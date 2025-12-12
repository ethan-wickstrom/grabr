import {
  type Fiber,
  type ReactRenderer,
  getDisplayName,
  getFiberFromHostInstance,
  getFiberStack,
  getLatestFiber,
  isCompositeFiber,
  isHostFiber,
  traverseContexts,
  traverseProps,
  traverseState,
  hasRDTHook,
  isInstrumentationActive,
  detectReactBuildType,
  _renderers,
} from "bippy";

import { getSource } from "bippy/source";

import { isLayoutLikeFromPath } from "./heuristics";
import { toSerializableValue } from "./serializable";
import type {
  BehaviorContext,
  BehaviorInferenceLevel,
  ComponentFlags,
  EventHandlerInfo,
  EventKind,
  PropHighlight,
  PropsSnapshot,
  ReactBuildType,
  ReactComponentFrame,
  ReactDebugInfo,
  ReactTreeSlice,
  SourceConfidence,
  SourceLocation,
  StateSnapshot,
  StateSnapshotEntry,
  ContextSnapshot,
  ContextEntry,
  GrabrRuntimeConfig,
} from "./schema";

type SourceLike = {
  readonly fileName?: string;
  readonly lineNumber?: number | null;
  readonly columnNumber?: number | null;
} | null;

function toSourceLocation(
  source: SourceLike,
  buildType: ReactBuildType
): SourceLocation | null {
  if (!source || !source.fileName) {
    return null;
  }
  const line =
    typeof source.lineNumber === "number" && Number.isFinite(source.lineNumber)
      ? source.lineNumber
      : null;
  const column =
    typeof source.columnNumber === "number" && Number.isFinite(source.columnNumber)
      ? source.columnNumber
      : null;

  const confidence: SourceConfidence =
    buildType === "development" ? "high" : buildType === "production" ? "low" : "medium";

  return {
    fileName: source.fileName,
    lineNumber: line,
    columnNumber: column,
    confidence,
    origin: "bippy",
  };
}

function classifyPropHighlight(
  name: string,
  value: unknown
): PropHighlight["reason"] | null {
  const lower = name.toLowerCase();
  if (
    lower === "label" ||
    lower === "title" ||
    lower === "placeholder" ||
    lower === "text" ||
    lower === "children"
  ) {
    return "text";
  }
  if (
    lower === "variant" ||
    lower === "size" ||
    lower === "intent" ||
    lower === "tone" ||
    lower === "color" ||
    lower === "kind"
  ) {
    return "design";
  }
  if (lower === "data-testid" || lower === "testid") {
    return "test-id";
  }
  if (lower === "aria-label") {
    return "aria-label";
  }
  if (value === null) {
    return null;
  }
  return "other";
}

const EXACT_EVENT_KIND: Record<string, EventKind> = {
  onclick: "click",
  onchange: "change",
  onsubmit: "submit",
  oninput: "input",
  onfocus: "focus",
  onblur: "blur",
};

function inferEventKindFromPropName(name: string): EventKind {
  const lower = name.toLowerCase();
  const exact = EXACT_EVENT_KIND[lower];
  if (exact) return exact;
  if (lower.startsWith("onkey")) return "key";
  if (lower.startsWith("onpointer") || lower.startsWith("onmouse")) {
    return "pointer";
  }
  return "other";
}

function getAnyRenderer(): ReactRenderer | null {
  const first = _renderers.values().next();
  return first.done ? null : first.value;
}

function detectReactBuildTypeSafe(): ReactBuildType {
  try {
    const renderer = getAnyRenderer();
    if (!renderer) {
      return "unknown";
    }

    const result = detectReactBuildType(renderer);
    if (result === "development" || result === "production") {
      return result;
    }
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function getReactDebugInfoForElement(element: Element): ReactDebugInfo {
  const buildType = detectReactBuildTypeSafe();

  if (!hasRDTHook()) {
    return {
      buildType,
      inspectorStatus: "no-hook",
      message:
        'React DevTools hook not detected. Import "@ethan-wickstrom/grabr/client" before React renders to enable React metadata.',
    };
  }

  if (!isInstrumentationActive()) {
    return {
      buildType,
      inspectorStatus: "inactive",
      message:
        'React instrumentation is not active yet. Ensure "@ethan-wickstrom/grabr/client" is imported before React renders.',
    };
  }

  try {
    const hostFiber = getFiberFromHostInstance(element);
    if (!hostFiber) {
      return {
        buildType,
        inspectorStatus: "no-fiber",
        message: "No React fiber associated with this element (non-React DOM).",
      };
    }
  } catch {
    return {
      buildType,
      inspectorStatus: "error",
      message:
        "Failed to access React fiber for this element. Instrumentation may be incompatible.",
    };
  }

  return {
    buildType,
    inspectorStatus: "ok",
    message: null,
  };
}

const MAX_REACT_SNAPSHOT_ENTRIES = 12;

function limitEntries<T>(
  entries: readonly T[],
  limit: number
): readonly T[] {
  return entries.length > limit ? entries.slice(0, limit) : entries;
}

function snapshotProps(fiber: Fiber): PropsSnapshot {
  const highlighted: PropHighlight[] = [];
  let totalProps = 0;
  traverseProps(fiber, (name, next) => {
    totalProps += 1;
    const serial = toSerializableValue(next, 0);
    const reason = classifyPropHighlight(name, serial);
    if (reason !== null) {
      highlighted.push({
        name,
        value: serial,
        reason,
      });
    }
  });
  return {
    totalProps,
    highlighted: limitEntries(highlighted, MAX_REACT_SNAPSHOT_ENTRIES),
  };
}

function snapshotState(fiber: Fiber): StateSnapshot {
  const entries: StateSnapshotEntry[] = [];
  let index = 0;
  traverseState(fiber, (next) => {
    const value = toSerializableValue(next, 0);
    entries.push({
      hookIndex: index,
      value,
    });
    index += 1;
  });
  return {
    totalHooks: index,
    entries: limitEntries(entries, MAX_REACT_SNAPSHOT_ENTRIES),
  };
}

function snapshotContexts(fiber: Fiber): ContextSnapshot {
  const entries: ContextEntry[] = [];
  let index = 0;
  traverseContexts(fiber, (next) => {
    const value = toSerializableValue(next, 0);
    entries.push({
      index,
      value,
    });
    index += 1;
  });
  return {
    totalContexts: index,
    entries: limitEntries(entries, MAX_REACT_SNAPSHOT_ENTRIES),
  };
}

// Build ReactTreeSlice for a host DOM element (best-effort).
export async function buildReactTreeSlice(
  element: Element,
  config: GrabrRuntimeConfig,
  debugInfo: ReactDebugInfo
): Promise<ReactTreeSlice | null> {
  if (config.reactInspectorMode === "off") {
    return null;
  }

  if (debugInfo.inspectorStatus !== "ok") {
    return null;
  }

  let hostFiber: Fiber | null = null;
  try {
    hostFiber = getFiberFromHostInstance(element);
  } catch {
    return null;
  }
  if (!hostFiber) {
    return null;
  }

  const latest = getLatestFiber(hostFiber);
  const stackFibers = getFiberStack(latest);
  if (stackFibers.length === 0) {
    return null;
  }
  const maxFrames = config.maxReactStackFrames;
  const takenFibers = stackFibers.slice(0, maxFrames);
  const sources: Array<SourceLocation | null> = await Promise.all(
    takenFibers.map(async (fiber) => {
      try {
        const location = await getSource(fiber);
        return toSourceLocation(location, debugInfo.buildType);
      } catch {
        return null;
      }
    })
  );
  const stack: ReactComponentFrame[] = takenFibers.map((fiber, index) => {
    const displayName = getDisplayName(fiber) ?? null;
    const source = sources[index] ?? null;
    const typed = fiber as Fiber & { readonly tag?: number };
    const tag = typeof typed.tag === "number" ? typed.tag : undefined;
    const isHost = isHostFiber(fiber);
    const isComposite = isCompositeFiber(fiber);
    const fileName = source?.fileName ?? "";
    const flags: ComponentFlags = {
      isHost,
      isComposite,
      isSuspenseBoundary:
        typeof tag === "number" && fileName.length > 0 && fileName.includes("Suspense")
          ? true
          : null,
      isErrorBoundary: displayName?.includes("ErrorBoundary") ?? null,
      isServerComponent:
        fileName.includes(".server.") || fileName.includes("/app/")
          ? true
          : null,
      isLayoutLike: isLayoutLikeFromPath(fileName),
    };
    return {
      displayName,
      isHost,
      source,
      flags,
    };
  });

  // Nearest composite "owner" for props/state/context snapshots
  let ownerIndex: number | null = null;
  for (let i = 0; i < takenFibers.length; i += 1) {
    const fiber = takenFibers[i];
    if (!fiber) continue;
    if (isCompositeFiber(fiber)) {
      ownerIndex = i;
      break;
    }
  }
  if (ownerIndex === null) {
    return {
      stack,
      ownerIndex,
      ownerProps: null,
      ownerState: null,
      ownerContexts: null,
    };
  }

  const ownerFiber = takenFibers[ownerIndex];
  if (!ownerFiber) {
    return {
      stack,
      ownerIndex: null,
      ownerProps: null,
      ownerState: null,
      ownerContexts: null,
    };
  }

  const ownerProps = snapshotProps(ownerFiber);
  const ownerState = snapshotState(ownerFiber);
  const ownerContexts = snapshotContexts(ownerFiber);

  return {
    stack,
    ownerIndex,
    ownerProps,
    ownerState,
    ownerContexts,
  };
}

// Behavior: event handlers from owner + host fiber props (speculative).
export function buildBehaviorContext(
  element: Element,
  reactSlice: ReactTreeSlice | null
): BehaviorContext {
  const handlers: EventHandlerInfo[] = [];

  let hostFiber: Fiber | null = null;
  try {
    hostFiber = getFiberFromHostInstance(element);
  } catch {
    hostFiber = null;
  }

  const seenNames = new Set<string>();

  const recordHandlersFromFiber = (
    fiber: Fiber | null,
    declaredOnComponent: string | null,
    source: SourceLocation | null
  ) => {
    if (!fiber) return;
    traverseProps(fiber, (name, next) => {
      if (!name.startsWith("on")) return;
      if (seenNames.has(name)) return;
      if (typeof next !== "function") return;
      seenNames.add(name);
      const fn = next as { readonly name?: string };
      const fnName =
        typeof fn.name === "string" && fn.name.length > 0 ? fn.name : null;
      const kind = inferEventKindFromPropName(name);
      const comment = `Handler ${name} likely handles ${kind} events on this element.`;
      handlers.push({
        propName: name,
        inferredKind: kind,
        functionName: fnName,
        declaredOnComponent,
        source,
        comment,
        inferenceSource: "prop-name",
      });
    });
  };

  if (hostFiber) {
    const stackFibers = getFiberStack(getLatestFiber(hostFiber));
    const source =
      reactSlice && reactSlice.stack.length > 0
        ? reactSlice.stack[0]?.source ?? null
        : null;
    const componentName =
      reactSlice && reactSlice.stack.length > 0
        ? reactSlice.stack[0]?.displayName ?? null
        : null;
    recordHandlersFromFiber(hostFiber, componentName, source);

    if (reactSlice && reactSlice.ownerIndex !== null) {
      const ownerFrame = reactSlice.stack[reactSlice.ownerIndex];
      const ownerSource = ownerFrame?.source ?? null;
      const ownerName = ownerFrame?.displayName ?? null;
      const ownerCompositeFiber = stackFibers[reactSlice.ownerIndex] ?? null;
      recordHandlersFromFiber(ownerCompositeFiber, ownerName, ownerSource);
    }
  }

  const inferenceLevel: BehaviorInferenceLevel =
    handlers.length === 0 ? "none" : "prop-name-only";

  return {
    inferenceLevel,
    handlers,
  };
}
