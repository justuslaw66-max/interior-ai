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
import { useCabinetSceneResourceOwnership } from "../hooks/useCabinetSceneResourceOwnership";
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
  /** Adds preview-only separation lines to slab fronts without changing generated/export geometry. */
  showPreviewFrontEdges?: boolean;
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

const PREVIEW_FRONT_EDGE_PART_TYPES = new Set<CabinetPartType>([
  "door_front",
  "drawer_front",
]);
export const CABINET_PREVIEW_FRONT_EDGE_OFFSET_M = 0.0004;

export function resolveCabinetPreviewFrontEdgeStyle(materialColor?: string): {
  color: string;
  opacity: number;
} {
  const color = new THREE.Color(materialColor ?? "#d8d2c6");
  const luminance = color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;

  if (luminance < 0.08) return { color: "#879198", opacity: 0.62 };
  if (luminance < 0.4) return { color: "#d1d6d9", opacity: 0.42 };
  return { color: "#505a63", opacity: 0.3 };
}

export function createCabinetPreviewFrontEdgePositions(
  part: CabinetPart
): Float32Array | null {
  if (!PREVIEW_FRONT_EDGE_PART_TYPES.has(part.type)) return null;

  const x0 = part.position.x / 1000;
  const x1 = (part.position.x + part.size.width) / 1000;
  const y0 = part.position.y / 1000;
  const y1 = (part.position.y + part.size.height) / 1000;
  const z = part.position.z / 1000 - CABINET_PREVIEW_FRONT_EDGE_OFFSET_M;

  return new Float32Array([
    x0, y0, z, x1, y0, z,
    x1, y0, z, x1, y1, z,
    x1, y1, z, x0, y1, z,
    x0, y1, z, x0, y0, z,
  ]);
}

function createCabinetPreviewFrontEdgeGroup(
  definition: CabinetDefinition,
  parts: readonly CabinetPart[]
): THREE.Group {
  const group = new THREE.Group();
  group.name = `CabinetPreviewFrontEdges_${definition.id}`;

  for (const part of parts) {
    const positions = createCabinetPreviewFrontEdgePositions(part);
    if (!positions) continue;

    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

    const materialRef = definition.materials.find(
      (material) => material.id === part.materialId
    );
    const edgeStyle = resolveCabinetPreviewFrontEdgeStyle(materialRef?.color);
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: edgeStyle.color,
      transparent: true,
      opacity: edgeStyle.opacity,
      depthTest: true,
      depthWrite: false,
      toneMapped: false,
    });
    const edgeLines = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    edgeLines.name = `CabinetPreviewFrontEdge_${part.id}`;
    edgeLines.renderOrder = 1;
    edgeLines.raycast = () => undefined;
    edgeLines.userData = {
      sourceType: "cabinet_preview_front_edge",
      partId: part.id,
      partType: part.type,
      previewOnly: true,
    };
    group.add(edgeLines);
  }

  return group;
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
  showPreviewFrontEdges = false,
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
  const previewFrontEdges = useMemo(
    () =>
      showPreviewFrontEdges
        ? createCabinetPreviewFrontEdgeGroup(definition, parts)
        : null,
    [definition, parts, showPreviewFrontEdges]
  );
  const moduleIds = useMemo(
    () => new Set(definition.modules.map((module) => module.id)),
    [definition.modules]
  );

  useEffect(() => {
    if (!renderReadyKey) return;
    onRenderReadyChange?.(renderReadyKey, true);
  }, [onRenderReadyChange, renderReadyKey]);

  useCabinetSceneResourceOwnership({
    assembly,
    previewFrontEdges,
    materials: definition.materials,
  });

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
        <>
          <primitive object={assembly} position={[-width / 2, 0, -depth / 2]} />
          {previewFrontEdges ? (
            <primitive object={previewFrontEdges} position={[-width / 2, 0, -depth / 2]} />
          ) : null}
        </>
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
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
          <Edges scale={1.012} color="#2563eb" />
        </mesh>
      ) : null}
      {selected ? (
        <mesh position={[0, height / 2, 0]} raycast={() => undefined}>
          <boxGeometry args={[width, height, depth]} />
          <meshBasicMaterial transparent opacity={0} colorWrite={false} depthWrite={false} />
          <Edges scale={1.012} color="#2563eb" />
        </mesh>
      ) : null}
    </group>
  );
}
