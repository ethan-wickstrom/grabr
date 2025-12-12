/**
 * Shared public schema types for grabr.
 *
 * This file is intentionally side‑effect free and contains only types/interfaces
 * that are part of the library's externally observable API.
 */

// Serializable values we may emit in props/state/context snapshots.
// This avoids dumping arbitrary functions or cyclic references.
export type SerializablePrimitive = string | number | boolean | null;

export interface SerializableObject {
  readonly [key: string]: SerializableValue;
}

export type SerializableValue =
  | SerializablePrimitive
  | readonly SerializableValue[]
  | SerializableObject;

// Selection metadata
export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SelectionIdentity {
  readonly tag: string;
  readonly id: string | null;
  readonly dataTestId: string | null;
  readonly role: string | null;
  readonly classes: readonly string[];
}

export interface SelectionInfo {
  readonly tag: string;
  readonly boundingBox: BoundingBox;
  readonly identity: SelectionIdentity;
  readonly componentDisplayName: string | null;
  readonly nearestSource: SourceLocation | null;
  readonly isLikelyServerComponent: boolean | null;
}

// DOM neighborhood
export interface DomNodeSummary {
  readonly tag: string;
  readonly id: string | null;
  readonly dataTestId: string | null;
  readonly classes: readonly string[];
  readonly textSnippet: string | null;
}

export interface SiblingSummary {
  readonly index: number;
  readonly total: number;
  readonly previous: DomNodeSummary | null;
  readonly next: DomNodeSummary | null;
}

export interface ChildSummary {
  readonly totalChildren: number;
  readonly tagCounts: { readonly [tag: string]: number };
  readonly samples: readonly DomNodeSummary[];
}

export interface DomNeighborhood {
  readonly snippet: string;
  readonly parents: readonly DomNodeSummary[];
  readonly siblings: SiblingSummary;
  readonly children: ChildSummary;
  readonly selectors: {
    readonly preferred: string;
    readonly all: readonly string[];
  };
}

// Source-location metadata: explicitly debug-only and fallible.
// Consumers should treat this as a hint, not a guarantee.
export type SourceConfidence = "none" | "low" | "medium" | "high";

export type SourceOrigin = "bippy" | "sourcemap" | "inline" | "unknown";

export interface SourceLocation {
  readonly fileName: string;
  readonly lineNumber: number | null;
  readonly columnNumber: number | null;
  readonly confidence: SourceConfidence;
  readonly origin: SourceOrigin;
}

// React component stack and data slice
export interface ComponentFlags {
  readonly isHost: boolean;
  readonly isComposite: boolean;
  readonly isSuspenseBoundary: boolean | null;
  readonly isErrorBoundary: boolean | null;
  readonly isServerComponent: boolean | null;
  readonly isLayoutLike: boolean | null;
}

export interface PropHighlight {
  readonly name: string;
  readonly value: SerializableValue | null;
  readonly reason:
    | "text"
    | "design"
    | "children"
    | "test-id"
    | "aria-label"
    | "other";
}

export interface PropsSnapshot {
  readonly totalProps: number;
  readonly highlighted: readonly PropHighlight[];
}

export interface StateSnapshotEntry {
  readonly hookIndex: number;
  readonly value: SerializableValue | null;
}

export interface StateSnapshot {
  readonly totalHooks: number;
  readonly entries: readonly StateSnapshotEntry[];
}

export interface ContextEntry {
  readonly index: number;
  readonly value: SerializableValue | null;
}

export interface ContextSnapshot {
  readonly totalContexts: number;
  readonly entries: readonly ContextEntry[];
}

export interface ReactComponentFrame {
  readonly displayName: string | null;
  readonly isHost: boolean;
  readonly source: SourceLocation | null;
  readonly flags: ComponentFlags;
}

export interface ReactTreeSlice {
  readonly stack: readonly ReactComponentFrame[];
  readonly ownerIndex: number | null;
  readonly ownerProps: PropsSnapshot | null;
  readonly ownerState: StateSnapshot | null;
  readonly ownerContexts: ContextSnapshot | null;
}

// Styling / layout information
export interface MatchedRuleSummary {
  readonly selector: string;
  readonly origin: "author" | "user-agent" | "inline" | "unknown";
  readonly specificity: string;
  readonly importantCount: number;
}

export interface StyleFrame {
  readonly layout: {
    readonly display: string | null;
    readonly position: string | null;
    readonly flexDirection: string | null;
    readonly justifyContent: string | null;
    readonly alignItems: string | null;
    readonly gap: string | null;
    readonly gridTemplateColumns: string | null;
    readonly gridTemplateRows: string | null;
  };
  readonly spacing: {
    readonly margin: string | null;
    readonly padding: string | null;
  };
  readonly size: {
    readonly width: string | null;
    readonly height: string | null;
  };
  readonly typography: {
    readonly fontFamily: string | null;
    readonly fontSize: string | null;
    readonly fontWeight: string | null;
    readonly lineHeight: string | null;
  };
  readonly colors: {
    readonly color: string | null;
    readonly backgroundColor: string | null;
    readonly borderColor: string | null;
  };
  readonly clickable: boolean;

  /**
   * Reserved for future deep CSS rule analysis (e.g. matched CSS rules).
   * Currently left empty by the implementation, but modeled here so schema
   * can be extended without breaking compatibility.
   */
  readonly ruleSummaries?: readonly MatchedRuleSummary[];
}

// Behavior / event hints: explicitly inferred/speculative.
export type EventKind =
  | "click"
  | "change"
  | "submit"
  | "input"
  | "focus"
  | "blur"
  | "key"
  | "pointer"
  | "other";

export type BehaviorInferenceLevel = "none" | "prop-name-only";

export type BehaviorInferenceSource = "prop-name" | "runtime-hook";

export interface EventHandlerInfo {
  readonly propName: string;
  readonly inferredKind: EventKind;
  readonly functionName: string | null;
  readonly declaredOnComponent: string | null;
  readonly source: SourceLocation | null;
  readonly comment: string | null;
  readonly inferenceSource: BehaviorInferenceSource;
}

export interface BehaviorContext {
  readonly inferenceLevel: BehaviorInferenceLevel;
  readonly handlers: readonly EventHandlerInfo[];
}

// Data-flow & routing hints
export interface DataSourceHint {
  readonly kind: "react-query" | "swr" | "redux" | "trpc" | "custom" | "unknown";
  readonly identifier: string | null;
  readonly description: string | null;
}

export type InferredFramework =
  | "next-app"
  | "next-pages"
  | "remix"
  | "react-router"
  | "unknown";

export interface FrameworkDetectionResult {
  readonly framework: InferredFramework;
  readonly routePatternGuess: string | null;
  readonly routeParamsGuess: { readonly [key: string]: string } | null;
  readonly pageComponent: SourceLocation | null;
  readonly layoutComponents: readonly SourceLocation[];
}

export interface AppContext {
  readonly url: string;
  readonly pathname: string;
  readonly search: string;
  readonly hash: string;
  readonly framework: InferredFramework;
  readonly routePatternGuess: string | null;
  readonly routeParamsGuess: { readonly [key: string]: string } | null;
  readonly pageComponent: SourceLocation | null;
  readonly layoutComponents: readonly SourceLocation[];
  readonly dataSources: readonly DataSourceHint[];
}

// Optional test hints
export interface TestHint {
  readonly type: "test" | "story" | "command";
  readonly location: SourceLocation;
  readonly description: string | null;
}

export interface TestsBlock {
  readonly hints: readonly TestHint[];
}

// React integration debug info
export type ReactBuildType = "development" | "production" | "unknown";

export type ReactInspectorStatus = "ok" | "no-hook" | "inactive" | "no-fiber" | "error";

export interface ReactDebugInfo {
  readonly buildType: ReactBuildType;
  readonly inspectorStatus: ReactInspectorStatus;
  readonly message: string | null;
}

// Main element context schema
export interface ElementContextV2 {
  readonly version: 2;
  readonly selection: SelectionInfo;
  readonly dom: DomNeighborhood;
  readonly react: ReactTreeSlice | null;
  readonly reactDebug: ReactDebugInfo;
  readonly styling: StyleFrame;
  readonly behavior: BehaviorContext;
  readonly app: AppContext;
  readonly tests?: TestsBlock;
}

// Session & agent integration
export interface GrabrSession {
  readonly id: string;
  readonly createdAt: string;
  readonly url: string;
  readonly userInstruction: string | null;
  readonly summary: string | null;
  readonly elements: readonly ElementContextV2[];
}

export interface AgentProvider {
  readonly id: string;
  readonly label: string;
  sendContext(session: GrabrSession): Promise<void>;
  onSuccess?(session: GrabrSession): void;
  onError?(session: GrabrSession, error: Error): void;
}

export interface GrabrApi {
  readonly version: string;
  startSelectionSession(userInstruction?: string | null): void;
  getCurrentSession(): GrabrSession | null;
  registerAgentProvider(provider: AgentProvider): void;
  setActiveAgentProvider(id: string): void;
}

export interface GrabrClient extends GrabrApi {
  readonly config: Readonly<GrabrRuntimeConfig>;
  dispose(): void;
}

export interface GrabrInitOptions {
  readonly config?: Partial<GrabrRuntimeConfig>;
  readonly providers?: readonly AgentProvider[];
  readonly activeProviderId?: string;
  readonly attachToWindow?: boolean;
  readonly hotkey?: string | false;
}

// ---------------------------------------------------------------------------
// Heuristic strategy interfaces (framework & data sources)
// ---------------------------------------------------------------------------

export interface FrameworkDetectionInput {
  readonly reactSlice: ReactTreeSlice | null;
  readonly url: string;
  readonly pathname: string;
}

export interface FrameworkDetectionStrategy {
  readonly id: string;
  detect(input: FrameworkDetectionInput): FrameworkDetectionResult | null;
}

export interface DataSourceDetectionInput {
  readonly ownerProps: PropsSnapshot | null;
}

export interface DataSourceDetectionStrategy {
  readonly id: string;
  detect(input: DataSourceDetectionInput): readonly DataSourceHint[];
}

// ---------------------------------------------------------------------------
// Runtime config
// ---------------------------------------------------------------------------

export type ReactInspectorMode = "best-effort" | "required" | "off";

export interface GrabrHeuristics {
  readonly frameworkStrategies: readonly FrameworkDetectionStrategy[];
  readonly dataSourceStrategies: readonly DataSourceDetectionStrategy[];
}

export interface GrabrRuntimeConfig {
  readonly reactInspectorMode: ReactInspectorMode;
  readonly maxReactStackFrames: number;
  readonly heuristics: GrabrHeuristics;
}

// ---------------------------------------------------------------------------
// Inspector engine public surface
// ---------------------------------------------------------------------------

export interface InspectorEngine {
  readonly config: Readonly<GrabrRuntimeConfig>;
  getElementContext(selectedElement: Element): Promise<ElementContextV2>;
}

