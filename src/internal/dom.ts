import { truncateText } from "./serializable";
import type {
  ChildSummary,
  DomNeighborhood,
  DomNodeSummary,
  ReactTreeSlice,
  SelectionIdentity,
  SelectionInfo,
  SiblingSummary,
  SourceLocation,
  StyleFrame,
} from "./schema";

const MAX_TEXT_SNIPPET = 80;
const MAX_PARENT_DEPTH = 4;
const MAX_CHILD_SAMPLES = 5;

function summarizeTextContent(node: Element): string | null {
  const text = node.textContent;
  if (text === null) {
    return null;
  }
  const summarized = truncateText(text, MAX_TEXT_SNIPPET);
  return summarized.length === 0 ? null : summarized;
}

export function getDataTestId(el: Element): string | null {
  const value = el.getAttribute("data-testid") ?? el.getAttribute("data-test-id");
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Build a simple CSS selector based on identity attributes.
export function buildPreferredSelector(el: Element): string {
  const id = el.id;
  if (id && id.length > 0 && !id.includes(" ")) {
    return `#${CSS.escape(id)}`;
  }
  const dataTestId = getDataTestId(el);
  if (dataTestId !== null) {
    return `[data-testid="${CSS.escape(dataTestId)}"]`;
  }
  const classes = Array.from(el.classList).filter((cls) => cls.length > 0);
  const baseTag = el.tagName.toLowerCase();
  if (classes.length > 0) {
    return `${baseTag}.${classes.map((cls) => CSS.escape(cls)).join(".")}`;
  }
  const parent = el.parentElement;
  if (!parent) {
    return baseTag;
  }
  let index = 1;
  let sibling: Element | null = parent.firstElementChild;
  while (sibling) {
    if (sibling === el) {
      break;
    }
    if (sibling.tagName === el.tagName) {
      index += 1;
    }
    sibling = sibling.nextElementSibling;
  }
  return `${baseTag}:nth-of-type(${index})`;
}

// Build a simple ancestor selector path (e.g., div.card > button.primary)
function buildAncestorSelectorPath(el: Element, maxDepth: number): string {
  const segments: string[] = [];
  let current: Element | null = el;
  let depth = 0;
  while (current && depth < maxDepth) {
    const preferred = buildPreferredSelector(current);
    segments.unshift(preferred);
    current = current.parentElement;
    depth += 1;
  }
  return segments.join(" > ");
}

function summarizeDomNode(el: Element): DomNodeSummary {
  const dataTestId = getDataTestId(el);
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id && el.id.length > 0 ? el.id : null,
    dataTestId,
    classes: Array.from(el.classList),
    textSnippet: summarizeTextContent(el),
  };
}

function summarizeSiblings(el: Element): SiblingSummary {
  const parent = el.parentElement;
  if (!parent) {
    return {
      index: 0,
      total: 1,
      previous: null,
      next: null,
    };
  }
  const siblings = Array.from(parent.children);
  const total = siblings.length;
  const index = siblings.indexOf(el);
  const previous =
    index > 0 ? summarizeDomNode(siblings[index - 1]!) : null;
  const next =
    index >= 0 && index < total - 1
      ? summarizeDomNode(siblings[index + 1]!)
      : null;
  return {
    index,
    total,
    previous,
    next,
  };
}

function summarizeChildren(el: Element): ChildSummary {
  const children = Array.from(el.children);
  const tagCounts: { [tag: string]: number } = {};
  for (const child of children) {
    const tag = child.tagName.toLowerCase();
    const prevCount = tagCounts[tag] ?? 0;
    tagCounts[tag] = prevCount + 1;
  }
  const samples: DomNodeSummary[] = children
    .slice(0, MAX_CHILD_SAMPLES)
    .map((c) => summarizeDomNode(c));
  return {
    totalChildren: children.length,
    tagCounts,
    samples,
  };
}

function serializeElementSnippet(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const attrs: string[] = [];
  if (el.id) {
    attrs.push(`id="${el.id}"`);
  }
  const className = el.className.trim();
  if (className.length > 0) {
    attrs.push(`class="${truncateText(className, 40)}"`);
  }
  const dataTestId = getDataTestId(el);
  if (dataTestId !== null) {
    attrs.push(`data-testid="${dataTestId}"`);
  }
  const attrString = attrs.length > 0 ? " " + attrs.join(" ") : "";
  const text = summarizeTextContent(el);
  return `<${tag}${attrString}>${text ?? ""}</${tag}>`;
}

const BOX_SIDES = ["Top", "Right", "Bottom", "Left"] as const;

function buildBoxShorthand(
  get: (prop: keyof CSSStyleDeclaration) => string | null,
  base: "margin" | "padding"
): string | null {
  const values = BOX_SIDES.map((side) =>
    get(`${base}${side}` as keyof CSSStyleDeclaration)
  );
  if (values.every((v) => v === null)) {
    return null;
  }
  const [top, right, bottom, left] = values;
  return `${top ?? "0"} ${right ?? "0"} ${bottom ?? "0"} ${left ?? "0"}`;
}

export function buildStyleFrame(el: Element): StyleFrame {
  const rect = el.getBoundingClientRect();
  const computed =
    typeof window !== "undefined" && typeof window.getComputedStyle === "function"
      ? window.getComputedStyle(el)
      : null;

  const clickable =
    (computed && computed.cursor === "pointer") ||
    el instanceof HTMLButtonElement ||
    el instanceof HTMLAnchorElement ||
    el.getAttribute("role") === "button" ||
    el.getAttribute("role") === "link";

  const get = (prop: keyof CSSStyleDeclaration): string | null => {
    if (!computed) {
      return null;
    }
    const value = computed[prop];
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  return {
    layout: {
      display: get("display"),
      position: get("position"),
      flexDirection: get("flexDirection"),
      justifyContent: get("justifyContent"),
      alignItems: get("alignItems"),
      gap: get("gap"),
      gridTemplateColumns: get("gridTemplateColumns"),
      gridTemplateRows: get("gridTemplateRows"),
    },
    spacing: {
      margin: buildBoxShorthand(get, "margin"),
      padding: buildBoxShorthand(get, "padding"),
    },
    size: {
      width: rect.width > 0 ? `${Math.round(rect.width)}px` : null,
      height: rect.height > 0 ? `${Math.round(rect.height)}px` : null,
    },
    typography: {
      fontFamily: get("fontFamily"),
      fontSize: get("fontSize"),
      fontWeight: get("fontWeight"),
      lineHeight: get("lineHeight"),
    },
    colors: {
      color: get("color"),
      backgroundColor: get("backgroundColor"),
      borderColor: get("borderColor"),
    },
    clickable,
    ruleSummaries: [],
  };
}

export function buildSelectionInfo(
  el: Element,
  reactSlice: ReactTreeSlice | null
): SelectionInfo {
  const rect = el.getBoundingClientRect();
  const identity: SelectionIdentity = {
    tag: el.tagName.toLowerCase(),
    id: el.id && el.id.length > 0 ? el.id : null,
    dataTestId: getDataTestId(el),
    role: el.getAttribute("role"),
    classes: Array.from(el.classList),
  };

  const nearestSource: SourceLocation | null =
    reactSlice && reactSlice.stack.length > 0
      ? reactSlice.stack[0]?.source ?? null
      : null;

  const componentDisplayName =
    reactSlice && reactSlice.stack.length > 0
      ? reactSlice.stack[0]?.displayName ?? null
      : null;

  return {
    tag: el.tagName.toLowerCase(),
    boundingBox: {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    },
    identity,
    componentDisplayName,
    nearestSource,
    isLikelyServerComponent:
      reactSlice && reactSlice.stack.length > 0
        ? reactSlice.stack[0]?.flags.isServerComponent ?? null
        : null,
  };
}

export function buildDomNeighborhood(el: Element): DomNeighborhood {
  const snippet = serializeElementSnippet(el);

  const parents: DomNodeSummary[] = [];
  let currentParent = el.parentElement;
  let depth = 0;
  while (currentParent && depth < MAX_PARENT_DEPTH) {
    parents.push(summarizeDomNode(currentParent));
    currentParent = currentParent.parentElement;
    depth += 1;
  }

  const siblings = summarizeSiblings(el);
  const children = summarizeChildren(el);

  const preferred = buildPreferredSelector(el);
  const path = buildAncestorSelectorPath(el, MAX_PARENT_DEPTH + 1);
  const selectors = {
    preferred,
    all: [preferred, path],
  };

  return {
    snippet,
    parents,
    siblings,
    children,
    selectors,
  };
}

export function dedupeElementsPreserveOrder(
  elements: readonly Element[]
): Element[] {
  const out: Element[] = [];
  const seen = new Set<Element>();
  for (const el of elements) {
    if (seen.has(el)) continue;
    seen.add(el);
    out.push(el);
  }
  return out;
}

export function isElementConnectedToDocument(el: Element): boolean {
  if (typeof document === "undefined") return false;
  return el.isConnected || document.documentElement.contains(el);
}

export function formatElementLabel(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id && el.id.trim().length > 0 ? `#${el.id.trim()}` : "";
  const testId = el.getAttribute("data-testid") || el.getAttribute("data-test-id");
  const testIdPart =
    testId && testId.trim().length > 0
      ? `[data-testid="${testId.trim()}"]`
      : "";
  if (id) return `${tag}${id}`;
  if (testIdPart) return `${tag}${testIdPart}`;
  return tag;
}
