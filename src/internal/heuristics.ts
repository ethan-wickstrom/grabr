import type {
  AppContext,
  DataSourceDetectionInput,
  DataSourceDetectionStrategy,
  DataSourceHint,
  FrameworkDetectionInput,
  FrameworkDetectionResult,
  FrameworkDetectionStrategy,
  GrabrHeuristics,
  GrabrRuntimeConfig,
  InferredFramework,
  ReactTreeSlice,
  SourceLocation,
} from "./schema";

function inferFrameworkFromPath(path: string): InferredFramework {
  if (path.includes("/app/")) {
    return "next-app";
  }
  if (path.includes("/pages/")) {
    return "next-pages";
  }
  if (path.includes("react-router")) {
    return "react-router";
  }
  if (path.includes("remix")) {
    return "remix";
  }
  return "unknown";
}

export function isLayoutLikeFromPath(path: string): boolean {
  return (
    path.endsWith("/layout.tsx") ||
    path.endsWith("/layout.jsx") ||
    path.endsWith("/_layout.tsx") ||
    path.endsWith("/_layout.jsx")
  );
}

function isPageLikeFromPath(path: string): boolean {
  return (
    path.endsWith("/page.tsx") ||
    path.endsWith("/page.jsx") ||
    path.endsWith("/index.tsx") ||
    path.endsWith("/index.jsx")
  );
}

const nextLikeFrameworkStrategy: FrameworkDetectionStrategy = {
  id: "next-like",
  detect(input: FrameworkDetectionInput): FrameworkDetectionResult | null {
    const layoutComponents: SourceLocation[] = [];
    let pageComponent: SourceLocation | null = null;
    let framework: InferredFramework = "unknown";

    if (!input.reactSlice) {
      return null;
    }

    for (const frame of input.reactSlice.stack) {
      const source = frame.source;
      if (!source) continue;
      const path = source.fileName;

      if (framework === "unknown") {
        framework = inferFrameworkFromPath(path);
      }
      if (isLayoutLikeFromPath(path)) {
        layoutComponents.push(source);
      }
      if (!pageComponent && isPageLikeFromPath(path)) {
        pageComponent = source;
      }
    }

    if (framework === "unknown" && !pageComponent && layoutComponents.length === 0) {
      return null;
    }

    const routeParamsGuess: { [key: string]: string } = {};
    const routePatternGuess: string | null =
      framework === "next-app" || framework === "next-pages"
        ? (() => {
            const segments = input.pathname.split("/").filter((s) => s.length > 0);
            const patternSegments: string[] = [];
            segments.forEach((seg, idx) => {
              if (/^\\d+$/.test(seg)) {
                patternSegments.push(`[id${idx}]`);
                routeParamsGuess[`id${idx}`] = seg;
              } else if (seg.length > 2 && seg === seg.toLowerCase()) {
                patternSegments.push(seg);
              } else {
                patternSegments.push(`[param${idx}]`);
                routeParamsGuess[`param${idx}`] = seg;
              }
            });
            return `/${patternSegments.join("/")}`;
          })()
        : null;

    return {
      framework,
      routePatternGuess,
      routeParamsGuess:
        Object.keys(routeParamsGuess).length > 0 ? routeParamsGuess : null,
      pageComponent,
      layoutComponents,
    };
  },
};

const genericFrameworkStrategy: FrameworkDetectionStrategy = {
  id: "generic",
  detect(_input: FrameworkDetectionInput): FrameworkDetectionResult | null {
    return {
      framework: "unknown",
      routePatternGuess: null,
      routeParamsGuess: null,
      pageComponent: null,
      layoutComponents: [],
    };
  },
};

const basicDataSourceStrategy: DataSourceDetectionStrategy = {
  id: "basic-data-props",
  detect(input: DataSourceDetectionInput): readonly DataSourceHint[] {
    const lowerNames: string[] =
      input.ownerProps?.highlighted.map((h) => h.name.toLowerCase()) ?? [];
    const lowerSet = new Set(lowerNames);

    const hints: DataSourceHint[] = [];
    const hasData = lowerSet.has("data");
    const hasIsLoading =
      lowerSet.has("isloading") || lowerSet.has("loading");
    const hasError = lowerSet.has("error");
    if (hasData && hasIsLoading && hasError) {
      hints.push({
        kind: "react-query",
        identifier: null,
        description: "Props suggest React Query-like async data (data/loading/error).",
      });
    }
    if (lowerNames.some((p) => p.includes("swr"))) {
      hints.push({
        kind: "swr",
        identifier: null,
        description: "Props mention SWR, likely SWR-based data.",
      });
    }
    if (lowerNames.some((p) => p.includes("selector"))) {
      hints.push({
        kind: "redux",
        identifier: null,
        description: "Selector-like props hint at Redux selectors.",
      });
    }

    if (hints.length === 0) {
      return [
        {
          kind: "unknown",
          identifier: null,
          description: null,
        },
      ];
    }
    return hints;
  },
};

const defaultHeuristics: GrabrHeuristics = {
  frameworkStrategies: [nextLikeFrameworkStrategy, genericFrameworkStrategy],
  dataSourceStrategies: [basicDataSourceStrategy],
};

export const defaultRuntimeConfig: GrabrRuntimeConfig = {
  reactInspectorMode: "best-effort",
  maxReactStackFrames: 8,
  heuristics: defaultHeuristics,
};

export function mergeRuntimeConfig(
  partial: Partial<GrabrRuntimeConfig> | undefined
): GrabrRuntimeConfig {
  if (!partial) {
    return defaultRuntimeConfig;
  }
  const heuristics: GrabrHeuristics = {
    frameworkStrategies:
      partial.heuristics?.frameworkStrategies ?? defaultHeuristics.frameworkStrategies,
    dataSourceStrategies:
      partial.heuristics?.dataSourceStrategies ?? defaultHeuristics.dataSourceStrategies,
  };

  return {
    reactInspectorMode: partial.reactInspectorMode ?? defaultRuntimeConfig.reactInspectorMode,
    maxReactStackFrames:
      partial.maxReactStackFrames ?? defaultRuntimeConfig.maxReactStackFrames,
    heuristics,
  };
}

function getWindowLocationSafe(): Location | null {
  if (typeof window === "undefined") return null;
  const loc = window.location;
  return typeof loc !== "undefined" ? loc : null;
}

export function buildAppContext(
  reactSlice: ReactTreeSlice | null,
  config: GrabrRuntimeConfig
): AppContext {
  const loc = getWindowLocationSafe();
  const url = loc?.href ?? "";
  const pathname = loc?.pathname ?? "";
  const search = loc?.search ?? "";
  const hash = loc?.hash ?? "";

  const frameworkResult =
    config.heuristics.frameworkStrategies
      .map((strategy) =>
        strategy.detect({
          reactSlice,
          url,
          pathname,
        })
      )
      .find((result) => result !== null) ?? {
      framework: "unknown" as InferredFramework,
      routePatternGuess: null,
      routeParamsGuess: null,
      pageComponent: null,
      layoutComponents: [],
    };

  const dataSources: readonly DataSourceHint[] = (() => {
    const input: DataSourceDetectionInput = {
      ownerProps: reactSlice?.ownerProps ?? null,
    };
    const collected: DataSourceHint[] = [];
    for (const strategy of config.heuristics.dataSourceStrategies) {
      const hints = strategy.detect(input);
      collected.push(...hints);
    }
    return collected.length > 0
      ? collected
      : [
          {
            kind: "unknown",
            identifier: null,
            description: null,
          },
        ];
  })();

  return {
    url,
    pathname,
    search,
    hash,
    framework: frameworkResult.framework,
    routePatternGuess: frameworkResult.routePatternGuess,
    routeParamsGuess: frameworkResult.routeParamsGuess,
    pageComponent: frameworkResult.pageComponent,
    layoutComponents: frameworkResult.layoutComponents,
    dataSources,
  };
}

function isFiniteIntegerInRange(
  value: unknown,
  min: number,
  max: number
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
  );
}

export function validateRuntimeConfigOrThrow(config: GrabrRuntimeConfig): void {
  if (
    config.reactInspectorMode !== "best-effort" &&
    config.reactInspectorMode !== "required" &&
    config.reactInspectorMode !== "off"
  ) {
    throw new Error(
      `Invalid config.reactInspectorMode: expected "best-effort" | "required" | "off", got ${String(
        config.reactInspectorMode
      )}`
    );
  }

  if (!isFiniteIntegerInRange(config.maxReactStackFrames, 1, 64)) {
    throw new Error(
      `Invalid config.maxReactStackFrames: expected integer in range [1, 64], got ${String(
        config.maxReactStackFrames
      )}`
    );
  }
}
