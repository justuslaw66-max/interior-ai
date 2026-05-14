// app/admin/models/[id]/viewer.tsx
"use client";

import { Canvas } from "@react-three/fiber";
import { Html, OrbitControls, useGLTF } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { getModelAssetStatus } from "@/lib/modelAssetStatus";

// Accept objects with the required properties (matches Prisma ModelAsset)
type Asset = {
  id: string;
  modelUrl: string;
  thumbUrl?: string;
  notes?: string | null;
  approved?: boolean;
  dimsWmm?: number;
  dimsDmm?: number;
  dimsHmm?: number;
  pivotOffsetX?: number;
  pivotOffsetZ?: number;
  groundAligned?: boolean;
  aabbSizeX: number;
  aabbSizeY: number;
  aabbSizeZ: number;
  aabbCenterX: number;
  aabbCenterY: number;
  aabbCenterZ: number;
  [key: string]: unknown; // Allow additional fields from Prisma
};

type LightingMode = "studio" | "day" | "warm";

type TextureStat = {
  name: string;
  width: number;
  height: number;
};

type QAStats = {
  triCount: number;
  materialNames: string[];
  textures: TextureStat[];
  computedSize: { x: number; y: number; z: number };
  materialDiagnostics: MaterialDiagnostic[];
};

type MaterialDiagnostic = {
  name: string;
  hasBaseColorMap: boolean;
  hasRoughnessMap: boolean;
  hasNormalMap: boolean;
  roughness: number | null;
  metalness: number | null;
};

type RenderMode = "pbr" | "albedo" | "roughness";

const MATERIAL_TEXTURE_KEYS = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "aoMap",
  "emissiveMap",
  "alphaMap",
  "bumpMap",
  "displacementMap",
  "specularMap",
] as const;

function formatFileSize(bytes: number | null) {
  if (bytes == null || !Number.isFinite(bytes)) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

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

function PivotMarker({ asset }: { asset: Asset }) {
  const x = asset.pivotOffsetX ?? 0;
  const z = asset.pivotOffsetZ ?? 0;
  return (
    <group position={[x, 0, z]}>
      <mesh>
        <sphereGeometry args={[0.03, 16, 16]} />
        <meshBasicMaterial color="#22c55e" />
      </mesh>
      <axesHelper args={[0.25]} />
      <Html position={[0, 0.08, 0]} center>
        <div className="rounded bg-black/70 px-2 py-0.5 text-[10px] text-white">pivot</div>
      </Html>
    </group>
  );
}

function qaStatsFromScene(scene: THREE.Object3D): QAStats {
  let triCount = 0;
  const materialNames = new Set<string>();
  const textureMap = new Map<string, TextureStat>();
  const materialDiagnosticsMap = new Map<string, MaterialDiagnostic>();

  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
    if (geometry) {
      const position = geometry.getAttribute("position");
      const index = geometry.getIndex();
      if (index) triCount += Math.floor(index.count / 3);
      else if (position) triCount += Math.floor(position.count / 3);
    }

    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material) => {
      const mat = material as THREE.MeshStandardMaterial | null;
      if (!mat) return;
      const materialName = mat.name?.trim() || "(unnamed)";
      materialNames.add(materialName);

      if (!materialDiagnosticsMap.has(mat.uuid)) {
        materialDiagnosticsMap.set(mat.uuid, {
          name: materialName,
          hasBaseColorMap: Boolean(mat.map),
          hasRoughnessMap: Boolean(mat.roughnessMap),
          hasNormalMap: Boolean(mat.normalMap),
          roughness: typeof mat.roughness === "number" ? mat.roughness : null,
          metalness: typeof mat.metalness === "number" ? mat.metalness : null,
        });
      }

      MATERIAL_TEXTURE_KEYS.forEach((key) => {
        const tex = mat[key as keyof THREE.MeshStandardMaterial] as THREE.Texture | null | undefined;
        if (!tex || !tex.image) return;
        const image = tex.image as { width?: number; height?: number };
        const sourceData = tex.source?.data as { width?: number; height?: number } | undefined;
        const width = image.width ?? sourceData?.width;
        const height = image.height ?? sourceData?.height;
        if (!width || !height) return;
        const name = tex.name?.trim() || `${key}:${tex.uuid.slice(0, 8)}`;
        if (!textureMap.has(tex.uuid)) {
          textureMap.set(tex.uuid, { name, width, height });
        }
      });
    });
  });

  const bbox = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3();
  bbox.getSize(size);

  return {
    triCount,
    materialNames: Array.from(materialNames).sort((a, b) => a.localeCompare(b)),
    textures: Array.from(textureMap.values()).sort((a, b) => (b.width * b.height) - (a.width * a.height)),
    computedSize: { x: size.x, y: size.y, z: size.z },
    materialDiagnostics: Array.from(materialDiagnosticsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  };
}

function Model({
  url,
  onStats,
  renderMode,
}: {
  url: string;
  onStats: (stats: QAStats) => void;
  renderMode: RenderMode;
}) {
  const gltf = useGLTF(url);

  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const originalMaterialsRef = useRef(new WeakMap<THREE.Mesh, THREE.Material[]>());

  useEffect(() => {
    onStats(qaStatsFromScene(scene));
  }, [scene, onStats]);

  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!originalMaterialsRef.current.has(mesh)) {
        originalMaterialsRef.current.set(mesh, materials.filter(Boolean));
      }
    });
  }, [scene]);

  useEffect(() => {
    const originalMaterialsMap = originalMaterialsRef.current;

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;

      const originals = originalMaterialsMap.get(mesh) ?? [];
      const mappedMaterials = originals.map((originalMat) => {
        if (!originalMat) return originalMat;

        if (renderMode === "pbr") {
          return originalMat;
        }

        const mat = originalMat as THREE.MeshStandardMaterial;
        const cloned = mat.clone();

        if (renderMode === "albedo") {
          cloned.normalMap = null;
          cloned.roughnessMap = null;
          cloned.metalnessMap = null;
          cloned.aoMap = null;
          cloned.bumpMap = null;
          cloned.displacementMap = null;
          cloned.emissiveMap = null;
          cloned.emissive.set("#000000");
          cloned.metalness = 0;
          cloned.roughness = 1;
          return cloned;
        }

        // roughness visualization mode
        const roughness = Math.max(0, Math.min(1, typeof mat.roughness === "number" ? mat.roughness : 0.5));
        const v = Math.round((1 - roughness) * 255);
        cloned.map = null;
        cloned.normalMap = null;
        cloned.aoMap = null;
        cloned.metalnessMap = null;
        cloned.bumpMap = null;
        cloned.displacementMap = null;
        cloned.color = new THREE.Color(`rgb(${v}, ${v}, ${v})`);
        cloned.metalness = 0;
        cloned.roughness = 1;
        return cloned;
      });

      mesh.material = Array.isArray(mesh.material)
        ? mappedMaterials
        : mappedMaterials[0] ?? originals[0];
    });

    return () => {
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const originals = originalMaterialsMap.get(mesh) ?? [];
        const originalSet = new Set(originals);
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((mat) => {
          if (!mat) return;
          if (!originalSet.has(mat)) {
            mat.dispose();
          }
        });
      });
    };
  }, [scene, renderMode]);

  return <primitive object={scene} />;
}

export default function ModelViewer({ asset }: { asset: Asset }) {
  const [lightingMode, setLightingMode] = useState<LightingMode>("studio");
  const [showBounds, setShowBounds] = useState(true);
  const [showPivot, setShowPivot] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [castShadow, setCastShadow] = useState(true);
  const [renderMode, setRenderMode] = useState<RenderMode>("pbr");
  const [neutralLighting, setNeutralLighting] = useState(false);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  const [stats, setStats] = useState<QAStats | null>(null);
  const [modelExists, setModelExists] = useState<boolean | null>(null);
  const [modelLoadError, setModelLoadError] = useState<string | null>(null);

  const approvalStatus = getModelAssetStatus(asset);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const headRes = await fetch(asset.modelUrl, { method: "HEAD" });
        if (!cancelled) {
          if (!headRes.ok) {
            setModelExists(false);
            setModelLoadError(`Model file returned ${headRes.status} for ${asset.modelUrl}`);
            setFileSizeBytes(null);
            return;
          }
          setModelExists(true);
          setModelLoadError(null);
        }

        const headSize = Number(headRes.headers.get("content-length"));
        if (!cancelled && Number.isFinite(headSize) && headSize > 0) {
          setFileSizeBytes(headSize);
          return;
        }

        const getRes = await fetch(asset.modelUrl);
        const blob = await getRes.blob();
        if (!cancelled) setFileSizeBytes(blob.size);
      } catch {
        if (!cancelled) {
          setModelExists(false);
          setModelLoadError(`Unable to fetch model file at ${asset.modelUrl}`);
          setFileSizeBytes(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [asset.modelUrl]);

  const lighting = useMemo(() => {
    if (neutralLighting) {
      return {
        ambient: 0.95,
        directional: 0.95,
        directionalColor: "#ffffff",
        hemi: 0,
        hemiSky: "#ffffff",
        hemiGround: "#ffffff",
      };
    }
    if (lightingMode === "day") {
      return {
        ambient: 0.7,
        directional: 1.4,
        directionalColor: "#ffffff",
        hemi: 0.45,
        hemiSky: "#dbeafe",
        hemiGround: "#e5e7eb",
      };
    }
    if (lightingMode === "warm") {
      return {
        ambient: 0.55,
        directional: 1.15,
        directionalColor: "#ffd6a3",
        hemi: 0.35,
        hemiSky: "#ffe7c2",
        hemiGround: "#d6c6a8",
      };
    }
    return {
      ambient: 0.6,
      directional: 1.25,
      directionalColor: "#f8fafc",
      hemi: 0.4,
      hemiSky: "#f1f5f9",
      hemiGround: "#d1d5db",
    };
  }, [lightingMode, neutralLighting]);

  const mapCoverage = useMemo(() => {
    const diagnostics = stats?.materialDiagnostics ?? [];
    const total = diagnostics.length;
    const count = (predicate: (d: MaterialDiagnostic) => boolean) => diagnostics.filter(predicate).length;
    return {
      total,
      baseColorPresent: count((d) => d.hasBaseColorMap),
      roughnessPresent: count((d) => d.hasRoughnessMap),
      normalPresent: count((d) => d.hasNormalMap),
    };
  }, [stats]);

  const textureSummary = useMemo(() => {
    if (!stats || stats.textures.length === 0) {
      return {
        count: 0,
        max: "-",
      };
    }
    const maxTex = stats.textures[0];
    return {
      count: stats.textures.length,
      max: `${maxTex.width}x${maxTex.height}`,
    };
  }, [stats]);

  const statusBadgeClass =
    approvalStatus === "approved"
      ? "bg-green-100 text-green-800 border-green-200"
      : approvalStatus === "needs_fix"
        ? "bg-amber-100 text-amber-900 border-amber-300"
        : "bg-neutral-100 text-neutral-700 border-neutral-300";

  return (
    <div className="relative h-full w-full">
      <div className="absolute left-3 top-3 z-20 flex flex-wrap items-center gap-2 rounded-xl border bg-white/90 p-2 text-xs backdrop-blur">
        <span className="font-semibold">Lighting</span>
        <button
          className={`rounded px-2 py-1 ${lightingMode === "studio" ? "bg-black text-white" : "bg-white border"}`}
          onClick={() => setLightingMode("studio")}
        >
          Studio
        </button>
        <button
          className={`rounded px-2 py-1 ${lightingMode === "day" ? "bg-black text-white" : "bg-white border"}`}
          onClick={() => setLightingMode("day")}
        >
          Day
        </button>
        <button
          className={`rounded px-2 py-1 ${lightingMode === "warm" ? "bg-black text-white" : "bg-white border"}`}
          onClick={() => setLightingMode("warm")}
        >
          Warm
        </button>

        <label className="ml-2 inline-flex items-center gap-1">
          <input type="checkbox" checked={showBounds} onChange={(e) => setShowBounds(e.target.checked)} />
          bounds
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showPivot} onChange={(e) => setShowPivot(e.target.checked)} />
          pivot
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} />
          grid
        </label>
        <label className="inline-flex items-center gap-1">
          <input type="checkbox" checked={castShadow} onChange={(e) => setCastShadow(e.target.checked)} />
          shadow
        </label>
        <label className="inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={neutralLighting}
            onChange={(e) => setNeutralLighting(e.target.checked)}
          />
          neutral
        </label>

        <span className="ml-2 font-semibold">Mode</span>
        <button
          className={`rounded px-2 py-1 ${renderMode === "pbr" ? "bg-black text-white" : "bg-white border"}`}
          onClick={() => setRenderMode("pbr")}
        >
          PBR
        </button>
        <button
          className={`rounded px-2 py-1 ${renderMode === "albedo" ? "bg-black text-white" : "bg-white border"}`}
          onClick={() => setRenderMode("albedo")}
        >
          Albedo
        </button>
        <button
          className={`rounded px-2 py-1 ${renderMode === "roughness" ? "bg-black text-white" : "bg-white border"}`}
          onClick={() => setRenderMode("roughness")}
        >
          Roughness
        </button>
      </div>

      <div className="absolute bottom-3 right-3 z-20 w-85 max-h-[70%] overflow-auto rounded-xl border bg-white/90 p-3 text-xs backdrop-blur">
        <div className="mb-2 flex items-center justify-between">
          <div className="font-semibold">Asset QA</div>
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusBadgeClass}`}>
            {approvalStatus}
          </span>
        </div>

        <div><b>File size</b>: {formatFileSize(fileSizeBytes)}</div>
        <div>
          <b>Model file</b>: {modelExists === null ? "checking..." : modelExists ? "found" : "missing"}
        </div>
        {modelLoadError && (
          <div className="mt-1 rounded border border-red-300 bg-red-50 p-2 text-[11px] text-red-800">
            {modelLoadError}
          </div>
        )}
        <div><b>Dimensions (mm)</b>: {asset.dimsWmm ?? "-"} x {asset.dimsDmm ?? "-"} x {asset.dimsHmm ?? "-"}</div>
        <div>
          <b>Computed bounds size (m)</b>: {stats ? `${stats.computedSize.x.toFixed(3)}, ${stats.computedSize.y.toFixed(3)}, ${stats.computedSize.z.toFixed(3)}` : "loading..."}
        </div>
        <div><b>AABB size (m)</b>: {asset.aabbSizeX.toFixed(3)}, {asset.aabbSizeY.toFixed(3)}, {asset.aabbSizeZ.toFixed(3)}</div>
        <div><b>AABB center (m)</b>: {asset.aabbCenterX.toFixed(3)}, {asset.aabbCenterY.toFixed(3)}, {asset.aabbCenterZ.toFixed(3)}</div>
        <div><b>Pivot offset</b>: x {asset.pivotOffsetX ?? 0}, z {asset.pivotOffsetZ ?? 0}</div>

        <div className="mt-2"><b>Triangles</b>: {stats ? stats.triCount.toLocaleString() : "loading..."}</div>
        <div><b>Textures</b>: {textureSummary.count} (max {textureSummary.max})</div>
        <div className="mt-2"><b>Base color maps</b>: {mapCoverage.baseColorPresent}/{mapCoverage.total}</div>
        <div><b>Roughness maps</b>: {mapCoverage.roughnessPresent}/{mapCoverage.total}</div>
        <div><b>Normal maps</b>: {mapCoverage.normalPresent}/{mapCoverage.total}</div>

        <div className="mt-2">
          <div className="font-medium">Materials ({stats?.materialNames.length ?? 0})</div>
          <ul className="mt-1 list-inside list-disc space-y-0.5">
            {(stats?.materialNames ?? []).map((name) => (
              <li key={name} className="truncate">{name}</li>
            ))}
          </ul>
        </div>

        <div className="mt-2">
          <div className="font-medium">Texture resolutions</div>
          <ul className="mt-1 space-y-0.5">
            {(stats?.textures ?? []).slice(0, 8).map((tex) => (
              <li key={`${tex.name}-${tex.width}-${tex.height}`} className="truncate">
                {tex.name}: {tex.width}x{tex.height}
              </li>
            ))}
            {(stats?.textures.length ?? 0) > 8 && (
              <li className="opacity-70">+{(stats?.textures.length ?? 0) - 8} more</li>
            )}
          </ul>
        </div>

        <div className="mt-2">
          <div className="font-medium">Material values</div>
          <ul className="mt-1 space-y-0.5">
            {(stats?.materialDiagnostics ?? []).map((diag) => (
              <li key={diag.name} className="truncate">
                {diag.name}: rough {diag.roughness?.toFixed(2) ?? "-"}, metal {diag.metalness?.toFixed(2) ?? "-"}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {modelExists === false ? (
        <div className="flex h-full items-center justify-center bg-neutral-100 p-6">
          <div className="max-w-md rounded-xl border border-red-300 bg-white p-4 text-sm text-neutral-900 shadow-sm">
            <div className="font-semibold text-red-700">Model file not found</div>
            <p className="mt-2 break-all text-xs text-neutral-700">{asset.modelUrl}</p>
            <p className="mt-2 text-xs text-neutral-600">
              Add this file under <code>public/assets/models</code> or update this model asset&apos;s URL.
            </p>
          </div>
        </div>
      ) : (
        <Canvas shadows={castShadow} camera={{ position: [2, 1.5, 2], fov: 45 }}>
          <ambientLight intensity={lighting.ambient} />
          <hemisphereLight args={[lighting.hemiSky, lighting.hemiGround, lighting.hemi]} />
          <directionalLight
            castShadow={castShadow}
            color={lighting.directionalColor}
            position={[4, 6, 2]}
            intensity={lighting.directional}
          />
          {showGrid && <gridHelper args={[10, 20]} />}
          <axesHelper args={[1]} />
          <Suspense fallback={null}>
            <Model url={asset.modelUrl} onStats={setStats} renderMode={renderMode} />
          </Suspense>
          {showBounds && <BoundsBox asset={asset} />}
          {showPivot && <PivotMarker asset={asset} />}
          <OrbitControls makeDefault />
        </Canvas>
      )}
    </div>
  );
}
