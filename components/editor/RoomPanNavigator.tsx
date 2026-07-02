"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";

type RoomPanNavigatorProps = {
  rooms: HousePlanRoom2D[];
  activeRoomId: string;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
  itemCountsByRoomId?: Record<string, number>;
  targetRoomId?: string | null;
  targetRoomValid?: boolean;
  disabled?: boolean;
  dark?: boolean;
  onMoveCamera: (x: number, z: number) => void;
  onMoveTarget: (x: number, z: number) => void;
  onFocusRoom: (roomId: string) => void;
  onZoom: (direction: "in" | "out") => void;
  onResetView: () => void;
};

type PlanBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  width: number;
  depth: number;
};

type DragMode = "camera" | "target" | null;

const MAP_WIDTH = 264;
const MAP_HEIGHT = 150;
const MAP_PADDING = 14;
const CAMERA_HANDLE_PADDING = 24;
const TARGET_HANDLE_PADDING = 24;

function resolvePlanBounds(rooms: HousePlanRoom2D[]): PlanBounds {
  if (!rooms.length) {
    return { minX: -2, maxX: 2, minZ: -2, maxZ: 2, width: 4, depth: 4 };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  rooms.forEach((room) => {
    minX = Math.min(minX, room.x - room.w / 2);
    maxX = Math.max(maxX, room.x + room.w / 2);
    minZ = Math.min(minZ, room.z - room.d / 2);
    maxZ = Math.max(maxZ, room.z + room.d / 2);
  });

  const padding = Math.max(1.25, Math.max(maxX - minX, maxZ - minZ) * 0.24);
  minX -= padding;
  maxX += padding;
  minZ -= padding;
  maxZ += padding;

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: Math.max(1, maxX - minX),
    depth: Math.max(1, maxZ - minZ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export default function RoomPanNavigator({
  rooms,
  activeRoomId,
  cameraPosition,
  cameraTarget,
  itemCountsByRoomId = {},
  targetRoomId = null,
  targetRoomValid = true,
  disabled = false,
  dark = false,
  onMoveCamera,
  onMoveTarget,
  onFocusRoom,
  onZoom,
  onResetView,
}: RoomPanNavigatorProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const mapRef = useRef<HTMLDivElement | null>(null);
  const dragModeRef = useRef<DragMode>(null);
  const bounds = useMemo(() => resolvePlanBounds(rooms), [rooms]);
  const mapScale = Math.min(
    (MAP_WIDTH - MAP_PADDING * 2) / bounds.width,
    (MAP_HEIGHT - MAP_PADDING * 2) / bounds.depth
  );
  const contentWidth = bounds.width * mapScale;
  const contentDepth = bounds.depth * mapScale;
  const originX = (MAP_WIDTH - contentWidth) / 2;
  const originY = (MAP_HEIGHT - contentDepth) / 2;

  const toMapX = (x: number) => originX + (x - bounds.minX) * mapScale;
  const toMapY = (z: number) => originY + (z - bounds.minZ) * mapScale;
  const toWorldPoint = (event: PointerEvent<HTMLDivElement>) => {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    const localX = clamp(event.clientX - rect.left, originX, originX + contentWidth);
    const localY = clamp(event.clientY - rect.top, originY, originY + contentDepth);
    return {
      x: bounds.minX + (localX - originX) / mapScale,
      z: bounds.minZ + (localY - originY) / mapScale,
    };
  };

  const cameraX = clamp(toMapX(cameraPosition[0]), CAMERA_HANDLE_PADDING, MAP_WIDTH - CAMERA_HANDLE_PADDING);
  const cameraY = clamp(toMapY(cameraPosition[2]), CAMERA_HANDLE_PADDING, MAP_HEIGHT - CAMERA_HANDLE_PADDING);
  const targetX = clamp(toMapX(cameraTarget[0]), TARGET_HANDLE_PADDING, MAP_WIDTH - TARGET_HANDLE_PADDING);
  const targetY = clamp(toMapY(cameraTarget[2]), TARGET_HANDLE_PADDING, MAP_HEIGHT - TARGET_HANDLE_PADDING);
  const cameraAimDeg = Math.atan2(targetY - cameraY, targetX - cameraX) * (180 / Math.PI);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !mapRef.current) return;

    const target = event.target as HTMLElement;
    const action = target.closest<HTMLElement>("[data-room-nav-action]")?.dataset.roomNavAction;
    if (action === "room") return;

    if (action === "camera" || action === "target") {
      dragModeRef.current = action;
    } else {
      dragModeRef.current = "target";
    }

    const point = toWorldPoint(event);
    if (!point) return;

    event.preventDefault();
    mapRef.current.setPointerCapture(event.pointerId);

    if (dragModeRef.current === "camera") {
      onMoveCamera(point.x, point.z);
    } else {
      onMoveTarget(point.x, point.z);
    }
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !dragModeRef.current) return;

    const point = toWorldPoint(event);
    if (!point) return;

    if (dragModeRef.current === "camera") {
      onMoveCamera(point.x, point.z);
    } else {
      onMoveTarget(point.x, point.z);
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (mapRef.current?.hasPointerCapture(event.pointerId)) {
      mapRef.current.releasePointerCapture(event.pointerId);
    }
    dragModeRef.current = null;
  };

  if (!rooms.length) return null;

  return (
    <section
      data-testid="room-pan-navigator"
      className={
        dark
          ? "designer-panel w-[264px] max-[520px]:w-full overflow-hidden rounded-lg"
          : "w-[264px] max-[520px]:w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
      }
      aria-label="Room view navigator"
    >
      <div
        className={
          dark
            ? "flex items-center justify-between border-b px-2 py-1"
            : "flex items-center justify-between border-b border-neutral-200 px-2 py-1"
        }
      >
        <div className="flex items-center gap-2.5 text-xs font-semibold">
          <span className={dark ? "designer-text-primary" : "text-blue-600"}>2D</span>
          <span className={dark ? "designer-text-secondary" : "text-neutral-600"}>Rooms</span>
        </div>
        <div className="flex items-center gap-1" aria-label="Navigator controls">
          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="h-6 w-6 rounded border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 shadow-sm"
            aria-label={isCollapsed ? "Expand navigator" : "Collapse navigator"}
            title={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? "+" : "-"}
          </button>
          <button
            type="button"
            data-testid="room-pan-reset-view"
            disabled={disabled}
            onClick={onResetView}
            className="h-6 rounded border border-neutral-200 bg-white px-1.5 text-[10px] font-semibold text-neutral-700 shadow-sm disabled:opacity-40"
            aria-label="Reset room view"
          >
            Reset
          </button>
          <button
            type="button"
            data-testid="room-pan-zoom-out"
            disabled={disabled}
            onClick={() => onZoom("out")}
            className="h-6 w-6 rounded border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 shadow-sm disabled:opacity-40"
            aria-label="Zoom out"
          >
            -
          </button>
          <button
            type="button"
            data-testid="room-pan-zoom-in"
            disabled={disabled}
            onClick={() => onZoom("in")}
            className="h-6 w-6 rounded border border-neutral-200 bg-white text-xs font-semibold text-neutral-700 shadow-sm disabled:opacity-40"
            aria-label="Zoom in"
          >
            +
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div
        ref={mapRef}
        data-testid="room-pan-map"
        className={
          dark
            ? "relative touch-none cursor-crosshair bg-neutral-950/30"
            : "relative touch-none cursor-crosshair bg-[linear-gradient(to_right,rgba(148,163,184,0.24)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.24)_1px,transparent_1px)] bg-[size:8px_8px] bg-slate-50"
        }
        style={{ width: MAP_WIDTH, height: MAP_HEIGHT }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        >
          <svg
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          >
            <line
              x1={cameraX}
              y1={cameraY}
              x2={targetX}
              y2={targetY}
              stroke={dark ? "#d1d5db" : "#111827"}
              strokeWidth="1.5"
              strokeDasharray="5 5"
            />
          </svg>

        {rooms.map((room) => {
          const isActive = room.id === activeRoomId;
          const isTarget = room.id === targetRoomId;
          const itemCount = itemCountsByRoomId[room.id] ?? 0;
          const roomLeft = toMapX(room.x - room.w / 2);
          const roomTop = toMapY(room.z - room.d / 2);
          const roomWidthPx = Math.max(10, room.w * mapScale);
          const roomHeightPx = Math.max(10, room.d * mapScale);
          const showFullLabel = roomWidthPx >= 30 && roomHeightPx >= 15;
          const label = showFullLabel ? room.name : isActive ? room.name.slice(0, 2) : "";
          return (
            <button
              type="button"
              key={room.id}
              data-testid="room-pan-map-room"
              data-room-nav-action="room"
              disabled={disabled}
              title={itemCount > 0 ? `${room.name} · ${itemCount} item${itemCount === 1 ? "" : "s"}` : room.name}
              aria-label={`Focus ${room.name}`}
              onClick={(event) => {
                event.stopPropagation();
                onFocusRoom(room.id);
              }}
              className={`absolute overflow-hidden border px-0.5 text-left text-[8px] font-semibold leading-[0.65rem] ${
                isTarget
                  ? targetRoomValid
                    ? "border-blue-600 bg-blue-100/90 text-blue-950 ring-2 ring-blue-500"
                    : "border-red-600 bg-red-100/90 text-red-900 ring-2 ring-red-500"
                  : isActive
                    ? "border-green-500 bg-green-100/80 text-green-900"
                    : "border-neutral-500 bg-stone-200/75 text-neutral-700"
              }`}
              style={{
                left: roomLeft,
                top: roomTop,
                width: roomWidthPx,
                height: roomHeightPx,
              }}
            >
              <span className="block truncate">{label}</span>
              {itemCount > 0 ? (
                <span
                  className={`absolute bottom-0.5 right-0.5 rounded-full px-1 text-[7px] leading-3 ${
                    isTarget
                      ? targetRoomValid
                        ? "bg-blue-600 text-white"
                        : "bg-red-600 text-white"
                      : isActive
                        ? "bg-green-600 text-white"
                        : "bg-neutral-700 text-white"
                  }`}
                >
                  {itemCount}
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          type="button"
          data-testid="room-pan-camera-handle"
          data-room-nav-action="camera"
          disabled={disabled}
          className="absolute h-9 w-10 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none border-0 bg-transparent p-0 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          style={{ left: cameraX, top: cameraY }}
          aria-label="Drag camera position"
        >
          <span
            data-testid="room-pan-camera-icon"
            className="absolute inset-0 block origin-center"
            style={{ transform: `rotate(${cameraAimDeg}deg)` }}
            aria-hidden="true"
          >
            <span className="absolute left-1 top-1.5 h-6 w-6 rounded bg-blue-600 shadow" />
            <span className="absolute left-6 top-2.5 h-4 w-3 rounded-sm bg-blue-600 shadow" />
          </span>
        </button>

        <button
          type="button"
          data-testid="room-pan-target"
          data-room-nav-action="target"
          disabled={disabled}
          className="absolute h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-0 bg-transparent p-0 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
          style={{ left: targetX, top: targetY }}
          aria-label="Drag view center"
        >
          <span className="absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-neutral-500 shadow" />
          <span className="absolute left-1/2 top-1 h-0 w-0 -translate-x-1/2 border-x-[5px] border-b-[7px] border-x-transparent border-b-neutral-500" />
          <span className="absolute bottom-1 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent border-t-neutral-500" />
          <span className="absolute left-1 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-r-[7px] border-y-transparent border-r-neutral-500" />
          <span className="absolute right-1 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[5px] border-l-[7px] border-y-transparent border-l-neutral-500" />
        </button>
        </div>
      )}
    </section>
  );
}
