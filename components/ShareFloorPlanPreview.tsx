import { buildHousePlan2D } from "@/lib/design-page-house-plan";
import type { DesignSnapshot, PersistedPlanOpening } from "@/lib/room-types";

type Point = { x: number; z: number };

type PreviewRoom = {
  id: string;
  name: string;
  dimensions: string;
  points: Point[];
  center: Point;
  openings: PersistedPlanOpening[];
};

type PreviewFloor = {
  key: string;
  label: string;
  rooms: PreviewRoom[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

const SVG_WIDTH = 720;
const SVG_HEIGHT = 360;
const SVG_PADDING = 28;

function roomPoints(room: ReturnType<typeof buildHousePlan2D>["rooms"][number]): Point[] {
  if (room.shape === "custom_polygon" && room.polygon && room.polygon.length >= 3) {
    return room.polygon.map((point) => ({ x: room.x + point.x, z: room.z + point.z }));
  }
  return [
    { x: room.x - room.w / 2, z: room.z - room.d / 2 },
    { x: room.x + room.w / 2, z: room.z - room.d / 2 },
    { x: room.x + room.w / 2, z: room.z + room.d / 2 },
    { x: room.x - room.w / 2, z: room.z + room.d / 2 },
  ];
}

function pointsBounds(points: Point[]) {
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

function formatMeters(value: number) {
  return value.toFixed(1).replace(/\.0$/, "");
}

function buildPreviewFloors(snapshot: DesignSnapshot): PreviewFloor[] {
  if (snapshot.rooms.length === 0) return [];
  const firstRoom = snapshot.rooms[0];
  const plan = buildHousePlan2D(
    snapshot.rooms,
    firstRoom.geometry.width,
    firstRoom.geometry.depth
  );
  const sourceById = new Map(snapshot.rooms.map((room) => [room.id, room]));
  const planOpenings = snapshot.floorPlan?.openings ?? [];
  const floors = new Map<string, PreviewFloor>();

  for (const room of plan.rooms) {
    const source = sourceById.get(room.id);
    const floorLevel = source?.floorLevel ?? room.floorLevel ?? 1;
    const key = String(floorLevel);
    const points = roomPoints(room);
    const bounds = pointsBounds(points);
    const previewRoom: PreviewRoom = {
      id: room.id,
      name: room.name,
      dimensions: `${formatMeters(room.w)} x ${formatMeters(room.d)} m`,
      points,
      center: {
        x: (bounds.minX + bounds.maxX) / 2,
        z: (bounds.minZ + bounds.maxZ) / 2,
      },
      openings: planOpenings.filter((opening) =>
        opening.roomId ? opening.roomId === room.id : snapshot.rooms.length === 1
      ),
    };
    const existing = floors.get(key);
    if (existing) {
      existing.rooms.push(previewRoom);
      existing.bounds = {
        minX: Math.min(existing.bounds.minX, bounds.minX),
        maxX: Math.max(existing.bounds.maxX, bounds.maxX),
        minZ: Math.min(existing.bounds.minZ, bounds.minZ),
        maxZ: Math.max(existing.bounds.maxZ, bounds.maxZ),
      };
    } else {
      floors.set(key, {
        key,
        label: source?.floorLabel ?? room.floorLabel ?? `Floor ${floorLevel}`,
        rooms: [previewRoom],
        bounds,
      });
    }
  }

  return Array.from(floors.values()).sort((left, right) => Number(left.key) - Number(right.key));
}

function openingPoints(room: PreviewRoom, opening: PersistedPlanOpening) {
  const bounds = pointsBounds(room.points);
  const offset = opening.offsetMm / 1000;
  const halfWidth = Math.max(0.2, opening.widthMm / 1000) / 2;
  if (opening.wall === "north" || opening.wall === "south") {
    const z = opening.wall === "north" ? bounds.minZ : bounds.maxZ;
    return {
      start: { x: Math.max(bounds.minX, room.center.x + offset - halfWidth), z },
      end: { x: Math.min(bounds.maxX, room.center.x + offset + halfWidth), z },
    };
  }
  const x = opening.wall === "west" ? bounds.minX : bounds.maxX;
  return {
    start: { x, z: Math.max(bounds.minZ, room.center.z + offset - halfWidth) },
    end: { x, z: Math.min(bounds.maxZ, room.center.z + offset + halfWidth) },
  };
}

export default function ShareFloorPlanPreview({ snapshot }: { snapshot: DesignSnapshot }) {
  const floors = buildPreviewFloors(snapshot);
  if (floors.length === 0) return null;

  return (
    <section className="border-t bg-white" data-testid="share-floor-plan-preview">
      <div className="mx-auto max-w-6xl px-6 py-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-neutral-950">Floor-plan preview</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Room boundaries, dimensions, doors, and windows from the shared design.
            </p>
          </div>
          <div className="flex gap-3 text-xs text-neutral-600">
            <span><span className="mr-1 inline-block h-2 w-4 rounded bg-amber-500" />Door</span>
            <span><span className="mr-1 inline-block h-2 w-4 rounded bg-sky-500" />Window</span>
          </div>
        </div>
        <div className={floors.length > 1 ? "mt-4 grid gap-4 lg:grid-cols-2" : "mt-4 grid gap-4"}>
          {floors.map((floor) => {
            const width = Math.max(1, floor.bounds.maxX - floor.bounds.minX);
            const depth = Math.max(1, floor.bounds.maxZ - floor.bounds.minZ);
            const scale = Math.min(
              (SVG_WIDTH - SVG_PADDING * 2) / width,
              (SVG_HEIGHT - SVG_PADDING * 2) / depth
            );
            const offsetX = (SVG_WIDTH - width * scale) / 2;
            const offsetY = (SVG_HEIGHT - depth * scale) / 2;
            const toX = (x: number) => offsetX + (x - floor.bounds.minX) * scale;
            const toY = (z: number) => offsetY + (z - floor.bounds.minZ) * scale;

            return (
              <div key={floor.key} className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50">
                <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2">
                  <h3 className="text-sm font-semibold text-neutral-900">{floor.label}</h3>
                  <span className="text-xs text-neutral-500">
                    {floor.rooms.length} room{floor.rooms.length === 1 ? "" : "s"}
                  </span>
                </div>
                <svg
                  viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                  role="img"
                  aria-label={`${floor.label} shared floor plan`}
                  className="block h-auto w-full bg-white"
                >
                  {floor.rooms.map((room) => (
                    <g key={room.id}>
                      <polygon
                        points={room.points.map((point) => `${toX(point.x)},${toY(point.z)}`).join(" ")}
                        fill="#f5f5f4"
                        stroke="#262626"
                        strokeWidth="3"
                      />
                      <text
                        x={toX(room.center.x)}
                        y={toY(room.center.z) - 5}
                        textAnchor="middle"
                        className="fill-neutral-900 text-[14px] font-semibold"
                      >
                        {room.name}
                      </text>
                      <text
                        x={toX(room.center.x)}
                        y={toY(room.center.z) + 14}
                        textAnchor="middle"
                        className="fill-neutral-500 text-[11px]"
                      >
                        {room.dimensions}
                      </text>
                      {room.openings.map((opening) => {
                        const line = openingPoints(room, opening);
                        return (
                          <line
                            key={opening.id}
                            x1={toX(line.start.x)}
                            y1={toY(line.start.z)}
                            x2={toX(line.end.x)}
                            y2={toY(line.end.z)}
                            stroke={opening.kind === "door" ? "#d97706" : "#0284c7"}
                            strokeWidth="7"
                            strokeLinecap="round"
                          />
                        );
                      })}
                    </g>
                  ))}
                </svg>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
