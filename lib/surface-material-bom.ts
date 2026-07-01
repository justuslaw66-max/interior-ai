import { getSurfaceMaterialById } from "./catalog-registry";
import type { RoomSnapshot, RoomSurfaceAssignments } from "./room-types";

export type SurfaceMaterialBomRow = {
  roomId: string;
  roomName: string;
  floorLabel?: string;
  surface: "floor";
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
};

function getRoomAreaSqm(room: RoomSnapshot): number {
  const polygon = room.planShape === "custom_polygon" ? room.planPolygon : null;
  if (polygon && polygon.length >= 3) {
    const area = polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point.x * next.z - next.x * point.z;
    }, 0);
    return Math.abs(area) / 2;
  }

  return Math.max(0, room.geometry.width * room.geometry.depth);
}

const FLOORING_WASTE_FACTOR = 0.1;

function roundSquareMeters(value: number): number {
  return Math.round(value * 100) / 100;
}

export function getRoomSurfaceAssignments(room: RoomSnapshot): RoomSurfaceAssignments | undefined {
  return room.surfaces ?? room.surfaceFinishes;
}

export function buildRoomSurfaceMaterialBomRows(rooms: RoomSnapshot[]): SurfaceMaterialBomRow[] {
  return rooms.flatMap((room) => {
    const surfaces = getRoomSurfaceAssignments(room);
    const floorMaterialId = String(surfaces?.floorMaterialId ?? "").trim();
    if (!floorMaterialId) return [];

    const material = getSurfaceMaterialById(floorMaterialId);
    if (!material) return [];

    const roomAreaSqm = roundSquareMeters(getRoomAreaSqm(room));
    const orderAreaSqm = roundSquareMeters(roomAreaSqm * (1 + FLOORING_WASTE_FACTOR));
    const pricePerSqm = material.commerce.price_per_sqm;
    const amount = typeof pricePerSqm?.amount === "number" ? pricePerSqm.amount : null;
    const lineTotal = amount === null ? null : amount * orderAreaSqm;
    const publishStatus = material.import_governance.publish_status ?? "unknown";
    const blockers = material.import_governance.publish_blockers ?? [];

    return [
      {
        roomId: room.id,
        roomName: room.name,
        floorLabel: room.floorLabel,
        surface: "floor",
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
      },
    ];
  });
}
