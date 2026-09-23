"use client";

import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";
import { useEffect, useMemo, useRef } from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import { ViewerLighting } from "@/components/editor/design-page/lighting";
import type { DesignLightingSettings } from "@/lib/lightingPresets";
import type { PublicShareCameraView } from "@/lib/public-share-saved-views";

const DEFAULT_CAMERA_POSITION: [number, number, number] = [4.5, 3.2, 5.5];
const DEFAULT_CAMERA_TARGET: [number, number, number] = [0, 1.1, 0];
const DEFAULT_CAMERA_FOV = 45;

function ShareCameraControls({
  activeView,
  roomId,
}: {
  activeView: PublicShareCameraView | null;
  roomId: string;
}) {
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    const sceneCamera = controls?.object;
    if (!sceneCamera) return;
    const nextPosition = activeView?.cameraPosition ?? DEFAULT_CAMERA_POSITION;
    const nextTarget = activeView?.cameraTarget ?? DEFAULT_CAMERA_TARGET;
    sceneCamera.position.set(...nextPosition);
    if (sceneCamera instanceof THREE.PerspectiveCamera) {
      sceneCamera.fov = activeView?.fov ?? DEFAULT_CAMERA_FOV;
      sceneCamera.updateProjectionMatrix();
    }
    controls.target.set(...nextTarget);
    controls.update();
  }, [activeView, roomId]);

  return (
    <OrbitControls
      ref={controlsRef}
      target={activeView?.cameraTarget ?? DEFAULT_CAMERA_TARGET}
      enableDamping
      dampingFactor={0.08}
      minDistance={2.5}
      maxDistance={10}
      minPolarAngle={0.35}
      maxPolarAngle={Math.PI / 2.05}
      maxAzimuthAngle={Infinity}
      minAzimuthAngle={-Infinity}
    />
  );
}

function RoomShell({ room }: { room: RoomSnapshot }) {
  const { width, depth, height = 2.6, wallThickness = 0.12 } = room.geometry;
  const floorMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e8decc", roughness: 0.86 }),
    []
  );
  const wallMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f2eee6", roughness: 0.92 }),
    []
  );
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  return (
    <group>
      <mesh receiveShadow rotation-x={-Math.PI / 2}>
        <planeGeometry args={[width, depth]} />
        <primitive object={floorMaterial} attach="material" />
      </mesh>
      {[
        [0, height / 2, -halfDepth + wallThickness / 2, width, height, wallThickness],
        [0, height / 2, halfDepth - wallThickness / 2, width, height, wallThickness],
        [-halfWidth + wallThickness / 2, height / 2, 0, wallThickness, height, depth],
        [halfWidth - wallThickness / 2, height / 2, 0, wallThickness, height, depth],
      ].map(([x, y, z, boxWidth, boxHeight, boxDepth], index) => (
        <mesh key={index} receiveShadow castShadow position={[x, y, z]}>
          <boxGeometry args={[boxWidth, boxHeight, boxDepth]} />
          <primitive object={wallMaterial} attach="material" />
        </mesh>
      ))}
    </group>
  );
}

function Furniture({ item }: { item: DesignItem }) {
  const product = resolveDesignItemVisualProduct(item, CATALOG_ITEMS);
  if (!product) return null;
  const resolved = resolveCatalogVariant(product, item.variantId);
  const position = item.position ?? [0, 0, 0];
  const height = resolved.dimsMm.h / 1000;
  return (
    <mesh
      castShadow
      receiveShadow
      position={[position[0], height / 2, position[2]]}
      rotation-y={item.rotationY ?? 0}
    >
      <boxGeometry
        args={[resolved.dimsMm.w / 1000, height, resolved.dimsMm.d / 1000]}
      />
      <meshStandardMaterial color={resolved.variant.colorHex} roughness={0.8} metalness={0.05} />
    </mesh>
  );
}

export function ShareScene({
  room,
  lightingSettings,
  activeView,
  onCreated,
}: {
  room: RoomSnapshot;
  lightingSettings: DesignLightingSettings;
  activeView: PublicShareCameraView | null;
  onCreated: () => void;
}) {
  return (
    <Canvas
      shadows
      camera={{ position: DEFAULT_CAMERA_POSITION, fov: DEFAULT_CAMERA_FOV, near: 0.1, far: 100 }}
      onCreated={onCreated}
    >
      <ViewerLighting
        settings={lightingSettings}
        roomId={room.id}
        roomWidth={room.geometry.width}
        roomDepth={room.geometry.depth}
        roomHeight={room.geometry.height}
        items={room.items}
      />
      <RoomShell room={room} />
      {room.items.map((item) => (
        <Furniture key={item.instanceId} item={item} />
      ))}
      <ShareCameraControls activeView={activeView} roomId={room.id} />
    </Canvas>
  );
}
