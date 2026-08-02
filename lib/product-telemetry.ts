export const PRODUCT_TELEMETRY_EVENTS = [
  "project_started",
  "room_created",
  "room_dimensions_completed",
  "catalog_opened",
  "product_searched",
  "product_placed",
  "object_transformed",
  "validation_warning_shown",
  "undo_used",
  "view_switched_to_3d",
  "project_saved",
  "project_save_failed",
  "project_reloaded",
  "project_recovered",
  "design_shared",
  "shopping_list_opened",
  "product_purchase_clicked",
] as const;

export const PRODUCT_PERFORMANCE_METRICS = [
  "application_startup_ms",
  "editor_interactive_ms",
  "drag_latency_ms",
  "frame_duration_ms",
  "scene_synchronization_ms",
  "save_duration_ms",
  "load_duration_ms",
  "serialization_bytes",
  "memory_growth_bytes",
  "memory_after_close_bytes",
  "large_project_duration_ms",
  "asset_failure_count",
  "rendering_crash_count",
] as const;

export type ProductTelemetryEvent = (typeof PRODUCT_TELEMETRY_EVENTS)[number];
export type ProductPerformanceMetric = (typeof PRODUCT_PERFORMANCE_METRICS)[number];

export type ProductTelemetryProperties = {
  mode?: "consumer" | "pro";
  source?: string;
  result?: "success" | "failure" | "blocked";
  operation?: "move" | "rotate" | "resize" | "duplicate" | "delete" | "group";
  viewMode?: "2d" | "3d";
  roomType?: string;
  category?: string;
  unit?: "mm" | "cm" | "in";
  recoverySource?: "primary_backup" | "last_known_valid" | "clean_copy";
  warningCode?: string;
  errorCode?: string;
  durationMs?: number;
  itemCount?: number;
  resultCount?: number;
  roomCount?: number;
  value?: number;
  bytes?: number;
  sampleCount?: number;
  firstInSession?: boolean;
};

const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,80}$/;

function finiteNonNegative(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function safeCode(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : undefined;
}

/**
 * Reduces product telemetry to a fixed, non-content-bearing property set.
 * Project text, room names, addresses, object IDs, URLs, tokens, and free-form
 * error messages have no representation in this contract.
 */
export function sanitizeProductTelemetryProperties(
  properties: ProductTelemetryProperties = {}
): ProductTelemetryProperties {
  const result: ProductTelemetryProperties = {};
  if (properties.mode === "consumer" || properties.mode === "pro") result.mode = properties.mode;
  if (properties.result === "success" || properties.result === "failure" || properties.result === "blocked") {
    result.result = properties.result;
  }
  if (
    properties.operation === "move" ||
    properties.operation === "rotate" ||
    properties.operation === "resize" ||
    properties.operation === "duplicate" ||
    properties.operation === "delete" ||
    properties.operation === "group"
  ) {
    result.operation = properties.operation;
  }
  if (properties.viewMode === "2d" || properties.viewMode === "3d") result.viewMode = properties.viewMode;
  if (properties.unit === "mm" || properties.unit === "cm" || properties.unit === "in") result.unit = properties.unit;
  if (
    properties.recoverySource === "primary_backup" ||
    properties.recoverySource === "last_known_valid" ||
    properties.recoverySource === "clean_copy"
  ) {
    result.recoverySource = properties.recoverySource;
  }
  const source = safeCode(properties.source);
  const roomType = safeCode(properties.roomType);
  const category = safeCode(properties.category);
  const warningCode = safeCode(properties.warningCode);
  const errorCode = safeCode(properties.errorCode);
  if (source) result.source = source;
  if (roomType) result.roomType = roomType;
  if (category) result.category = category;
  if (warningCode) result.warningCode = warningCode;
  if (errorCode) result.errorCode = errorCode;
  for (const key of [
    "durationMs",
    "itemCount",
    "resultCount",
    "roomCount",
    "value",
    "bytes",
    "sampleCount",
  ] as const) {
    const value = finiteNonNegative(properties[key]);
    if (value !== undefined) result[key] = value;
  }
  if (typeof properties.firstInSession === "boolean") result.firstInSession = properties.firstInSession;
  return result;
}

export type ProductPerformanceObservation = {
  metric: ProductPerformanceMetric;
  value: number;
  context?: Pick<ProductTelemetryProperties, "mode" | "source" | "itemCount" | "roomCount">;
};

export function sanitizeProductPerformanceObservation(
  observation: ProductPerformanceObservation
): ProductPerformanceObservation | null {
  if (!PRODUCT_PERFORMANCE_METRICS.includes(observation.metric)) return null;
  const value = finiteNonNegative(observation.value);
  if (value === undefined) return null;
  return {
    metric: observation.metric,
    value,
    context: sanitizeProductTelemetryProperties(observation.context),
  };
}
