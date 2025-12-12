import type {
  ElementContextV2,
  GrabrRuntimeConfig,
  InspectorEngine,
  ReactTreeSlice,
} from "./schema";

import { mergeRuntimeConfig } from "./heuristics";
import { buildBehaviorContext, buildReactTreeSlice, getReactDebugInfoForElement } from "./react";
import { buildDomNeighborhood, buildSelectionInfo, buildStyleFrame } from "./dom";
import { buildAppContext } from "./heuristics";

class DefaultInspectorEngine implements InspectorEngine {
  readonly config: Readonly<GrabrRuntimeConfig>;

  constructor(config: GrabrRuntimeConfig) {
    this.config = config;
  }

  async getElementContext(selectedElement: Element): Promise<ElementContextV2> {
    const reactDebug = getReactDebugInfoForElement(selectedElement);
    const reactSlice: ReactTreeSlice | null =
      this.config.reactInspectorMode === "off"
        ? null
        : await buildReactTreeSlice(selectedElement, this.config, reactDebug);

    const selection = buildSelectionInfo(selectedElement, reactSlice);
    const dom = buildDomNeighborhood(selectedElement);
    const styling = buildStyleFrame(selectedElement);
    const behavior = buildBehaviorContext(selectedElement, reactSlice);
    const app = buildAppContext(reactSlice, this.config);

    const context: ElementContextV2 = {
      version: 2,
      selection,
      dom,
      react: reactSlice,
      reactDebug,
      styling,
      behavior,
      app,
    };

    return context;
  }
}

let defaultInspectorEngine: InspectorEngine | null = null;

export function createInspectorEngine(
  partialConfig?: Partial<GrabrRuntimeConfig>
): InspectorEngine {
  const config = mergeRuntimeConfig(partialConfig);
  return new DefaultInspectorEngine(config);
}

/**
 * Convenience helper: builds an element context using a shared default engine.
 * This keeps a simple API for agents while allowing advanced users to provide
 * their own InspectorEngine instance.
 */
export async function getElementContext(
  selectedElement: Element,
  engine?: InspectorEngine
): Promise<ElementContextV2> {
  if (engine) {
    return engine.getElementContext(selectedElement);
  }
  if (!defaultInspectorEngine) {
    defaultInspectorEngine = createInspectorEngine();
  }
  return defaultInspectorEngine.getElementContext(selectedElement);
}
