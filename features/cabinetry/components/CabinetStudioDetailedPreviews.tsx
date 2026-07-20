"use client";

import { Check } from "lucide-react";

import type {
  CabinetDefinition,
  CabinetPart,
  CabinetValidationIssue,
} from "../types";
import type { CabinetSemanticSelection } from "./CabinetSceneItem";
import {
  CabinetPreviewViewSelector,
  type CabinetPreviewView,
} from "./CabinetPreviewCameraController";
import { CabinetPreview3D } from "./CabinetPreview3D";
import {
  CabinetStudioPreviewInteractionController,
  type CabinetStudioPreviewInteractionControllerProps,
} from "./CabinetStudioPreviewInteractionController";

type PreviewStatus = "ready" | "regenerating";

export interface CabinetDetailedCompactPreviewProps {
  definition: CabinetDefinition;
  generatedParts: readonly CabinetPart[];
  desktopPreviewActive: boolean;
  view: CabinetPreviewView;
  showClearances: boolean;
  selection: CabinetSemanticSelection;
  activeModuleId: string | null;
  status: PreviewStatus;
  formatMeasurement: (valueMm: number) => string;
  onViewChange: (view: CabinetPreviewView) => void;
  onSemanticSelect: (selection: CabinetSemanticSelection) => void;
  onSelectModule: (moduleId: string) => void;
}

export function CabinetDetailedCompactPreview({
  definition,
  generatedParts,
  desktopPreviewActive,
  view,
  showClearances,
  selection,
  activeModuleId,
  status,
  formatMeasurement,
  onViewChange,
  onSemanticSelect,
  onSelectModule,
}: CabinetDetailedCompactPreviewProps) {
  return (
    <div
      data-testid="cabinet-detailed-compact-preview"
      className="relative min-h-0 flex-1 overflow-hidden bg-[#e8ece7] lg:hidden"
    >
      {!desktopPreviewActive ? (
        <CabinetPreview3D
          definition={definition}
          generatedParts={generatedParts}
          view={view}
          showClearances={showClearances}
          selection={selection}
          onSemanticSelect={onSemanticSelect}
        />
      ) : null}
      <div className="absolute right-3 top-3 z-30">
        <CabinetPreviewViewSelector value={view} onChange={onViewChange} />
      </div>
      <div className="absolute inset-x-3 bottom-3 z-30 rounded-xl border border-white/70 bg-white/95 p-3 shadow-lg backdrop-blur">
        <div className="mb-2 flex items-center justify-between gap-2 text-xs">
          <span className="font-semibold text-neutral-900">Select a module</span>
          <span role="status" aria-live="polite" className="text-neutral-500">
            {status === "regenerating" ? "Updating preview…" : "Preview ready"}
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {definition.modules.map((module, index) => (
            <button
              key={module.id}
              type="button"
              data-testid={`cabinet-compact-module-${index + 1}`}
              aria-pressed={module.id === activeModuleId}
              className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                module.id === activeModuleId
                  ? "border-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-300 bg-white text-neutral-700"
              }`}
              onClick={() => onSelectModule(module.id)}
            >
              Bay {index + 1} · {formatMeasurement(module.width)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export interface CabinetDetailedPreviewPanelProps {
  interaction: CabinetStudioPreviewInteractionControllerProps;
  view: CabinetPreviewView;
  showClearances: boolean;
  activeModuleIndex: number;
  activeModuleIssues: readonly CabinetValidationIssue[];
  dimensionsLabel: string;
  selectionLabel: string;
  status: PreviewStatus;
  onViewChange: (view: CabinetPreviewView) => void;
  onToggleClearances: () => void;
  onSelectIssue: (issue: CabinetValidationIssue) => void;
}

export function CabinetDetailedPreviewPanel({
  interaction,
  view,
  showClearances,
  activeModuleIndex,
  activeModuleIssues,
  dimensionsLabel,
  selectionLabel,
  status,
  onViewChange,
  onToggleClearances,
  onSelectIssue,
}: CabinetDetailedPreviewPanelProps) {
  return (
    <main
      data-testid="cabinet-preview"
      data-shadow-maps-enabled="false"
      data-front-axis="negative-z"
      data-render-color-space="srgb"
      data-tone-mapping="aces-filmic"
      className="relative min-h-0 bg-[#e8ece7]"
    >
      <CabinetStudioPreviewInteractionController {...interaction} />
      <div className="absolute left-1/2 top-4 z-30 flex -translate-x-1/2 items-center gap-2">
        <CabinetPreviewViewSelector value={view} onChange={onViewChange} />
        <button
          type="button"
          data-testid="cabinet-preview-clearance-toggle"
          aria-pressed={showClearances}
          className={`inline-flex items-center gap-1.5 rounded-lg border border-white/60 px-2.5 py-2 text-[11px] font-semibold shadow-sm backdrop-blur focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2 ${
            showClearances
              ? "bg-blue-600 text-white"
              : "bg-white/90 text-neutral-700"
          }`}
          onClick={onToggleClearances}
        >
          {showClearances ? (
            <Check aria-hidden="true" className="h-3 w-3" />
          ) : null}
          Clearances
        </button>
      </div>
      {activeModuleIssues.length ? (
        <button
          type="button"
          data-testid="cabinet-preview-issue-marker"
          className="absolute bottom-4 left-4 z-30 rounded-full border border-white/60 bg-red-600 px-3 py-2 text-xs font-semibold text-white shadow-lg"
          onClick={() => onSelectIssue(activeModuleIssues[0])}
        >
          Module {activeModuleIndex + 1} · {activeModuleIssues.length}{" "}
          {activeModuleIssues.length === 1 ? "issue" : "issues"}
        </button>
      ) : null}
      <div className="pointer-events-none absolute left-4 top-4 rounded-md bg-white/90 px-3 py-2 text-xs text-neutral-700 shadow-sm">
        <span className="block">{dimensionsLabel}</span>
        <span className="mt-1 block font-semibold text-blue-700">
          Selected: {selectionLabel}
        </span>
      </div>
      <div
        data-testid="cabinet-preview-status"
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute right-4 top-4 rounded-md bg-white/90 px-3 py-2 text-xs text-neutral-700 shadow-sm"
      >
        {status === "regenerating" ? "Regenerating preview..." : "Preview ready"}
      </div>
    </main>
  );
}
