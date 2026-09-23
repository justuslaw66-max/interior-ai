"use client";

import { Edges } from "@react-three/drei/core/Edges";
import { Html } from "@react-three/drei/web/Html";
import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  CABINET_DRAG_START_DISTANCE_M,
  type CabinetDragState,
  type CabinetSceneItemProps,
} from "./CabinetSceneItem.types";
import { createCabinetPreviewFrontEdgeGroup } from "./cabinetScenePreviewEdges";
import { resolveSemanticSelection } from "./cabinetSceneSemanticSelection";

export type {
  CabinetSceneItemProps,
  CabinetSemanticSelection,
  CabinetSemanticSelectionScope,
} from "./CabinetSceneItem.types";
export {
  CABINET_PREVIEW_FRONT_EDGE_OFFSET_M,
  createCabinetPreviewFrontEdgePositions,
  resolveCabinetPreviewFrontEdgeStyle,
} from "./cabinetScenePreviewEdges";
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
  showPlanLabel = true,
  onSelect,
  onSemanticSelect,
  locked = false,
  onDraggingChange,
  onDragPointerMove,
  onMove,
  onDragEnd,
  renderReadyKey,
  onRenderReadyChange,
}: CabinetSceneItemProps) {
  const groupRef = useRef<THREE.Group>(null);
  const dragStateRef = useRef<CabinetDragState | null>(null);
  const dragPlaneRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
  const dragPointRef = useRef(new THREE.Vector3());
  const didDragRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [renderPosition, setRenderPosition] = useState(position);
  const displayedPosition = dragging ? renderPosition : position;
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

  const beginDrag = (event: ThreeEvent<PointerEvent>) => {
    if (
      viewMode !== "3d" ||
      !interactive ||
      locked ||
      !instanceId ||
      !onMove
    ) {
      return;
    }

    event.stopPropagation();
    const plane = dragPlaneRef.current;
    plane.set(new THREE.Vector3(0, 1, 0), -position[1]);
    const point = event.ray.intersectPlane(plane, dragPointRef.current);
    if (!point) return;

    didDragRef.current = false;
    setRenderPosition(position);
    dragStateRef.current = {
      pointerId: event.pointerId,
      additiveSelection: Boolean(event.shiftKey),
      offsetX: position[0] - point.x,
      offsetZ: position[2] - point.z,
      startX: point.x,
      startZ: point.z,
      lastAcceptedPosition: position,
    };
    (event.target as unknown as HTMLElement).setPointerCapture(event.pointerId);
    setDragging(true);
    onDraggingChange?.(true);
  };

  const moveDrag = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragStateRef.current;
    if (
      !drag ||
      drag.pointerId !== event.pointerId ||
      !instanceId ||
      !onMove
    ) {
      return;
    }

    event.stopPropagation();
    onDragPointerMove?.(event);
    const point = event.ray.intersectPlane(
      dragPlaneRef.current,
      dragPointRef.current
    );
    if (!point) return;

    if (
      !didDragRef.current &&
      Math.hypot(point.x - drag.startX, point.z - drag.startZ) <
        CABINET_DRAG_START_DISTANCE_M
    ) {
      return;
    }

    if (!didDragRef.current) {
      didDragRef.current = true;
      onSelect?.(instanceId, drag.additiveSelection);
    }

    const nextPosition: [number, number, number] = [
      point.x + drag.offsetX,
      drag.lastAcceptedPosition[1],
      point.z + drag.offsetZ,
    ];
    const accepted = onMove(instanceId, nextPosition);
    if (accepted !== false) {
      drag.lastAcceptedPosition = nextPosition;
      setRenderPosition(nextPosition);
    }
  };

  const finishDrag = (event: ThreeEvent<PointerEvent>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.stopPropagation();
    try {
      (event.target as unknown as HTMLElement).releasePointerCapture(
        event.pointerId
      );
    } catch {}
    dragStateRef.current = null;
    setDragging(false);
    if (didDragRef.current && instanceId) {
      onDragEnd?.(instanceId, drag.lastAcceptedPosition);
    }
    onDraggingChange?.(false);
  };

  return (
    <group
      ref={groupRef}
      position={[
        displayedPosition[0],
        displayedPosition[1],
        displayedPosition[2],
      ]}
      rotation-y={rotationY}
      onPointerDown={beginDrag}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onClick={(event) => {
        const canSelectInstance = interactive && Boolean(instanceId);
        const canSelectSemantic = Boolean(onSemanticSelect);
        if (!canSelectInstance && !canSelectSemantic) return;

        event.stopPropagation();
        if (didDragRef.current) {
          didDragRef.current = false;
          return;
        }
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
        <>
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
          {showPlanLabel ? (
            <Html zIndexRange={[5, 0]} position={[0, 0.08, 0]} center transform={false}>
              {interactive && instanceId ? (
                <button
                  type="button"
                  data-testid="plan-item-keyboard-target"
                  aria-label={`Select ${definition.name} in 2D plan`}
                  aria-pressed={selected}
                  className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect?.(instanceId, event.shiftKey);
                  }}
                  style={{
                    appearance: "none",
                    background: "rgba(255,255,255,0.9)",
                    border: selected
                      ? "1px solid rgba(37,99,235,0.62)"
                      : "1px solid rgba(120,120,120,0.35)",
                    borderRadius: 6,
                    color: "#1f2937",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: "2px 6px",
                    pointerEvents: "auto",
                    whiteSpace: "nowrap",
                  }}
                >
                  {definition.name}
                </button>
              ) : (
                <div
                  style={{
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid rgba(120,120,120,0.35)",
                    borderRadius: 6,
                    color: "#1f2937",
                    fontSize: 11,
                    padding: "2px 6px",
                    pointerEvents: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {definition.name}
                </div>
              )}
            </Html>
          ) : null}
        </>
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
