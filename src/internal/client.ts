import { hasRDTHook } from "bippy";

import type {
  AgentProvider,
  ElementContextV2,
  GrabrApi,
  GrabrClient,
  GrabrInitOptions,
  GrabrRuntimeConfig,
  GrabrSession,
  InspectorEngine,
} from "./schema";

import { createInspectorEngine } from "./inspector";
import { renderSessionPrompt } from "./prompt";
import {
  dedupeElementsPreserveOrder,
  formatElementLabel,
  isElementConnectedToDocument,
} from "./dom";
import {
  mergeRuntimeConfig,
  validateRuntimeConfigOrThrow,
} from "./heuristics";
// Default AgentProvider: clipboard + console

export class ClipboardAgentProvider implements AgentProvider {
  readonly id: string = "clipboard";
  readonly label: string = "Clipboard (default)";

  async sendContext(session: GrabrSession): Promise<void> {
    const text = renderSessionPrompt(session);

    const copyFailureReasons: string[] = [];
    const copied = await tryCopyTextToClipboard(text, copyFailureReasons);

    console.log("[grabr] Session context:\n", text);

    if (!copied) {
      const suffix =
        copyFailureReasons.length > 0
          ? ` Reasons: ${copyFailureReasons.join(" | ")}`
          : "";
      throw new Error(`Failed to copy session context to clipboard.${suffix}`);
    }
  }
}

async function tryCopyTextToClipboard(
  text: string,
  reasonsOut: string[]
): Promise<boolean> {
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      reasonsOut.push(
        error instanceof Error
          ? `navigator.clipboard.writeText failed: ${error.message}`
          : "navigator.clipboard.writeText failed"
      );
    }
  } else {
    reasonsOut.push("navigator.clipboard.writeText not available.");
  }

  if (typeof document === "undefined" || !document.body) {
    reasonsOut.push("document/body not available for execCommand fallback.");
    return false;
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    textarea.setAttribute("readonly", "true");

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);

    if (!ok) {
      reasonsOut.push("document.execCommand('copy') returned false.");
    }
    return ok;
  } catch (error) {
    reasonsOut.push(
      error instanceof Error
        ? `execCommand fallback failed: ${error.message}`
        : "execCommand fallback failed"
    );
    return false;
  }
}

// Overlay styles

const OVERLAY_STYLES = `
.grabr-ui {
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  z-index: 2147483647;
}

.grabr-root {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.grabr-highlight {
  position: fixed;
  z-index: 2147483646;
  outline: 2px solid var(--grabr-accent, #38bdf8);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--grabr-accent, #38bdf8) 12%, transparent);
  border-radius: 6px;
  display: none;
}

.grabr-highlight-label {
  position: absolute;
  top: -22px;
  left: 0;
  padding: 2px 6px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 6px;
  color: var(--grabr-label-fg, #0b1220);
  background: var(--grabr-accent, #38bdf8);
  box-shadow: 0 6px 18px rgba(0,0,0,0.20);
  white-space: nowrap;
  max-width: 70vw;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity 120ms ease;
}

.grabr-highlight-label.visible {
  opacity: 1;
}

.grabr-selected {
  position: fixed;
  z-index: 2147483645;
  outline: 2px solid var(--grabr-ok, #22c55e);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--grabr-ok, #22c55e) 10%, transparent);
  border-radius: 6px;
}

.grabr-hud {
  position: fixed;
  left: 16px;
  bottom: 16px;
  min-width: 260px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--grabr-fg, #e5e7eb) 18%, transparent);
  background: color-mix(in srgb, var(--grabr-bg, #0b1220) 92%, transparent);
  color: var(--grabr-fg, #e5e7eb);
  box-shadow: 0 18px 60px rgba(0,0,0,0.32);
  display: none;
}

.grabr-hud.visible {
  display: block;
}

.grabr-hud-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.grabr-title {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.9;
}

.grabr-status {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.grabr-sub {
  margin-top: 6px;
  font-size: 12px;
  opacity: 0.8;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.grabr-kbd {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 9999px;
  border: 1px solid color-mix(in srgb, var(--grabr-fg, #e5e7eb) 14%, transparent);
  background: color-mix(in srgb, var(--grabr-bg, #0b1220) 70%, transparent);
}

.grabr-key {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  font-size: 11px;
  font-weight: 700;
  opacity: 0.95;
}

.grabr-help {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid color-mix(in srgb, var(--grabr-fg, #e5e7eb) 12%, transparent);
  font-size: 12px;
  opacity: 0.85;
  display: none;
}

.grabr-help.visible {
  display: block;
}

.grabr-toast {
  position: fixed;
  right: 16px;
  top: 16px;
  max-width: min(520px, calc(100vw - 32px));
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--grabr-fg, #e5e7eb) 16%, transparent);
  background: color-mix(in srgb, var(--grabr-bg, #0b1220) 92%, transparent);
  color: var(--grabr-fg, #e5e7eb);
  box-shadow: 0 18px 60px rgba(0,0,0,0.32);
  transform: translateY(-6px);
  opacity: 0;
  transition: transform 180ms ease, opacity 180ms ease;
  pointer-events: none;
}

.grabr-toast.visible {
  transform: translateY(0);
  opacity: 1;
}

.grabr-toast.ok {
  border-color: color-mix(in srgb, var(--grabr-ok, #22c55e) 45%, transparent);
}

.grabr-toast.err {
  border-color: color-mix(in srgb, var(--grabr-err, #ef4444) 55%, transparent);
}

@media (prefers-color-scheme: light) {
  .grabr-ui {
      --grabr-bg: #ffffff;
      --grabr-fg: #0b1220;
      --grabr-label-fg: #0b1220;
      --grabr-accent: #0284c7;
      --grabr-ok: #16a34a;
      --grabr-err: #dc2626;
  }
}

@media (prefers-reduced-motion: reduce) {
  .grabr-highlight-label,
  .grabr-toast {
      transition: none;
  }
}
`;

function injectGrabrStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("grabr-styles")) return;

  const style = document.createElement("style");
  style.id = "grabr-styles";
  style.textContent = OVERLAY_STYLES;
  document.head.appendChild(style);
}

type SelectionFinalizeProgress =
  | { readonly phase: "building-context"; readonly completed: number; readonly total: number }
  | { readonly phase: "sending"; readonly completed: number; readonly total: number }
  | { readonly phase: "done"; readonly completed: number; readonly total: number }
  | { readonly phase: "error"; readonly completed: number; readonly total: number; readonly message: string };

class GrabrController implements GrabrApi {
  readonly version: string = "2.2.0";
  readonly config: Readonly<GrabrRuntimeConfig>;

  private readonly inspector: InspectorEngine;
  private readonly providerRegistry: Map<string, AgentProvider> = new Map();
  private activeProvider: AgentProvider;

  private currentSession: GrabrSession | null = null;
  private currentInstruction: string | null = null;

  private overlay: SelectionOverlay | null = null;

  constructor(
    inspector: InspectorEngine,
    initialProvider: AgentProvider,
    config: GrabrRuntimeConfig
  ) {
    this.inspector = inspector;
    this.activeProvider = initialProvider;
    this.providerRegistry.set(initialProvider.id, initialProvider);
    this.config = config;
  }

  attachOverlay(overlay: SelectionOverlay): void {
    this.overlay = overlay;
  }

  startSelectionSession(userInstruction?: string | null): void {
    const trimmed =
      typeof userInstruction === "string" ? userInstruction.trim() : null;
    this.currentInstruction = trimmed && trimmed.length > 0 ? trimmed : null;

    if (this.overlay) {
      this.overlay.beginSelection();
    } else {
      console.warn("[grabr] startSelectionSession called, but no overlay attached.");
    }
  }

  getCurrentSession(): GrabrSession | null {
    return this.currentSession;
  }

  registerAgentProvider(provider: AgentProvider): void {
    this.providerRegistry.set(provider.id, provider);
  }

  setActiveAgentProvider(id: string): void {
    const provider = this.providerRegistry.get(id);
    if (provider) this.activeProvider = provider;
  }

  async finalizeSelection(
    elements: readonly Element[],
    onProgress?: (progress: SelectionFinalizeProgress) => void
  ): Promise<void> {
    const connected = dedupeElementsPreserveOrder(elements).filter(
      isElementConnectedToDocument
    );

    if (connected.length === 0) {
      onProgress?.({
        phase: "error",
        completed: 0,
        total: 0,
        message: "No valid elements to capture.",
      });
      return;
    }

    const createdAt = new Date().toISOString();
    const url = window.location.href;

    const sessionId =
      typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${createdAt}-${Math.random().toString(16).slice(2)}`;

    const total = connected.length;
    onProgress?.({ phase: "building-context", completed: 0, total });

    let completed = 0;
    let failed = 0;

    const contextsOrNull = await mapWithConcurrencyLimit(
      connected,
      2,
      async (el): Promise<ElementContextV2 | null> => {
        try {
          return await this.inspector.getElementContext(el);
        } catch (error) {
          failed += 1;
          console.warn(
            "[grabr] Failed to capture element context:",
            error instanceof Error ? error.message : error
          );
          return null;
        } finally {
          completed += 1;
          onProgress?.({ phase: "building-context", completed, total });
        }
      }
    );

    const contexts = contextsOrNull.filter(
      (c): c is ElementContextV2 => c !== null
    );

    if (contexts.length === 0) {
      onProgress?.({
        phase: "error",
        completed,
        total,
        message: "Failed to capture context for all selected elements.",
      });
      return;
    }

    const summary =
      failed > 0
        ? `Session with ${contexts.length} element(s) captured; ${failed} failed.`
        : `Session with ${contexts.length} element(s) captured.`;

    const session: GrabrSession = {
      id: sessionId,
      createdAt,
      url,
      userInstruction: this.currentInstruction,
      summary,
      elements: contexts,
    };

    this.currentSession = session;

    onProgress?.({ phase: "sending", completed: total, total });

    try {
      await this.activeProvider.sendContext(session);
      this.activeProvider.onSuccess?.(session);

      onProgress?.({ phase: "done", completed: total, total });

      this.overlay?.showToast(
        contexts.length === 1
          ? "Copied context for 1 element."
          : `Copied context for ${contexts.length} elements.`,
        false
      );

      if (failed > 0) {
        this.overlay?.showToast(
          `Warning: ${failed} element(s) failed to capture.`,
          true
        );
      }
    } catch (error) {
      const err =
        error instanceof Error ? error : new Error("Failed to send context.");
      this.activeProvider.onError?.(session, err);
      onProgress?.({
        phase: "error",
        completed: total,
        total,
        message: err.message,
      });
      this.overlay?.showToast(err.message, true);
    }
  }

  dispose(): void {
    if (!this.overlay) return;
    this.overlay.dispose();
    this.overlay = null;
  }
}

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: readonly TIn[],
  limit: number,
  mapper: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;

  const runWorker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await mapper(items[currentIndex]!, currentIndex);
    }
  };

  const workerCount = Math.min(limit, items.length);
  const workers = Array.from({ length: workerCount }, () => runWorker());
  await Promise.all(workers);
  return results;
}

// Hotkey parsing

type HotkeySpec = {
  readonly alt: boolean;
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly key?: string;
  readonly code?: string;
};

const DEFAULT_HOTKEY = "Alt+Shift+G";

function parseHotkey(spec: string): HotkeySpec | null {
  const parts = spec
    .split("+")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1]!;
  const mods = new Set(parts.slice(0, -1).map((p) => p.toLowerCase()));

  const code = /^Key[A-Z]$/i.test(last) || /^Digit\\d$/i.test(last) ? last : undefined;
  const key = code ? undefined : last.toLowerCase();

  return {
    alt: mods.has("alt") || mods.has("option"),
    shift: mods.has("shift"),
    ctrl: mods.has("ctrl") || mods.has("control"),
    meta: mods.has("meta") || mods.has("cmd") || mods.has("command"),
    key,
    code,
  };
}

function matchesHotkey(event: KeyboardEvent, spec: HotkeySpec): boolean {
  if (
    event.altKey !== spec.alt ||
    event.shiftKey !== spec.shift ||
    event.ctrlKey !== spec.ctrl ||
    event.metaKey !== spec.meta
  ) {
    return false;
  }
  if (spec.code) return event.code === spec.code;
  return event.key.toLowerCase() === spec.key;
}

// Selection overlay (browser only)

class SelectionOverlay {
  private readonly controller: GrabrController;
  private readonly hotkey: HotkeySpec | null;
  private readonly globalToggleHandler: ((event: KeyboardEvent) => void) | null;

  private readonly root: HTMLDivElement;
  private readonly highlight: HTMLDivElement;
  private readonly highlightLabel: HTMLDivElement;

  private readonly hud: HTMLDivElement;
  private readonly hudStatus: HTMLDivElement;
  private readonly hudSub: HTMLDivElement;
  private readonly hudHelp: HTMLDivElement;

  private readonly toast: HTMLDivElement;

  private readonly selectionBoxes: HTMLDivElement[] = [];

  private selecting = false;
  private sending = false;
  private helpVisible = false;

  private hoveredElement: Element | null = null;
  private selectedElements: Element[] = [];

  private rafPending = false;
  private rafReflowPending = false;

  private toastTimer: number | null = null;

  constructor(controller: GrabrController, hotkey: HotkeySpec | null) {
    this.controller = controller;
    this.hotkey = hotkey;

    injectGrabrStyles();

    this.root = document.createElement("div");
    this.root.className = "grabr-ui grabr-root";

    this.highlight = document.createElement("div");
    this.highlight.className = "grabr-highlight";

    this.highlightLabel = document.createElement("div");
    this.highlightLabel.className = "grabr-highlight-label";
    this.highlight.appendChild(this.highlightLabel);

    this.hud = document.createElement("div");
    this.hud.className = "grabr-hud";

    const hudRow = document.createElement("div");
    hudRow.className = "grabr-hud-row";

    const hudTitle = document.createElement("div");
    hudTitle.className = "grabr-title";
    hudTitle.textContent = "AI Grab";

    this.hudStatus = document.createElement("div");
    this.hudStatus.className = "grabr-status";
    this.hudStatus.textContent = "Idle";

    hudRow.appendChild(hudTitle);
    hudRow.appendChild(this.hudStatus);

    this.hudSub = document.createElement("div");
    this.hudSub.className = "grabr-sub";
    this.hudSub.innerHTML = `
      <span class="grabr-kbd"><span class="grabr-key">Click</span> select</span>
      <span class="grabr-kbd"><span class="grabr-key">Shift</span> multi</span>
      <span class="grabr-kbd"><span class="grabr-key">Enter</span> finish</span>
      <span class="grabr-kbd"><span class="grabr-key">Esc</span> cancel</span>
      <span class="grabr-kbd"><span class="grabr-key">?</span> help</span>
    `.trim();

    this.hudHelp = document.createElement("div");
    this.hudHelp.className = "grabr-help";
    this.hudHelp.textContent =
      "Shortcuts: Backspace=undo, X=clear, ArrowUp/P=parent, Enter=finish, Esc=cancel.";

    this.hud.appendChild(hudRow);
    this.hud.appendChild(this.hudSub);
    this.hud.appendChild(this.hudHelp);

    this.toast = document.createElement("div");
    this.toast.className = "grabr-toast";
    this.toast.setAttribute("role", "status");
    this.toast.setAttribute("aria-live", "polite");

    this.root.appendChild(this.highlight);
    this.root.appendChild(this.hud);
    this.root.appendChild(this.toast);

    document.documentElement.appendChild(this.root);

    if (this.hotkey) {
      const hotkey = this.hotkey;
      this.globalToggleHandler = (event: KeyboardEvent) => {
        if (!matchesHotkey(event, hotkey)) return;
        event.preventDefault();
        if (this.selecting || this.sending) {
          this.cancelSelection();
        } else {
          this.beginSelection();
        }
      };
      document.addEventListener("keydown", this.globalToggleHandler, false);
    } else {
      this.globalToggleHandler = null;
    }
  }

  beginSelection(): void {
    if (this.sending) return;

    this.selectedElements = [];
    this.hoveredElement = null;
    this.helpVisible = false;

    this.clearSelectionBoxes();

    this.selecting = true;
    this.hud.classList.add("visible");

    this.updateHudState();
    this.attachSelectionListeners();
  }

  dispose(): void {
    this.detachSelectionListeners();
    this.clearSelectionBoxes();

    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    if (this.globalToggleHandler) {
      document.removeEventListener("keydown", this.globalToggleHandler, false);
    }

    this.root.parentElement?.removeChild(this.root);
  }

  showToast(message: string, isError: boolean): void {
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }

    this.toast.textContent = message;
    this.toast.classList.remove("ok", "err");
    this.toast.classList.add(isError ? "err" : "ok");
    this.toast.classList.add("visible");

    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove("visible");
      this.toastTimer = null;
    }, 2600);
  }

  private attachSelectionListeners(): void {
    document.addEventListener("mousemove", this.onMouseMove, true);
    document.addEventListener("click", this.onClick, true);
    document.addEventListener("keydown", this.onKeyDown, true);
    window.addEventListener("scroll", this.onViewportChange, true);
    window.addEventListener("resize", this.onViewportChange, true);
  }

  private detachSelectionListeners(): void {
    document.removeEventListener("mousemove", this.onMouseMove, true);
    document.removeEventListener("click", this.onClick, true);
    document.removeEventListener("keydown", this.onKeyDown, true);
    window.removeEventListener("scroll", this.onViewportChange, true);
    window.removeEventListener("resize", this.onViewportChange, true);
  }

  private onViewportChange = (): void => {
    if (!this.selecting) return;
    if (this.rafReflowPending) return;

    this.rafReflowPending = true;
    window.requestAnimationFrame(() => {
      this.rafReflowPending = false;
      this.reflowOverlays();
    });
  };

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.selecting || this.sending) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.root.contains(target)) return;
    if (target === this.hoveredElement) return;

    this.hoveredElement = target;

    if (this.rafPending) return;
    this.rafPending = true;

    window.requestAnimationFrame(() => {
      this.rafPending = false;
      this.updateHighlight();
    });
  };

  private onClick = (event: MouseEvent): void => {
    if (!this.selecting || this.sending) return;
    if (event.button !== 0) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (this.root.contains(target)) return;

    event.preventDefault();
    event.stopPropagation();

    const multi = event.shiftKey || event.metaKey || event.ctrlKey;
    this.toggleSelection(target, multi);
  };

  private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.selecting || this.sending) return;

    if (event.key === "Escape") {
      event.preventDefault();
      this.cancelSelection();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      void this.finalizeSelection();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      this.undoSelection();
      return;
    }

    if (event.key === "?" || event.key.toLowerCase() === "h") {
      event.preventDefault();
      this.toggleHelp();
      return;
    }

    if (event.key === "ArrowUp" || event.key.toLowerCase() === "p") {
      event.preventDefault();
      this.selectHoveredParent();
      return;
    }

    if (event.key.toLowerCase() === "x") {
      event.preventDefault();
      this.clearSelection();
      return;
    }
  };

  private cancelSelection(): void {
    this.selecting = false;
    this.sending = false;
    this.helpVisible = false;

    this.hoveredElement = null;
    this.selectedElements = [];

    this.detachSelectionListeners();
    this.clearSelectionBoxes();

    this.highlight.style.display = "none";
    this.hud.classList.remove("visible");
    this.hudHelp.classList.remove("visible");
  }

  private toggleHelp(): void {
    this.helpVisible = !this.helpVisible;
    this.hudHelp.classList.toggle("visible", this.helpVisible);
  }

  private clearSelection(): void {
    this.selectedElements = [];
    this.updateSelectionBoxes();
    this.updateHudState();
  }

  private undoSelection(): void {
    if (this.selectedElements.length === 0) return;
    this.selectedElements.pop();
    this.updateSelectionBoxes();
    this.updateHudState();
  }

  private selectHoveredParent(): void {
    if (!this.hoveredElement) return;
    const parent = this.hoveredElement.parentElement;
    if (!parent) return;
    if (this.root.contains(parent)) return;

    this.hoveredElement = parent;
    this.updateHighlight();
  }

  private async finalizeSelection(): Promise<void> {
    if (this.selectedElements.length === 0 && this.hoveredElement) {
      this.selectedElements = [this.hoveredElement];
    }

    const connected = dedupeElementsPreserveOrder(this.selectedElements).filter(
      isElementConnectedToDocument
    );

    if (connected.length === 0) {
      this.cancelSelection();
      return;
    }

    this.sending = true;
    this.updateHudState();

    this.detachSelectionListeners();
    this.highlight.style.display = "none";

    try {
      await this.controller.finalizeSelection(connected, (progress) =>
        this.updateHudProgress(progress)
      );
    } finally {
      this.selecting = false;
      this.sending = false;
      this.helpVisible = false;

      this.clearSelectionBoxes();
      this.hud.classList.remove("visible");
      this.hudHelp.classList.remove("visible");
    }
  }

  private updateHudProgress(progress: SelectionFinalizeProgress): void {
    const total = progress.total;

    if (progress.phase === "building-context") {
      this.hudStatus.textContent = `Capturing context… ${progress.completed}/${total}`;
      return;
    }
    if (progress.phase === "sending") {
      this.hudStatus.textContent = "Sending…";
      return;
    }
    if (progress.phase === "done") {
      this.hudStatus.textContent = "Done.";
      return;
    }
    this.hudStatus.textContent = `Error: ${progress.message}`;
  }

  private updateHudState(): void {
    if (!this.selecting) {
      this.hudStatus.textContent = "Idle";
      return;
    }
    if (this.sending) {
      const count = this.selectedElements.length;
      this.hudStatus.textContent =
        count === 1
          ? "Capturing context… (1 element)"
          : `Capturing context… (${count} elements)`;
      return;
    }

    const count = this.selectedElements.length;
    const hovered = this.hoveredElement;

    if (count === 0) {
      this.hudStatus.textContent = hovered
        ? `Hovering: ${formatElementLabel(hovered)}`
        : "Hover an element to inspect";
    } else if (count === 1) {
      this.hudStatus.textContent = `Selected: 1 (${formatElementLabel(
        this.selectedElements[0]!
      )})`;
    } else {
      const last = this.selectedElements[this.selectedElements.length - 1]!;
      this.hudStatus.textContent = `Selected: ${count} (last: ${formatElementLabel(
        last
      )})`;
    }
  }

  private toggleSelection(el: Element, multi: boolean): void {
    if (!multi) {
      this.selectedElements = [el];
    } else {
      const index = this.selectedElements.indexOf(el);
      if (index >= 0) {
        this.selectedElements.splice(index, 1);
      } else {
        this.selectedElements.push(el);
      }
    }

    this.selectedElements = this.selectedElements.filter(
      isElementConnectedToDocument
    );

    this.updateSelectionBoxes();
    this.updateHudState();
  }

  private updateHighlight(): void {
    const el = this.hoveredElement;
    if (!el || !isElementConnectedToDocument(el)) {
      this.highlight.style.display = "none";
      this.highlightLabel.classList.remove("visible");
      return;
    }

    const rect = el.getBoundingClientRect();
    if (!Number.isFinite(rect.left) || rect.width <= 0 || rect.height <= 0) {
      this.highlight.style.display = "none";
      this.highlightLabel.classList.remove("visible");
      return;
    }

    this.highlight.style.display = "block";
    this.highlight.style.left = `${rect.left}px`;
    this.highlight.style.top = `${rect.top}px`;
    this.highlight.style.width = `${rect.width}px`;
    this.highlight.style.height = `${rect.height}px`;

    this.highlightLabel.textContent = formatElementLabel(el);
    this.highlightLabel.classList.add("visible");

    this.updateHudState();
  }

  private reflowOverlays(): void {
    this.updateHighlight();
    this.updateSelectionBoxes();
  }

  private clearSelectionBoxes(): void {
    for (const box of this.selectionBoxes) {
      box.parentElement?.removeChild(box);
    }
    this.selectionBoxes.length = 0;
  }

  private updateSelectionBoxes(): void {
    this.clearSelectionBoxes();

    for (const el of this.selectedElements) {
      if (!isElementConnectedToDocument(el)) continue;

      const rect = el.getBoundingClientRect();
      if (!Number.isFinite(rect.left) || rect.width <= 0 || rect.height <= 0) {
        continue;
      }

      const box = document.createElement("div");
      box.className = "grabr-selected";
      box.style.left = `${rect.left}px`;
      box.style.top = `${rect.top}px`;
      box.style.width = `${rect.width}px`;
      box.style.height = `${rect.height}px`;

      this.root.appendChild(box);
      this.selectionBoxes.push(box);
    }
  }
}

let didWarnMissingHook = false;

function isInitOptionsArg(
  arg: Partial<GrabrRuntimeConfig> | GrabrInitOptions
): arg is GrabrInitOptions {
  return (
    "config" in arg ||
    "providers" in arg ||
    "activeProviderId" in arg ||
    "attachToWindow" in arg ||
    "hotkey" in arg
  );
}

function normalizeInitOptionsArg(
  arg?: Partial<GrabrRuntimeConfig> | GrabrInitOptions
): GrabrInitOptions {
  if (!arg) return {};
  if (isInitOptionsArg(arg)) return arg;
  return { config: arg };
}

function warnIfMissingReactHook(config: GrabrRuntimeConfig): void {
  if (didWarnMissingHook) return;
  if (config.reactInspectorMode === "off") return;
  if (hasRDTHook()) return;
  didWarnMissingHook = true;
  console.warn(
    '[grabr] React DevTools hook not detected. Import "@ethan-wickstrom/grabr/client" before React renders to enable React metadata.'
  );
}

function attachClientToWindow(client: GrabrClient): void {
  window.grabr = {
    version: client.version,
    startSelectionSession: client.startSelectionSession.bind(client),
    getCurrentSession: client.getCurrentSession.bind(client),
    registerAgentProvider: client.registerAgentProvider.bind(client),
    setActiveAgentProvider: client.setActiveAgentProvider.bind(client),
  };
}

export function createGrabrClient(
  partialConfig?: Partial<GrabrRuntimeConfig>
): GrabrClient;
export function createGrabrClient(options?: GrabrInitOptions): GrabrClient;
export function createGrabrClient(
  arg?: Partial<GrabrRuntimeConfig> | GrabrInitOptions
): GrabrClient {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("createGrabrClient must be called in a browser environment.");
  }

  const options = normalizeInitOptionsArg(arg);
  const config = mergeRuntimeConfig(options.config);
  validateRuntimeConfigOrThrow(config);
  warnIfMissingReactHook(config);

  const providers =
    options.providers && options.providers.length > 0
      ? [...options.providers]
      : [new ClipboardAgentProvider()];
  const controller = new GrabrController(
    createInspectorEngine(config),
    providers[0]!,
    config
  );
  for (const provider of providers.slice(1)) {
    controller.registerAgentProvider(provider);
  }
  if (options.activeProviderId) {
    controller.setActiveAgentProvider(options.activeProviderId);
  }

  const hotkey =
    options.hotkey === false
      ? null
      : parseHotkey(options.hotkey ?? DEFAULT_HOTKEY);
  const overlay = new SelectionOverlay(controller, hotkey);
  controller.attachOverlay(overlay);

  const client: GrabrClient = {
    version: controller.version,
    config: controller.config,
    startSelectionSession(userInstruction?: string | null): void {
      controller.startSelectionSession(userInstruction ?? null);
    },
    getCurrentSession(): GrabrSession | null {
      return controller.getCurrentSession();
    },
    registerAgentProvider(providerToAdd: AgentProvider): void {
      controller.registerAgentProvider(providerToAdd);
    },
    setActiveAgentProvider(id: string): void {
      controller.setActiveAgentProvider(id);
    },
    dispose(): void {
      controller.dispose();
    },
  };

  if (options.attachToWindow) {
    attachClientToWindow(client);
  }

  return client;
}

export function initGrabr(
  partialConfig?: Partial<GrabrRuntimeConfig>
): GrabrClient;
export function initGrabr(options?: GrabrInitOptions): GrabrClient;
export function initGrabr(
  arg?: Partial<GrabrRuntimeConfig> | GrabrInitOptions
): GrabrClient {
  const options = normalizeInitOptionsArg(arg);
  return createGrabrClient({ ...options, attachToWindow: true });
}
