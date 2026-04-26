"use client";

import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo, useEffect, useRef } from "react";
type RoomProps = {
  width?: number;
  depth?: number;
  height?: number;
  wallThickness?: number;
};

export function Room({
  width = 5,
  depth = 4,
  height = 2.6,
  wallThickness = 0.12,
}: RoomProps) {
  const { camera, gl } = useThree();
  const floorTexture = useMemo(() => {
    const size = 1024;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = "#ddd6c8";
    ctx.fillRect(0, 0, size, size);

    const rowHeight = 34;
    const gap = 2;
    const baseColor = [221, 214, 200];
    const noise = (seed: number) => {
      const x = Math.sin(seed * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };

    for (let y = 0, row = 0; y < size; y += rowHeight + gap, row += 1) {
      let plank = 0;
      let x = -Math.floor(noise(row + 0.17) * 120);
      while (x < size) {
        const plankWidth = 140 + Math.floor(noise(row * 97 + plank * 13 + 0.31) * 170);
        const grainShift = Math.floor(noise(row * 53 + plank * 19 + 0.73) * 14) - 7;
        const r = Math.max(170, Math.min(240, baseColor[0] + grainShift));
        const g = Math.max(150, Math.min(225, baseColor[1] + grainShift));
        const b = Math.max(125, Math.min(205, baseColor[2] + grainShift));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillRect(x, y, plankWidth, rowHeight);

        ctx.globalAlpha = 0.08;
        ctx.fillStyle = grainShift > 0 ? "#ffffff" : "#8f7a5f";
        for (let i = 0; i < 4; i += 1) {
          const grainY = y + 3 + i * 7;
          ctx.fillRect(x + 3, grainY, plankWidth - 6, 1);
        }
        ctx.globalAlpha = 1;

        x += plankWidth + gap;
        plank += 1;
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(1, width / 1.8), Math.max(1, depth / 1.8));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }, [depth, gl.capabilities, width]);

  const floorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#efe8dc",
        map: floorTexture ?? null,
        roughness: 0.78,
        metalness: 0,
        emissive: "#ffffff",
        emissiveIntensity: 0.02,
      }),
    [floorTexture]
  );
  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4f4f2",
        roughness: 0.92,
        metalness: 0,
        emissive: "#ffffff",
        emissiveIntensity: 0.015,
      }),
    []
  );
  const ceilingMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f8f8f6",
        roughness: 0.93,
        metalness: 0,
        emissive: "#ffffff",
        emissiveIntensity: 0.01,
      }),
    []
  );

  useEffect(() => {
    return () => {
      floorTexture?.dispose();
      floorMat.dispose();
      wallMat.dispose();
      ceilingMat.dispose();
    };
  }, [ceilingMat, floorMat, floorTexture, wallMat]);

  const ceilingRef = useRef<THREE.Mesh>(null);
  const frontWallRef = useRef<THREE.Mesh>(null);
  const backWallRef = useRef<THREE.Mesh>(null);
  const leftWallRef = useRef<THREE.Mesh>(null);
  const rightWallRef = useRef<THREE.Mesh>(null);

  const halfW = width / 2;
  const halfD = depth / 2;
  const frontZ = -halfD + wallThickness / 2;
  const backZ = halfD - wallThickness / 2;
  const leftX = -halfW + wallThickness / 2;
  const rightX = halfW - wallThickness / 2;

  useFrame(() => {
    const outsideBuffer = 0.02;

    const wallCandidates: Array<{ key: "front" | "back" | "left" | "right"; distance: number }> = [];
    if (camera.position.z < frontZ - outsideBuffer) {
      wallCandidates.push({ key: "front", distance: Math.abs(camera.position.z - frontZ) });
    }
    if (camera.position.z > backZ + outsideBuffer) {
      wallCandidates.push({ key: "back", distance: Math.abs(camera.position.z - backZ) });
    }
    if (camera.position.x < leftX - outsideBuffer) {
      wallCandidates.push({ key: "left", distance: Math.abs(camera.position.x - leftX) });
    }
    if (camera.position.x > rightX + outsideBuffer) {
      wallCandidates.push({ key: "right", distance: Math.abs(camera.position.x - rightX) });
    }

    // At corner viewpoints, two walls can block interior visibility. Hide up to two closest.
    const hiddenWallSet = new Set<"front" | "back" | "left" | "right">();
    wallCandidates
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 2)
      .forEach((entry) => hiddenWallSet.add(entry.key));

    if (frontWallRef.current) frontWallRef.current.visible = !hiddenWallSet.has("front");
    if (backWallRef.current) backWallRef.current.visible = !hiddenWallSet.has("back");
    if (leftWallRef.current) leftWallRef.current.visible = !hiddenWallSet.has("left");
    if (rightWallRef.current) rightWallRef.current.visible = !hiddenWallSet.has("right");
    if (ceilingRef.current) {
      ceilingRef.current.visible = camera.position.y <= height + wallThickness + outsideBuffer;
    }
  });

  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <primitive object={floorMat} attach="material" />
      </mesh>

      <mesh ref={ceilingRef} receiveShadow castShadow position={[0, height + wallThickness / 2, 0]}>
        <boxGeometry args={[width, wallThickness, depth]} />
        <primitive object={ceilingMat} attach="material" />
      </mesh>

      <mesh
        ref={frontWallRef}
        receiveShadow
        castShadow
        position={[0, height / 2, frontZ]}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        ref={backWallRef}
        receiveShadow
        castShadow
        position={[0, height / 2, backZ]}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        ref={leftWallRef}
        receiveShadow
        castShadow
        position={[leftX, height / 2, 0]}
      >
        <boxGeometry args={[wallThickness, height, depth]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        ref={rightWallRef}
        receiveShadow
        castShadow
        position={[rightX, height / 2, 0]}
      >
        <boxGeometry args={[wallThickness, height, depth]} />
        <primitive object={wallMat} attach="material" />
      </mesh>
    </group>
  );
}

