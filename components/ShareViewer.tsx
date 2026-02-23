"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useMemo, useState } from "react";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";
import { getActiveRoom, switchRoom } from "@/lib/room-types";

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

export default function ShareViewer({
  initialSnapshot,
}: {
  initialSnapshot: DesignSnapshot;
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const activeRoom = useMemo(() => getActiveRoom(snapshot), [snapshot]);
  const rooms = snapshot.rooms || [];

  if (!activeRoom) {
    return <div>No room available</div>;
  }

  const items = activeRoom.items || [];

  return (
    <div className="space-y-4">
      {/* Room Switcher */}
      {rooms.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {rooms.map((room: RoomSnapshot) => (
            <button
              key={room.id}
              onClick={() => setSnapshot(switchRoom(snapshot, room.id))}
              className={
                room.id === snapshot.activeRoomId
                  ? "rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white"
                  : "rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 border"
              }
            >
              {room.name}
            </button>
          ))}
        </div>
      )}

      {/* 3D Viewer */}
      <div className="relative overflow-hidden rounded-2xl bg-white shadow">
        <div className="pointer-events-none absolute right-4 top-4 rounded-lg bg-black/70 px-3 py-1 text-xs text-white z-10">
          Shared preview
        </div>

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

            <Room 
              width={activeRoom.geometry.width} 
              depth={activeRoom.geometry.depth} 
            />

            {items.map((it: any) => {
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
      </div>

      {/* Saved Views */}
      {activeRoom.savedViews && activeRoom.savedViews.length > 0 && (
        <div className="rounded-lg bg-white p-4 shadow">
          <h3 className="mb-2 text-sm font-semibold text-gray-800">Saved Views</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {activeRoom.savedViews.map((view: any) => (
              <div
                key={view.name}
                className="rounded-lg border bg-gray-50 p-3 text-center"
              >
                <div className="text-sm font-medium text-gray-700">{view.name}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
