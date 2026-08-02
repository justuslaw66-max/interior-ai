export type FloorPlanProcessingMode = "background" | "inline";

type ProcessingEnvironment = Readonly<{
  FLOOR_PLAN_PROCESSING_MODE?: string;
  NODE_ENV?: string;
}>;

/**
 * Production requests enqueue work for the lease-backed worker by default.
 * Local development and tests retain an explicit inline path so contributors
 * can exercise the complete pipeline without operating a second process.
 */
export function resolveFloorPlanProcessingMode(
  environment: ProcessingEnvironment = process.env
): FloorPlanProcessingMode {
  const configured = environment.FLOOR_PLAN_PROCESSING_MODE?.trim().toLowerCase();
  if (configured === "background" || configured === "inline") return configured;
  if (configured) {
    throw new Error(
      `Invalid FLOOR_PLAN_PROCESSING_MODE "${configured}"; expected "background" or "inline"`
    );
  }
  return environment.NODE_ENV === "production" ? "background" : "inline";
}
