"use client";

import type { ReactNode } from "react";
import { LayoutPanelLeft, Maximize, ShoppingBag, Sofa, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/Button";

export type EditorToolRailMode = "design" | "adjust" | "ai" | "buy";

type EditorToolRailProps = {
  mode: EditorToolRailMode;
  aiDesignEnabled?: boolean;
  onDesign: () => void;
  onAdjust: () => void;
  onAi: () => void;
  onCart: () => void;
  onFitPlan: () => void;
};

type ToolButtonProps = {
  active?: boolean;
  label: string;
  testId: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
};

// The rail's shortcuts are quiet icon buttons; the step that's open is pressed, black (UX 5n, Q3).
// Fit to screen is an action, so it has no pressed state. The icons are lucide's (30 Oct 2026).
function ToolButton({
  active,
  label,
  testId,
  title,
  onClick,
  children,
}: ToolButtonProps) {
  return (
    <Button
      variant="quiet"
      size="icon"
      pressed={active}
      aria-label={label}
      data-testid={testId}
      title={title}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export default function EditorToolRail({
  mode,
  aiDesignEnabled = false,
  onDesign,
  onAdjust,
  onAi,
  onCart,
  onFitPlan,
}: EditorToolRailProps) {
  return (
    <div
      data-testid="editor-tool-rail"
      className="absolute left-4 top-bar-17 z-40 md:top-bar-6 flex w-12 touch:w-14 flex-col items-center gap-2 rounded-2xl border border-separator bg-surface-floating/95 p-2 shadow-xl backdrop-blur"
      aria-label="Editor tools"
    >
      <ToolButton
        active={mode === "design"}
        label="Planning shortcut"
        testId="editor-rail-design"
        title="Draw or upload a floor plan"
        onClick={onDesign}
      >
        <LayoutPanelLeft className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      <ToolButton
        active={mode === "adjust"}
        label="Furniture shortcut"
        testId="editor-rail-adjust"
        title="Add and adjust furniture"
        onClick={onAdjust}
      >
        <Sofa className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      {aiDesignEnabled && (
        <ToolButton
          active={mode === "ai"}
          label="AI shortcut"
          testId="editor-rail-ai"
          title="Suggest a layout"
          onClick={onAi}
        >
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </ToolButton>
      )}
      <ToolButton
        active={mode === "buy"}
        label="Commerce shortcut"
        testId="editor-rail-cart"
        title="Shopping list"
        onClick={onCart}
      >
        <ShoppingBag className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
      <div className="my-1 h-px w-7 bg-separator" />
      <ToolButton
        label="Fit to screen"
        testId="editor-rail-fit-plan"
        title="Fit to screen"
        onClick={onFitPlan}
      >
        <Maximize className="h-5 w-5" aria-hidden="true" />
      </ToolButton>
    </div>
  );
}
