import type { CompiledFloorPlanOpeningV2 } from "@/lib/floor-plan-compiler-v2";
import type { CanonicalOpeningSymbolRole } from "@/lib/floor-plan-opening-primitives";

export function openingColor(opening: CompiledFloorPlanOpeningV2, selected: boolean) {
  if (selected) return "#f97316";
  if (opening.kind === "window" || opening.kind === "vent" || opening.kind === "louvre") return "#0891b2";
  return "#1d4ed8";
}

export function symbolLineStyle(role: CanonicalOpeningSymbolRole) {
  if (role === "swing_arc") return { width: 1.15, dashed: true };
  if (role === "host_span") return { width: 3.2, dashed: false };
  if (role === "open_jamb" || role === "vent_slat") return { width: 1.35, dashed: false };
  return { width: 1.8, dashed: false };
}
