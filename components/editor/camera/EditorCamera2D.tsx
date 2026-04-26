"use client";

import { OrthographicCamera } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { OrthographicCamera as ThreeOrthographicCamera } from "three";

type EditorCamera2DProps = {
  active: boolean;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
};

export default function EditorCamera2D({
  active,
  roomWidth,
  roomDepth,
  roomHeight,
}: EditorCamera2DProps) {
  const cameraRef = useRef<ThreeOrthographicCamera | null>(null);
  const { size } = useThree();

  useEffect(() => {
    if (!active || !cameraRef.current) return;

    const spanX = roomWidth + 1.2;
    const spanZ = roomDepth + 1.2;
    const zoomX = size.width / spanX;
    const zoomZ = size.height / spanZ;

    cameraRef.current.zoom = Math.max(24, Math.min(220, Math.min(zoomX, zoomZ)));
    cameraRef.current.position.set(0, Math.max(roomWidth, roomDepth) + roomHeight + 6, 0);
    // Top-down plan orientation without diagonal roll.
    cameraRef.current.up.set(0, 0, -1);
    cameraRef.current.lookAt(0, 0, 0);
    cameraRef.current.updateProjectionMatrix();
  }, [active, roomDepth, roomHeight, roomWidth, size.height, size.width]);

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
