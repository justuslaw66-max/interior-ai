import { findAbkDatasheetMatch } from "./surface-material-abk-datasheet-lookup";
import type { SurfaceSuitabilityFacts } from "./surface-material-runtime-types";
import type { SurfaceMaterial } from "./surface-material-schema";

/**
 * Builds a catalogue entry's tile facts for plan review's surface checks (17 Oct 2026). The generator calls it; app code
 * reads the result from the render data (`surface-material-suitability.ts`) and never imports this file or ABK's sheets.
 *
 * - The slip class is the YAML's `physical_specs.slip_rating` (filled from the sheets on 14 Oct), else the sheet's.
 * - The barefoot class and the sheet are ABK's technical sheet's, for Gardenia entries the sheet covers.
 * - An outdoor floor is one in ABK's outdoor range: it lists `classification.outdoor_uses`.
 * - A white-body wall tile is one whose sheet gives EN 14411 group BIII (Gioia's plain colours: water absorption over 10%).
 * - A laminate sheet is a wall panel made from the laminate catalogue (lib/laminate-wall-panel-materials.ts): Greenlam's
 *   1 mm HPL, which is bonded to a board and is for dry walls (26 Oct 2026).
 */
export function buildSurfaceSuitabilityFacts(
  entry: Pick<SurfaceMaterial, "surface_material" | "classification" | "physical_specs">
): SurfaceSuitabilityFacts {
  const match = entry.surface_material.supplier === "gardenia_orchidea"
    ? findAbkDatasheetMatch({ ...entry.surface_material, ...entry.physical_specs })
    : null;
  return {
    slip_rating: entry.physical_specs.slip_rating ?? match?.shod_slip ?? null,
    barefoot_slip_rating: match?.barefoot_slip ?? null,
    datasheet: match?.datasheet.collection ?? null,
    outdoor_floor: (entry.classification.outdoor_uses?.length ?? 0) > 0,
    wall_tile_body: match?.datasheet.en14411_group === "BIII",
    laminate_sheet: entry.surface_material.surface_category === "wall_panel" && entry.classification.flooring_type === "laminate",
  };
}
