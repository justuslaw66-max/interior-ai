import { prisma } from "@/lib/prisma";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { buildHousePlan2D } from "@/lib/design-page-house-plan";
import { legacyApiToSnapshot } from "@/lib/room-persistence";
import {
  summarizeShoppingRooms,
  summarizeWholeHomeShopping,
} from "@/lib/room-shopping";
import {
  buildCheckoutReadinessRows,
  buildShoppingCsvRows,
  getCheckoutSourceLabel,
  getCheckoutStatusLabel,
  type CheckoutReadinessRow,
} from "@/lib/share-shopping-csv";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";
import type { DesignItem, DesignSnapshot, PersistedPlanOpening, RoomSnapshot, SavedView, ZoneMin } from "@/lib/room-types";
import {
  getExportCapabilities,
  getPlanDisplayName,
  type UserPlan,
} from "@/lib/export-capabilities";
import Link from "next/link";
import { ExportWatermark } from "@/components/ExportWatermark";
import ExportTracking from "./ExportTracking";
import PrintButton from "./PrintButton";
import PlanSvgDownload from "./PlanSvgDownload";
import ShoppingList from "./ShoppingList";
import ShoppingCsvDownload from "./ShoppingCsvDownload";

export const metadata = {
  robots: { index: false, follow: false },
  title: "Design Export",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatRoomType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

const SQM_TO_SQFT = 10.7639;
const PLAN_SVG_WIDTH = 720;
const PLAN_SVG_HEIGHT = 360;
const PLAN_SVG_PADDING = 28;

function formatMeasurement(value: number, unit: string) {
  return `${value.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}

function getPolygonArea(points: NonNullable<RoomSnapshot["planPolygon"]>) {
  if (points.length < 3) return 0;
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0);
  return Math.abs(area) / 2;
}

function getPolygonPerimeter(points: NonNullable<RoomSnapshot["planPolygon"]>) {
  if (points.length < 2) return 0;
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + Math.hypot(next.x - point.x, next.z - point.z);
  }, 0);
}

function getRoomOpenings(
  room: RoomSnapshot,
  rooms: RoomSnapshot[],
  openings: PersistedPlanOpening[]
) {
  return openings.filter((opening) => {
    if (opening.roomId) return opening.roomId === room.id;
    return rooms.length === 1;
  });
}

function getRoomMetrics(
  room: RoomSnapshot,
  rooms: RoomSnapshot[],
  openings: PersistedPlanOpening[]
) {
  const width = room.geometry.width;
  const depth = room.geometry.depth;
  const polygon = room.planShape === "custom_polygon" ? room.planPolygon : null;
  const areaSqm = polygon?.length ? getPolygonArea(polygon) : width * depth;
  const perimeterM = polygon?.length ? getPolygonPerimeter(polygon) : (width + depth) * 2;
  const clearSpanM = Math.min(width, depth);
  const roomOpenings = getRoomOpenings(room, rooms, openings);
  const furnitureDensity = areaSqm > 0 ? room.items.length / areaSqm : 0;
  const densityLabel =
    furnitureDensity >= 0.35 ? "Dense" : furnitureDensity >= 0.18 ? "Furnished" : "Open";

  return {
    areaSqm,
    areaSqft: areaSqm * SQM_TO_SQFT,
    perimeterM,
    clearSpanM,
    openingCount: roomOpenings.length,
    doorCount: roomOpenings.filter((opening) => opening.kind === "door").length,
    windowCount: roomOpenings.filter((opening) => opening.kind === "window").length,
    densityLabel,
    densityPer10Sqm: furnitureDensity * 10,
  };
}

type PlanPoint = { x: number; z: number };

type PlanDiagramRoom = {
  id: string;
  name: string;
  typeLabel: string;
  points: PlanPoint[];
  openings: PlanDiagramOpening[];
  furniture: PlanDiagramFurniture[];
  labelX: number;
  labelZ: number;
  width: number;
  depth: number;
  areaSqm: number;
  itemCount: number;
  openingCount: number;
};

type PlanDiagramOpening = {
  id: string;
  kind: "door" | "window";
  wall: "north" | "south" | "east" | "west";
  start: PlanPoint;
  end: PlanPoint;
  labelX: number;
  labelZ: number;
};

type PlanDiagramFurniture = {
  id: string;
  label: string;
  title: string;
  points: PlanPoint[];
  labelX: number;
  labelZ: number;
  localCenterX: number;
  localCenterZ: number;
  rotationDegrees: number;
  widthMeters: number;
  depthMeters: number;
};

type PlanDiagramFloor = {
  key: string;
  label: string;
  rooms: PlanDiagramRoom[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

type OpeningScheduleRow = {
  id: string;
  roomName: string;
  kindLabel: string;
  wallLabel: string;
  widthMeters: number;
  offsetMeters: number;
};

type PresentationViewRow = {
  id: string;
  roomName: string;
  name: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  fov?: number;
};

function formatWallLabel(wall: PersistedPlanOpening["wall"]) {
  return wall.charAt(0).toUpperCase() + wall.slice(1);
}

function formatOpeningOffset(value: number) {
  if (Math.abs(value) < 0.05) return "Centered";
  return `${value > 0 ? "+" : "-"}${formatMeasurement(Math.abs(value), "m")} from center`;
}

function formatSignedMeasurement(value: number) {
  if (Math.abs(value) < 0.05) return "0 m";
  return `${value > 0 ? "+" : "-"}${formatMeasurement(Math.abs(value), "m")}`;
}

function normalizeRotationDegrees(value: number) {
  const normalized = Math.round(value) % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function formatRotationDegrees(value: number) {
  return `${normalizeRotationDegrees(value)} deg`;
}

function isVector3(value: unknown): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === "number" && Number.isFinite(entry))
  );
}

function normalizePresentationView(
  roomName: string,
  view: SavedView | unknown,
  index: number
): PresentationViewRow | null {
  if (!view || typeof view !== "object") return null;
  const candidate = view as Partial<SavedView> & {
    id?: unknown;
    name?: unknown;
    view?: {
      pos?: unknown;
      target?: unknown;
      fov?: unknown;
    };
  };
  const cameraPosition = isVector3(candidate.cameraPosition)
    ? candidate.cameraPosition
    : isVector3(candidate.view?.pos)
      ? candidate.view.pos
      : null;
  const cameraTarget = isVector3(candidate.cameraTarget)
    ? candidate.cameraTarget
    : isVector3(candidate.view?.target)
      ? candidate.view.target
      : null;

  if (!cameraPosition || !cameraTarget) return null;

  return {
    id: typeof candidate.id === "string" && candidate.id ? candidate.id : `${roomName}-view-${index}`,
    roomName,
    name: typeof candidate.name === "string" && candidate.name ? candidate.name : `View ${index + 1}`,
    cameraPosition,
    cameraTarget,
    fov: typeof candidate.view?.fov === "number" && Number.isFinite(candidate.view.fov)
      ? candidate.view.fov
      : undefined,
  };
}

function buildPresentationViewRows(rooms: RoomSnapshot[]): PresentationViewRow[] {
  return rooms.flatMap((room) =>
    (room.savedViews ?? [])
      .map((view, index) => normalizePresentationView(room.name, view, index))
      .filter((view): view is PresentationViewRow => Boolean(view))
  );
}

function buildOpeningScheduleRows(
  rooms: RoomSnapshot[],
  openings: PersistedPlanOpening[]
): OpeningScheduleRow[] {
  return rooms.flatMap((room) =>
    getRoomOpenings(room, rooms, openings).map((opening) => ({
      id: opening.id,
      roomName: room.name,
      kindLabel: opening.kind === "door" ? "Door" : "Window",
      wallLabel: formatWallLabel(opening.wall),
      widthMeters: opening.widthMm / 1000,
      offsetMeters: opening.offsetMm / 1000,
    }))
  );
}

function getPlanRoomPoints(room: ReturnType<typeof buildHousePlan2D>["rooms"][number]): PlanPoint[] {
  if (room.shape === "custom_polygon" && room.polygon && room.polygon.length >= 3) {
    return room.polygon.map((point) => ({
      x: room.x + point.x,
      z: room.z + point.z,
    }));
  }

  const left = room.x - room.w / 2;
  const right = room.x + room.w / 2;
  const top = room.z - room.d / 2;
  const bottom = room.z + room.d / 2;
  return [
    { x: left, z: top },
    { x: right, z: top },
    { x: right, z: bottom },
    { x: left, z: bottom },
  ];
}

function getPlanPointsBounds(points: PlanPoint[]) {
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minZ: Math.min(bounds.minZ, point.z),
      maxZ: Math.max(bounds.maxZ, point.z),
    }),
    {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    }
  );
}

function buildPlanDiagramOpenings(
  room: ReturnType<typeof buildHousePlan2D>["rooms"][number],
  sourceRoom: RoomSnapshot | undefined,
  rooms: RoomSnapshot[],
  openings: PersistedPlanOpening[]
): PlanDiagramOpening[] {
  const roomOpenings = sourceRoom ? getRoomOpenings(sourceRoom, rooms, openings) : [];
  const halfWidth = room.w / 2;
  const halfDepth = room.d / 2;

  return roomOpenings.map((opening) => {
    const widthMeters = Math.max(0.2, opening.widthMm / 1000);
    const offsetMeters = opening.offsetMm / 1000;
    const halfOpening = widthMeters / 2;

    if (opening.wall === "north" || opening.wall === "south") {
      const z = room.z + (opening.wall === "north" ? -halfDepth : halfDepth);
      const start = {
        x: Math.max(room.x - halfWidth, room.x + offsetMeters - halfOpening),
        z,
      };
      const end = {
        x: Math.min(room.x + halfWidth, room.x + offsetMeters + halfOpening),
        z,
      };
      return {
        id: opening.id,
        kind: opening.kind,
        wall: opening.wall,
        start,
        end,
        labelX: (start.x + end.x) / 2,
        labelZ: z + (opening.wall === "north" ? -0.22 : 0.32),
      };
    }

    const x = room.x + (opening.wall === "west" ? -halfWidth : halfWidth);
    const start = {
      x,
      z: Math.max(room.z - halfDepth, room.z + offsetMeters - halfOpening),
    };
    const end = {
      x,
      z: Math.min(room.z + halfDepth, room.z + offsetMeters + halfOpening),
    };

    return {
      id: opening.id,
      kind: opening.kind,
      wall: opening.wall,
      start,
      end,
      labelX: x + (opening.wall === "west" ? -0.34 : 0.34),
      labelZ: (start.z + end.z) / 2,
    };
  });
}

function getRotatedFootprintPoints({
  centerX,
  centerZ,
  widthMeters,
  depthMeters,
  rotationY,
}: {
  centerX: number;
  centerZ: number;
  widthMeters: number;
  depthMeters: number;
  rotationY: number;
}): PlanPoint[] {
  const halfWidth = widthMeters / 2;
  const halfDepth = depthMeters / 2;
  const cos = Math.cos(rotationY);
  const sin = Math.sin(rotationY);
  const corners = [
    { x: -halfWidth, z: -halfDepth },
    { x: halfWidth, z: -halfDepth },
    { x: halfWidth, z: halfDepth },
    { x: -halfWidth, z: halfDepth },
  ];

  return corners.map((corner) => ({
    x: centerX + corner.x * cos - corner.z * sin,
    z: centerZ + corner.x * sin + corner.z * cos,
  }));
}

function buildPlanDiagramFurniture(
  room: ReturnType<typeof buildHousePlan2D>["rooms"][number],
  sourceRoom: RoomSnapshot | undefined
): PlanDiagramFurniture[] {
  if (!sourceRoom) return [];

  return sourceRoom.items.flatMap((item, index) => {
    if (item.bundleRole === "component") return [];
    const product = CATALOG_ITEMS[item.productId];
    if (!product) return [];

    const resolved = resolveCatalogVariant(product, item.variantId);
    const widthMeters = Math.max(0.1, resolved.dimsMm.w / 1000);
    const depthMeters = Math.max(0.1, resolved.dimsMm.d / 1000);
    const localCenterX = item.position?.[0] ?? 0;
    const localCenterZ = item.position?.[2] ?? 0;
    const rotationY = item.rotationY ?? 0;
    const centerX = room.x + localCenterX;
    const centerZ = room.z + localCenterZ;
    const points = getRotatedFootprintPoints({
      centerX,
      centerZ,
      widthMeters,
      depthMeters,
      rotationY,
    });

    return [
      {
        id: item.instanceId,
        label: `F${index + 1}`,
        title: product.title,
        points,
        labelX: centerX,
        labelZ: centerZ,
        localCenterX,
        localCenterZ,
        rotationDegrees: (rotationY * 180) / Math.PI,
        widthMeters,
        depthMeters,
      },
    ];
  });
}

function buildPlanDiagramFloors(
  rooms: RoomSnapshot[],
  roomMetricsById: Map<string, ReturnType<typeof getRoomMetrics>>,
  openings: PersistedPlanOpening[]
): PlanDiagramFloor[] {
  if (!rooms.length) return [];

  const fallbackRoom = rooms[0];
  const housePlan = buildHousePlan2D(
    rooms,
    fallbackRoom?.geometry.width ?? 5,
    fallbackRoom?.geometry.depth ?? 4
  );
  const roomSnapshotsById = new Map(rooms.map((room) => [room.id, room]));
  const floors = new Map<string, PlanDiagramFloor>();

  for (const room of housePlan.rooms) {
    const sourceRoom = roomSnapshotsById.get(room.id);
    const floorLevel = sourceRoom?.floorLevel ?? room.floorLevel ?? 1;
    const floorLabel = sourceRoom?.floorLabel ?? room.floorLabel ?? `Floor ${floorLevel}`;
    const floorKey = String(floorLevel);
    const points = getPlanRoomPoints(room);
    const bounds = getPlanPointsBounds(points);
    const metrics = roomMetricsById.get(room.id);
    const diagramOpenings = buildPlanDiagramOpenings(room, sourceRoom, rooms, openings);
    const diagramFurniture = buildPlanDiagramFurniture(room, sourceRoom);
    const diagramRoom: PlanDiagramRoom = {
      id: room.id,
      name: room.name,
      typeLabel: formatRoomType(room.roomType),
      points,
      openings: diagramOpenings,
      furniture: diagramFurniture,
      labelX: (bounds.minX + bounds.maxX) / 2,
      labelZ: (bounds.minZ + bounds.maxZ) / 2,
      width: room.w,
      depth: room.d,
      areaSqm: metrics?.areaSqm ?? room.w * room.d,
      itemCount: sourceRoom?.items.length ?? 0,
      openingCount: metrics?.openingCount ?? 0,
    };

    const existing = floors.get(floorKey);
    if (existing) {
      existing.rooms.push(diagramRoom);
      existing.bounds = {
        minX: Math.min(existing.bounds.minX, bounds.minX),
        maxX: Math.max(existing.bounds.maxX, bounds.maxX),
        minZ: Math.min(existing.bounds.minZ, bounds.minZ),
        maxZ: Math.max(existing.bounds.maxZ, bounds.maxZ),
      };
    } else {
      floors.set(floorKey, {
        key: floorKey,
        label: floorLabel,
        rooms: [diagramRoom],
        bounds,
      });
    }
  }

  return Array.from(floors.values()).sort((a, b) => Number(a.key) - Number(b.key));
}

function PlanOverview({
  floors,
  title,
  shareToken,
  watermarked,
}: {
  floors: PlanDiagramFloor[];
  title: string;
  shareToken: string;
  watermarked: boolean;
}) {
  if (!floors.length) return null;

  return (
    <section className="avoid-break mb-12">
      <h2 className="mb-4 text-2xl font-bold text-gray-900">2D Plan Overview</h2>
      <div className="space-y-5">
        {floors.map((floor) => {
          const widthMeters = Math.max(1, floor.bounds.maxX - floor.bounds.minX);
          const depthMeters = Math.max(1, floor.bounds.maxZ - floor.bounds.minZ);
          const scale = Math.min(
            (PLAN_SVG_WIDTH - PLAN_SVG_PADDING * 2) / widthMeters,
            (PLAN_SVG_HEIGHT - PLAN_SVG_PADDING * 2) / depthMeters
          );
          const offsetX =
            PLAN_SVG_PADDING + (PLAN_SVG_WIDTH - PLAN_SVG_PADDING * 2 - widthMeters * scale) / 2;
          const offsetY =
            PLAN_SVG_PADDING + (PLAN_SVG_HEIGHT - PLAN_SVG_PADDING * 2 - depthMeters * scale) / 2;
          const toSvgX = (x: number) => offsetX + (x - floor.bounds.minX) * scale;
          const toSvgY = (z: number) => offsetY + (z - floor.bounds.minZ) * scale;
          const furnitureRows = floor.rooms.flatMap((room) =>
            room.furniture.map((furniture) => ({
              ...furniture,
              roomName: room.name,
            }))
          );
          const planSvgId = `plan-overview-svg-${floor.key}`;

          return (
            <div key={floor.key} className="avoid-break">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="text-lg font-semibold text-gray-800">{floor.label}</h3>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <div className="text-xs text-gray-500">
                    Scale preview • {formatMeasurement(widthMeters, "m")} x {formatMeasurement(depthMeters, "m")}
                  </div>
                  <PlanSvgDownload
                    targetId={planSvgId}
                    title={title}
                    floorLabel={floor.label}
                    shareToken={shareToken}
                    watermarked={watermarked}
                  />
                </div>
              </div>
              <svg
                id={planSvgId}
                role="img"
                aria-label={`${floor.label} 2D floor plan`}
                viewBox={`0 0 ${PLAN_SVG_WIDTH} ${PLAN_SVG_HEIGHT}`}
                className="h-auto w-full rounded-lg border bg-gray-50"
              >
                <rect
                  x="0"
                  y="0"
                  width={PLAN_SVG_WIDTH}
                  height={PLAN_SVG_HEIGHT}
                  fill="#f9fafb"
                />
                <defs>
                  <pattern id={`grid-${floor.key}`} width="24" height="24" patternUnits="userSpaceOnUse">
                    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#e5e7eb" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect
                  x="0"
                  y="0"
                  width={PLAN_SVG_WIDTH}
                  height={PLAN_SVG_HEIGHT}
                  fill={`url(#grid-${floor.key})`}
                />
                {floor.rooms.map((room, index) => {
                  const points = room.points.map((point) => `${toSvgX(point.x).toFixed(1)},${toSvgY(point.z).toFixed(1)}`).join(" ");
                  const labelX = toSvgX(room.labelX);
                  const labelY = toSvgY(room.labelZ);
                  const fill = index % 2 === 0 ? "#eff6ff" : "#ecfdf5";
                  const stroke = index % 2 === 0 ? "#2563eb" : "#059669";

                  return (
                    <g key={room.id}>
                      <polygon
                        points={points}
                        fill={fill}
                        stroke={stroke}
                        strokeWidth="2"
                        vectorEffect="non-scaling-stroke"
                      />
                      {room.furniture.map((furniture) => {
                        const furniturePoints = furniture.points
                          .map((point) => `${toSvgX(point.x).toFixed(1)},${toSvgY(point.z).toFixed(1)}`)
                          .join(" ");
                        const footprintWidthPx = Math.max(
                          16,
                          Math.hypot(
                            toSvgX(furniture.points[1].x) - toSvgX(furniture.points[0].x),
                            toSvgY(furniture.points[1].z) - toSvgY(furniture.points[0].z)
                          )
                        );

                        return (
                          <g key={furniture.id}>
                            <polygon
                              points={furniturePoints}
                              fill="#ffffff"
                              fillOpacity="0.85"
                              stroke="#525252"
                              strokeDasharray="4 3"
                              strokeWidth="1.5"
                              vectorEffect="non-scaling-stroke"
                            />
                            <text
                              x={toSvgX(furniture.labelX)}
                              y={toSvgY(furniture.labelZ) + 3}
                              textAnchor="middle"
                              className="fill-gray-800 text-[9px] font-bold"
                              textLength={Math.min(footprintWidthPx - 4, 22)}
                              lengthAdjust="spacingAndGlyphs"
                            >
                              {furniture.label}
                            </text>
                          </g>
                        );
                      })}
                      {room.openings.map((opening) => {
                        const x1 = toSvgX(opening.start.x);
                        const y1 = toSvgY(opening.start.z);
                        const x2 = toSvgX(opening.end.x);
                        const y2 = toSvgY(opening.end.z);
                        const openingColor = opening.kind === "door" ? "#f97316" : "#0284c7";
                        const openingLabel = opening.kind === "door" ? "Door" : "Window";

                        return (
                          <g key={opening.id}>
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke="#f9fafb"
                              strokeWidth="8"
                              strokeLinecap="round"
                              vectorEffect="non-scaling-stroke"
                            />
                            <line
                              x1={x1}
                              y1={y1}
                              x2={x2}
                              y2={y2}
                              stroke={openingColor}
                              strokeWidth="4"
                              strokeLinecap="round"
                              vectorEffect="non-scaling-stroke"
                            />
                            <text
                              x={toSvgX(opening.labelX)}
                              y={toSvgY(opening.labelZ)}
                              textAnchor="middle"
                              className="fill-gray-700 text-[9px] font-semibold"
                            >
                              {openingLabel}
                            </text>
                          </g>
                        );
                      })}
                      <text
                        x={labelX}
                        y={labelY - 24}
                        textAnchor="middle"
                        className="fill-gray-900 text-[13px] font-semibold"
                      >
                        {room.name}
                      </text>
                      <text
                        x={labelX}
                        y={labelY - 7}
                        textAnchor="middle"
                        className="fill-gray-600 text-[10px]"
                      >
                        {formatMeasurement(room.width, "m")} x {formatMeasurement(room.depth, "m")}
                      </text>
                      <text
                        x={labelX}
                        y={labelY + 8}
                        textAnchor="middle"
                        className="fill-gray-500 text-[10px]"
                      >
                        {formatMeasurement(room.areaSqm, "m2")} • {room.itemCount} items • {room.openingCount} openings
                      </text>
                    </g>
                  );
                })}
	              </svg>
              {furnitureRows.length > 0 ? (
                <div className="mt-3">
                  <h4 className="mb-2 text-sm font-semibold text-gray-800">Furniture Footprints</h4>
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="p-2 text-left">Mark</th>
                        <th className="p-2 text-left">Item</th>
                        <th className="p-2 text-left">Room</th>
                        <th className="p-2 text-right">Footprint</th>
                      </tr>
                    </thead>
                    <tbody>
                      {furnitureRows.map((furniture) => (
                        <tr key={furniture.id} className="border-b">
                          <td className="p-2 font-semibold text-gray-900">{furniture.label}</td>
                          <td className="p-2 text-gray-700">{furniture.title}</td>
                          <td className="p-2 text-gray-600">{furniture.roomName}</td>
                          <td className="p-2 text-right text-gray-600">
                            {formatMeasurement(furniture.widthMeters, "m")} x {formatMeasurement(furniture.depthMeters, "m")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function FurniturePlacementSchedule({ floors }: { floors: PlanDiagramFloor[] }) {
  const rows = floors.flatMap((floor) =>
    floor.rooms.flatMap((room) =>
      room.furniture.map((furniture) => ({
        ...furniture,
        floorLabel: floor.label,
        roomName: room.name,
      }))
    )
  );

  if (!rows.length) return null;

  return (
    <section className="avoid-break mb-12">
      <h2 className="mb-4 text-2xl font-bold text-gray-900">Furniture Placement Schedule</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="p-2 text-left">Mark</th>
            <th className="p-2 text-left">Floor</th>
            <th className="p-2 text-left">Room</th>
            <th className="p-2 text-left">Item</th>
            <th className="p-2 text-left">Center</th>
            <th className="p-2 text-right">Rotation</th>
            <th className="p-2 text-right">Footprint</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.floorLabel}-${row.roomName}-${row.id}`} className="border-b">
              <td className="p-2 font-semibold text-gray-900">{row.label}</td>
              <td className="p-2 text-gray-600">{row.floorLabel}</td>
              <td className="p-2 text-gray-600">{row.roomName}</td>
              <td className="p-2 text-gray-700">{row.title}</td>
              <td className="p-2 text-gray-600">
                X {formatSignedMeasurement(row.localCenterX)}, Z {formatSignedMeasurement(row.localCenterZ)}
              </td>
              <td className="p-2 text-right text-gray-600">
                {formatRotationDegrees(row.rotationDegrees)}
              </td>
              <td className="p-2 text-right text-gray-600">
                {formatMeasurement(row.widthMeters, "m")} x {formatMeasurement(row.depthMeters, "m")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function OpeningSchedule({ rows }: { rows: OpeningScheduleRow[] }) {
  if (!rows.length) return null;

  return (
    <section className="avoid-break mb-12">
      <h2 className="mb-4 text-2xl font-bold text-gray-900">Door & Window Schedule</h2>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="p-2 text-left">Room</th>
            <th className="p-2 text-left">Type</th>
            <th className="p-2 text-left">Wall</th>
            <th className="p-2 text-right">Width</th>
            <th className="p-2 text-left">Position</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b">
              <td className="p-2 font-medium text-gray-900">{row.roomName}</td>
              <td className="p-2 text-gray-600">{row.kindLabel}</td>
              <td className="p-2 text-gray-600">{row.wallLabel}</td>
              <td className="p-2 text-right text-gray-600">
                {formatMeasurement(row.widthMeters, "m")}
              </td>
              <td className="p-2 text-gray-600">{formatOpeningOffset(row.offsetMeters)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function CheckoutReadinessSchedule({ rows }: { rows: CheckoutReadinessRow[] }) {
  if (!rows.length) return null;

  const cartReadyCount = rows.filter(
    (row) => row.commerceMode === "shopify" && row.hasValidCommerce && row.includeInCheckout
  ).length;
  const retailerLinkCount = rows.filter(
    (row) => row.commerceMode === "affiliate" && row.hasValidCommerce
  ).length;
  const reviewCount = rows.filter((row) => !row.hasValidCommerce).length;

  return (
    <section className="avoid-break mb-12">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Checkout Readiness</h2>
          <div className="mt-1 text-sm text-gray-600">
            {cartReadyCount} cart-ready • {retailerLinkCount} retailer link{retailerLinkCount === 1 ? "" : "s"} • {reviewCount} review item{reviewCount === 1 ? "" : "s"}
          </div>
        </div>
        <div className="text-right text-sm">
          <div className="font-semibold text-gray-900">
            {formatCurrency(rows.reduce((sum, row) => sum + row.linePrice, 0))}
          </div>
          <div className="text-xs text-gray-500">Estimated shopping total</div>
        </div>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="p-2 text-left">Room</th>
            <th className="p-2 text-left">Item</th>
            <th className="p-2 text-center">Qty</th>
            <th className="p-2 text-left">Status</th>
            <th className="p-2 text-left">Source</th>
            <th className="p-2 text-right">Line total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.roomName}-${row.instanceId}`} className="border-b">
              <td className="p-2 font-medium text-gray-900">{row.roomName}</td>
              <td className="p-2 text-gray-700">
                <div>{row.title}</div>
                <div className="text-xs text-gray-500">{row.variantLabel}</div>
              </td>
              <td className="p-2 text-center text-gray-600">{row.quantity}</td>
              <td className="p-2 text-gray-600">{getCheckoutStatusLabel(row)}</td>
              <td className="p-2 text-gray-600">{getCheckoutSourceLabel(row)}</td>
              <td className="p-2 text-right text-gray-600">{formatCurrency(row.linePrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatVector3(value: [number, number, number]) {
  return value.map((entry) => entry.toFixed(1)).join(", ");
}

function PresentationViewSchedule({ rows }: { rows: PresentationViewRow[] }) {
  if (!rows.length) return null;

  return (
    <section className="avoid-break mb-12">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Presentation View Schedule</h2>
        <div className="mt-1 text-sm text-gray-600">
          {rows.length} saved camera view{rows.length === 1 ? "" : "s"} for the shared 3D walkthrough
        </div>
      </div>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="p-2 text-left">View</th>
            <th className="p-2 text-left">Room</th>
            <th className="p-2 text-left">Camera position</th>
            <th className="p-2 text-left">Target</th>
            <th className="p-2 text-right">FOV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.roomName}-${row.id}`} className="border-b">
              <td className="p-2 font-medium text-gray-900">{row.name}</td>
              <td className="p-2 text-gray-600">{row.roomName}</td>
              <td className="p-2 text-gray-600">{formatVector3(row.cameraPosition)}</td>
              <td className="p-2 text-gray-600">{formatVector3(row.cameraTarget)}</td>
              <td className="p-2 text-right text-gray-600">
                {row.fov ? `${Math.round(row.fov)} deg` : "Default"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ExportAccessSummary({
  capabilities,
  userPlan,
}: {
  capabilities: ReturnType<typeof getExportCapabilities>;
  userPlan: UserPlan;
}) {
  const planLabel = getPlanDisplayName(userPlan);

  return (
    <section className="avoid-break mb-10 rounded-lg border bg-gray-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Export Access</h2>
          <div className="mt-1 text-sm text-gray-600">Current plan: {planLabel}</div>
        </div>
        <div
          className={
            capabilities.watermark
              ? "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800"
              : "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800"
          }
        >
          {capabilities.watermark ? "Watermarked preview" : "Clean export"}
        </div>
      </div>
      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-lg bg-white p-3">
          <div className="font-semibold text-gray-900">Print preview</div>
          <div className="mt-1 text-xs text-gray-600">
            {capabilities.watermark ? "Available with watermark" : "Available without watermark"}
          </div>
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="font-semibold text-gray-900">Clean PDF</div>
          <div className="mt-1 text-xs text-gray-600">
            {capabilities.pdfDownload ? "Included" : "Pro upgrade"}
          </div>
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="font-semibold text-gray-900">Shopping CSV</div>
          <div className="mt-1 text-xs text-gray-600">Included for handoff</div>
        </div>
      </div>
    </section>
  );
}

export default async function ExportPage({
  params,
}: {
  params: Promise<{ shareToken: string }>;
}) {
  const { shareToken } = await params;

  const design = await prisma.design.findFirst({
    where: { shareToken, shareEnabled: true },
    select: {
      id: true,
      title: true,
      roomWidth: true,
      roomDepth: true,
      items: true,
      snapshot: true,
      zones: true,
      savedViews: true,
      style: true,
      budget: true,
      notes: true,
      createdAt: true,
      user: {
        select: {
          name: true,
          email: true,
          plan: true,
        },
      },
    },
  });

  if (!design) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="rounded-xl border bg-white p-6">
          <div className="text-lg font-semibold">Link not available</div>
          <div className="text-sm text-neutral-600">
            This share link is disabled or invalid.
          </div>
        </div>
      </main>
    );
  }

  // Convert to v3 format
  const designSnapshot: DesignSnapshot = legacyApiToSnapshot({
    id: design.id,
    title: design.title,
    roomWidth: design.roomWidth,
    roomDepth: design.roomDepth,
    items: design.items as unknown as DesignItem[],
    snapshot: design.snapshot as Parameters<typeof legacyApiToSnapshot>[0]["snapshot"],
    zones: (design.zones as unknown as ZoneMin[]) || [],
    savedViews: (design.savedViews as unknown as SavedView[]) || [],
  });

  const rooms = designSnapshot.rooms || [];
  const userPlan: UserPlan = design.user?.plan === "pro" ? "pro" : "free";
  const capabilities = getExportCapabilities(userPlan);
  const roomSummaries = summarizeShoppingRooms(rooms, designSnapshot.activeRoomId);
  const homeSummary = summarizeWholeHomeShopping(roomSummaries);
  const preparedBy = design.user?.name ?? design.user?.email ?? "Interior AI";
  const planOpenings = designSnapshot.floorPlan?.openings ?? [];
  const roomMetrics = rooms.map((room) => ({
    roomId: room.id,
    ...getRoomMetrics(room, rooms, planOpenings),
  }));
  const roomMetricsById = new Map(roomMetrics.map((metrics) => [metrics.roomId, metrics]));
  const totalAreaSqm = roomMetrics.reduce((sum, metrics) => sum + metrics.areaSqm, 0);
  const totalOpenings = roomMetrics.reduce((sum, metrics) => sum + metrics.openingCount, 0);
  const compactRoomCount = roomMetrics.filter((metrics) => metrics.areaSqm > 0 && metrics.areaSqm < 10).length;
  const denseRoomCount = roomMetrics.filter((metrics) => metrics.densityPer10Sqm >= 3.5).length;
  const planFloors = buildPlanDiagramFloors(rooms, roomMetricsById, planOpenings);
  const openingScheduleRows = buildOpeningScheduleRows(rooms, planOpenings);
  const checkoutReadinessRows = buildCheckoutReadinessRows(rooms);
  const presentationViewRows = buildPresentationViewRows(rooms);
  const shoppingCsvRows = buildShoppingCsvRows(checkoutReadinessRows);
  const qaSnapshotFingerprint =
    process.env.NEXT_PUBLIC_ENABLE_QA_HOOKS === "1"
      ? fingerprintDesignSnapshot(designSnapshot)
      : null;

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          .no-print {
            display: none !important;
          }
          .page-break {
            page-break-before: always;
          }
          .avoid-break {
            break-inside: avoid;
          }
        }
      `}</style>

      <main className="min-h-screen bg-white">
        {qaSnapshotFingerprint ? (
          <div
            data-testid="qa-export-snapshot-fingerprint"
            data-fingerprint={qaSnapshotFingerprint}
            hidden
          />
        ) : null}
        {capabilities.watermark ? <ExportWatermark /> : null}
        <ExportTracking shareToken={shareToken} designId={design.id} />
        
        {/* Header - No Print */}
        <div className="no-print sticky top-0 z-10 border-b bg-white px-6 py-4">
          <div className="mx-auto flex max-w-4xl items-center justify-between">
            <div>
              <Link
                href={`/share/${shareToken}`}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                ← Back to 3D View
              </Link>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-2">
              <PrintButton
                shareToken={shareToken}
                designId={design.id}
                capabilities={capabilities}
              />
              <a
                href={`/share/${shareToken}/export/pdf`}
                data-testid="share-export-pdf-download"
                className="rounded-lg border border-neutral-300 bg-neutral-950 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                {capabilities.watermark ? "Download watermarked PDF" : "Download clean PDF"}
              </a>
              <ShoppingCsvDownload
                rows={shoppingCsvRows}
                title={design.title}
                shareToken={shareToken}
              />
            </div>
          </div>
        </div>

        {/* Export Pack Content */}
        <div className="mx-auto max-w-4xl px-6 py-12">
          {/* Cover */}
          <div className="mb-10">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Presentation Pack
            </div>
            <h1 className="mb-3 text-4xl font-bold text-gray-900">{design.title}</h1>
            <div className="grid gap-2 text-sm text-gray-600 sm:grid-cols-2">
              <div>Created: {new Date(design.createdAt).toLocaleDateString()}</div>
              <div>Prepared by: {preparedBy}</div>
              <div>Style: {design.style ?? "Not specified"}</div>
              <div>Budget: {design.budget ?? "Not specified"}</div>
            </div>
          </div>

          <ExportAccessSummary capabilities={capabilities} userPlan={userPlan} />

          {/* Overview */}
          <section className="avoid-break mb-10">
            <h2 className="mb-4 text-2xl font-bold text-gray-900">Export Overview</h2>
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rooms</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{rooms.length}</div>
              </div>
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Items</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{homeSummary.itemCount}</div>
              </div>
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Shoppable</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{homeSummary.shoppableCount}</div>
              </div>
              <div className="rounded-lg border bg-gray-50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Estimated Total</div>
                <div className="mt-1 text-2xl font-bold text-gray-900">{formatCurrency(homeSummary.subtotal)}</div>
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Measured Area</div>
                <div className="mt-1 text-xl font-bold text-gray-900">{formatMeasurement(totalAreaSqm, "m2")}</div>
                <div className="mt-1 text-xs text-gray-500">{formatMeasurement(totalAreaSqm * SQM_TO_SQFT, "sq ft")}</div>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Openings</div>
                <div className="mt-1 text-xl font-bold text-gray-900">{totalOpenings}</div>
                <div className="mt-1 text-xs text-gray-500">Doors and windows saved in plan mode</div>
              </div>
              <div className="rounded-lg border bg-white p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Plan Readiness</div>
                <div className="mt-1 text-xl font-bold text-gray-900">
                  {totalAreaSqm > 0 && totalOpenings > 0 ? "Ready" : "Review"}
                </div>
                <div className="mt-1 text-xs text-gray-500">Measurement and opening coverage</div>
              </div>
            </div>
            {homeSummary.needsReviewCount > 0 ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                {homeSummary.needsReviewCount} item{homeSummary.needsReviewCount === 1 ? "" : "s"} need commerce or availability review before ordering.
              </div>
            ) : null}
          </section>

          <PlanOverview
            floors={planFloors}
            title={design.title}
            shareToken={shareToken}
            watermarked={capabilities.watermark}
          />
          <FurniturePlacementSchedule floors={planFloors} />
          <OpeningSchedule rows={openingScheduleRows} />
          <CheckoutReadinessSchedule rows={checkoutReadinessRows} />
          <PresentationViewSchedule rows={presentationViewRows} />

          {/* Room Schedule */}
          {roomSummaries.length > 0 ? (
            <section className="avoid-break mb-12">
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Room Schedule</h2>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="p-2 text-left">Room</th>
                    <th className="p-2 text-left">Type</th>
                    <th className="p-2 text-right">Area</th>
                    <th className="p-2 text-center">Items</th>
                    <th className="p-2 text-center">Openings</th>
                    <th className="p-2 text-center">Shoppable</th>
                    <th className="p-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {roomSummaries.map((room) => {
                    const metrics = roomMetricsById.get(room.roomId);
                    return (
                      <tr key={room.roomId} className="border-b">
                        <td className="p-2 font-medium text-gray-900">{room.roomName}</td>
                        <td className="p-2 text-gray-600">{formatRoomType(room.roomType)}</td>
                        <td className="p-2 text-right text-gray-600">
                          {metrics ? formatMeasurement(metrics.areaSqm, "m2") : "Not set"}
                        </td>
                        <td className="p-2 text-center">{room.itemCount}</td>
                        <td className="p-2 text-center">{metrics?.openingCount ?? 0}</td>
                        <td className="p-2 text-center">{room.shoppableCount}</td>
                        <td className="p-2 text-right">{formatCurrency(room.subtotal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ) : null}

          {/* Rooms & Views */}
          {rooms.map((room: RoomSnapshot, index: number) => (
            <div key={room.id} className={index > 0 ? "page-break mt-12" : "mb-12"}>
              {(() => {
                const metrics = roomMetricsById.get(room.id) ?? getRoomMetrics(room, rooms, planOpenings);
                return (
                  <>
              <h2 className="mb-4 text-2xl font-bold text-gray-900">{room.name}</h2>
              
              {/* Room Details */}
              <div className="mb-4 text-sm text-gray-600">
                <div>Dimensions: {room.geometry.width}m × {room.geometry.depth}m</div>
                <div>Type: {room.roomType}</div>
              </div>

              <div className="avoid-break mb-6 grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Area</div>
                  <div className="mt-1 text-lg font-bold text-gray-900">{formatMeasurement(metrics.areaSqm, "m2")}</div>
                  <div className="mt-1 text-xs text-gray-500">{formatMeasurement(metrics.areaSqft, "sq ft")}</div>
                </div>
                <div className="rounded-lg border bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Perimeter</div>
                  <div className="mt-1 text-lg font-bold text-gray-900">{formatMeasurement(metrics.perimeterM, "m")}</div>
                  <div className="mt-1 text-xs text-gray-500">Wall length estimate</div>
                </div>
                <div className="rounded-lg border bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Openings</div>
                  <div className="mt-1 text-lg font-bold text-gray-900">{metrics.openingCount}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {metrics.doorCount} door{metrics.doorCount === 1 ? "" : "s"} / {metrics.windowCount} window{metrics.windowCount === 1 ? "" : "s"}
                  </div>
                </div>
                <div className="rounded-lg border bg-gray-50 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Furniture Fit</div>
                  <div className="mt-1 text-lg font-bold text-gray-900">{metrics.densityLabel}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    {formatMeasurement(metrics.densityPer10Sqm, "items / 10 m2")}
                  </div>
                </div>
              </div>

              {/* Saved Views */}
              {room.savedViews && room.savedViews.length > 0 && (
                <div className="mb-6">
                  <h3 className="mb-2 text-lg font-semibold text-gray-800">Saved Views</h3>
                  <div className="grid grid-cols-2 gap-3">
                    {room.savedViews.map((view: SavedView) => (
                      <div
                        key={view.id}
                        className="rounded-lg border bg-gray-50 p-4"
                      >
                        <div className="text-sm font-medium text-gray-700">{view.name}</div>
                        <div className="mt-1 text-xs text-gray-500">
                          View position: {view.cameraPosition[0].toFixed(1)}, {view.cameraPosition[1].toFixed(1)}, {view.cameraPosition[2].toFixed(1)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Shopping List for this Room */}
              <ShoppingList items={room.items} roomName={room.name} />
                  </>
                );
              })()}
            </div>
          ))}

          {/* Design Notes */}
          {design.notes && (
            <div className="page-break mb-12">
              <h2 className="mb-4 text-2xl font-bold text-gray-900">Design Notes</h2>
              <div className="whitespace-pre-wrap rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
                {design.notes}
              </div>
            </div>
          )}

          {/* Practical Checks */}
          <div className="mb-12">
            <h2 className="mb-4 text-2xl font-bold text-gray-900">Practical Checks</h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className={totalAreaSqm > 0 ? "text-green-600" : "text-amber-600"}>
                  {totalAreaSqm > 0 ? "✓" : "!"}
                </span>
                <span>
                  Measurements: {totalAreaSqm > 0 ? `${formatMeasurement(totalAreaSqm, "m2")} captured across ${rooms.length} room${rooms.length === 1 ? "" : "s"}` : "Add room dimensions before final export"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={denseRoomCount === 0 ? "text-green-600" : "text-amber-600"}>
                  {denseRoomCount === 0 ? "✓" : "!"}
                </span>
                <span>
                  Furniture fit: {denseRoomCount === 0 ? "No dense rooms flagged" : `${denseRoomCount} room${denseRoomCount === 1 ? "" : "s"} may need circulation review`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={totalOpenings > 0 ? "text-green-600" : "text-amber-600"}>
                  {totalOpenings > 0 ? "✓" : "!"}
                </span>
                <span>
                  Doors and windows: {totalOpenings > 0 ? `${totalOpenings} opening${totalOpenings === 1 ? "" : "s"} included` : "Trace openings for stronger installation and shopping notes"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className={compactRoomCount === 0 ? "text-green-600" : "text-blue-600"}>
                  {compactRoomCount === 0 ? "✓" : "i"}
                </span>
                <span>Rug sizing: Review in 3D view for final placement</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t pt-6 text-center text-xs text-gray-500">
            <div>Created with Interior AI</div>
            <div className="mt-1">{new Date().toLocaleDateString()}</div>
          </div>
        </div>
      </main>
    </>
  );
}
