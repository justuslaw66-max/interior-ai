"use client";

import { Edges } from "@react-three/drei/core/Edges";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { createCabinetThreeGroup } from "../createCabinetThreeGroup";
import { generateCabinetParts } from "../generateCabinetParts";
import { getCabinetVisiblePreviewParts } from "../previewParts";
import {
  getCabinetModuleFrontOffset,
  getCabinetModuleStartOffset,
} from "../layout";
import {
  getCabinetConvertibleOpenDepth,
  isCabinetWallBedPanel,
} from "../convertibleLayout";
import type { CabinetDefinition, CabinetPart, CabinetPartType } from "../types";

export type CabinetSemanticSelectionScope = "assembly" | "module" | "part";

export type CabinetSemanticSelection = {
  scope: CabinetSemanticSelectionScope;
  cabinetDefinitionId: string;
  cabinetInstanceId?: string;
  moduleId?: string;
  partId?: string;
  partType?: CabinetPartType;
  additive: boolean;
};

export type CabinetSceneItemProps = {
  definition: CabinetDefinition;
  generatedParts?: readonly CabinetPart[];
  showClearances?: boolean;
  position?: [number, number, number];
  rotationY?: number;
  selected?: boolean;
  highlightModuleId?: string;
  highlightPartId?: string;
  interactive?: boolean;
  instanceId?: string;
  viewMode?: "2d" | "3d";
  onSelect?: (id: string, additive: boolean) => void;
  onSemanticSelect?: (selection: CabinetSemanticSelection) => void;
  renderReadyKey?: string;
  onRenderReadyChange?: (key: string, ready: boolean) => void;
};

function resolveSemanticSelection(
  object: THREE.Object3D,
  boundary: THREE.Object3D | null,
  definition: CabinetDefinition,
  instanceId: string | undefined,
  partById: ReadonlyMap<string, CabinetPart>,
  moduleIds: ReadonlySet<string>,
  additive: boolean
): CabinetSemanticSelection {
  let current: THREE.Object3D | null = object;

  while (current && current !== boundary) {
    const partId = typeof current.userData.partId === "string" ? current.userData.partId : undefined;
    const part = partId ? partById.get(partId) : undefined;
    if (part) {
      return {
        scope: "part",
        cabinetDefinitionId: definition.id,
        cabinetInstanceId: instanceId,
        moduleId: part.moduleId,
        partId: part.id,
        partType: part.type,
        additive,
      };
    }

    const moduleId = typeof current.userData.moduleId === "string" ? current.userData.moduleId : undefined;
    if (moduleId && moduleIds.has(moduleId)) {
      return {
        scope: "module",
        cabinetDefinitionId: definition.id,
        cabinetInstanceId: instanceId,
        moduleId,
        additive,
      };
    }

    current = current.parent;
  }

  return {
    scope: "assembly",
    cabinetDefinitionId: definition.id,
    cabinetInstanceId: instanceId,
    additive,
  };
}

function disposeObject3D(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      material.forEach((entry) => entry.dispose());
    } else {
      material?.dispose();
    }
  });
}

export function CabinetSceneItem({
  definition,
  generatedParts,
  showClearances = true,
  position = [0, 0, 0],
  rotationY = 0,
  selected = false,
  highlightModuleId,
  highlightPartId,
  interactive = true,
  instanceId,
  viewMode = "3d",
  onSelect,
  onSemanticSelect,
  renderReadyKey,
  onRenderReadyChange,
}: CabinetSceneItemProps) {
  const groupRef = useRef<THREE.Group>(null);
  const previewModel = useMemo(() => {
    const parts = getCabinetVisiblePreviewParts(
      definition,
      generatedParts ?? generateCabinetParts(definition),
      { showClearances }
    );
    return {
      assembly: createCabinetThreeGroup(definition, parts),
      parts,
      partById: new Map(parts.map((part) => [part.id, part])),
    };
  }, [definition, generatedParts, showClearances]);
  const { assembly, parts, partById } = previewModel;
  const moduleIds = useMemo(
    () => new Set(definition.modules.map((module) => module.id)),
    [definition.modules]
  );

  useEffect(() => {
    if (!renderReadyKey) return;
    onRenderReadyChange?.(renderReadyKey, true);
  }, [onRenderReadyChange, renderReadyKey]);

  useEffect(() => {
    return () => disposeObject3D(assembly);
  }, [assembly]);

  useEffect(() => {
    const texturedMaterials = definition.materials.filter(
      (material) => typeof material.textureUrl === "string" && material.textureUrl.length > 0
    );
    if (!texturedMaterials.length) return;

    let cancelled = false;
    const loadedTextures: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    for (const materialRef of texturedMaterials) {
      loader.load(
        materialRef.textureUrl!,
        (texture) => {
          if (cancelled) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          loadedTextures.push(texture);
          assembly.traverse((object) => {
            const mesh = object as THREE.Mesh;
            if (mesh.userData.materialId !== materialRef.id) return;
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            for (const material of materials) {
              if (!(material instanceof THREE.MeshStandardMaterial)) continue;
              material.map = texture;
              material.needsUpdate = true;
            }
          });
        },
        undefined,
        () => {
          // The color fallback remains usable when a texture asset is unavailable.
        }
      );
    }

    return () => {
      cancelled = true;
      loadedTextures.forEach((texture) => texture.dispose());
    };
  }, [assembly, definition.materials]);

  const width = definition.totalWidth / 1000;
  const height = definition.height / 1000;
  const depth = definition.depth / 1000;
  const wallBedClearanceZones = useMemo(() => {
    const startOffsetX = getCabinetModuleStartOffset(definition);
    const frontOffset = getCabinetModuleFrontOffset(definition);
    return definition.modules.flatMap((module, moduleIndex) => {
      const moduleOffsetX = definition.modules
        .slice(0, moduleIndex)
        .reduce((offset, precedingModule) => offset + precedingModule.width, startOffsetX);
      if (!showClearances || !isCabinetWallBedPanel(module) || !module.wallBedClearanceVisible) {
        return [];
      }
      const openDepthMm = getCabinetConvertibleOpenDepth(module);
      return [{
        id: module.id,
        position: [
          (moduleOffsetX + module.width / 2) / 1000 - width / 2,
          0.006,
          (frontOffset - openDepthMm / 2) / 1000 - depth / 2,
        ] as [number, number, number],
        size: [module.width / 1000, 0.012, openDepthMm / 1000] as [number, number, number],
      }];
    });
  }, [definition, depth, showClearances, width]);
  const highlightBounds = useMemo(() => {
    const highlightedParts = highlightPartId
      ? parts.filter((part) => part.id === highlightPartId)
      : highlightModuleId
        ? parts.filter((part) => part.moduleId === highlightModuleId)
        : [];
    if (!highlightedParts.length) return null;
    const minX = Math.min(...highlightedParts.map((part) => part.position.x));
    const minY = Math.min(...highlightedParts.map((part) => part.position.y));
    const minZ = Math.min(...highlightedParts.map((part) => part.position.z));
    const maxX = Math.max(
      ...highlightedParts.map((part) => part.position.x + part.size.width)
    );
    const maxY = Math.max(
      ...highlightedParts.map((part) => part.position.y + part.size.height)
    );
    const maxZ = Math.max(
      ...highlightedParts.map((part) => part.position.z + part.size.depth)
    );
    return {
      position: [
        (minX + maxX) / 2000 - width / 2,
        (minY + maxY) / 2000,
        (minZ + maxZ) / 2000 - depth / 2,
      ] as [number, number, number],
      size: [
        Math.max(0.001, (maxX - minX) / 1000),
        Math.max(0.001, (maxY - minY) / 1000),
        Math.max(0.001, (maxZ - minZ) / 1000),
      ] as [number, number, number],
    };
  }, [depth, highlightModuleId, highlightPartId, parts, width]);

  return (
    <group
      ref={groupRef}
      position={[position[0], position[1], position[2]]}
      rotation-y={rotationY}
      onClick={(event) => {
        const canSelectInstance = interactive && Boolean(instanceId);
        const canSelectSemantic = Boolean(onSemanticSelect);
        if (!canSelectInstance && !canSelectSemantic) return;

        event.stopPropagation();
        const additive = Boolean(event.shiftKey);
        if (canSelectInstance && instanceId) onSelect?.(instanceId, additive);
        if (canSelectSemantic) {
          onSemanticSelect?.(
            resolveSemanticSelection(
              event.object,
              groupRef.current,
              definition,
              instanceId,
              partById,
              moduleIds,
              additive
            )
          );
        }
      }}
    >
      {viewMode === "2d" ? (
        <mesh position={[0, 0.018, 0]} castShadow={false} receiveShadow>
          <boxGeometry args={[width, 0.028, depth]} />
          <meshStandardMaterial
            color={selected ? "#bfdbfe" : "#d8d2c6"}
            roughness={0.78}
            metalness={0.02}
            transparent
            opacity={0.92}
          />
          {selected ? <Edges scale={1.01} color="#2563eb" /> : null}
        </mesh>
      ) : (
        <primitive object={assembly} position={[-width / 2, 0, -depth / 2]} />
      )}
      {viewMode === "3d"
        ? wallBedClearanceZones.map((zone) => (
            <mesh key={zone.id} position={zone.position} raycast={() => undefined}>
              <boxGeometry args={zone.size} />
              <meshBasicMaterial
                color="#38bdf8"
                transparent
                opacity={0.16}
                depthWrite={false}
              />
              <Edges scale={1.002} color="#0284c7" />
            </mesh>
          ))
        : null}
      {viewMode === "3d" && highlightBounds ? (
        <mesh position={highlightBounds.position} raycast={() => undefined}>
          <boxGeometry args={highlightBounds.size} />
          <meshBasicMaterial color="#2563eb" transparent opacity={0.06} depthWrite={false} />
          <Edges scale={1.006} color="#2563eb" />
        </mesh>
      ) : null}
      {selected ? (
        <mesh position={[0, height / 2, 0]} raycast={() => undefined}>
          <boxGeometry args={[width, height, depth]} />
          <meshBasicMaterial transparent opacity={0} />
          <Edges scale={1.012} color="#2563eb" />
        </mesh>
      ) : null}
    </group>
  );
}
