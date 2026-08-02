"use client";

import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, type RefObject } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  getPlan2DCameraInvariantStatus,
  recoverPlan2DCameraIfNeeded,
  type Plan2DCameraControls,
  type Plan2DCameraInvariantFit,
} from "@/lib/plan-camera-2d";

export type Plan2DCameraDiagnostics = {
  valid: boolean;
  recoveries: number;
  targetX: number;
  targetZ: number;
  projectedRoomMinWidthPx: number;
  projectedRoomMinHeightPx: number;
  projectedRoomMinAreaPx: number;
};

export interface Plan2DCameraInvariantGuardProps {
  active: boolean;
  cameraHeightMeters: number;
  controlsRef: RefObject<OrbitControlsImpl | null>;
  fit: Plan2DCameraInvariantFit;
  onDiagnosticsChange: (diagnostics: Plan2DCameraDiagnostics) => void;
  rooms: HousePlanRoom2D[];
  updateProjection: (camera: THREE.Camera | null) => void;
}

function getProjectedRoomMetrics(
  camera: THREE.Camera,
  viewport: { width: number; height: number },
  rooms: HousePlanRoom2D[]
) {
  if (viewport.width <= 0 || viewport.height <= 0 || rooms.length === 0) {
    return {
      projectedRoomMinWidthPx: 0,
      projectedRoomMinHeightPx: 0,
      projectedRoomMinAreaPx: 0,
    };
  }

  let minWidth = Number.POSITIVE_INFINITY;
  let minHeight = Number.POSITIVE_INFINITY;
  let minArea = Number.POSITIVE_INFINITY;

  for (const room of rooms) {
    const points = [
      new THREE.Vector3(room.x - room.w / 2, 0, room.z - room.d / 2),
      new THREE.Vector3(room.x + room.w / 2, 0, room.z - room.d / 2),
      new THREE.Vector3(room.x + room.w / 2, 0, room.z + room.d / 2),
      new THREE.Vector3(room.x - room.w / 2, 0, room.z + room.d / 2),
    ].map((point) => point.project(camera));

    const xs = points.map((point) => ((point.x + 1) / 2) * viewport.width);
    const ys = points.map((point) => ((1 - point.y) / 2) * viewport.height);
    const widthPx = Math.max(...xs) - Math.min(...xs);
    const heightPx = Math.max(...ys) - Math.min(...ys);
    const areaPx = widthPx * heightPx;

    if (Number.isFinite(widthPx)) minWidth = Math.min(minWidth, widthPx);
    if (Number.isFinite(heightPx)) minHeight = Math.min(minHeight, heightPx);
    if (Number.isFinite(areaPx)) minArea = Math.min(minArea, areaPx);
  }

  return {
    projectedRoomMinWidthPx: Number.isFinite(minWidth) ? Math.round(minWidth) : 0,
    projectedRoomMinHeightPx: Number.isFinite(minHeight) ? Math.round(minHeight) : 0,
    projectedRoomMinAreaPx: Number.isFinite(minArea) ? Math.round(minArea) : 0,
  };
}

export function Plan2DCameraInvariantGuard({
  active,
  cameraHeightMeters,
  controlsRef,
  fit,
  onDiagnosticsChange,
  rooms,
  updateProjection,
}: Plan2DCameraInvariantGuardProps) {
  const { camera, size } = useThree();
  const recoveryCountRef = useRef(0);
  const lastDiagnosticsRef = useRef<Plan2DCameraDiagnostics | null>(null);
  const lastWarningAtRef = useRef(0);

  useFrame(() => {
    if (!active) return;

    const controls = controlsRef.current as Plan2DCameraControls | null;
    const recovery = recoverPlan2DCameraIfNeeded({
      camera,
      controls,
      fit,
      cameraHeightMeters,
      updateProjection,
    });

    if (recovery.recovered) {
      recoveryCountRef.current += 1;
      const now = Date.now();
      if (process.env.NODE_ENV !== "production" && now - lastWarningAtRef.current > 1500) {
        lastWarningAtRef.current = now;
        console.warn("[Plan2D] recovered non-degenerate top-down camera", recovery.previousStatus);
      }
    }

    const status = getPlan2DCameraInvariantStatus(camera, controls);
    const projectionMetrics = getProjectedRoomMetrics(camera, size, rooms);
    const diagnostics = {
      valid: status.valid,
      recoveries: recoveryCountRef.current,
      targetX: Number((controls?.target.x ?? 0).toFixed(3)),
      targetZ: Number((controls?.target.z ?? 0).toFixed(3)),
      ...projectionMetrics,
    };
    const last = lastDiagnosticsRef.current;
    if (
      last &&
      last.valid === diagnostics.valid &&
      last.recoveries === diagnostics.recoveries &&
      last.targetX === diagnostics.targetX &&
      last.targetZ === diagnostics.targetZ &&
      last.projectedRoomMinWidthPx === diagnostics.projectedRoomMinWidthPx &&
      last.projectedRoomMinHeightPx === diagnostics.projectedRoomMinHeightPx &&
      last.projectedRoomMinAreaPx === diagnostics.projectedRoomMinAreaPx
    ) {
      return;
    }

    lastDiagnosticsRef.current = diagnostics;
    onDiagnosticsChange(diagnostics);
  });

  return null;
}
