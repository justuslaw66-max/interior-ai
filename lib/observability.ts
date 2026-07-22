const SENSITIVE_KEY =
  /(authorization|cookie|credential|password|secret|token|api[-_]?key|private[-_]?key|card|cvv|payment|session|address|street|postal|room[-_]?name|project[-_]?name|design[-_]?title|notes?|free[-_]?form|search[-_]?(term|query))/i;

const MAX_DEPTH = 4;
const MAX_KEYS = 40;
const MAX_ARRAY_ITEMS = 30;
const MAX_STRING_LENGTH = 240;

function sanitizeValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeValue(entry, depth + 1));
  }
  if (typeof value !== "object") return String(value).slice(0, MAX_STRING_LENGTH);

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value).slice(0, MAX_KEYS)) {
    sanitized[key.slice(0, 80)] = SENSITIVE_KEY.test(key)
      ? "[redacted]"
      : sanitizeValue(entry, depth + 1);
  }
  return sanitized;
}

export function sanitizeObservabilityMeta(
  value: Record<string, unknown> | null | undefined
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  return sanitizeValue(value, 0) as Record<string, unknown>;
}

export type OperationalLog = {
  operation: string;
  operationId: string;
  outcome: "started" | "succeeded" | "failed";
  durationMs?: number;
  status?: number;
  errorCode?: string;
  meta?: Record<string, unknown>;
};

export function logOperationalEvent(entry: OperationalLog) {
  const safeEntry = {
    ...entry,
    meta: sanitizeObservabilityMeta(entry.meta),
  };
  const method = entry.outcome === "failed" ? console.error : console.info;
  method("[operation]", safeEntry);
}
