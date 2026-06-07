export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function textValue(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value || fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => textValue(item)).filter(Boolean).join(" / ") || fallback;
  return fallback;
}

export function asTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return textValue(value) ? [textValue(value)] : [];
  return value.map((item) => {
    if (typeof item === "string") return item;
    const record = asRecord(item);
    return Object.values(record).map((entry) => textValue(entry)).filter(Boolean).join("：");
  }).filter(Boolean);
}
