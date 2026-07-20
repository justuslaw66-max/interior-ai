"use client";

import { Lock, Unlock } from "lucide-react";

import {
  getCabinetOverallDepth,
  getCabinetOverallHeight,
  getCabinetOverallWidth,
} from "../layout";
import type { CabinetDefinition, CabinetValidationIssue } from "../types";
import {
  GuidedNumberField,
  sectionTitle,
} from "./CabinetStudioFormPrimitives";

export interface CabinetAssemblyInspectorProps {
  definition: CabinetDefinition;
  widthLimits: { minMm: number; maxMm: number };
  widthCanResize: boolean;
  widthLocked: boolean;
  widthBlockedByModuleLocks: boolean;
  getIssuesForField: (field: string) => CabinetValidationIssue[];
  onWidthCommit: (valueMm: number) => void;
  onDimensionCommit: (field: "height" | "depth", valueMm: number) => void;
  onToggleWidthLock: () => void;
  onOpenGuidedFit: () => void;
}

export function CabinetAssemblyInspector({
  definition,
  widthLimits,
  widthCanResize,
  widthLocked,
  widthBlockedByModuleLocks,
  getIssuesForField,
  onWidthCommit,
  onDimensionCommit,
  onToggleWidthLock,
  onOpenGuidedFit,
}: CabinetAssemblyInspectorProps) {
  return (
    <div
      className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3"
      data-testid="cabinet-assembly-inspector"
    >
      {sectionTitle("Complete assembly size")}
      <GuidedNumberField
        label="Overall width"
        value={getCabinetOverallWidth(definition)}
        min={widthLimits.minMm}
        max={widthLimits.maxMm}
        suffix="mm"
        testId="cabinet-guided-width"
        fieldPath="totalWidth"
        issues={getIssuesForField("totalWidth")}
        disabled={!widthCanResize}
        onCommit={onWidthCommit}
      />
      <GuidedNumberField
        label="Overall height"
        value={getCabinetOverallHeight(definition)}
        min={200}
        max={5000}
        suffix="mm"
        testId="cabinet-guided-height"
        fieldPath="height"
        issues={getIssuesForField("height")}
        onCommit={(value) => onDimensionCommit("height", value)}
      />
      <GuidedNumberField
        label="Overall depth"
        value={getCabinetOverallDepth(definition)}
        min={120}
        max={2500}
        suffix="mm"
        testId="cabinet-guided-depth"
        fieldPath="depth"
        issues={getIssuesForField("depth")}
        onCommit={(value) => onDimensionCommit("depth", value)}
      />
      <button
        type="button"
        data-testid="cabinet-overall-width-lock"
        aria-pressed={widthLocked}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${
          widthLocked
            ? "border-blue-200 bg-blue-100 text-blue-800"
            : "border-blue-200 bg-white text-blue-800"
        }`}
        onClick={onToggleWidthLock}
      >
        {widthLocked ? (
          <Lock className="h-3.5 w-3.5" />
        ) : (
          <Unlock className="h-3.5 w-3.5" />
        )}
        {widthLocked ? "Overall width locked" : "Lock overall width"}
      </button>
      {widthBlockedByModuleLocks ? (
        <p className="text-[11px] leading-5 text-amber-700">
          Unlock a bay or release equal sizing before resizing the complete
          assembly.
        </p>
      ) : null}
      <button
        type="button"
        className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-semibold text-blue-800"
        onClick={onOpenGuidedFit}
      >
        Open guided Fit to Space
      </button>
    </div>
  );
}
