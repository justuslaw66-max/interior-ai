"use client";

import type { ReactNode } from "react";

export type EditorToolRailMode = "design" | "adjust" | "ai" | "buy" | "present";

type EditorToolRailProps = {
  mode: EditorToolRailMode;
  dark?: boolean;
  aiDesignEnabled?: boolean;
  onDesign: () => void;
  onAdjust: () => void;
  onAi: () => void;
  onCart: () => void;
  onPresent: () => void;
  onFitPlan: () => void;
};

type ToolButtonProps = {
  active?: boolean;
  dark: boolean;
  label: string;
  testId: string;
  title: string;
  onClick: () => void;
  children: ReactNode;
};

function toolButtonClass(active: boolean, dark: boolean): string {
  if (active) {
    return dark
      ? "designer-command-selection"
      : "bg-neutral-900 text-white";
  }

  return dark
    ? "text-neutral-200 hover:bg-white/10"
    : "text-neutral-700 hover:bg-neutral-100";
}

function ToolButton({
  active = false,
  dark,
  label,
  testId,
  title,
  onClick,
  children,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      title={title}
      className={`flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${toolButtonClass(active, dark)}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function DesignIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M5 5h14v14H5z" stroke="currentColor" strokeWidth="1.8" />
      <path d="M5 10h14M10 5v14" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function AdjustIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="1.8" />
      <path d="m9 7 3-3 3 3M9 17l3 3 3-3M7 9l-3 3 3 3M17 9l3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M6 7h13l-1.2 7.2a2 2 0 0 1-2 1.7H9.2a2 2 0 0 1-2-1.6L5.8 5.8H3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 20h.1M16 20h.1" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4-5.7-1.8L10.2 9 12 3.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M18 15.5 18.8 18l2.2.8-2.2.7L18 22l-.8-2.5-2.2-.7 2.2-.8.8-2.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function PresentIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M5 5h14v10H5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m11 8 4 2-4 2z" fill="currentColor" />
      <path d="M12 15v4M9 19h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function FitIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path d="M5 9V5h4M15 5h4v4M19 15v4h-4M9 19H5v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 9h6v6H9z" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export default function EditorToolRail({
  mode,
  dark = false,
  aiDesignEnabled = false,
  onDesign,
  onAdjust,
  onAi,
  onCart,
  onPresent,
  onFitPlan,
}: EditorToolRailProps) {
  return (
    <div
      data-testid="editor-tool-rail"
      className={
        dark
          ? "designer-tool-rail absolute left-4 top-15 z-40 flex w-12 flex-col items-center gap-2 rounded-2xl p-2"
          : "absolute left-4 top-15 z-40 flex w-12 flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white/95 p-2 shadow-xl backdrop-blur"
      }
      aria-label="Editor tools"
    >
      <ToolButton
        active={mode === "design"}
        dark={dark}
        label="Planning shortcut"
        testId="editor-rail-design"
        title="Draw or upload a floor plan"
        onClick={onDesign}
      >
        <DesignIcon />
      </ToolButton>
      <ToolButton
        active={mode === "adjust"}
        dark={dark}
        label="Furniture shortcut"
        testId="editor-rail-adjust"
        title="Add and adjust furniture"
        onClick={onAdjust}
      >
        <AdjustIcon />
      </ToolButton>
      {aiDesignEnabled && (
        <ToolButton
          active={mode === "ai"}
          dark={dark}
          label="AI shortcut"
          testId="editor-rail-ai"
          title="Generate a starter layout"
          onClick={onAi}
        >
          <AiIcon />
        </ToolButton>
      )}
      <ToolButton
        active={mode === "buy"}
        dark={dark}
        label="Commerce shortcut"
        testId="editor-rail-cart"
        title="Shopping list and cart"
        onClick={onCart}
      >
        <CartIcon />
      </ToolButton>
      <ToolButton
        active={mode === "present"}
        dark={dark}
        label="Presentation shortcut"
        testId="editor-rail-present"
        title={mode === "present" ? "Exit export mode" : "Export and present"}
        onClick={onPresent}
      >
        <PresentIcon />
      </ToolButton>
      <div
        className={
          dark
            ? "designer-divider my-1 h-px w-7 border-t"
            : "my-1 h-px w-7 bg-neutral-200"
        }
      />
      <ToolButton
        dark={dark}
        label="Fit plan shortcut"
        testId="editor-rail-fit-plan"
        title="Fit plan"
        onClick={onFitPlan}
      >
        <FitIcon />
      </ToolButton>
    </div>
  );
}
