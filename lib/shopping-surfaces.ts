import type { PersistedPlanOpening, RoomSnapshot } from "@/lib/room-types";
import { buildRoomSurfaceAreaRows, roundSquareMeters, type SurfaceAreaRow } from "@/lib/surface-material-areas";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";

/**
 * A floor or wall finish in the design, as the Shopping list shows it (the Shop mockup's
 * "Surfaces"): what to ask the supplier for, where it goes and how much to order. Suppliers price
 * surfaces, so they stay out of the total.
 */
export type ShoppingSurface = {
  materialId: string;
  name: string;
  supplier: string;
  /** "Floor in the Living Room and Dining". */
  where: string;
  /** Whole square metres to order, with 10% extra for cuts. */
  orderAreaSqm: number;
  swatchUrl: string | null;
};

/** What the Shopping list shows of a material; null for one the catalogue doesn't have. */
export type ShoppingSurfaceMaterial = { materialId: string; name: string; supplier: string; swatchUrl: string | null };
export type ShoppingSurfaceMaterialLookup = (materialId: string) => ShoppingSurfaceMaterial | null;

/** The editor's own surface catalogue (it runs in the browser, like the renderer that uses it). */
export function runtimeShoppingSurfaceMaterial(materialId: string): ShoppingSurfaceMaterial | null {
  const material = getRuntimeSurfaceMaterialById(materialId);
  if (!material) return null;
  const { surface_material: info, texture_assets: textures } = material;
  return {
    materialId: info.material_id,
    name: info.product_name,
    supplier: info.brand ?? info.supplier,
    swatchUrl: textures.swatch_url?.trim() || null,
  };
}

const SURFACE_NAMES: Record<SurfaceAreaRow["surface"], string> = {
  floor: "floor",
  walls: "walls",
  selected_wall: "walls",
};

/** "the Living Room", "the Living Room and Dining", "the Hall, Kitchen and Dining". */
function roomList(names: readonly string[]) {
  const last = names[names.length - 1] ?? "";
  return `the ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${last}` : last}`;
}

function surfaceWhere(rows: readonly SurfaceAreaRow[]) {
  const roomsBySurface = new Map<string, string[]>();
  for (const row of rows) {
    const surface = SURFACE_NAMES[row.surface];
    const rooms = roomsBySurface.get(surface) ?? [];
    if (!rooms.includes(row.roomName)) rooms.push(row.roomName);
    roomsBySurface.set(surface, rooms);
  }
  const phrase = Array.from(roomsBySurface, ([surface, rooms]) => `${surface} in ${roomList(rooms)}`).join(", ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

/**
 * One line per material, in the order the design first uses it. Surfaces with nothing to order,
 * and materials the catalogue doesn't have, are left out.
 */
export function buildShoppingSurfaces(
  rows: readonly SurfaceAreaRow[],
  lookup: ShoppingSurfaceMaterialLookup = runtimeShoppingSurfaceMaterial
): ShoppingSurface[] {
  const byMaterial = new Map<string, { material: ShoppingSurfaceMaterial; rows: SurfaceAreaRow[] }>();
  for (const row of rows) {
    const material = row.orderAreaSqm > 0 ? lookup(row.materialId) : null;
    if (!material) continue;
    const group = byMaterial.get(material.materialId) ?? { material, rows: [] };
    group.rows.push(row);
    byMaterial.set(material.materialId, group);
  }
  return Array.from(byMaterial.values(), ({ material, rows: group }) => ({
    materialId: material.materialId,
    name: material.name,
    supplier: material.supplier,
    where: surfaceWhere(group),
    orderAreaSqm: Math.max(1, Math.ceil(roundSquareMeters(group.reduce((sum, row) => sum + row.orderAreaSqm, 0)))),
    swatchUrl: material.swatchUrl,
  }));
}

/** The design's floor and wall finishes, from its rooms and the doors and windows that cut its walls. */
export function shoppingSurfacesOf(
  rooms: readonly RoomSnapshot[],
  planOpenings: readonly PersistedPlanOpening[] = []
): ShoppingSurface[] {
  return buildShoppingSurfaces(buildRoomSurfaceAreaRows([...rooms], planOpenings));
}
