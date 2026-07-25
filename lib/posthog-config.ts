const POSTHOG_PLACEHOLDER_VALUES = new Set([
  "null",
  "placeholder",
  "redacted",
  "sensitive",
  "undefined",
]);

export function isUsablePostHogKey(value: string | null | undefined): value is string {
  const key = value?.trim();
  if (!key) return false;

  if (/^\[[^\]]+\]$/.test(key)) return false;

  return !POSTHOG_PLACEHOLDER_VALUES.has(key.toLowerCase());
}
