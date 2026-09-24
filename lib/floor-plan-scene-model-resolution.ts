import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";

/** A rejected canonical document must never fall back to approximate room geometry. */
export function resolveCanonicalSceneModel(document: FloorPlanDocumentV2 | null, geometryHash: string | null) {
  if (!document) return { plan: null, error: null };
  try {
    return { plan: compileCanonicalFloorPlanRenderModel(document, geometryHash), error: null };
  } catch (cause) {
    console.error("Canonical floor-plan render model rejected", cause);
    return { plan: null, error: cause instanceof Error ? cause.message : "Canonical floor-plan integrity check failed" };
  }
}
