"use client";

import { useLoader } from "@react-three/fiber";
import { Line } from "@react-three/drei/core/Line";
import { Html } from "@react-three/drei/web/Html";
import { useMemo, useState } from "react";
import * as THREE from "three";
import type {
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import {
  resolveArcWallDrawPreview,
  resolveRoomDrawPreview,
  resolveTracedOpeningPreview,
  snapFloorPlanPointToGrid,
  type ArcWallDrawPreview,
  type RoomDrawPreview,
} from "@/lib/floor-plan-tracing";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";

type PlanUnderlayRenderer2DProps = {
  underlay: FloorPlanUnderlay | null;
  calibrationMode?: boolean;
  calibrationPoints?: FloorPlanPoint[];
  onCalibrationPoint?: (point: FloorPlanPoint) => void;
  traceRoomMode?: boolean;
  traceRoomDrawMode?: FloorPlanDrawRoomMode;
  traceRoomPoints?: FloorPlanPoint[];
  onTraceRoomPoint?: (point: FloorPlanPoint) => void;
  traceOpeningMode?: boolean;
  traceOpeningPoints?: FloorPlanPoint[];
  traceOpeningKind?: RoomOpening2D["kind"];
  rooms?: HousePlanRoom2D[];
  existingOpenings?: RoomOpening2D[];
  onTraceOpeningPoint?: (point: FloorPlanPoint) => void;
};

function getPointFromEvent(point: THREE.Vector3, snapToGrid = false): FloorPlanPoint {
  const nextPoint = {
    x: Number(point.x.toFixed(3)),
    z: Number(point.z.toFixed(3)),
  };
  return snapToGrid ? snapFloorPlanPointToGrid(nextPoint) : nextPoint;
}

function buildRectangleLinePoints(points: FloorPlanPoint[]): Array<[number, number, number]> {
  if (points.length !== 2) return [];
  const [first, second] = points;
  return [
    [first.x, 0.019, first.z],
    [second.x, 0.019, first.z],
    [second.x, 0.019, second.z],
    [first.x, 0.019, second.z],
    [first.x, 0.019, first.z],
  ];
}

function buildStraightWallLinePoints(
  points: FloorPlanPoint[],
  previewPoint: FloorPlanPoint | null
): Array<[number, number, number]> {
  const visiblePoints =
    previewPoint && points.length > 0 ? [...points, previewPoint] : points;
  return visiblePoints.map((point) => [point.x, 0.021, point.z]);
}

function buildArcWallLinePoints(
  preview: ArcWallDrawPreview
): Array<[number, number, number]> {
  if (preview.outline.length < 3) return [];
  return [...preview.outline, preview.outline[0]].map((point) => [point.x, 0.021, point.z]);
}

function buildPreviewLabel(preview: RoomDrawPreview): string {
  const width = preview.width.toFixed(1).replace(/\.0$/, "");
  const depth = preview.depth.toFixed(1).replace(/\.0$/, "");
  const area = preview.areaSqm.toFixed(1).replace(/\.0$/, "");
  return preview.rectangle ? `${width} x ${depth}m (${area} m2)` : `${width} x ${depth}m`;
}

function formatMillimeters(meters: number): string {
  return `${Math.round(meters * 1000)} mm`;
}

function ImagePlanUnderlay({
  underlay,
  calibrationMode = false,
  calibrationPoints = [],
  onCalibrationPoint,
  traceRoomMode = false,
  traceRoomDrawMode = "rectangle_wall",
  traceRoomPoints = [],
  onTraceRoomPoint,
  traceOpeningMode = false,
  traceOpeningPoints = [],
  traceOpeningKind = "door",
  rooms = [],
  existingOpenings = [],
  onTraceOpeningPoint,
}: {
  underlay: FloorPlanUnderlay;
  calibrationMode?: boolean;
  calibrationPoints?: FloorPlanPoint[];
  onCalibrationPoint?: (point: FloorPlanPoint) => void;
  traceRoomMode?: boolean;
  traceRoomDrawMode?: FloorPlanDrawRoomMode;
  traceRoomPoints?: FloorPlanPoint[];
  onTraceRoomPoint?: (point: FloorPlanPoint) => void;
  traceOpeningMode?: boolean;
  traceOpeningPoints?: FloorPlanPoint[];
  traceOpeningKind?: RoomOpening2D["kind"];
  rooms?: HousePlanRoom2D[];
  existingOpenings?: RoomOpening2D[];
  onTraceOpeningPoint?: (point: FloorPlanPoint) => void;
}) {
  const texture = useLoader(THREE.TextureLoader, underlay.assetUrl);
  const [traceRoomPreviewPoint, setTraceRoomPreviewPoint] = useState<FloorPlanPoint | null>(null);
  const [traceOpeningPreviewPoint, setTraceOpeningPreviewPoint] =
    useState<FloorPlanPoint | null>(null);
  const isPickingPoint = calibrationMode || traceRoomMode || traceOpeningMode;
  const isStraightTraceMode = traceRoomMode && traceRoomDrawMode === "straight_wall";
  const isRectangleTraceMode = traceRoomMode && traceRoomDrawMode === "rectangle_wall";
  const isArcTraceMode = traceRoomMode && traceRoomDrawMode === "arc_wall";
  const roomDrawPreview = useMemo(() => {
    if (!isRectangleTraceMode || traceRoomPoints.length !== 1 || !traceRoomPreviewPoint) {
      return null;
    }

    return resolveRoomDrawPreview(traceRoomPoints[0], traceRoomPreviewPoint);
  }, [isRectangleTraceMode, traceRoomPoints, traceRoomPreviewPoint]);
  const arcWallDrawPreview = useMemo(() => {
    if (!isArcTraceMode || traceRoomPoints.length !== 1 || !traceRoomPreviewPoint) {
      return null;
    }

    return resolveArcWallDrawPreview(traceRoomPoints[0], traceRoomPreviewPoint);
  }, [isArcTraceMode, traceRoomPoints, traceRoomPreviewPoint]);
  const openingPreview = useMemo(() => {
    if (!traceOpeningMode || traceOpeningPoints.length !== 1 || !traceOpeningPreviewPoint) {
      return null;
    }

    return resolveTracedOpeningPreview(
      [traceOpeningPoints[0], traceOpeningPreviewPoint],
      rooms,
      traceOpeningKind,
      existingOpenings
    );
  }, [
    existingOpenings,
    rooms,
    traceOpeningKind,
    traceOpeningMode,
    traceOpeningPoints,
    traceOpeningPreviewPoint,
  ]);
  const traceRoomLinePoints =
    traceRoomPoints.length === 2
      ? traceRoomPoints
      : roomDrawPreview
        ? [roomDrawPreview.start, roomDrawPreview.end]
        : [];
  const straightWallLinePoints = isStraightTraceMode
    ? buildStraightWallLinePoints(traceRoomPoints, traceRoomPreviewPoint)
    : [];

  const handlePointClick = (point: THREE.Vector3) => {
    if (calibrationMode) {
      onCalibrationPoint?.(getPointFromEvent(point));
      return;
    }
    if (traceRoomMode) {
      if (traceRoomPoints.length !== 1) {
        setTraceRoomPreviewPoint(null);
      }
      onTraceRoomPoint?.(getPointFromEvent(point, true));
      return;
    }
    if (traceOpeningMode) {
      if (traceOpeningPoints.length !== 1) {
        setTraceOpeningPreviewPoint(null);
      }
      onTraceOpeningPoint?.(getPointFromEvent(point));
    }
  };
  const handlePointPreview = (point: THREE.Vector3) => {
    if (traceRoomMode && traceRoomPoints.length > 0) {
      setTraceRoomPreviewPoint(getPointFromEvent(point, true));
    }
    if (traceOpeningMode && traceOpeningPoints.length > 0) {
      setTraceOpeningPreviewPoint(getPointFromEvent(point));
    }
  };

  return (
    <>
      <group
        position={[underlay.position.x, 0.001, underlay.position.z]}
        rotation-y={(underlay.rotationDeg * Math.PI) / 180}
      >
        <mesh
          rotation-x={-Math.PI / 2}
          renderOrder={-10}
          onClick={(event) => {
            if (!isPickingPoint) return;
            event.stopPropagation();
            handlePointClick(event.point);
          }}
          onPointerMove={(event) => {
            if (!isPickingPoint) return;
            handlePointPreview(event.point);
          }}
              onPointerOut={() => {
                setTraceRoomPreviewPoint(null);
                setTraceOpeningPreviewPoint(null);
              }}
        >
          <planeGeometry args={[underlay.widthMeters, underlay.depthMeters]} />
          <meshBasicMaterial
            map={texture}
            transparent
            opacity={underlay.opacity}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
        {isPickingPoint && (
          <mesh
            rotation-x={-Math.PI / 2}
            position={[0, 0.04, 0]}
              onClick={(event) => {
                event.stopPropagation();
                handlePointClick(event.point);
              }}
              onPointerMove={(event) => {
                event.stopPropagation();
                handlePointPreview(event.point);
              }}
              onPointerOut={() => {
                setTraceRoomPreviewPoint(null);
                setTraceOpeningPreviewPoint(null);
              }}
            >
            <planeGeometry args={[underlay.widthMeters, underlay.depthMeters]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        )}
      </group>

      {calibrationMode && calibrationPoints.length === 2 && (
        <Line
          points={calibrationPoints.map((point) => [point.x, 0.018, point.z])}
          color="#14b8a6"
          lineWidth={2}
        />
      )}

      {isStraightTraceMode && straightWallLinePoints.length >= 2 && (
        <Line
          points={straightWallLinePoints}
          color="#2563eb"
          lineWidth={3}
        />
      )}

      {isRectangleTraceMode && traceRoomLinePoints.length === 2 && (
        <Line
          points={buildRectangleLinePoints(traceRoomLinePoints)}
          color={roomDrawPreview?.rectangle === null ? "#f97316" : "#2563eb"}
          lineWidth={2}
        />
      )}

      {isRectangleTraceMode && roomDrawPreview && (
        <Html
          zIndexRange={[10, 0]}
          position={[
            (roomDrawPreview.start.x + roomDrawPreview.end.x) / 2,
            0.055,
            (roomDrawPreview.start.z + roomDrawPreview.end.z) / 2,
          ]}
          center
          transform={false}
        >
          <div
            data-testid="floor-plan-room-draw-preview"
            style={{
              border: roomDrawPreview.rectangle
                ? "1px solid rgba(37,99,235,0.3)"
                : "1px solid rgba(249,115,22,0.38)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.9)",
              color: roomDrawPreview.rectangle ? "#1d4ed8" : "#c2410c",
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 7px",
              pointerEvents: "none",
              whiteSpace: "nowrap",
              boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
            }}
          >
            {buildPreviewLabel(roomDrawPreview)}
          </div>
        </Html>
      )}

      {isRectangleTraceMode && roomDrawPreview && (
        <>
          <Html
            zIndexRange={[11, 0]}
            position={[
              (roomDrawPreview.start.x + roomDrawPreview.end.x) / 2,
              0.06,
              roomDrawPreview.start.z - 0.22,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="floor-plan-rectangle-wall-width"
              style={{
                border: "1px solid rgba(37,99,235,0.32)",
                borderRadius: 5,
                background: "rgba(255,255,255,0.94)",
                color: "#1d4ed8",
                fontSize: 11,
                fontWeight: 800,
                padding: "2px 7px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
              }}
            >
              {formatMillimeters(roomDrawPreview.width)}
            </div>
          </Html>
          <Html
            zIndexRange={[11, 0]}
            position={[
              roomDrawPreview.start.x - 0.22,
              0.06,
              (roomDrawPreview.start.z + roomDrawPreview.end.z) / 2,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="floor-plan-rectangle-wall-depth"
              style={{
                border: "1px solid rgba(37,99,235,0.32)",
                borderRadius: 5,
                background: "rgba(255,255,255,0.94)",
                color: "#1d4ed8",
                fontSize: 11,
                fontWeight: 800,
                padding: "2px 7px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
                writingMode: "vertical-rl",
              }}
            >
              {formatMillimeters(roomDrawPreview.depth)}
            </div>
          </Html>
        </>
      )}

      {isArcTraceMode && arcWallDrawPreview && (
        <>
          <Line
            points={buildArcWallLinePoints(arcWallDrawPreview)}
            color={arcWallDrawPreview.resolvedRoom ? "#2563eb" : "#f97316"}
            lineWidth={3}
          />
          <Html
            zIndexRange={[11, 0]}
            position={[
              arcWallDrawPreview.labelPosition.x,
              0.06,
              arcWallDrawPreview.labelPosition.z,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="floor-plan-arc-wall-length"
              style={{
                border: "1px solid rgba(37,99,235,0.32)",
                borderRadius: 5,
                background: "rgba(255,255,255,0.94)",
                color: "#1d4ed8",
                fontSize: 11,
                fontWeight: 800,
                padding: "2px 7px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
              }}
            >
              {formatMillimeters(arcWallDrawPreview.arcLengthMeters)}
            </div>
          </Html>
          <Html
            zIndexRange={[11, 0]}
            position={[
              arcWallDrawPreview.angleLabelPosition.x,
              0.06,
              arcWallDrawPreview.angleLabelPosition.z,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="floor-plan-arc-wall-angle"
              style={{
                color: "#171717",
                fontSize: 12,
                fontWeight: 800,
                pointerEvents: "none",
                whiteSpace: "nowrap",
                textShadow: "0 1px 2px rgba(255,255,255,0.9)",
              }}
            >
              {arcWallDrawPreview.angleDeg.toFixed(1)}°
            </div>
          </Html>
        </>
      )}

      {traceOpeningMode && traceOpeningPoints.length === 2 && (
        <Line
          points={traceOpeningPoints.map((point) => [point.x, 0.021, point.z])}
          color="#db2777"
          lineWidth={2}
        />
      )}

      {traceOpeningMode && openingPreview && (
        <>
          <Line
            points={openingPreview.segment.map((point) => [point.x, 0.023, point.z])}
            color={openingPreview.status === "valid" ? "#0f766e" : "#f97316"}
            lineWidth={3}
          />
          <Html
            zIndexRange={[12, 0]}
            position={[
              openingPreview.labelPosition.x,
              0.07,
              openingPreview.labelPosition.z,
            ]}
            center
            transform={false}
          >
            <div
              data-testid="floor-plan-opening-snap-preview"
              style={{
                border:
                  openingPreview.status === "valid"
                    ? "1px solid rgba(15,118,110,0.32)"
                    : "1px solid rgba(249,115,22,0.38)",
                borderRadius: 6,
                background: "rgba(255,255,255,0.94)",
                color: openingPreview.status === "valid" ? "#0f766e" : "#c2410c",
                fontSize: 11,
                fontWeight: 800,
                padding: "3px 7px",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                boxShadow: "0 1px 5px rgba(15,23,42,0.12)",
              }}
            >
              {openingPreview.label}
            </div>
          </Html>
        </>
      )}

      {calibrationMode &&
        calibrationPoints.map((point, index) => (
          <mesh
            key={`${point.x}:${point.z}:${index}`}
            position={[point.x, 0.02, point.z]}
            rotation-x={-Math.PI / 2}
          >
            <circleGeometry args={[0.08, 24]} />
            <meshBasicMaterial color={index === 0 ? "#14b8a6" : "#f97316"} />
          </mesh>
        ))}

      {traceRoomMode &&
        traceRoomPoints.map((point, index) => (
          <mesh
            key={`trace:${point.x}:${point.z}:${index}`}
            position={[point.x, 0.022, point.z]}
            rotation-x={-Math.PI / 2}
          >
            <circleGeometry args={[0.08, 24]} />
            <meshBasicMaterial color={index === 0 ? "#2563eb" : "#f59e0b"} />
          </mesh>
        ))}

      {traceOpeningMode &&
        traceOpeningPoints.map((point, index) => (
          <mesh
            key={`opening:${point.x}:${point.z}:${index}`}
            position={[point.x, 0.024, point.z]}
            rotation-x={-Math.PI / 2}
          >
            <circleGeometry args={[0.07, 24]} />
            <meshBasicMaterial color={index === 0 ? "#db2777" : "#f97316"} />
          </mesh>
        ))}
    </>
  );
}

export default function PlanUnderlayRenderer2D({
  underlay,
  calibrationMode = false,
  calibrationPoints = [],
  onCalibrationPoint,
  traceRoomMode = false,
  traceRoomDrawMode = "rectangle_wall",
  traceRoomPoints = [],
  onTraceRoomPoint,
  traceOpeningMode = false,
  traceOpeningPoints = [],
  traceOpeningKind = "door",
  rooms = [],
  existingOpenings = [],
  onTraceOpeningPoint,
}: PlanUnderlayRenderer2DProps) {
  if (!underlay?.mimeType.startsWith("image/")) {
    return null;
  }

  return (
    <ImagePlanUnderlay
      underlay={underlay}
      calibrationMode={calibrationMode}
      calibrationPoints={calibrationPoints}
      onCalibrationPoint={onCalibrationPoint}
      traceRoomMode={traceRoomMode}
      traceRoomDrawMode={traceRoomDrawMode}
      traceRoomPoints={traceRoomPoints}
      onTraceRoomPoint={onTraceRoomPoint}
      traceOpeningMode={traceOpeningMode}
      traceOpeningPoints={traceOpeningPoints}
      traceOpeningKind={traceOpeningKind}
      rooms={rooms}
      existingOpenings={existingOpenings}
      onTraceOpeningPoint={onTraceOpeningPoint}
    />
  );
}
