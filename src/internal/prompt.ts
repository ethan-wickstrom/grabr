import type {
  ContextSnapshot,
  ElementContextV2,
  EventHandlerInfo,
  GrabrSession,
  PropsSnapshot,
  ReactTreeSlice,
  SourceLocation,
  StateSnapshot,
  ReactDebugInfo,
} from "./schema";

function promptChecksum(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash >>> 0).toString(16);
}

function stringifyForPrompt(value: unknown, dropNull: boolean): string {
  return JSON.stringify(
    value,
    (_key, val) => {
      if (val === undefined) {
        return undefined;
      }
      if (dropNull && val === null) {
        return undefined;
      }
      return val;
    }
  );
}

function maybeAddLine(
  lines: string[],
  key: string,
  value: unknown,
  options?: { dropNull?: boolean; allowEmpty?: boolean }
): void {
  const dropNull = options?.dropNull ?? true;
  const allowEmpty = options?.allowEmpty ?? false;
  if (value === null || value === undefined) {
    if (dropNull) {
      return;
    }
  }
  const serialized = stringifyForPrompt(value, dropNull);
  if (!allowEmpty && (serialized === "{}" || serialized === "[]")) {
    return;
  }
  lines.push(`${key}=${serialized}`);
}

function formatSourceForPrompt(
  source: SourceLocation | null
): Record<string, unknown> | null {
  if (!source) {
    return null;
  }
  const out: Record<string, unknown> = {
    file: source.fileName,
    confidence: source.confidence,
    origin: source.origin,
  };
  if (source.lineNumber !== null) {
    out["line"] = source.lineNumber;
  }
  if (source.columnNumber !== null) {
    out["col"] = source.columnNumber;
  }
  return out;
}

function deriveSelectionId(context: ElementContextV2): string {
  const s = context.selection;
  const parts = [
    s.identity.id ?? "",
    s.identity.dataTestId ?? "",
    s.tag,
    s.componentDisplayName ?? "",
    s.nearestSource?.fileName ?? "",
    Math.round(s.boundingBox.x).toString(),
    Math.round(s.boundingBox.y).toString(),
  ];
  return `sel_${promptChecksum(parts.join("|"))}`;
}

function formatReactStack(
  react: ReactTreeSlice
): Array<Record<string, unknown>> {
  return react.stack.map((frame, idx) => {
    const formatted: Record<string, unknown> = {
      idx,
      displayName: frame.displayName ?? "<host>",
      isHost: frame.isHost,
      source: formatSourceForPrompt(frame.source),
      flags: frame.flags,
    };
    if (react.ownerIndex === idx) {
      formatted["owner"] = true;
    }
    return formatted;
  });
}

function formatPropsSnapshot(
  snapshot: PropsSnapshot | null
): Record<string, unknown> | null {
  if (!snapshot) {
    return null;
  }
  return {
    total: snapshot.totalProps,
    highlighted: snapshot.highlighted.map((h) => ({
      name: h.name,
      reason: h.reason,
      value: h.value,
    })),
  };
}

function formatStateSnapshot(
  snapshot: StateSnapshot | null
): Record<string, unknown> | null {
  if (!snapshot) {
    return null;
  }
  return {
    total: snapshot.totalHooks,
    entries: snapshot.entries,
  };
}

function formatContextSnapshot(
  snapshot: ContextSnapshot | null
): Record<string, unknown> | null {
  if (!snapshot) {
    return null;
  }
  return {
    total: snapshot.totalContexts,
    entries: snapshot.entries,
  };
}

function formatBehaviorHandlers(
  handlers: readonly EventHandlerInfo[]
): readonly Record<string, unknown>[] {
  return handlers.map((h) => ({
    prop: h.propName,
    kind: h.inferredKind,
    fn: h.functionName ?? "anonymous",
    component: h.declaredOnComponent ?? "unknown",
    source: formatSourceForPrompt(h.source),
    inference: h.inferenceSource,
  }));
}

export function renderElementContextPrompt(
  context: ElementContextV2
): string {
  const selectionId = deriveSelectionId(context);
  const checksum = promptChecksum(stringifyForPrompt(context, false));
  const lines: string[] = [];
  const s = context.selection;
  const dom = context.dom;
  const react = context.react;
  const style = context.styling;
  const app = context.app;
  const reactDebug: ReactDebugInfo =
    context.reactDebug ?? {
      buildType: "unknown",
      inspectorStatus: "no-hook",
      message: "React debug info unavailable.",
    };

  const section = (name: string, fn: () => void) => {
    lines.push(`[section:${name}]`);
    fn();
    lines.push(`[end:${name}]`);
  };

  lines.push(`<ai_grab_selection v="2" sel_id="${selectionId}" checksum="${checksum}">`);

  section("meta", () => {
    maybeAddLine(lines, "version", 2, { dropNull: false });
    maybeAddLine(lines, "sel_id", selectionId, { dropNull: false });
    maybeAddLine(lines, "checksum", checksum, { dropNull: false });
    maybeAddLine(lines, "react_available", react !== null);
    maybeAddLine(lines, "react_inspector_status", reactDebug.inspectorStatus);
    maybeAddLine(lines, "react_build", reactDebug.buildType);
    maybeAddLine(lines, "react_message", reactDebug.message, { dropNull: true });
    maybeAddLine(
      lines,
      "source_hint_present",
      s.nearestSource !== null
    );
    maybeAddLine(
      lines,
      "tests_present",
      Boolean(context.tests && context.tests.hints.length > 0)
    );
  });

  section("selection", () => {
    maybeAddLine(lines, "tag", s.tag, { dropNull: false });
    maybeAddLine(
      lines,
      "bounding_box",
      {
        x: Math.round(s.boundingBox.x),
        y: Math.round(s.boundingBox.y),
        w: Math.round(s.boundingBox.width),
        h: Math.round(s.boundingBox.height),
      },
      { dropNull: false }
    );
    maybeAddLine(
      lines,
      "identity",
      {
        id: s.identity.id,
        dataTestId: s.identity.dataTestId,
        role: s.identity.role,
        classes: s.identity.classes,
      },
      { dropNull: false }
    );
    maybeAddLine(lines, "component", s.componentDisplayName, { dropNull: true });
    maybeAddLine(lines, "nearest_source", formatSourceForPrompt(s.nearestSource));
    maybeAddLine(lines, "is_server_component", s.isLikelyServerComponent);
  });

  section("dom", () => {
    maybeAddLine(lines, "snippet", dom.snippet, { dropNull: false });
    maybeAddLine(lines, "parents", dom.parents);
    maybeAddLine(lines, "siblings", dom.siblings);
    maybeAddLine(lines, "children", dom.children);
    maybeAddLine(lines, "selectors", dom.selectors);
  });

  section("react", () => {
    maybeAddLine(
      lines,
      "status",
      {
        available: react !== null,
        inspectorStatus: reactDebug.inspectorStatus,
        build: reactDebug.buildType,
        message: reactDebug.message,
      },
      { dropNull: true }
    );
    if (react !== null) {
      maybeAddLine(lines, "owner_index", react.ownerIndex, { dropNull: false });
      maybeAddLine(lines, "stack", formatReactStack(react), { allowEmpty: true });
      maybeAddLine(lines, "owner_props", formatPropsSnapshot(react.ownerProps), {
        allowEmpty: true,
      });
      maybeAddLine(lines, "owner_state", formatStateSnapshot(react.ownerState), {
        allowEmpty: true,
      });
      maybeAddLine(
        lines,
        "owner_contexts",
        formatContextSnapshot(react.ownerContexts),
        { allowEmpty: true }
      );
    }
  });

  section("styling", () => {
    maybeAddLine(lines, "layout", style.layout, { dropNull: true, allowEmpty: false });
    maybeAddLine(lines, "spacing", style.spacing, { dropNull: true, allowEmpty: false });
    maybeAddLine(lines, "size", style.size, { dropNull: true, allowEmpty: false });
    maybeAddLine(lines, "typography", style.typography, {
      dropNull: true,
      allowEmpty: false,
    });
    maybeAddLine(lines, "colors", style.colors, { dropNull: true, allowEmpty: false });
    maybeAddLine(lines, "clickable", style.clickable, { dropNull: false });
  });

  section("behavior", () => {
    maybeAddLine(lines, "inference_level", context.behavior.inferenceLevel, {
      dropNull: false,
    });
    maybeAddLine(lines, "handlers", formatBehaviorHandlers(context.behavior.handlers), {
      allowEmpty: true,
    });
  });

  section("app", () => {
    maybeAddLine(
      lines,
      "url",
      {
        full: app.url,
        pathname: app.pathname,
        search: app.search,
        hash: app.hash,
      },
      { dropNull: true }
    );
    maybeAddLine(
      lines,
      "routing",
      {
        framework: app.framework,
        routePatternGuess: app.routePatternGuess,
        routeParamsGuess: app.routeParamsGuess,
        pageComponent: formatSourceForPrompt(app.pageComponent),
        layoutComponents: app.layoutComponents.map((loc) => formatSourceForPrompt(loc)),
      },
      { dropNull: true, allowEmpty: true }
    );
    maybeAddLine(lines, "data_sources", app.dataSources, { allowEmpty: true });
  });

  if (context.tests) {
    section("tests", () => {
      maybeAddLine(lines, "hints", context.tests?.hints ?? [], { allowEmpty: true });
    });
  }

  lines.push(`<ai_grab_selection_end sel_id="${selectionId}" checksum="${checksum}"/>`);
  return lines.join("\n");
}

export function renderSessionPrompt(session: GrabrSession): string {
  const checksum = promptChecksum(stringifyForPrompt(session, false));
  const lines: string[] = [];
  lines.push(`<ai_grab_session id="${session.id}" checksum="${checksum}">`);
  const section = (name: string, fn: () => void) => {
    lines.push(`[section:${name}]`);
    fn();
    lines.push(`[end:${name}]`);
  };

  section("meta", () => {
    maybeAddLine(lines, "created_at", session.createdAt, { dropNull: false });
    maybeAddLine(lines, "url", session.url, { dropNull: false });
    maybeAddLine(lines, "instruction", session.userInstruction ?? "(none)", {
      dropNull: false,
    });
    maybeAddLine(
      lines,
      "summary",
      session.summary ?? `Session with ${session.elements.length} elements.`,
      { dropNull: false }
    );
    maybeAddLine(lines, "element_count", session.elements.length, { dropNull: false });
  });

  section("elements", () => {
    session.elements.forEach((ctx, idx) => {
      lines.push(`[element:${idx}]`);
      lines.push(renderElementContextPrompt(ctx));
      lines.push(`[end:element:${idx}]`);
    });
  });

  lines.push(`<ai_grab_session_end id="${session.id}" checksum="${checksum}"/>`);
  return lines.join("\n");
}
