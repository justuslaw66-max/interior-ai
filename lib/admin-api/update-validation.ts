export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function pickDefinedFields<const TFields extends readonly string[]>(
  value: Record<string, unknown>,
  allowedFields: TFields
) {
  const data: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (hasOwn(value, field) && value[field] !== undefined) {
      data[field] = value[field];
    }
  }

  return data as Partial<Record<TFields[number], unknown>>;
}

export function normalizeStringArray(value: string[]) {
  return value.map((entry) => entry.trim()).filter(Boolean);
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
