import { getSurfaceMaterialById } from "./catalog-registry";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "./floor-materials";
import {
  getDefaultWallSurfaceSettings,
  getWallFaceLabel,
  getWallFaceSurfaceSettings,
  normalizeFloorSurfaceSettings,
} from "./surface-settings";
import type { RoomFloorPattern, RoomSnapshot, RoomSurfaceAssignments } from "./room-types";

export type SurfaceMaterialBomRow = {
  roomId: string;
  roomName: string;
  floorLabel?: string;
  surface: "floor" | "walls" | "selected_wall";
  surfaceLabel: string;
  surfaceAreaSqm: number;
  wallFaceId?: string | null;
  materialId: string;
  materialName: string;
  supplier: string;
  brand?: string | null;
  materialFamily: string;
  category: "surface_material";
  roomAreaSqm: number;
  orderAreaSqm: number;
  wasteFactor: number;
  quantitySqm: number;
  status: "published" | "draft" | "blocked" | "needs_review" | "unknown";
  purchaseMode: string;
  sampleRequestUrl: string | null;
  sourceUrl: string | null;
  pricePerSqmCurrency: string | null;
  pricePerSqmAmount: number | null;
  lineTotal: number | null;
  publishBlockers: string[];
  reviewNote: string | null;
  pattern: RoomFloorPattern;
  rotationDeg: number;
  scale: number;
  patternOffset: { x: number; y: number };
  jointSizeMm: number;
  jointColor: string;
  floorPattern: RoomFloorPattern;
  floorRotationDeg: number;
  floorScale: number;
  floorPatternOffset: { x: number; y: number };
  floorJointSizeMm: number;
  floorJointColor: string;
};

function getRoomAreaSqm(room: RoomSnapshot): number {
  const polygon = room.planShape === "custom_polygon" ? room.planPolygon : null;
  if (polygon && polygon.length >= 3) {
    const loopArea = (loop: NonNullable<RoomSnapshot["planPolygon"]>) => Math.abs(loop.reduce((sum, point, index) => {
      const next = loop[(index + 1) % loop.length];
      return sum + point.x * next.z - next.x * point.z;
    }, 0)) / 2;
    return Math.max(
      0,
      loopArea(polygon) -
        (room.planHoles ?? []).reduce(
          (sum, hole) => sum + (hole.length >= 3 ? loopArea(hole) : 0),
          0
        )
    );
  }

  return Math.max(0, room.geometry.width * room.geometry.depth);
}

const FLOORING_WASTE_FACTOR = 0.1;

function roundSquareMeters(value: number): number {
  return Math.round(value * 100) / 100;
}

function getRoomWallHeight(room: RoomSnapshot): number {
  return Math.max(0.2, room.geometry.height ?? 2.6);
}

function getRoomWallAreaSqm(room: RoomSnapshot): number {
  const polygon = room.planShape === "custom_polygon" ? room.planPolygon : null;
  if (polygon && polygon.length >= 2) {
    const loopPerimeter = (loop: NonNullable<RoomSnapshot["planPolygon"]>) => loop.reduce((sum, point, index) => {
      const next = loop[(index + 1) % loop.length];
      return sum + Math.hypot(next.x - point.x, next.z - point.z);
    }, 0);
    const perimeter = loopPerimeter(polygon) +
      (room.planHoles ?? []).reduce(
        (sum, hole) => sum + (hole.length >= 2 ? loopPerimeter(hole) : 0),
        0
      );
    return perimeter * getRoomWallHeight(room);
  }
  return Math.max(0, (room.geometry.width + room.geometry.depth) * 2 * getRoomWallHeight(room));
}

function getRoomWallFaceAreaSqm(room: RoomSnapshot, faceId: string): number {
  const height = getRoomWallHeight(room);
  if (faceId === "north" || faceId === "south") return Math.max(0, room.geometry.width * height);
  if (faceId === "east" || faceId === "west") return Math.max(0, room.geometry.depth * height);
  return Math.max(0, Math.max(room.geometry.width, room.geometry.depth) * height);
}

export function getRoomSurfaceAssignments(room: RoomSnapshot): RoomSurfaceAssignments | undefined {
  return room.surfaces ?? room.surfaceFinishes;
}

export function buildRoomSurfaceMaterialBomRows(rooms: RoomSnapshot[]): SurfaceMaterialBomRow[] {
  return rooms.flatMap((room) => {
    const surfaces = getRoomSurfaceAssignments(room);
    const rows: SurfaceMaterialBomRow[] = [];

    const makeRow = ({
      materialId,
      surface,
      surfaceLabel,
      surfaceAreaSqm,
      wallFaceId = null,
      settings,
    }: {
      materialId: string | null | undefined;
      surface: SurfaceMaterialBomRow["surface"];
      surfaceLabel: string;
      surfaceAreaSqm: number;
      wallFaceId?: string | null;
      settings: {
        pattern: RoomFloorPattern;
        rotationDeg: number;
        scale: number;
        offset: { x: number; y: number };
        jointSizeMm: number;
        jointColor: string;
      };
    }): SurfaceMaterialBomRow | null => {
      const normalizedMaterialId = String(materialId ?? "").trim();
      if (!normalizedMaterialId) return null;
      const material = getSurfaceMaterialById(normalizedMaterialId);
      if (!material) return null;

      const roomAreaSqm = roundSquareMeters(getRoomAreaSqm(room));
      const roundedSurfaceAreaSqm = roundSquareMeters(surfaceAreaSqm);
      const orderAreaSqm = roundSquareMeters(roundedSurfaceAreaSqm * (1 + FLOORING_WASTE_FACTOR));
      const pricePerSqm = material.commerce.price_per_sqm;
      const amount = typeof pricePerSqm?.amount === "number" ? pricePerSqm.amount : null;
      const lineTotal = amount === null ? null : amount * orderAreaSqm;
      const publishStatus = material.import_governance.publish_status ?? "unknown";
      const blockers = material.import_governance.publish_blockers ?? [];

      return {
        roomId: room.id,
        roomName: room.name,
        floorLabel: room.floorLabel,
        surface,
        surfaceLabel,
        surfaceAreaSqm: roundedSurfaceAreaSqm,
        wallFaceId,
        materialId: material.surface_material.material_id,
        materialName: material.surface_material.product_name,
        supplier: material.surface_material.brand ?? material.surface_material.supplier,
        brand: material.surface_material.brand,
        materialFamily: material.surface_material.material_family,
        category: "surface_material",
        roomAreaSqm,
        orderAreaSqm,
        wasteFactor: FLOORING_WASTE_FACTOR,
        quantitySqm: orderAreaSqm,
        status: publishStatus,
        purchaseMode: material.commerce.purchase_mode,
        sampleRequestUrl: material.commerce.sample_request_url ?? material.source.sample_request_url ?? null,
        sourceUrl: material.source.source_url,
        pricePerSqmCurrency: pricePerSqm?.currency ?? material.source.currency ?? null,
        pricePerSqmAmount: amount,
        lineTotal,
        publishBlockers: blockers,
        reviewNote: blockers.length > 0 ? blockers.join("; ") : null,
        pattern: settings.pattern,
        rotationDeg: settings.rotationDeg,
        scale: settings.scale,
        patternOffset: settings.offset,
        jointSizeMm: settings.jointSizeMm,
        jointColor: settings.jointColor,
        floorPattern: settings.pattern,
        floorRotationDeg: settings.rotationDeg,
        floorScale: settings.scale,
        floorPatternOffset: settings.offset,
        floorJointSizeMm: settings.jointSizeMm,
        floorJointColor: settings.jointColor,
      };
    };

    const floorSettings = normalizeFloorSurfaceSettings(
      surfaces,
      normalizeFloorRotationDeg,
      clampFloorPatternScale
    );
    const floorRow = makeRow({
      materialId: surfaces?.floorMaterialId ?? surfaces?.floor?.materialId,
      surface: "floor",
      surfaceLabel: "Floor",
      surfaceAreaSqm: getRoomAreaSqm(room),
      settings: {
        pattern: floorSettings.floorPattern,
        rotationDeg: floorSettings.floorRotationDeg,
        scale: floorSettings.floorScale,
        offset: floorSettings.floorPatternOffset,
        jointSizeMm: floorSettings.floorJointSizeMm,
        jointColor: floorSettings.floorJointColor,
      },
    });
    if (floorRow) rows.push(floorRow);

    const wallDefaultSettings = getDefaultWallSurfaceSettings(
      surfaces,
      normalizeFloorRotationDeg,
      clampFloorPatternScale
    );
    const faceIds = Object.keys(surfaces?.walls?.faces ?? {});
    const wallAreaSqm = getRoomWallAreaSqm(room);
    const faceAreaTotal = faceIds.reduce(
      (sum, faceId) => sum + getRoomWallFaceAreaSqm(room, faceId),
      0
    );
    const remainingWallAreaSqm = Math.max(0, wallAreaSqm - Math.min(wallAreaSqm, faceAreaTotal));
    const wallDefaultRow = makeRow({
      materialId: wallDefaultSettings.materialId,
      surface: "walls",
      surfaceLabel: faceIds.length > 0 ? "Remaining walls" : "All walls",
      surfaceAreaSqm: remainingWallAreaSqm,
      settings: {
        pattern: wallDefaultSettings.pattern,
        rotationDeg: wallDefaultSettings.rotationDeg,
        scale: wallDefaultSettings.scale,
        offset: wallDefaultSettings.offset,
        jointSizeMm: wallDefaultSettings.jointSizeMm,
        jointColor: wallDefaultSettings.jointColor,
      },
    });
    if (wallDefaultRow) rows.push(wallDefaultRow);

    faceIds.forEach((faceId) => {
      const faceSettings = getWallFaceSurfaceSettings(
        surfaces,
        faceId,
        normalizeFloorRotationDeg,
        clampFloorPatternScale
      );
      const faceRow = makeRow({
        materialId: faceSettings.materialId,
        surface: "selected_wall",
        surfaceLabel: getWallFaceLabel(faceId),
        surfaceAreaSqm: getRoomWallFaceAreaSqm(room, faceId),
        wallFaceId: faceId,
        settings: {
          pattern: faceSettings.pattern,
          rotationDeg: faceSettings.rotationDeg,
          scale: faceSettings.scale,
          offset: faceSettings.offset,
          jointSizeMm: faceSettings.jointSizeMm,
          jointColor: faceSettings.jointColor,
        },
      });
      if (faceRow) rows.push(faceRow);
    });

    return rows;
  });
}
