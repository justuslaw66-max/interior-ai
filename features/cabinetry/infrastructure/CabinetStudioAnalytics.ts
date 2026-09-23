import { track } from "@/lib/analytics";

import type { CabinetDefinition } from "../types";

export interface CabinetStudioAnalyticsContext {
  accessLevel: "consumer" | "pro";
  mode: "create" | "edit";
  definition: CabinetDefinition;
}

export type CabinetStudioAnalyticsTracker = (
  event: string,
  details: Record<string, unknown>
) => void;

export function emitCabinetStudioAnalytics(
  event: string,
  context: CabinetStudioAnalyticsContext,
  details: Record<string, unknown> = {},
  tracker: CabinetStudioAnalyticsTracker = track
): void {
  try {
    tracker(event, {
      access_level: context.accessLevel,
      studio_mode: context.mode,
      assembly_type:
        context.definition.millworkAssemblyType ??
        context.definition.millworkFamily ??
        "cabinet",
      module_count: context.definition.modules.length,
      ...details,
    });
  } catch {
    // Analytics is optional and must never turn a completed editor action into a failure.
  }
}
