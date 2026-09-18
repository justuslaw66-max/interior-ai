import {
  clampFloorPatternScale,
  getFloorMaterialById,
  normalizeFloorRotationDeg,
} from "@/lib/floor-materials";
import type { PersistedPlanOpening, RoomSnapshot } from "@/lib/room-types";
import { buildRoomWallFinishQuantities } from "@/lib/surface-material-wall-panels";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import {
  getCeilingSurfaceSettings,
  getDefaultWallSurfaceSettings,
  getWallFaceLabel,
  getWallFaceSurfaceSettings,
  normalizeFloorSurfaceSettings,
  type NormalizedSurfaceSettings,
} from "@/lib/surface-settings";
import { getWallPaintDisplayName } from "@/lib/wall-paint";
import {
  formatSurfaceMaterialValue,
  getSurfaceRoomAreaSqm,
  type SurfaceRoomSummary,
  type SurfaceSummaryRow,
} from "./surfaceCatalog";

type SampleUrlFor = (materialId: string | null | undefined) => string | null;

/** Project design rooms and their wall finish quantities for the Surface Summary. */
export function buildSurfaceRoomSummaries(
  rooms: RoomSnapshot[],
  planOpenings: readonly PersistedPlanOpening[]
): SurfaceRoomSummary[] {
  const wallFinishQuantities = buildRoomWallFinishQuantities(rooms, planOpenings);
  return rooms.map((room, index) => ({
    id: room.id,
    name: room.name,
    floorLabel: room.floorLabel,
    roomType: room.roomType,
    width: room.geometry.width,
    depth: room.geometry.depth,
    height: room.geometry.height,
    surfaces: room.surfaces,
    surfaceFinishes: room.surfaceFinishes,
    wallFinishQuantities: wallFinishQuantities[index],
  }));
}

function buildWallFinishRow(
  room: SurfaceRoomSummary,
  scope: { id: string; target: "walls" | "selected_wall"; surfaceLabel: string; areaSqm: number },
  settings: NormalizedSurfaceSettings,
  sampleUrlFor: SampleUrlFor
): SurfaceSummaryRow | null {
  if (!settings.materialId && !settings.paintColorHex) return null;
  const material = settings.materialId ? getRuntimeSurfaceMaterialById(settings.materialId) : null;
  const starter = settings.materialId ? getFloorMaterialById(settings.materialId) : null;
  return {
    ...scope,
    room,
    materialId: material?.surface_material.material_id ?? starter?.id ?? `paint:${settings.paintColorHex}`,
    materialName:
      material?.surface_material.product_name ??
      starter?.name ??
      getWallPaintDisplayName(settings.paintColorHex, settings.paintName),
    supplier: material
      ? material.surface_material.brand ?? formatSurfaceMaterialValue(material.surface_material.supplier)
      : starter
        ? "Starter finish"
        : "Paint colour",
    status: material?.import_governance.publish_status ?? (starter ? "not_orderable" : "visual_finish"),
    sampleUrl: sampleUrlFor(settings.materialId),
    settings: {
      pattern: settings.pattern,
      rotationDeg: settings.rotationDeg,
      scale: settings.scale,
      offset: settings.offset,
      jointSizeMm: settings.jointSizeMm,
      jointColor: settings.jointColor,
    },
  };
}

function buildRoomFloorAndCeilingRows(
  room: SurfaceRoomSummary,
  sampleUrlFor: SampleUrlFor
): SurfaceSummaryRow[] {
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const floorMaterialId = surfaces?.floorMaterialId ?? null;
  const floorMaterial = getRuntimeSurfaceMaterialById(floorMaterialId);
  const starterMaterial = getFloorMaterialById(floorMaterialId);
  const floorSettings = normalizeFloorSurfaceSettings(surfaces, normalizeFloorRotationDeg, clampFloorPatternScale);
  const ceilingSettings = getCeilingSurfaceSettings(surfaces, normalizeFloorRotationDeg, clampFloorPatternScale);
  return [
    {
      id: `${room.id}-floor`,
      room,
      target: "floor",
      surfaceLabel: "Floor",
      materialId: floorMaterial?.surface_material.material_id ?? starterMaterial.id,
      materialName: floorMaterial?.surface_material.product_name ?? starterMaterial.name,
      supplier: floorMaterial
        ? floorMaterial.surface_material.brand ?? formatSurfaceMaterialValue(floorMaterial.surface_material.supplier)
        : "Starter finish",
      areaSqm: getSurfaceRoomAreaSqm(room),
      status: floorMaterial?.import_governance.publish_status ?? "not_orderable",
      sampleUrl: sampleUrlFor(floorMaterialId),
      settings: {
        pattern: floorSettings.floorPattern,
        rotationDeg: floorSettings.floorRotationDeg,
        scale: floorSettings.floorScale,
        offset: floorSettings.floorPatternOffset,
        jointSizeMm: floorSettings.floorJointSizeMm,
        jointColor: floorSettings.floorJointColor,
      },
    },
    {
      id: `${room.id}-ceiling`,
      room,
      target: "ceiling",
      surfaceLabel: "Ceiling",
      materialId: ceilingSettings.paintColorHex ? `paint:${ceilingSettings.paintColorHex}` : `ceiling:${room.id}`,
      materialName: ceilingSettings.paintColorHex
        ? getWallPaintDisplayName(ceilingSettings.paintColorHex, ceilingSettings.paintName)
        : "No ceiling paint",
      supplier: ceilingSettings.paintColorHex ? "Paint colour" : "Visual finish",
      areaSqm: getSurfaceRoomAreaSqm(room),
      status: ceilingSettings.paintColorHex ? "visual_finish" : "not_started",
      sampleUrl: null,
      settings: {
        pattern: ceilingSettings.pattern,
        rotationDeg: ceilingSettings.rotationDeg,
        scale: ceilingSettings.scale,
        offset: ceilingSettings.offset,
        jointSizeMm: ceilingSettings.jointSizeMm,
        jointColor: ceilingSettings.jointColor,
      },
    },
  ];
}

function buildRoomWallRows(room: SurfaceRoomSummary, sampleUrlFor: SampleUrlFor): SurfaceSummaryRow[] {
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const { faceAreaSqmById, remainingWallAreaSqm, assignedPanels } = room.wallFinishQuantities;
  const faceIds = [...faceAreaSqmById.keys()];
  const rows = [
    buildWallFinishRow(room, {
      id: `${room.id}-walls`,
      target: "walls",
      surfaceLabel: faceIds.length > 0 ? "Remaining walls" : "All walls",
      areaSqm: remainingWallAreaSqm,
    }, getDefaultWallSurfaceSettings(surfaces, normalizeFloorRotationDeg, clampFloorPatternScale), sampleUrlFor),
    ...faceIds.map((faceId) => buildWallFinishRow(room, {
      id: `${room.id}-wall-${faceId}`,
      target: "selected_wall",
      surfaceLabel: getWallFaceLabel(faceId),
      areaSqm: faceAreaSqmById.get(faceId) ?? 0,
    }, getWallFaceSurfaceSettings(surfaces, faceId, normalizeFloorRotationDeg, clampFloorPatternScale), sampleUrlFor)),
    ...assignedPanels.map((panel) => buildWallFinishRow(room, {
      id: `${room.id}-wall-panel-${panel.panelId}`,
      target: "selected_wall",
      surfaceLabel: panel.surfaceLabel,
      areaSqm: panel.areaSqm,
    }, panel.settings, sampleUrlFor)),
  ];
  return rows.filter((row): row is SurfaceSummaryRow => row !== null);
}

/**
 * Surface Summary rows for every room. Wall areas come from the same
 * aperture-free quantities as the export bill of materials.
 */
export function buildSurfaceSummaryRows(
  rooms: readonly SurfaceRoomSummary[],
  sampleUrlFor: SampleUrlFor
): SurfaceSummaryRow[] {
  return rooms.flatMap((room) => [
    ...buildRoomFloorAndCeilingRows(room, sampleUrlFor),
    ...buildRoomWallRows(room, sampleUrlFor),
  ]);
}
