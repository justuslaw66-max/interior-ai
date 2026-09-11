import { buildHousePlan2D } from "@/lib/design-page-house-plan";
import { resolveDesignPageOpeningHosts } from "@/lib/design-page-opening-host";
import {
  buildRoomSurfaceMaterialBomRows,
  type SurfaceMaterialBomRow,
} from "@/lib/surface-material-bom";
import type { PersistedPlanOpening, RoomSnapshot } from "@/lib/room-types";

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
  const noun = warnings.length === 1 ? "opening" : "openings";
  return `Warning — wall quantities remain uncut for ${noun}: ${warnings.map(({ openingId }) => openingId).join(", ")}.`;
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
      message: `${resolution.consumerMessage} Wall quantities were left uncut for this opening.`,
    }];
  });
  return {
    rows: buildRoomSurfaceMaterialBomRows(rooms, openings),
    warnings,
    blocked: warnings.length > 0,
  };
}
