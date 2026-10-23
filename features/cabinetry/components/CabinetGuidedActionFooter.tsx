"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

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
        <Button
          data-testid="cabinet-guided-back"
          size="regular"
          disabled={currentStep === 0}
          onClick={onBack}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </Button>
        {isProWorkspace ? (
          <Button
            variant="quiet" size="regular" className="sm:hidden"
            onClick={onOpenDetailed}
          >
            Detailed editor
          </Button>
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
          <Button
            data-testid="cabinet-guided-next"
            variant="primary" size="regular"
            onClick={onNext}
          >
            Continue <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <>
            {isProWorkspace ? (
              <Button
                data-testid="cabinet-open-outputs"
                size="regular"
                onClick={onOpenOutputs}
              >
                Export…
              </Button>
            ) : null}
            {canPlaceInPlan ? (
              <Button
                data-testid="cabinet-save-as-copy"
                size="regular"
                disabled={!valid || interactionDisabled}
                onClick={onSaveAsCopy}
              >
                {busyAction === "copy" ? "Copying…" : "Save as copy"}
              </Button>
            ) : null}
            {mode === "create" || (!canPlaceInPlan && canSaveDefinition) ? (
              <Button
                data-testid="cabinet-save-definition"
                size="regular"
                disabled={!valid || interactionDisabled}
                onClick={onSaveDefinition}
              >
                {busyAction === "save"
                  ? "Saving…"
                  : mode === "create"
                    ? "Save as template"
                    : "Save built-in"}
              </Button>
            ) : null}
            {canPlaceInPlan ? (
              <Button
                data-testid={
                  mode === "edit"
                    ? "cabinet-update-placement"
                    : "cabinet-place-in-plan"
                }
                variant="primary" size="regular"
                disabled={!valid || interactionDisabled}
                onClick={onPlaceInPlan}
              >
                {busyAction === "place"
                  ? "Generating…"
                  : mode === "edit"
                    ? "Update in plan"
                    : "Place in plan"}
              </Button>
            ) : null}
          </>
        )}
      </div>
    </footer>
  );
}
