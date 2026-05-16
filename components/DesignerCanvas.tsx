"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useMemo } from "react";
import Link from "next/link";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";

type PlacedItem = {
  instanceId: string;
  productId: string;
  variantId: string;
  position: [number, number, number];
  rotationY?: number;
  includeInCheckout?: boolean;
};

type DesignerCanvasProps = {
  initialItems: PlacedItem[];
  roomWidth: number;
  roomDepth: number;
  readOnly?: boolean;
};

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
        color: "#e8decc",
        roughness: 0.86,
        metalness: 0.0,
      }),
    []
  );

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f2eee6",
        roughness: 0.92,
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

export default function DesignerCanvas({
  initialItems,
  roomWidth,
  roomDepth,
  readOnly = false,
}: DesignerCanvasProps) {
  const items = Array.isArray(initialItems) ? initialItems : [];

  return (
    <main className="relative h-screen w-screen bg-neutral-100">
      <div className="absolute left-4 top-4 z-10 flex gap-2">
        {!readOnly && (
          <Link
            href="/dashboard"
            className="rounded-lg bg-white px-3 py-2 text-sm text-neutral-900 shadow hover:bg-neutral-50"
          >
            Dashboard
          </Link>
        )}
        <Link
          href="/"
          className="rounded-lg bg-white px-3 py-2 text-sm text-neutral-900 shadow hover:bg-neutral-50"
        >
          Main Menu
        </Link>
      </div>
      <Canvas
        shadows
        camera={{ position: [4.5, 3.2, 5.5], fov: 45, near: 0.1, far: 100 }}
      >
        <ambientLight intensity={0.5} color="#fff8ef" />
        <directionalLight
          position={[6, 8, 4]}
          intensity={1.1}
          color="#fff6e8"
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

        {items.map((it) => {
          const product = CATALOG_ITEMS[it.productId];
          if (!product) return null;
          const variant =
            product.variants.find((v) => v.id === it.variantId) ?? product.variants[0];
          return (
            <Furniture
              key={it.instanceId}
              product={product}
              variantColor={variant.colorHex}
              position={it.position}
              rotationY={it.rotationY}
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
    </main>
  );
}
