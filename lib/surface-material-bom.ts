import { getSurfaceMaterialById } from "./catalog-registry";
import type { PersistedPlanOpening, RoomFloorPattern, RoomSnapshot } from "./room-types";
import {
  buildRoomSurfaceAreaRows,
  getRoomSurfaceAssignments,
  type SurfaceAreaRow,
} from "./surface-material-areas";
import type { SurfaceMaterial } from "./surface-material-schema";
import { countSurfaceSheets, getSheetAreaSqm, getSurfaceSheetSize, type SurfaceSheetSize } from "./surface-material-sheets";
import {
  buildWallPanelBackingOrder,
  getLaminateWallPanelJointMm,
  isLaminateWallSheet,
  type WallPanelBackingOrder,
} from "./laminate-wall-backing";

export { getRoomSurfaceAssignments };

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
  /** A finish sold by the sheet (a wall panel): its sheet and how many to order; null for one ordered by area. */
  sheetSizeMm: SurfaceSheetSize | null;
  orderSheets: number | null;
  /** A laminate sheet's board behind each sheet, and its battens when fixed on them; null for anything else. */
  backing: WallPanelBackingOrder | null;
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

/**
 * What to order of a finish sold by the sheet: whole sheets, and for a laminate sheet the board behind each one, which is
 * never left out (J, 28 Oct 2026), and its joint of at least 3 mm. Sheets are bought whole, so a priced sheet finish costs
 * its sheets' area.
 */
function sheetOrderOf(area: SurfaceAreaRow, material: SurfaceMaterial) {
  const { settings } = area;
  const sheet = getSurfaceSheetSize(material);
  const orderSheets = sheet
    ? countSurfaceSheets({ pieces: area.wallPieces, orderAreaSqm: area.orderAreaSqm, rotationDeg: settings.rotationDeg, sheet })
    : null;
  const laminate = isLaminateWallSheet(material);
  return {
    sheet,
    orderSheets,
    pricedAreaSqm: sheet && orderSheets !== null ? orderSheets * getSheetAreaSqm(sheet) : area.orderAreaSqm,
    backing: laminate && sheet && orderSheets !== null
      ? buildWallPanelBackingOrder({
          backing: settings.panelBacking, sheets: orderSheets, sheet, pieces: area.wallPieces, surfaceAreaSqm: area.surfaceAreaSqm,
        })
      : null,
    jointSizeMm: laminate ? getLaminateWallPanelJointMm(settings.jointSizeMm) : settings.jointSizeMm,
  };
}

/** A measured surface with its material's catalogue record: supplier, price, status and links. */
function toBomRow(area: SurfaceAreaRow, material: SurfaceMaterial): SurfaceMaterialBomRow {
  const pricePerSqm = material.commerce.price_per_sqm;
  const amount = typeof pricePerSqm?.amount === "number" ? pricePerSqm.amount : null;
  const blockers = material.import_governance.publish_blockers ?? [];
  const { settings } = area;
  const { sheet, orderSheets, pricedAreaSqm, backing, jointSizeMm } = sheetOrderOf(area, material);
  return {
    roomId: area.roomId,
    roomName: area.roomName,
    floorLabel: area.floorLabel,
    surface: area.surface,
    surfaceLabel: area.surfaceLabel,
    surfaceAreaSqm: area.surfaceAreaSqm,
    wallFaceId: area.wallFaceId,
    wallPanelId: area.wallPanelId,
    materialId: material.surface_material.material_id,
    materialName: material.surface_material.product_name,
    supplier: material.surface_material.brand ?? material.surface_material.supplier,
    brand: material.surface_material.brand,
    materialFamily: material.surface_material.material_family,
    category: "surface_material",
    roomAreaSqm: area.roomAreaSqm,
    orderAreaSqm: area.orderAreaSqm,
    wasteFactor: area.wasteFactor,
    quantitySqm: area.orderAreaSqm,
    sheetSizeMm: sheet,
    orderSheets,
    backing,
    status: material.import_governance.publish_status ?? "unknown",
    purchaseMode: material.commerce.purchase_mode,
    sampleRequestUrl: material.commerce.sample_request_url ?? material.source.sample_request_url ?? null,
    sourceUrl: material.source.source_url,
    pricePerSqmCurrency: pricePerSqm?.currency ?? material.source.currency ?? null,
    pricePerSqmAmount: amount,
    lineTotal: amount === null ? null : amount * pricedAreaSqm,
    publishBlockers: blockers,
    reviewNote: blockers.length > 0 ? blockers.join("; ") : null,
    pattern: settings.pattern,
    rotationDeg: settings.rotationDeg,
    scale: settings.scale,
    patternOffset: settings.offset,
    jointSizeMm,
    jointColor: settings.jointColor,
    floorPattern: settings.pattern,
    floorRotationDeg: settings.rotationDeg,
    floorScale: settings.scale,
    floorPatternOffset: settings.offset,
    floorJointSizeMm: jointSizeMm,
    floorJointColor: settings.jointColor,
  };
}

/**
 * The design's floor and wall finishes, with 10% extra for cuts, and whole sheets for a finish sold by the sheet;
 * unknown materials are left out.
 */
export function buildRoomSurfaceMaterialBomRows(
  rooms: RoomSnapshot[],
  planOpenings: readonly PersistedPlanOpening[] = []
): SurfaceMaterialBomRow[] {
  return buildRoomSurfaceAreaRows(rooms, planOpenings).flatMap((area) => {
    const material = getSurfaceMaterialById(area.materialId);
    return material ? [toBomRow(area, material)] : [];
  });
}
