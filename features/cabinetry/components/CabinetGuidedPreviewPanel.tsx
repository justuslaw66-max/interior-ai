"use client";

import { Check } from "lucide-react";

import {
  CabinetPreviewViewSelector,
  type CabinetPreviewView,
} from "./CabinetPreviewCameraController";
import {
  CabinetStudioPreviewInteractionController,
  type CabinetStudioPreviewInteractionControllerProps,
} from "./CabinetStudioPreviewInteractionController";

export interface CabinetGuidedPreviewPanelProps {
  interaction: CabinetStudioPreviewInteractionControllerProps;
  view: CabinetPreviewView;
  showClearances: boolean;
  isProWorkspace: boolean;
  presetLabel: string;
  dimensionsLabel: string;
  selectionLabel: string;
  materialLabel: string;
  hardwareLabel: string;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  bomCount: number;
  onViewChange: (view: CabinetPreviewView) => void;
  onToggleClearances: () => void;
}

export function CabinetGuidedPreviewPanel({
  interaction,
  view,
  showClearances,
  isProWorkspace,
  presetLabel,
  dimensionsLabel,
  selectionLabel,
  materialLabel,
  hardwareLabel,
  errorCount,
  warningCount,
  infoCount,
  bomCount,
  onViewChange,
  onToggleClearances,
}: CabinetGuidedPreviewPanelProps) {
  return (
    <aside
      data-testid="cabinet-guided-preview"
      className={`relative hidden min-h-0 overflow-hidden bg-[#e5e7e1] lg:block ${
        interaction.showDimensionHandles
          ? "[&_[data-dimension-field=depth]]:!top-52"
          : ""
      }`}
    >
      <CabinetStudioPreviewInteractionController {...interaction} />
      <div className="absolute inset-x-5 top-5 z-30 grid gap-2">
        <div
          data-testid="cabinet-guided-preview-controls"
          className="flex max-w-full flex-wrap items-center justify-end gap-2"
        >
          <CabinetPreviewViewSelector value={view} onChange={onViewChange} />
          {isProWorkspace ? (
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
          ) : null}
        </div>
        <div
          data-testid="cabinet-guided-preview-summary"
          className="pointer-events-none flex min-w-0 flex-wrap gap-2"
        >
          <span className="max-w-full rounded-full bg-white/90 px-3 py-1.5 text-xs font-semibold text-neutral-800 shadow-sm backdrop-blur">
            {presetLabel}
          </span>
          <span className="max-w-full rounded-full bg-white/90 px-3 py-1.5 text-xs text-neutral-600 shadow-sm backdrop-blur">
            {dimensionsLabel}
          </span>
          <span className="max-w-full rounded-full bg-blue-600/90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm backdrop-blur">
            Selected: {selectionLabel}
          </span>
        </div>
      </div>
      <div
        className={`absolute inset-x-5 grid gap-3 ${
          interaction.showDimensionHandles ? "bottom-20" : "bottom-5"
        }`}
      >
        <div
          data-testid="cabinet-validation"
          data-validation-policy="errors_block_warnings_allow"
          data-error-count={String(errorCount)}
          data-warning-count={String(warningCount)}
          data-info-count={String(infoCount)}
          className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-lg backdrop-blur"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-neutral-900">
                {errorCount
                  ? "Needs attention"
                  : warningCount
                    ? "Valid with recommendations"
                    : "Design is valid"}
              </p>
              <p className="mt-1 text-[11px] text-neutral-500">
                {materialLabel} · {hardwareLabel}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                errorCount
                  ? "bg-red-100 text-red-700"
                  : warningCount
                    ? "bg-amber-100 text-amber-700"
                    : "bg-emerald-100 text-emerald-700"
              }`}
            >
              {errorCount
                ? `${errorCount} errors`
                : warningCount
                  ? `${warningCount} notes`
                  : "Ready"}
            </span>
          </div>
        </div>
        {isProWorkspace ? (
          <div
            data-testid="cabinet-bom"
            data-bom-count={String(bomCount)}
            className="sr-only"
          />
        ) : null}
      </div>
    </aside>
  );
}
