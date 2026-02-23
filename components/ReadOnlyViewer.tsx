"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";

function Room({
  width,
  depth,
  height = 2.6,
  wallThickness = 0.12,
  showGrid = false,
}: {
  width: number;
  depth: number;
  height?: number;
  wallThickness?: number;
  showGrid?: boolean;
}) {
  const floorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e9e4dc",
        roughness: 0.9,
        metalness: 0.0,
      }),
    []
  );

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f6f6f6",
        roughness: 0.95,
        metalness: 0.0,
      }),
    []
  );

  const halfW = width / 2;
  const halfD = depth / 2;

  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2} position={[0, 0, 0]}>
        <planeGeometry args={[width, depth]} />
        <primitive object={floorMat} attach="material" />
      </mesh>
      {showGrid && (
        <group position={[0, 0.001, 0]}>
          <Grid
            args={[width, depth]}
            cellSize={0.5}
            cellThickness={0.5}
            sectionSize={1}
            sectionThickness={1}
            infiniteGrid={false}
            fadeDistance={0}
          />
        </group>
      )}

      <mesh
        receiveShadow
        castShadow
        position={[0, height / 2, -halfD + wallThickness / 2]}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        receiveShadow
        castShadow
        position={[0, height / 2, halfD - wallThickness / 2]}
      >
        <boxGeometry args={[width, height, wallThickness]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        receiveShadow
        castShadow
        position={[-halfW + wallThickness / 2, height / 2, 0]}
      >
        <boxGeometry args={[wallThickness, height, depth]} />
        <primitive object={wallMat} attach="material" />
      </mesh>

      <mesh
        receiveShadow
        castShadow
        position={[halfW - wallThickness / 2, height / 2, 0]}
      >
        <boxGeometry args={[wallThickness, height, depth]} />
        <primitive object={wallMat} attach="material" />
      </mesh>
    </group>
  );
}

function Furniture({
  product,
  variantColor,
  position,
  rotationY,
}: {
  product: CatalogItemSchema;
  variantColor: string;
  position: [number, number, number];
  rotationY?: number;
}) {
  return (
    <mesh
      castShadow
      receiveShadow
      position={[position[0], product.dimsMm.h / 1000 / 2, position[2]]}
      rotation-y={rotationY ?? 0}
    >
      <boxGeometry args={[product.dimsMm.w / 1000, product.dimsMm.h / 1000, product.dimsMm.d / 1000]} />
      <meshStandardMaterial color={variantColor} roughness={0.8} metalness={0.05} />
    </mesh>
  );
}

export default function ReadOnlyViewer({
  roomWidth,
  roomDepth,
  items,
}: {
  roomWidth: number;
  roomDepth: number;
  items: any[];
}) {
  const safeItems = Array.isArray(items) ? items : [];

  return (
    <div className="h-[78vh] w-full">
      <Canvas
        shadows
        camera={{ position: [4.5, 3.2, 5.5], fov: 45, near: 0.1, far: 100 }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[6, 8, 4]}
          intensity={1.0}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-near={1}
          shadow-camera-far={25}
          shadow-camera-left={-10}
          shadow-camera-right={10}
          shadow-camera-top={10}
          shadow-camera-bottom={-10}
        />

        <Room width={roomWidth} depth={roomDepth} />

        {safeItems.map((it: any) => {
          const product = CATALOG_ITEMS[it.productId];
          if (!product) return null;
          const variant =
            product.variants.find((v) => v.id === it.variantId) ?? product.variants[0];
          return (
            <Furniture
              key={it.instanceId}
              product={product}
              variantColor={variant.colorHex}
              position={it.position ?? [0, 0, 0]}
              rotationY={it.rotationY ?? 0}
            />
          );
        })}

        <OrbitControls
          target={[0, 1.1, 0]}
          enableDamping
          dampingFactor={0.08}
          minDistance={2.5}
          maxDistance={10}
          minPolarAngle={0.35}
          maxPolarAngle={Math.PI / 2.05}
          maxAzimuthAngle={Infinity}
          minAzimuthAngle={-Infinity}
        />
      </Canvas>
    </div>
  );
}
