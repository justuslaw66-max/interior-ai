// app/admin/models/[id]/viewer.tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

// Accept any object with the required properties (matches Prisma ModelAsset)
type Asset = {
  id: string;
  modelUrl: string;
  aabbSizeX: number;
  aabbSizeY: number;
  aabbSizeZ: number;
  aabbCenterX: number;
  aabbCenterY: number;
  aabbCenterZ: number;
  [key: string]: any; // Allow additional fields from Prisma
};

function BoundsBox({ asset }: { asset: Asset }) {
  const size = new THREE.Vector3(asset.aabbSizeX, asset.aabbSizeY, asset.aabbSizeZ);
  const center = new THREE.Vector3(asset.aabbCenterX, asset.aabbCenterY, asset.aabbCenterZ);

  return (
    <mesh position={center}>
      <boxGeometry args={[size.x, size.y, size.z]} />
      <meshBasicMaterial wireframe color="#ff0000" />
    </mesh>
  );
}

function Model({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return <primitive object={gltf.scene} />;
}

export default function ModelViewer({ asset }: { asset: Asset }) {
  return (
    <Canvas camera={{ position: [2, 1.5, 2], fov: 45 }}>
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 2]} intensity={1.2} />
      <gridHelper args={[10, 20]} />
      <axesHelper args={[1]} />
      <Model url={asset.modelUrl} />
      <BoundsBox asset={asset} />
      <OrbitControls makeDefault />
    </Canvas>
  );
}
