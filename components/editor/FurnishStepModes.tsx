"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";

type FurnishStepModesProps = {
  mode: "furnish" | "ai";
  onGoFurnish: () => void;
  onOpenBuiltIns?: () => void;
};

/**
 * The Furnish step's own entries: the way back to products from Suggest a layout, and Built-ins,
 * which opens its studio (findings ED1, ST12). Suggest a layout itself sits beside the product search.
 */
export function FurnishStepModes({
  mode,
  onGoFurnish,
  onOpenBuiltIns,
}: FurnishStepModesProps) {
  if (mode === "furnish" && !onOpenBuiltIns) return null;
  return (
    <div data-testid="furnish-step-modes" className="flex flex-wrap items-center gap-1.5">
      {mode === "ai" ? (
        <Button size="regular" data-testid="furnish-step-back-to-products" onClick={onGoFurnish}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to products
        </Button>
      ) : null}
      {onOpenBuiltIns ? (
        <Button
          size="regular"
          data-testid="editor-workflow-millwork"
          aria-label="Built-ins"
          title="Built-ins"
          onClick={onOpenBuiltIns}
        >
          <span data-testid="open-custom-millwork-studio">
            <span data-testid="open-cabinetry-studio">Built-ins</span>
          </span>
        </Button>
      ) : null}
    </div>
  );
}
