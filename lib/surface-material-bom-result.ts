import { buildHousePlan2D } from "@/lib/design-page-house-plan";
import { resolveDesignPageOpeningHosts } from "@/lib/design-page-opening-host";
import {
  buildRoomSurfaceMaterialBomRows,
  type SurfaceMaterialBomRow,
} from "@/lib/surface-material-bom";
import type { PersistedPlanOpening, RoomSnapshot } from "@/lib/room-types";
import { formatSheetCount, formatSheetSize } from "@/lib/surface-material-sheets";
import { formatWallPanelBackingOrder } from "@/lib/laminate-wall-backing";

export type SurfaceMaterialBomWarning = {
  code: "UNRESOLVED_OPENING_HOST";
  openingId: string;
  status: "unresolved" | "ambiguous" | "unsupported" | "invalid";
  message: string;
};

export type SurfaceMaterialBomResult = {
  rows: SurfaceMaterialBomRow[];
  warnings: SurfaceMaterialBomWarning[];
  blocked: boolean;
};

export function formatSurfaceMaterialBomWarning(
  warnings: readonly Pick<SurfaceMaterialBomWarning, "openingId">[]
) {
  const noun = warnings.length === 1 ? "door or window" : "doors or windows";
  return `Warning — wall quantities remain uncut for ${warnings.length} ${noun}.`;
}

/**
 * What to order of a row: "12 sheets of 1220 × 2440 mm" for a finish sold by the sheet, with a laminate's board ("on 12 MDF
 * boards, 9 mm, glued"), or its order area, as the export formats areas, "incl. 10% waste".
 */
export function formatSurfaceMaterialBomOrder(
  row: Pick<SurfaceMaterialBomRow, "orderSheets" | "sheetSizeMm" | "orderAreaSqm"> & Partial<Pick<SurfaceMaterialBomRow, "backing">>,
  formatArea: (areaSqm: number) => string
): string {
  if (row.orderSheets !== null && row.sheetSizeMm) {
    const sheets = `${formatSheetCount(row.orderSheets)} of ${formatSheetSize(row.sheetSizeMm)}`;
    return row.backing ? `${sheets} ${formatWallPanelBackingOrder(row.backing)}` : sheets;
  }
  return `${formatArea(row.orderAreaSqm)} incl. 10% waste`;
}

export function buildRoomSurfaceMaterialBomResult(
  rooms: RoomSnapshot[],
  openings: readonly PersistedPlanOpening[] = []
): SurfaceMaterialBomResult {
  const firstRoom = rooms[0];
  const plan = buildHousePlan2D(
    rooms,
    firstRoom?.geometry.width ?? 4,
    firstRoom?.geometry.depth ?? 5
  );
  const warnings = resolveDesignPageOpeningHosts(openings, plan.rooms).flatMap(
    ({ opening, resolution }): SurfaceMaterialBomWarning[] => {
    return resolution.status === "resolved" ? [] : [{
      code: "UNRESOLVED_OPENING_HOST",
      openingId: opening.id,
      status: resolution.status,
      message: `${resolution.consumerMessage} Wall quantities were left uncut for this door or window.`,
    }];
  });
  return {
    rows: buildRoomSurfaceMaterialBomRows(rooms, openings),
    warnings,
    blocked: warnings.length > 0,
  };
}
