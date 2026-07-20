"use client";

import { Environment } from "@react-three/drei/core/Environment";
import { Grid } from "@react-three/drei/core/Grid";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import { OrbitControls } from "@react-three/drei/core/OrbitControls";

import type { CabinetDefinition, CabinetPart } from "../types";
import {
  CabinetPreviewCameraController,
  type CabinetPreviewView,
} from "./CabinetPreviewCameraController";
import {
  CabinetSceneItem,
  type CabinetSemanticSelection,
} from "./CabinetSceneItem";

export type CabinetPreviewScene3DProps = {
  definition: CabinetDefinition;
  generatedParts?: readonly CabinetPart[];
  view: CabinetPreviewView;
  showClearances: boolean;
  selection?: CabinetSemanticSelection;
  onSemanticSelect?: (selection: CabinetSemanticSelection) => void;
  currentWidthMm: number;
  currentHeightMm: number;
  currentDepthMm: number;
  previewWidthMm: number;
  previewHeightMm: number;
  previewDepthMm: number;
};

/** Projects Cabinet domain state into the preview-only Three.js scene. */
export function CabinetPreviewScene3D({
  definition,
  generatedParts,
  view,
  showClearances,
  selection,
  onSemanticSelect,
  currentWidthMm,
  currentHeightMm,
  currentDepthMm,
  previewWidthMm,
  previewHeightMm,
  previewDepthMm,
}: CabinetPreviewScene3DProps) {
  return (
    <>
      <CabinetPreviewCameraController
        view={view}
        widthMm={previewWidthMm}
        heightMm={previewHeightMm}
        depthMm={previewDepthMm}
        fitKey={definition.id}
      />
      <Environment resolution={128}>
        <Lightformer
          form="rect"
          intensity={2.35}
          color="#fffaf2"
          position={[-3.2, 3.8, -4.5]}
          scale={[4.5, 3.2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.25}
          color="#e8f0fa"
          position={[3.5, 2.4, -3.2]}
          scale={[3, 3.5, 1]}
        />
        <Lightformer
          form="rect"
          intensity={1.6}
          color="#ffffff"
          position={[0, 4, 3.2]}
          rotation={[0, Math.PI, 0]}
          scale={[4.5, 2.2, 1]}
        />
        <Lightformer
          form="rect"
          intensity={0.85}
          color="#f6f2ea"
          position={[0, 5, 0]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[4, 4, 1]}
        />
      </Environment>
      <hemisphereLight color="#f5f7fa" groundColor="#82796f" intensity={0.58} />
      <directionalLight
        position={[-4, 6, -5]}
        color="#fff8ed"
        intensity={1.3}
        castShadow={false}
      />
      <directionalLight
        position={[4, 3, -2.5]}
        color="#dfeaf7"
        intensity={0.48}
        castShadow={false}
      />
      <group
        position={[0, 0, 0]}
        scale={[
          previewWidthMm / currentWidthMm,
          previewHeightMm / currentHeightMm,
          previewDepthMm / currentDepthMm,
        ]}
      >
        <CabinetSceneItem
          definition={definition}
          generatedParts={generatedParts}
          showClearances={showClearances}
          interactive={false}
          selected={selection?.scope === "assembly"}
          highlightModuleId={selection?.moduleId}
          highlightPartId={selection?.partId}
          showPreviewFrontEdges
          onSemanticSelect={onSemanticSelect}
        />
      </group>
      <Grid
        args={[6, 6]}
        cellSize={0.25}
        sectionSize={1}
        cellThickness={0.45}
        sectionThickness={0.8}
        position={[0, -0.002, 0]}
      />
      <OrbitControls
        target={[0, previewHeightMm / 2000, 0]}
        enableRotate={view === "perspective"}
        enableDamping
        dampingFactor={0.08}
        minDistance={0.9}
        maxDistance={8}
        maxPolarAngle={Math.PI / 2.05}
      />
    </>
  );
}
