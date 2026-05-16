"use client";

import { Html, Line } from "@react-three/drei";
import { useRef } from "react";
import type { ThreeEvent } from "@react-three/fiber";

type RectZone = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  label: string;
};

type Opening2D = {
  id: string;
  wall: "north" | "south" | "east" | "west";
  offset: number;
  width: number;
  kind: "door" | "window";
};

type FixedElement2D = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  label?: string;
};

type Annotation2D = {
  id: string;
  x: number;
  z: number;
  text: string;
  kind: "note" | "callout" | "room_tag";
  anchorX?: number;
  anchorZ?: number;
};

type RoomRenderer2DProps = {
  width: number;
  depth: number;
  measurementUnit?: "mm" | "cm" | "in";
  showGrid?: boolean;
  showDimensions?: boolean;
  showOpenings?: boolean;
  showBuiltIns?: boolean;
  showAnnotations?: boolean;
  showZones?: boolean;
  theme?: "consumer" | "pro";
  gridStep?: number;
  openings?: Opening2D[];
  fixedElements?: FixedElement2D[];
  annotations?: Annotation2D[];
  zones?: RectZone[];
  interactive?: boolean;
  selectedOverlayId?: string | null;
  onSelectOverlay?: (id: string | null) => void;
  onMoveOpening?: (id: string, offset: number) => void;
  onMoveFixedElement?: (id: string, x: number, z: number) => void;
  onMoveAnnotation?: (id: string, x: number, z: number) => void;
};

export default function RoomRenderer2D({
  width,
  depth,
  measurementUnit = "mm",
  showGrid = true,
  showDimensions = true,
  showOpenings = true,
  showBuiltIns = true,
  showAnnotations = true,
  showZones = true,
  theme = "consumer",
  gridStep = 0.5,
  openings = [],
  fixedElements = [],
  annotations = [],
  zones = [],
  interactive = false,
  selectedOverlayId = null,
  onSelectOverlay,
  onMoveOpening,
  onMoveFixedElement,
  onMoveAnnotation,
}: RoomRenderer2DProps) {
  const htmlZIndexRange: [number, number] = [5, 0];

  const halfW = width / 2;
  const halfD = depth / 2;
  const isPro = theme === "pro";

  const floorColor = isPro ? "#ffffff" : "#f4f2ed";
  const borderColor = isPro ? "#111111" : "#9a9a9a";
  const minorGridColor = isPro ? "#e1e1e1" : "#d8d8d8";
  const majorGridColor = isPro ? "#c4c4c4" : "#c8c8c8";
  const zoneFillColor = isPro ? "#0f766e" : "#0ea5a0";
  const zoneLabelColor = isPro ? "#115e59" : "#0f766e";
  const openingDoorColor = isPro ? "#0b3b6f" : "#1d4ed8";
  const openingWindowColor = isPro ? "#0f766e" : "#0f766e";
  const snapThreshold = 0.12;
  const dragTargetRef = useRef<
    | null
    | { kind: "opening"; id: string }
    | { kind: "fixed"; id: string; width: number; depth: number }
    | { kind: "annotation"; id: string }
  >(null);

  const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

  const formatDimension = (meters: number) => {
    const millimeters = meters * 1000;
    if (measurementUnit === "cm") {
      const value = (millimeters / 10).toFixed(1).replace(/\.0$/, "");
      return `${value} cm`;
    }
    if (measurementUnit === "in") {
      const value = (millimeters / 25.4).toFixed(1).replace(/\.0$/, "");
      return `${value} in`;
    }
    return `${Math.round(millimeters)} mm`;
  };

  const setPointerCaptureIfSupported = (event: ThreeEvent<PointerEvent>) => {
    const target = event.target as Element | null;
    if (target && "setPointerCapture" in target) {
      target.setPointerCapture(event.pointerId);
    }
  };

  const releasePointerCaptureIfSupported = (event: ThreeEvent<PointerEvent>) => {
    const target = event.target as Element | null;
    if (target && "releasePointerCapture" in target) {
      target.releasePointerCapture(event.pointerId);
    }
  };

  const handleOpeningMove = (opening: Opening2D, event: ThreeEvent<PointerEvent>) => {
    if (!onMoveOpening) return;
    const span = opening.wall === "north" || opening.wall === "south" ? width : depth;
    const maxOffset = span / 2 - opening.width / 2 - 0.03;
    const rawOffset =
      opening.wall === "north" || opening.wall === "south" ? event.point.x : event.point.z;
    const nextOffset = clamp(rawOffset, -maxOffset, maxOffset);
    onMoveOpening(opening.id, nextOffset);
  };

  const handleFixedMove = (
    fixed: FixedElement2D,
    event: ThreeEvent<PointerEvent>,
    widthHint?: number,
    depthHint?: number
  ) => {
    if (!onMoveFixedElement) return;
    const elemW = widthHint ?? fixed.w;
    const elemD = depthHint ?? fixed.d;
    const minX = -halfW + elemW / 2;
    const maxX = halfW - elemW / 2;
    const minZ = -halfD + elemD / 2;
    const maxZ = halfD - elemD / 2;

    let nextX = clamp(event.point.x, minX, maxX);
    let nextZ = clamp(event.point.z, minZ, maxZ);

    const west = minX;
    const east = maxX;
    const north = minZ;
    const south = maxZ;

    if (Math.abs(nextX - west) < snapThreshold) nextX = west;
    if (Math.abs(nextX - east) < snapThreshold) nextX = east;
    if (Math.abs(nextZ - north) < snapThreshold) nextZ = north;
    if (Math.abs(nextZ - south) < snapThreshold) nextZ = south;

    onMoveFixedElement(fixed.id, nextX, nextZ);
  };

  const handleAnnotationMove = (annotation: Annotation2D, event: ThreeEvent<PointerEvent>) => {
    if (!onMoveAnnotation) return;
    const nextX = clamp(event.point.x, -halfW + 0.05, halfW - 0.05);
    const nextZ = clamp(event.point.z, -halfD + 0.05, halfD - 0.05);
    onMoveAnnotation(annotation.id, nextX, nextZ);
  };

  const gridLines: Array<{ points: Array<[number, number, number]>; major: boolean; key: string }> = [];
  if (showGrid) {
    const startX = -halfW;
    const endX = halfW;
    const startZ = -halfD;
    const endZ = halfD;
    const epsilon = 1e-6;

    for (let x = startX; x <= endX + epsilon; x += gridStep) {
      const mm = Math.round(Math.abs(x * 1000));
      const major = mm % 1000 === 0;
      gridLines.push({
        key: `gx-${x.toFixed(3)}`,
        major,
        points: [
          [x, 0.0018, startZ],
          [x, 0.0018, endZ],
        ],
      });
    }

    for (let z = startZ; z <= endZ + epsilon; z += gridStep) {
      const mm = Math.round(Math.abs(z * 1000));
      const major = mm % 1000 === 0;
      gridLines.push({
        key: `gz-${z.toFixed(3)}`,
        major,
        points: [
          [startX, 0.0018, z],
          [endX, 0.0018, z],
        ],
      });
    }
  }

  const openingSegments = openings.map((o) => {
    if (o.wall === "north" || o.wall === "south") {
      const z = o.wall === "north" ? -halfD : halfD;
      const x0 = o.offset - o.width / 2;
      const x1 = o.offset + o.width / 2;
      return {
        id: o.id,
        kind: o.kind,
        points: [
          [x0, 0.0022, z] as [number, number, number],
          [x1, 0.0022, z] as [number, number, number],
        ],
      };
    }
    const x = o.wall === "west" ? -halfW : halfW;
    const z0 = o.offset - o.width / 2;
    const z1 = o.offset + o.width / 2;
    return {
      id: o.id,
      kind: o.kind,
      points: [
        [x, 0.0022, z0] as [number, number, number],
        [x, 0.0022, z1] as [number, number, number],
      ],
    };
  });

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.0005, 0]}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial color={floorColor} />
      </mesh>

      {showZones &&
        zones.map((zone) => (
          <group key={zone.id} position={[zone.x, 0, zone.z]}>
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.0012, 0]}>
              <planeGeometry args={[zone.w, zone.d]} />
              <meshBasicMaterial color={zoneFillColor} transparent opacity={0.12} />
            </mesh>
            <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, 0]} center transform={false}>
              <div
                style={{
                  fontSize: 10,
                  color: zoneLabelColor,
                  background: "rgba(255,255,255,0.82)",
                  borderRadius: 6,
                  border: "1px solid rgba(15,118,110,0.22)",
                  padding: "2px 6px",
                  pointerEvents: "none",
                }}
              >
                {zone.label}
              </div>
            </Html>
          </group>
        ))}

      {showGrid &&
        gridLines.map((line) => (
          <Line
            key={line.key}
            points={line.points}
            color={line.major ? majorGridColor : minorGridColor}
            lineWidth={line.major ? 1.1 : 0.6}
          />
        ))}

      <Line
        points={[
          [-halfW, 0.002, -halfD],
          [halfW, 0.002, -halfD],
          [halfW, 0.002, halfD],
          [-halfW, 0.002, halfD],
          [-halfW, 0.002, -halfD],
        ]}
        color={borderColor}
        lineWidth={isPro ? 2 : 1.5}
      />

      {showOpenings &&
        openingSegments.map((seg) => (
          <group key={seg.id}>
            <Line
              points={seg.points}
              color={seg.kind === "door" ? openingDoorColor : openingWindowColor}
              lineWidth={selectedOverlayId === seg.id ? 3 : 2.2}
            />
            {interactive && (
              <mesh
                position={[
                  (seg.points[0][0] + seg.points[1][0]) / 2,
                  0.003,
                  (seg.points[0][2] + seg.points[1][2]) / 2,
                ]}
                rotation-x={-Math.PI / 2}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectOverlay?.(seg.id);
                  dragTargetRef.current = { kind: "opening", id: seg.id };
                  setPointerCaptureIfSupported(event);
                }}
                onPointerMove={(event) => {
                  if (!dragTargetRef.current || dragTargetRef.current.id !== seg.id) return;
                  event.stopPropagation();
                  const opening = openings.find((entry) => entry.id === seg.id);
                  if (!opening) return;
                  handleOpeningMove(opening, event);
                }}
                onPointerUp={(event) => {
                  if (dragTargetRef.current?.id === seg.id) {
                    dragTargetRef.current = null;
                  }
                  releasePointerCaptureIfSupported(event);
                }}
              >
                <circleGeometry args={[0.05, 20]} />
                <meshBasicMaterial
                  color={selectedOverlayId === seg.id ? "#f97316" : "#fb923c"}
                  transparent
                  opacity={0.95}
                />
              </mesh>
            )}
          </group>
        ))}

      {showBuiltIns &&
        fixedElements.map((fixed) => (
          <group
            key={fixed.id}
            position={[fixed.x, 0, fixed.z]}
            onClick={(event) => {
              event.stopPropagation();
              onSelectOverlay?.(fixed.id);
            }}
          >
            <mesh rotation-x={-Math.PI / 2} position={[0, 0.0016, 0]}>
              <planeGeometry args={[fixed.w, fixed.d]} />
              <meshBasicMaterial color={isPro ? "#d7d7d7" : "#e2ddd3"} transparent opacity={0.85} />
            </mesh>
            {interactive && (
              <mesh
                rotation-x={-Math.PI / 2}
                position={[0, 0.003, 0]}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectOverlay?.(fixed.id);
                  dragTargetRef.current = {
                    kind: "fixed",
                    id: fixed.id,
                    width: fixed.w,
                    depth: fixed.d,
                  };
                  setPointerCaptureIfSupported(event);
                }}
                onPointerMove={(event) => {
                  const drag = dragTargetRef.current;
                  if (!drag || drag.kind !== "fixed" || drag.id !== fixed.id) return;
                  event.stopPropagation();
                  handleFixedMove(fixed, event, drag.width, drag.depth);
                }}
                onPointerUp={(event) => {
                  const drag = dragTargetRef.current;
                  if (drag?.kind === "fixed" && drag.id === fixed.id) {
                    dragTargetRef.current = null;
                  }
                  releasePointerCaptureIfSupported(event);
                }}
              >
                <planeGeometry args={[fixed.w, fixed.d]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
            {interactive && (
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.0032, 0]}>
                <circleGeometry args={[0.05, 20]} />
                <meshBasicMaterial color={selectedOverlayId === fixed.id ? "#f97316" : "#9ca3af"} />
              </mesh>
            )}
            {fixed.label && (
              <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, 0]} center transform={false}>
                <div
                  style={{
                    fontSize: 10,
                    background: "rgba(255,255,255,0.88)",
                    border: "1px solid rgba(100,100,100,0.25)",
                    borderRadius: 5,
                    padding: "1px 5px",
                    pointerEvents: "none",
                  }}
                >
                  {fixed.label}
                </div>
              </Html>
            )}
          </group>
        ))}

      {showDimensions && (
        <>
          <Html zIndexRange={htmlZIndexRange} position={[0, 0.01, -halfD - 0.18]} center transform={false}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(120,120,120,0.35)",
                borderRadius: 6,
                padding: "2px 7px",
                pointerEvents: "none",
              }}
            >
              {formatDimension(width)}
            </div>
          </Html>
          <Html zIndexRange={htmlZIndexRange} position={[-halfW - 0.16, 0.01, 0]} center transform={false}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(120,120,120,0.35)",
                borderRadius: 6,
                padding: "2px 7px",
                pointerEvents: "none",
              }}
            >
              {formatDimension(depth)}
            </div>
          </Html>
        </>
      )}

      {showAnnotations &&
        annotations.map((note) => (
          <group
            key={note.id}
            onClick={(event) => {
              event.stopPropagation();
              onSelectOverlay?.(note.id);
            }}
          >
            {note.kind === "callout" &&
              note.anchorX !== undefined &&
              note.anchorZ !== undefined && (
                <>
                  <Line
                    points={[
                      [note.anchorX, 0.0025, note.anchorZ],
                      [note.x, 0.0025, note.z],
                    ]}
                    color="#374151"
                    lineWidth={1.2}
                  />
                  <mesh rotation-x={-Math.PI / 2} position={[note.anchorX, 0.0028, note.anchorZ]}>
                    <circleGeometry args={[0.018, 16]} />
                    <meshBasicMaterial color="#374151" />
                  </mesh>
                </>
              )}

            {interactive && (
              <mesh
                rotation-x={-Math.PI / 2}
                position={[note.x, 0.003, note.z]}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onSelectOverlay?.(note.id);
                  dragTargetRef.current = { kind: "annotation", id: note.id };
                  setPointerCaptureIfSupported(event);
                }}
                onPointerMove={(event) => {
                  const drag = dragTargetRef.current;
                  if (!drag || drag.kind !== "annotation" || drag.id !== note.id) return;
                  event.stopPropagation();
                  handleAnnotationMove(note, event);
                }}
                onPointerUp={(event) => {
                  const drag = dragTargetRef.current;
                  if (drag?.kind === "annotation" && drag.id === note.id) {
                    dragTargetRef.current = null;
                  }
                  releasePointerCaptureIfSupported(event);
                }}
              >
                <circleGeometry args={[0.05, 20]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}

            <Html zIndexRange={htmlZIndexRange} position={[note.x, 0.01, note.z]} center transform={false}>
              <div
                style={{
                  fontSize: note.kind === "room_tag" ? 12 : 11,
                  fontWeight: note.kind === "room_tag" ? 700 : 500,
                  letterSpacing: note.kind === "room_tag" ? 0.2 : 0,
                  color: note.kind === "room_tag" ? "#0f172a" : "#1f2937",
                  background: "rgba(255,255,255,0.92)",
                  border:
                    note.kind === "callout"
                      ? "1px solid rgba(55,65,81,0.45)"
                      : note.kind === "room_tag"
                        ? "1px solid rgba(15,23,42,0.35)"
                        : "1px dashed rgba(31,41,55,0.45)",
                  borderRadius: note.kind === "room_tag" ? 4 : 6,
                  padding: note.kind === "room_tag" ? "2px 8px" : "2px 6px",
                  pointerEvents: "none",
                }}
              >
                {note.text}
              </div>
            </Html>
          </group>
        ))}
    </group>
  );
}
