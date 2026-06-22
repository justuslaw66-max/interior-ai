"use client";

import { OrthographicCamera } from "@react-three/drei/core/OrthographicCamera";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { OrthographicCamera as ThreeOrthographicCamera } from "three";
import { resolvePlanFitZoom } from "@/lib/design-page-house-plan";

type EditorCamera2DProps = {
  active: boolean;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  safeAreaLeftPx?: number;
  safeAreaBottomPx?: number;
};

export default function EditorCamera2D({
  active,
  roomWidth,
  roomDepth,
  roomHeight,
  safeAreaLeftPx = 0,
  safeAreaBottomPx = 0,
}: EditorCamera2DProps) {
  const cameraRef = useRef<ThreeOrthographicCamera | null>(null);
  const { size } = useThree();

  useEffect(() => {
    if (!active || !cameraRef.current) return;

    const leftInsetPx = size.width >= 768 ? Math.max(0, safeAreaLeftPx) : 0;
    const bottomInsetPx = size.width < 768 ? Math.max(0, safeAreaBottomPx) : 0;
    const fitWidthPx = Math.max(320, size.width - leftInsetPx);
    const fitHeightPx = Math.max(260, size.height - bottomInsetPx);
    cameraRef.current.zoom = resolvePlanFitZoom({
      viewportWidthPx: fitWidthPx,
      viewportHeightPx: fitHeightPx,
      planWidthMeters: roomWidth,
      planDepthMeters: roomDepth,
    });
    const offsetX = leftInsetPx / cameraRef.current.zoom / -2;
    const offsetZ = bottomInsetPx / cameraRef.current.zoom / -2;
    cameraRef.current.position.set(offsetX, Math.max(roomWidth, roomDepth) + roomHeight + 6, offsetZ);
    // Top-down plan orientation without diagonal roll.
    cameraRef.current.up.set(0, 0, -1);
    cameraRef.current.lookAt(offsetX, 0, offsetZ);
    cameraRef.current.updateProjectionMatrix();
  }, [
    active,
    roomDepth,
    roomHeight,
    roomWidth,
    safeAreaBottomPx,
    safeAreaLeftPx,
    size.height,
    size.width,
  ]);

  if (!active) return null;

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      near={0.1}
      far={2000}
      position={[0, Math.max(roomWidth, roomDepth) + roomHeight + 6, 0]}
      up={[0, 0, -1]}
    />
  );
}
