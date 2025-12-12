/// <reference lib="dom" />

/**
 * grabr: React element context extraction for AI coding agents.
 *
 * Import the client entrypoint before React renders to enable fiber metadata.
 * If the hook isn't active, React info will be missing but DOM/styling still works.
 */

import type { GrabrApi } from "./internal/schema";

declare global {
  interface Window {
    grabr?: GrabrApi;
  }
}

export type {
  SerializablePrimitive,
  SerializableObject,
  SerializableValue,
  BoundingBox,
  SelectionIdentity,
  SelectionInfo,
  DomNodeSummary,
  SiblingSummary,
  ChildSummary,
  DomNeighborhood,
  SourceConfidence,
  SourceOrigin,
  SourceLocation,
  ComponentFlags,
  PropHighlight,
  PropsSnapshot,
  StateSnapshotEntry,
  StateSnapshot,
  ContextEntry,
  ContextSnapshot,
  ReactComponentFrame,
  ReactTreeSlice,
  MatchedRuleSummary,
  StyleFrame,
  EventKind,
  BehaviorInferenceLevel,
  BehaviorInferenceSource,
  EventHandlerInfo,
  BehaviorContext,
  DataSourceHint,
  InferredFramework,
  FrameworkDetectionResult,
  AppContext,
  TestHint,
  TestsBlock,
  ReactBuildType,
  ReactInspectorStatus,
  ReactDebugInfo,
  ElementContextV2,
  GrabrSession,
  AgentProvider,
  GrabrApi,
  GrabrClient,
  GrabrInitOptions,
  FrameworkDetectionInput,
  FrameworkDetectionStrategy,
  DataSourceDetectionInput,
  DataSourceDetectionStrategy,
  ReactInspectorMode,
  GrabrHeuristics,
  GrabrRuntimeConfig,
  InspectorEngine,
} from "./internal/schema";

export { defaultRuntimeConfig, mergeRuntimeConfig } from "./internal/heuristics";

export { truncateText, toSerializableValue } from "./internal/serializable";

export { buildPreferredSelector } from "./internal/dom";

export { createInspectorEngine, getElementContext } from "./internal/inspector";

export {
  renderElementContextPrompt,
  renderSessionPrompt,
} from "./internal/prompt";

export {
  ClipboardAgentProvider,
  createGrabrClient,
  initGrabr,
} from "./internal/client";

/**
 * Bun-only demo server that serves a small HTML page and a bundled grabr client.
 * Not invoked on import; call explicitly in Bun.
 */
export async function startGrabrDemoServer(port: number = 3000): Promise<void> {
  if (typeof Bun === "undefined") {
    throw new Error("startGrabrDemoServer can only be used in a Bun runtime.");
  }
  const { startGrabrDemoServerImpl } = await import("./internal/demo-server");
  await startGrabrDemoServerImpl(port);
}
