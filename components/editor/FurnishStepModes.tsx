"use client";

import { ArrowLeft } from "lucide-react";

type FurnishStepModesProps = {
  dark: boolean;
  mode: "furnish" | "ai";
  aiDesignEnabled: boolean;
  onGoFurnish: () => void;
  onGoAiDesign: () => void;
  onOpenBuiltIns?: () => void;
};

/**
 * The Furnish step's own entries: Suggest a layout (or the way back to products from it) and
 * Built-ins, which opens its studio. Both used to be Workspace menu entries (findings ED1, ST12).
 */
export function FurnishStepModes({
  dark,
  mode,
  aiDesignEnabled,
  onGoFurnish,
  onGoAiDesign,
  onOpenBuiltIns,
}: FurnishStepModesProps) {
  const buttonClass = dark
    ? "designer-work-control inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-semibold"
    : "inline-flex h-9 items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50";
  return (
    <div data-testid="furnish-step-modes" className="flex flex-wrap items-center gap-1.5">
      {mode === "ai" ? (
        <button type="button" data-testid="furnish-step-back-to-products" className={buttonClass} onClick={onGoFurnish}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to products
        </button>
      ) : aiDesignEnabled ? (
        <button type="button" data-testid="editor-workflow-ai" className={buttonClass} onClick={onGoAiDesign}>
          Suggest a layout
        </button>
      ) : null}
      {onOpenBuiltIns ? (
        <button
          type="button"
          data-testid="editor-workflow-millwork"
          aria-label="Built-ins"
          title="Built-ins"
          className={buttonClass}
          onClick={onOpenBuiltIns}
        >
          <span data-testid="open-custom-millwork-studio">
            <span data-testid="open-cabinetry-studio">Built-ins</span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
