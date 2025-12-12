import type { SerializablePrimitive, SerializableValue } from "./schema";

export function truncateText(text: string, limit: number): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit)}…`;
}

// Serializable-value conversion (best-effort). Returns null when the value
// should be omitted from snapshots/prompts.
export function toSerializableValue(
  value: unknown,
  depth: number
): SerializableValue | null {
  if (depth > 2) {
    return null;
  }
  if (value === null) {
    return null;
  }
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") {
    return value as SerializablePrimitive;
  }
  if (Array.isArray(value)) {
    const items: SerializableValue[] = [];
    for (let i = 0; i < value.length && i < 5; i += 1) {
      const converted = toSerializableValue(value[i], depth + 1);
      if (converted !== null) {
        items.push(converted);
      }
    }
    return items;
  }
  if (t === "object") {
    const obj = value as { readonly [key: string]: unknown };
    const entries = Object.entries(obj);
    const out: { [key: string]: SerializableValue } = {};
    let count = 0;
    for (const [key, v] of entries) {
      if (count >= 8) {
        break;
      }
      const converted = toSerializableValue(v, depth + 1);
      if (converted !== null) {
        out[key] = converted;
        count += 1;
      }
    }
    return out;
  }
  return null;
}

