import { getSurfaceMaterialById } from "./catalog-registry";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "./floor-materials";
import {
  getWallPanelSurfaceSettings,
  getDefaultWallSurfaceSettings,
  getWallFaceLabel,
  getWallFaceSurfaceSettings,
  normalizeFloorSurfaceSettings,
} from "./surface-settings";
import {
  buildHousePlan2D,
  type HousePlanRoom2D,
} from "./design-page-house-plan";
import { mapPlanOpeningsToRoomRenderer } from "./design-page-plan-overlays";
import {
  buildWallSurfacePanels,
  getWallOpenings,
  getWallSegments,
} from "@/components/editor/renderers/house-plan-3d/geometry";
import type {
  PersistedPlanOpening,
  RoomFloorPattern,
  RoomSnapshot,
  RoomSurfaceAssignments,
} from "./room-types";

export type SurfaceMaterialBomRow = {
  roomId: string;
  roomName: string;
  floorLabel?: string;
  surface: "floor" | "walls" | "selected_wall";
  surfaceLabel: string;
  surfaceAreaSqm: number;
  wallFaceId?: string | null;
  wallPanelId?: string | null;
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
  const height = Math.max(
    0.2,
    room.geometry.wallHeights?.[faceId] ?? getRoomWallHeight(room)
  );
  if (faceId === "north" || faceId === "south") return Math.max(0, room.geometry.width * height);
  if (faceId === "east" || faceId === "west") return Math.max(0, room.geometry.depth * height);
  return Math.max(0, Math.max(room.geometry.width, room.geometry.depth) * height);
}

export function getRoomSurfaceAssignments(room: RoomSnapshot): RoomSurfaceAssignments | undefined {
  return room.surfaces ?? room.surfaceFinishes;
}

type BomWallPanel = {
  panelId: string;
  faceId: string;
  areaSqm: number;
  legacyPanelIds: readonly string[];
};

function buildRoomBomWallPanels(
  room: RoomSnapshot,
  topologyRoom: HousePlanRoom2D | undefined,
  topologyRooms: readonly HousePlanRoom2D[],
  openings: ReturnType<typeof mapPlanOpeningsToRoomRenderer>
): BomWallPanel[] {
  if (!topologyRoom) return [];
  return getWallSegments(topologyRoom).flatMap((segment) => {
    const faceId = segment.wall ?? segment.key;
    const height = Math.max(
      0.2,
      topologyRoom.wallHeights?.[faceId] ??
        topologyRoom.height ??
        getRoomWallHeight(room)
    );
    return buildWallSurfacePanels(
      topologyRoom,
      segment,
      getWallOpenings(topologyRoom, segment, topologyRooms, openings)
    ).map((panel) => ({
      panelId: panel.panelId,
      faceId: panel.faceId,
      areaSqm: panel.part.length * height,
      legacyPanelIds: panel.legacyPanelIds,
    }));
  });
}

export function buildRoomSurfaceMaterialBomRows(
  rooms: RoomSnapshot[],
  planOpenings: readonly PersistedPlanOpening[] = []
): SurfaceMaterialBomRow[] {
  const fallbackRoom = rooms[0];
  const housePlan = buildHousePlan2D(
    rooms,
    fallbackRoom?.geometry.width ?? 4,
    fallbackRoom?.geometry.depth ?? 5
  );
  const topologyRoomById = new Map(
    housePlan.rooms.map((room) => [room.id, room])
  );
  const rendererOpenings = mapPlanOpeningsToRoomRenderer([...planOpenings]);

  return rooms.flatMap((room) => {
    const surfaces = getRoomSurfaceAssignments(room);
    const rows: SurfaceMaterialBomRow[] = [];
    const wallPanels = buildRoomBomWallPanels(
      room,
      topologyRoomById.get(room.id),
      housePlan.rooms,
      rendererOpenings
    );
    const wallPanelAreaByFace = new Map<string, number>();
    wallPanels.forEach((panel) => {
      wallPanelAreaByFace.set(
        panel.faceId,
        (wallPanelAreaByFace.get(panel.faceId) ?? 0) + panel.areaSqm
      );
    });

    const makeRow = ({
      materialId,
      surface,
      surfaceLabel,
      surfaceAreaSqm,
      wallFaceId = null,
      wallPanelId = null,
      settings,
    }: {
      materialId: string | null | undefined;
      surface: SurfaceMaterialBomRow["surface"];
      surfaceLabel: string;
      surfaceAreaSqm: number;
      wallFaceId?: string | null;
      wallPanelId?: string | null;
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
        wallPanelId,
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
    const wallAreaSqm =
      wallPanelAreaByFace.size > 0
        ? [...wallPanelAreaByFace.values()].reduce(
            (sum, areaSqm) => sum + areaSqm,
            0
          )
        : getRoomWallAreaSqm(room);
    const panelAssignments = surfaces?.walls?.panels ?? {};
    const resolvedPanels = wallPanels.flatMap((panel) => {
      const assignmentId = [panel.panelId, ...panel.legacyPanelIds].find(
        (panelId) =>
          Object.prototype.hasOwnProperty.call(panelAssignments, panelId)
      );
      if (!assignmentId) return [];
      const settings = getWallPanelSurfaceSettings(
        surfaces,
        panel.faceId,
        panel.panelId,
        normalizeFloorRotationDeg,
        clampFloorPatternScale,
        panel.legacyPanelIds
      );
      return [{ ...panel, settings }];
    });
    const panelOverrideAreaByFace = new Map<string, number>();
    resolvedPanels.forEach((panel) => {
      panelOverrideAreaByFace.set(
        panel.faceId,
        (panelOverrideAreaByFace.get(panel.faceId) ?? 0) + panel.areaSqm
      );
    });
    const faceAreaTotal = faceIds.reduce(
      (sum, faceId) =>
        sum +
        (wallPanelAreaByFace.get(faceId) ??
          getRoomWallFaceAreaSqm(room, faceId)),
      0
    );
    const panelAreaOnDefaultFaces = resolvedPanels.reduce(
      (sum, panel) =>
        faceIds.includes(panel.faceId) ? sum : sum + panel.areaSqm,
      0
    );
    const remainingWallAreaSqm = Math.max(
      0,
      wallAreaSqm -
        Math.min(wallAreaSqm, faceAreaTotal) -
        panelAreaOnDefaultFaces
    );
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
        surfaceAreaSqm: Math.max(
          0,
          (wallPanelAreaByFace.get(faceId) ??
            getRoomWallFaceAreaSqm(room, faceId)) -
            (panelOverrideAreaByFace.get(faceId) ?? 0)
        ),
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

    resolvedPanels.forEach((panel) => {
      const panelRow = makeRow({
        materialId: panel.settings.materialId,
        surface: "selected_wall",
        surfaceLabel: `${getWallFaceLabel(panel.faceId)} panel`,
        surfaceAreaSqm: panel.areaSqm,
        wallFaceId: panel.faceId,
        wallPanelId: panel.panelId,
        settings: {
          pattern: panel.settings.pattern,
          rotationDeg: panel.settings.rotationDeg,
          scale: panel.settings.scale,
          offset: panel.settings.offset,
          jointSizeMm: panel.settings.jointSizeMm,
          jointColor: panel.settings.jointColor,
        },
      });
      if (panelRow) rows.push(panelRow);
    });

    return rows;
  });
}
