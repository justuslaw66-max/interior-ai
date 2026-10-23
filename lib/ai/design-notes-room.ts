import type { DesignNotesOutput } from "@/lib/ai/design-notes-contract";
import {
  buildFloorSurfaceIssues,
  buildRoomSurfaceSuitabilityIssues,
  toSurfaceCheckRoom,
  type RoomWithSurfaces,
  type SurfaceCheckRoom,
} from "@/lib/floor-plan-surface-checks";
import type { RoomType } from "@/lib/room-types";
import { getFloorSwapCandidates, isFloorSwapCandidate } from "@/lib/surface-floor-swaps";
import { getRuntimeSurfaceMaterialById, type SurfaceMaterialRenderRecord } from "@/lib/surface-material-runtime";

/**
 * The active room as AI notes sees it (J, 18 Oct 2026, step 2 of the AI tile plan): its type, its floor and walls with
 * the facts from ABK's sheets, plan review's surface findings, and the floors it may swap in. The page sends only the
 * room's type and material ids; the server looks up everything else, and keeps a floor swap only when it names one of
 * the room's candidates (`surface-floor-swaps.ts`). See docs/architecture/surface-suitability-checks.md.
 */
const ROOM_TYPES: Record<RoomType, true> = {
  living: true,
  bedroom: true,
  dining: true,
  kitchen: true,
  toilet: true,
  balcony: true,
  custom: true,
};

/** The fields of a SWAP_SURFACE action, as the model or the cache gave them. */
type SwapSurfaceFields = {
  roomId?: string;
  surface?: string;
  materialId?: string;
  fromMaterialId?: string | null;
};

function boundedString(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maxLength ? value.trim() : null;
}

function parseRoomType(value: unknown): RoomType | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ROOM_TYPES, value) ? (value as RoomType) : null;
}

function parseMaterialIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 64) return null;
  const ids = value.map((entry) => boundedString(entry, 200));
  return ids.every((id): id is string => id !== null) ? ids : null;
}

/** The room the page sent, or `null` when it sent none or one outside the contract. */
export function parseDesignNotesRoom(value: unknown): SurfaceCheckRoom | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, 128);
  const name = boundedString(raw.name, 120);
  const roomType = parseRoomType(raw.roomType);
  const floorMaterialId = raw.floorMaterialId == null ? null : boundedString(raw.floorMaterialId, 200);
  const wallMaterialIds = parseMaterialIds(raw.wallMaterialIds);
  if (!id || !name || !roomType || !wallMaterialIds) return null;
  if (raw.floorMaterialId != null && !floorMaterialId) return null;
  return { id, name, roomType, floorMaterialId, wallMaterialIds };
}

export function buildDesignNotesRoom(room: RoomWithSurfaces | null | undefined): SurfaceCheckRoom | null {
  return room ? toSurfaceCheckRoom(room) : null;
}

/** Whether the room has a floor or wall from the tile catalogue: the starter floor doesn't count. */
export function hasDesignNotesFinish(room: SurfaceCheckRoom | null): boolean {
  if (!room) return false;
  return [room.floorMaterialId, ...room.wallMaterialIds].some((id) => getRuntimeSurfaceMaterialById(id) !== null);
}

function describeMaterial(record: SurfaceMaterialRenderRecord) {
  const facts = record.suitability;
  return {
    materialId: record.surface_material.material_id,
    name: record.surface_material.product_name,
    colourFamily: record.classification.color_family,
    slipClass: facts?.slip_rating ?? null,
    barefootClass: facts?.barefoot_slip_rating ?? null,
    technicalSheet: facts?.datasheet ?? null,
    inOutdoorRange: facts?.outdoor_floor ?? false,
    whiteBodyWallTile: facts?.wall_tile_body ?? false,
  };
}

function describeFinish(materialId: string | null) {
  const record = getRuntimeSurfaceMaterialById(materialId);
  return record ? describeMaterial(record) : { fromTileCatalogue: false };
}

/** What the model is told about the room. Facts come from the server's own catalogue, not from the request. */
export function describeDesignNotesRoom(room: SurfaceCheckRoom) {
  return {
    name: room.name,
    roomType: room.roomType,
    floor: describeFinish(room.floorMaterialId),
    walls: room.wallMaterialIds.map(describeFinish),
    surfaceFindings: buildRoomSurfaceSuitabilityIssues(room).map((issue) => ({
      title: issue.title,
      detail: issue.detail,
      fix: issue.suggestedFix,
    })),
    floorSwapCandidates: getFloorSwapCandidates(room).map(describeMaterial),
  };
}

function checkedFloorSwap(action: SwapSurfaceFields, room: SurfaceCheckRoom | null, allowed: Set<string>) {
  if (!room || action.roomId !== room.id || action.surface !== "floor") return null;
  if (!action.materialId || !allowed.has(action.materialId)) return null;
  return {
    type: "SWAP_SURFACE" as const,
    roomId: room.id,
    surface: "floor" as const,
    materialId: action.materialId,
    fromMaterialId: room.floorMaterialId,
  };
}

/**
 * Keeps a floor swap only when it names this room and one of its candidates, and records the floor it replaces, so the
 * page can refuse it once the floor has changed. Other suggestions pass unchanged.
 */
export function keepCheckedFloorSwaps(output: DesignNotesOutput, room: SurfaceCheckRoom | null): DesignNotesOutput {
  const allowed = new Set(room ? getFloorSwapCandidates(room).map((record) => record.surface_material.material_id) : []);
  const suggestions = output.suggestions.flatMap((suggestion) => {
    if (suggestion.action.type !== "SWAP_SURFACE") return [suggestion];
    const action = checkedFloorSwap(suggestion.action, room, allowed);
    return action ? [{ ...suggestion, action }] : [];
  });
  return { ...output, suggestions };
}

/** Without an AI provider: the nearest candidate for a flagged floor, named with what the checks found. */
export function fallbackFloorSwapSuggestions(room: SurfaceCheckRoom | null): DesignNotesOutput["suggestions"] {
  if (!room) return [];
  const [best] = getFloorSwapCandidates(room, 1);
  const [finding] = buildFloorSurfaceIssues(room);
  if (!best || !finding) return [];
  const materialId = best.surface_material.material_id;
  return [{
    id: `fallback_floor_swap_${room.id}`,
    label: `${finding.title}. Swap it for ${best.surface_material.product_name}.`,
    action: { type: "SWAP_SURFACE", roomId: room.id, surface: "floor", materialId, fromMaterialId: room.floorMaterialId },
  }];
}

/** Why the page won't apply a floor swap now, or `null` when it can. */
export function floorSwapProblem(room: SurfaceCheckRoom | null, action: SwapSurfaceFields): string | null {
  if (!room || action.roomId !== room.id) return "These notes are for another room. Open that room and get new notes.";
  if (action.surface !== "floor") return "AI notes can only swap floors.";
  if (action.fromMaterialId !== undefined && action.fromMaterialId !== room.floorMaterialId) {
    return "This room's floor has changed since these notes. Get new notes.";
  }
  if (!isFloorSwapCandidate(room, getRuntimeSurfaceMaterialById(action.materialId))) {
    return "That tile no longer suits this room. Get new notes.";
  }
  return null;
}
