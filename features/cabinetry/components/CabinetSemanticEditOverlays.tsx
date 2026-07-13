"use client";

import {
  getCabinetAutomationState,
  getCabinetParameterState,
  isCabinetModuleWidthLocked,
} from "../automation";
import { getCabinetMinimumModuleWidthMm } from "../moduleWidthRules";
import { getCabinetShelfCenterHeights, getCabinetShelfSpacingMode } from "../shelfLayout";
import type { CabinetDefinition } from "../types";
import { CabinetModuleDividerHandles } from "./CabinetModuleDividerHandles";
import { CabinetShelfMarkerHandles } from "./CabinetShelfMarkerHandles";

export type CabinetSemanticEditOverlaysProps = {
  definition: CabinetDefinition;
  activeModuleId?: string;
  onPreviewChange?: (preview: CabinetSemanticEditPreview | null) => void;
  onDividerCommit: (input: {
    leftModuleId: string;
    rightModuleId: string;
    leftWidthMm: number;
    rightWidthMm: number;
  }) => void;
  onShelfCommit: (input: {
    moduleId: string;
    shelfIndex: number;
    heightMm: number;
  }) => void;
  disabled?: boolean;
};

export type CabinetSemanticEditPreview =
  | {
      kind: "module_divider";
      leftModuleId: string;
      rightModuleId: string;
      leftWidthMm: number;
      rightWidthMm: number;
    }
  | {
      kind: "shelf";
      moduleId: string;
      shelfIndex: number;
      heightMm: number;
    };

/**
 * Derives semantic divider and shelf constraints from the definition, then
 * delegates pointer/keyboard interaction to model-agnostic DOM controls.
 */
export function CabinetSemanticEditOverlays({
  definition,
  activeModuleId,
  onPreviewChange,
  onDividerCommit,
  onShelfCommit,
  disabled = false,
}: CabinetSemanticEditOverlaysProps) {
  const automation = getCabinetAutomationState(definition);
  const totalModuleWidthMm = Math.max(
    1,
    definition.modules.reduce((sum, module) => sum + module.width, 0)
  );
  const dividers = definition.modules.slice(0, -1).map((leftModule, index) => {
    const rightModule = definition.modules[index + 1];
    const cumulativeWidthMm = definition.modules
      .slice(0, index + 1)
      .reduce((sum, module) => sum + module.width, 0);
    const pairWidthMm = leftModule.width + rightModule.width;
    const minimumLeftMm = getCabinetMinimumModuleWidthMm(leftModule, definition);
    const minimumRightMm = getCabinetMinimumModuleWidthMm(rightModule, definition);
    return {
      id: `${leftModule.id}--${rightModule.id}`,
      valueMm: leftModule.width,
      minMm: minimumLeftMm,
      maxMm: Math.max(minimumLeftMm, pairWidthMm - minimumRightMm),
      positionPercent: (cumulativeWidthMm / totalModuleWidthMm) * 100,
      label: `Divider between module ${index + 1} and module ${index + 2}`,
      disabled:
        disabled ||
        automation.equalModuleSizing ||
        isCabinetModuleWidthLocked(definition, leftModule.id) ||
        isCabinetModuleWidthLocked(definition, rightModule.id),
      leftModuleId: leftModule.id,
      rightModuleId: rightModule.id,
      pairWidthMm,
    };
  });

  const activeModule = definition.modules.find((module) => module.id === activeModuleId);
  const activeModuleIndex = activeModule
    ? definition.modules.findIndex((module) => module.id === activeModule.id)
    : -1;
  const activeModuleStartMm =
    activeModuleIndex > 0
      ? definition.modules
          .slice(0, activeModuleIndex)
          .reduce((sum, module) => sum + module.width, 0)
      : 0;
  const shelfPositions =
    activeModule && getCabinetShelfSpacingMode(definition, activeModule) === "custom"
      ? getCabinetShelfCenterHeights(definition, activeModule)
      : [];
  const shelfLayoutLocked = Boolean(
    activeModule &&
      getCabinetParameterState(definition, `modules.${activeModule.id}.shelfLayout`).locked
  );
  const shelves = activeModule
    ? shelfPositions.map((heightMm, index) => ({
        id: `${activeModule.id}:${index}`,
        valueMm: heightMm,
        minMm:
          index === 0
            ? definition.toeKickHeight + definition.boardThickness
            : shelfPositions[index - 1] + definition.boardThickness,
        maxMm:
          index === shelfPositions.length - 1
            ? activeModule.height - definition.boardThickness
            : shelfPositions[index + 1] - definition.boardThickness,
        positionPercentFromBottom: (heightMm / Math.max(1, activeModule.height)) * 100,
        label: `Shelf ${index + 1} height in module ${activeModuleIndex + 1}`,
        disabled: disabled || shelfLayoutLocked,
        shelfIndex: index,
      }))
    : [];
  const dividerInteractionKey = dividers
    .map((divider) => `${divider.id}:${divider.disabled ? "locked" : "editable"}`)
    .join("|");
  const shelfInteractionKey = shelves
    .map((shelf) => `${shelf.id}:${shelf.disabled ? "locked" : "editable"}`)
    .join("|");

  return (
    <div
      role="group"
      aria-label="Direct cabinet editing controls"
      className="pointer-events-none absolute inset-x-[8%] inset-y-[9%] z-20"
      data-testid="cabinet-semantic-edit-overlays"
    >
      {dividers.length ? (
        <CabinetModuleDividerHandles
          key={dividerInteractionKey}
          dividers={dividers}
          onPreviewChange={(preview) => {
            if (!preview) {
              onPreviewChange?.(null);
              return;
            }
            const divider = dividers.find(
              (candidate) => candidate.id === preview.dividerId
            );
            if (!divider) return;
            onPreviewChange?.({
              kind: "module_divider",
              leftModuleId: divider.leftModuleId,
              rightModuleId: divider.rightModuleId,
              leftWidthMm: preview.valueMm,
              rightWidthMm: divider.pairWidthMm - preview.valueMm,
            });
          }}
          onCommit={(dividerId, leftWidthMm) => {
            const divider = dividers.find((candidate) => candidate.id === dividerId);
            if (!divider) return;
            onDividerCommit({
              leftModuleId: divider.leftModuleId,
              rightModuleId: divider.rightModuleId,
              leftWidthMm,
              rightWidthMm: divider.pairWidthMm - leftWidthMm,
            });
          }}
        />
      ) : null}
      {activeModule && shelves.length ? (
        <div
          className="pointer-events-none absolute inset-y-[5%]"
          style={{
            left: `${(activeModuleStartMm / totalModuleWidthMm) * 100}%`,
            width: `${(activeModule.width / totalModuleWidthMm) * 100}%`,
          }}
        >
          <CabinetShelfMarkerHandles
            key={shelfInteractionKey}
            shelves={shelves}
            onPreviewChange={(preview) => {
              if (!preview) {
                onPreviewChange?.(null);
                return;
              }
              const shelf = shelves.find((candidate) => candidate.id === preview.shelfId);
              if (!shelf) return;
              onPreviewChange?.({
                kind: "shelf",
                moduleId: activeModule.id,
                shelfIndex: shelf.shelfIndex,
                heightMm: preview.valueMm,
              });
            }}
            onCommit={(shelfId, heightMm) => {
              const shelf = shelves.find((candidate) => candidate.id === shelfId);
              if (!shelf) return;
              onShelfCommit({
                moduleId: activeModule.id,
                shelfIndex: shelf.shelfIndex,
                heightMm,
              });
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
