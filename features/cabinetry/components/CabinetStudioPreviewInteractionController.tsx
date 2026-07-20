"use client";

import { useMemo, useState } from "react";

import { getCabinetOverallDepth, getCabinetOverallHeight, getCabinetOverallWidth } from "../layout";
import { applyCabinetSemanticPreviewToParts } from "../semanticPreviewParts";
import type { CabinetDefinition, CabinetPart } from "../types";
import {
  CabinetOverallDimensionHandles,
  type CabinetDimensionPreview,
  type CabinetOverallDimensionHandlesProps,
} from "./CabinetOverallDimensionHandles";
import {
  CabinetPreview3D,
  type CabinetPreview3DProps,
} from "./CabinetPreview3D";
import {
  CabinetSemanticEditOverlays,
  type CabinetSemanticEditPreview,
  type CabinetSemanticEditOverlaysProps,
} from "./CabinetSemanticEditOverlays";

export interface CabinetStudioPreviewInteractionControllerProps {
  previewDefinition: CabinetDefinition;
  interactionDefinition: CabinetDefinition;
  generatedParts: readonly CabinetPart[];
  desktopPreviewActive: boolean;
  view: CabinetPreview3DProps["view"];
  showClearances: boolean;
  selection: NonNullable<CabinetPreview3DProps["selection"]>;
  onSemanticSelect: NonNullable<CabinetPreview3DProps["onSemanticSelect"]>;
  previewContainerClassName?: string;
  showDimensionHandles: boolean;
  dimensionLimits?: CabinetOverallDimensionHandlesProps["limits"];
  disabledDimensionFields?: CabinetOverallDimensionHandlesProps["disabledFields"];
  onDimensionCommit: CabinetOverallDimensionHandlesProps["onCommit"];
  showSemanticEditOverlays: boolean;
  activeModuleId?: string;
  onDividerCommit: CabinetSemanticEditOverlaysProps["onDividerCommit"];
  onShelfCommit: CabinetSemanticEditOverlaysProps["onShelfCommit"];
}

export function CabinetStudioPreviewInteractionController({
  previewDefinition,
  interactionDefinition,
  generatedParts,
  desktopPreviewActive,
  view,
  showClearances,
  selection,
  onSemanticSelect,
  previewContainerClassName,
  showDimensionHandles,
  dimensionLimits,
  disabledDimensionFields,
  onDimensionCommit,
  showSemanticEditOverlays,
  activeModuleId,
  onDividerCommit,
  onShelfCommit,
}: CabinetStudioPreviewInteractionControllerProps) {
  const [dimensionPreview, setDimensionPreview] =
    useState<CabinetDimensionPreview | null>(null);
  const [semanticEditPreview, setSemanticEditPreview] =
    useState<CabinetSemanticEditPreview | null>(null);
  const previewParts = useMemo(
    () =>
      applyCabinetSemanticPreviewToParts(
        previewDefinition,
        generatedParts,
        semanticEditPreview
      ),
    [generatedParts, previewDefinition, semanticEditPreview]
  );

  const preview = desktopPreviewActive ? (
    <CabinetPreview3D
      definition={previewDefinition}
      generatedParts={previewParts}
      view={view}
      showClearances={showClearances}
      selection={selection}
      onSemanticSelect={onSemanticSelect}
      dimensionPreview={dimensionPreview}
    />
  ) : null;

  return (
    <>
      {previewContainerClassName ? (
        <div className={previewContainerClassName}>{preview}</div>
      ) : (
        preview
      )}
      {showDimensionHandles ? (
        <CabinetOverallDimensionHandles
          widthMm={getCabinetOverallWidth(interactionDefinition)}
          heightMm={getCabinetOverallHeight(interactionDefinition)}
          depthMm={getCabinetOverallDepth(interactionDefinition)}
          limits={dimensionLimits}
          disabledFields={disabledDimensionFields}
          onPreviewChange={setDimensionPreview}
          onCommit={onDimensionCommit}
        />
      ) : null}
      {showSemanticEditOverlays ? (
        <CabinetSemanticEditOverlays
          definition={interactionDefinition}
          activeModuleId={activeModuleId}
          onPreviewChange={setSemanticEditPreview}
          onDividerCommit={onDividerCommit}
          onShelfCommit={onShelfCommit}
        />
      ) : null}
    </>
  );
}
