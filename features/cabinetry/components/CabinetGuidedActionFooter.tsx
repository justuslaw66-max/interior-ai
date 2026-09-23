"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import type { CabinetryStudioProps } from "./CabinetryStudio.contract";
import type { CabinetStudioBusyAction } from "./CabinetStudioOutputsPanel";

export interface CabinetGuidedActionFooterProps {
  currentStep: number;
  lastStep: number;
  isProWorkspace: boolean;
  valid: boolean;
  busyAction: CabinetStudioBusyAction | null;
  mode: CabinetryStudioProps["mode"];
  actionError: string | null;
  actionSuccess: string | null;
  canPlaceInPlan: boolean;
  canSaveDefinition: boolean;
  formatFeedback: (message: string) => string;
  onBack: () => void;
  onOpenDetailed: () => void;
  onNext: () => void;
  onOpenOutputs: () => void;
  onSaveAsCopy: () => void;
  onSaveDefinition: () => void;
  onPlaceInPlan: () => void;
}

export function CabinetGuidedActionFooter({
  currentStep,
  lastStep,
  isProWorkspace,
  valid,
  busyAction,
  mode,
  actionError,
  actionSuccess,
  canPlaceInPlan,
  canSaveDefinition,
  formatFeedback,
  onBack,
  onOpenDetailed,
  onNext,
  onOpenOutputs,
  onSaveAsCopy,
  onSaveDefinition,
  onPlaceInPlan,
}: CabinetGuidedActionFooterProps) {
  const interactionDisabled = busyAction !== null;

  return (
    <footer className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t border-neutral-200 bg-white px-4 py-2 sm:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          data-testid="cabinet-guided-back"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-neutral-300 px-3 text-sm font-semibold text-neutral-700 hover:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-35"
          disabled={currentStep === 0}
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        {isProWorkspace ? (
          <button
            type="button"
            className="min-h-10 rounded-xl px-3 text-sm font-semibold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-950 sm:hidden"
            onClick={onOpenDetailed}
          >
            Detailed editor
          </button>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2">
        {actionError ? (
          <span
            data-testid="cabinet-action-error"
            role="alert"
            className="max-w-full text-xs font-medium leading-5 text-red-700"
          >
            {formatFeedback(actionError)}
          </span>
        ) : null}
        {actionSuccess ? (
          <span
            data-testid="cabinet-action-success"
            role="status"
            className="max-w-full text-xs font-medium leading-5 text-emerald-700"
          >
            {formatFeedback(actionSuccess)}
          </span>
        ) : null}
        {currentStep < lastStep ? (
          <button
            type="button"
            data-testid="cabinet-guided-next"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-neutral-950 px-4 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
            onClick={onNext}
          >
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <>
            {isProWorkspace ? (
              <button
                type="button"
                data-testid="cabinet-open-outputs"
                className="min-h-10 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-700"
                onClick={onOpenOutputs}
              >
                Export…
              </button>
            ) : null}
            {canPlaceInPlan ? (
              <button
                type="button"
                data-testid="cabinet-save-as-copy"
                className="min-h-10 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!valid || interactionDisabled}
                onClick={onSaveAsCopy}
              >
                {busyAction === "copy" ? "Copying…" : "Save as copy"}
              </button>
            ) : null}
            {mode === "create" || (!canPlaceInPlan && canSaveDefinition) ? (
              <button
                type="button"
                data-testid="cabinet-save-definition"
                className="min-h-10 rounded-xl border border-neutral-300 px-4 text-sm font-semibold text-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!valid || interactionDisabled}
                onClick={onSaveDefinition}
              >
                {busyAction === "save"
                  ? "Saving…"
                  : mode === "create"
                    ? "Save as template"
                    : "Save design"}
              </button>
            ) : null}
            {canPlaceInPlan ? (
              <button
                type="button"
                data-testid={
                  mode === "edit"
                    ? "cabinet-update-placement"
                    : "cabinet-place-in-plan"
                }
                className="min-h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!valid || interactionDisabled}
                onClick={onPlaceInPlan}
              >
                {busyAction === "place"
                  ? "Generating…"
                  : mode === "edit"
                    ? "Update in plan"
                    : "Place in plan"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </footer>
  );
}
