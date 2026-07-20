"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
} from "../layout";
import type { CabinetDefinition, CabinetPart } from "../types";
import type { CabinetDimensionPreview } from "./CabinetOverallDimensionHandles";
import {
  type CabinetPreviewView,
} from "./CabinetPreviewCameraController";
import { CabinetPreviewRenderer3D } from "./CabinetPreviewRenderer3D";
import { CabinetPreviewScene3D } from "./CabinetPreviewScene3D";
import type { CabinetSemanticSelection } from "./CabinetSceneItem";

export function useCabinetDesktopPreviewActive(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mediaQuery.matches);
    update();
    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }
    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, []);

  return isDesktop;
}

function hashCabinetPreviewRenderState(serializedState: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < serializedState.length; index += 1) {
    hash ^= serializedState.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface CabinetPreview3DProps {
  definition: CabinetDefinition;
  generatedParts?: readonly CabinetPart[];
  view: CabinetPreviewView;
  showClearances: boolean;
  selection?: CabinetSemanticSelection;
  onSemanticSelect?: (selection: CabinetSemanticSelection) => void;
  dimensionPreview?: CabinetDimensionPreview | null;
}

export function CabinetPreview3D({
  definition,
  generatedParts,
  view,
  showClearances,
  selection,
  onSemanticSelect,
  dimensionPreview,
}: CabinetPreview3DProps) {
  const cameraDistance = Math.max(2.4, definition.totalWidth / 650, definition.height / 850);
  const currentWidthMm = Math.max(1, getCabinetOverallWidth(definition));
  const currentHeightMm = Math.max(1, getCabinetOverallHeight(definition));
  const currentDepthMm = Math.max(1, getCabinetOverallDepth(definition));
  const previewWidthMm =
    dimensionPreview?.field === "totalWidth" ? dimensionPreview.valueMm : currentWidthMm;
  const previewHeightMm =
    dimensionPreview?.field === "height" ? dimensionPreview.valueMm : currentHeightMm;
  const previewDepthMm =
    dimensionPreview?.field === "depth" ? dimensionPreview.valueMm : currentDepthMm;
  const previewRenderKey = useMemo(
    () =>
      `${definition.id}:${view}:${hashCabinetPreviewRenderState(
        JSON.stringify({
          definition,
          generatedParts: generatedParts?.map((part) => ({
            id: part.id,
            type: part.type,
            materialId: part.materialId,
            position: part.position,
            size: part.size,
          })),
          view,
          showClearances,
          previewWidthMm,
          previewHeightMm,
          previewDepthMm,
          selection: selection
            ? {
                scope: selection.scope,
                moduleId: selection.moduleId,
                partId: selection.partId,
              }
            : null,
        })
      )}`,
    [
      definition,
      generatedParts,
      previewDepthMm,
      previewHeightMm,
      previewWidthMm,
      selection,
      showClearances,
      view,
    ]
  );
  return (
    <CabinetPreviewRenderer3D
      definitionId={definition.id}
      presetId={definition.sourcePresetId}
      view={view}
      previewRenderKey={previewRenderKey}
      initialCameraPosition={[
        cameraDistance,
        Math.max(1.4, definition.height / 900),
        -cameraDistance * 1.25,
      ]}
    >
      <CabinetPreviewScene3D
        definition={definition}
        generatedParts={generatedParts}
        view={view}
        showClearances={showClearances}
        selection={selection}
        onSemanticSelect={onSemanticSelect}
        currentWidthMm={currentWidthMm}
        currentHeightMm={currentHeightMm}
        currentDepthMm={currentDepthMm}
        previewWidthMm={previewWidthMm}
        previewHeightMm={previewHeightMm}
        previewDepthMm={previewDepthMm}
      />
    </CabinetPreviewRenderer3D>
  );
}
