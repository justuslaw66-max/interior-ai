"use client";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import { CommandBarAccountMenu } from "@/components/editor/command-bar/CommandBarAccountMenu";
import { CommandBarCanvasControls } from "@/components/editor/command-bar/CommandBarCanvasControls";
import { CommandBarMoreMenu } from "@/components/editor/command-bar/CommandBarMoreMenu";
import { CommandBarSaveStatus } from "@/components/editor/command-bar/CommandBarSaveStatus";
import { CommandBarStepTabs, type CommandBarStep } from "@/components/editor/command-bar/CommandBarStepTabs";
import { LightingSettingsDrawer } from "@/components/editor/design-page/LightingSettingsDrawer";
import { CLIENT_PREVIEW_COMMAND_BAR_ID, guardHiddenCommandAction } from "@/lib/useClientPreviewCommandBarFocus";
import type { EditorSaveStatus } from "@/lib/design-page-save-status";
import { GUEST_SAVE_OPENER_ID } from "@/lib/guest-save-prompt";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
type EditorMode = "design" | "adjust" | "ai" | "buy" | "present";

type EditorCommandBarProps = {
  isClientPreview: boolean;
  dark?: boolean;
  editorMode: EditorMode;
  viewMode: EditorViewMode;
  isDesigner: boolean;
  isAuthed: boolean;
  planLabel: string;
  canManageBilling: boolean;
  isOpeningBillingPortal: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  designSidebarCollapsed: boolean;
  onToggleDesignSidebar: () => void;
  onPlan: () => void;
  millworkActive?: boolean;
  onFurnish: () => void;
  onShop: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onViewModeChange: (next: EditorViewMode) => void;
  onToggleDesignerMode: () => void;
  onToggleClientPreview: () => void;
  onViewPlans: () => void;
  onNewPlan: () => void;
  onManageBilling: () => void;
  onFeedback: () => void;
  showLoadDesign: boolean;
  onToggleLoadDesign: () => void;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  saveStatus: EditorSaveStatus;
  onRetrySaveStatus: () => void | Promise<void>;
  onOpenPresentExport: () => void;
  contextSlot?: ReactNode;
  overflowSlot?: ReactNode;
  lightingSettingsSlot?: ReactNode;
};

export default function EditorCommandBar({
  isClientPreview,
  dark = false,
  editorMode,
  viewMode,
  isDesigner,
  isAuthed,
  planLabel,
  canManageBilling,
  isOpeningBillingPortal,
  canUndo,
  canRedo,
  undoName,
  redoName,
  designSidebarCollapsed,
  onToggleDesignSidebar,
  onPlan,
  millworkActive = false,
  onFurnish,
  onShop,
  onExport,
  onUndo,
  onRedo,
  onViewModeChange,
  onToggleDesignerMode,
  onToggleClientPreview,
  onViewPlans,
  onNewPlan,
  onManageBilling,
  onFeedback,
  showLoadDesign,
  onToggleLoadDesign,
  onSave,
  isSaving = false,
  saveStatus,
  onRetrySaveStatus,
  onOpenPresentExport,
  contextSlot,
  overflowSlot,
  lightingSettingsSlot,
}: EditorCommandBarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [lightingSettingsOpen, setLightingSettingsOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeLightingSettings = useCallback(() => setLightingSettingsOpen(false), []);

  useEffect(() => {
    if (!overflowOpen && !accountOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const insideOverflow = overflowRef.current?.contains(target) ?? false;
      const insideAccount = accountRef.current?.contains(target) ?? false;
      if (!insideOverflow && !insideAccount) {
        setOverflowOpen(false);
        setAccountOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOverflowOpen(false);
        setAccountOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountOpen, overflowOpen]);

  // Built-ins and Suggest a layout open from inside the Furnish step, so Furnish stays current
  // while either is open. Present & export lives in More.
  const steps: CommandBarStep[] = [
    { id: "plan", number: 1, label: "Plan", testId: "editor-workflow-plan", onSelect: onPlan,
      active: !millworkActive && editorMode === "design" },
    { id: "furnish", number: 2, label: "Furnish", testId: "editor-workflow-furnish", onSelect: onFurnish,
      active: millworkActive || editorMode === "adjust" || editorMode === "ai" },
    { id: "shop", number: 3, label: "Shop", testId: "editor-workflow-shop", onSelect: onShop,
      active: !millworkActive && editorMode === "buy" },
  ];
  const focusFallbackStepId = steps.find((step) => step.active)?.id ?? "plan";
  const designSidebarToggleVisible =
    !millworkActive && (editorMode === "design" || editorMode === "adjust" || editorMode === "ai");
  const menuButtonClass = dark
    ? "designer-work-control flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold"
    : "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-100";
  const menuPanelClass = dark
    ? "designer-work-surface absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl p-2 shadow-2xl"
    : "absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl border border-neutral-200 bg-white p-2 text-neutral-900 shadow-2xl";
  const handleViewModeChange = (next: EditorViewMode) => {
    if (next !== "3d") setLightingSettingsOpen(false);
    onViewModeChange(next);
  };

  return (
    <div
      id={CLIENT_PREVIEW_COMMAND_BAR_ID}
      data-testid="editor-command-bar"
      inert={isClientPreview}
      aria-hidden={isClientPreview}
      onClickCapture={guardHiddenCommandAction}
      className={`absolute left-0 right-0 top-0 z-50 flex h-12 items-center gap-0 overflow-visible border-b px-2 shadow-sm transition-opacity duration-300 sm:px-4 md:h-9 md:gap-2 md:backdrop-blur ${
        dark ? "designer-command-bar" : "border-neutral-200 bg-white/95 text-neutral-950"
      } ${isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="flex min-w-0 flex-[1.25] items-center gap-1 md:gap-1.5">
        <CommandBarCanvasControls
          dark={dark}
          isClientPreview={isClientPreview}
          sidebarToggleVisible={designSidebarToggleVisible}
          designSidebarCollapsed={designSidebarCollapsed}
          onToggleDesignSidebar={onToggleDesignSidebar}
          canUndo={canUndo}
          canRedo={canRedo}
          undoName={undoName}
          redoName={redoName}
          onUndo={onUndo}
          onRedo={onRedo}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
        />

        <CommandBarStepTabs
          dark={dark}
          steps={steps}
          focusFallbackStepId={focusFallbackStepId}
        />

        {isDesigner && !isClientPreview ? (
          <span
            data-testid="pro-mode-indicator"
            role="status"
            aria-label="Pro tools on"
            className="inline-flex h-[30px] shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700"
          >
            <span className="lg:hidden">Pro</span>
            <span className="hidden lg:inline">Pro tools</span>
          </span>
        ) : null}

      </div>

      <div className="pointer-events-none hidden min-w-0 flex-[0.95] items-center justify-center 2xl:flex">
        {contextSlot ? (
          <div
            data-testid="editor-command-context"
            className="pointer-events-auto flex min-w-0 max-w-full items-center justify-center overflow-hidden"
          >
            {contextSlot}
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-[0.9] items-center justify-end gap-0.5 md:gap-1.5">
        <CommandBarSaveStatus
          dark={dark}
          saveStatus={saveStatus}
          onRetrySaveStatus={onRetrySaveStatus}
        />
        <button id={GUEST_SAVE_OPENER_ID}
          type="button"
          data-testid="save-design"
          className={
            dark
              ? "designer-primary-action inline-flex h-[30px] shrink-0 items-center justify-center rounded-lg px-3 text-sm font-semibold leading-none disabled:cursor-wait disabled:opacity-70 sm:px-4"
              : "inline-flex h-[30px] shrink-0 items-center justify-center rounded-lg bg-neutral-900 px-3 text-sm font-semibold leading-none text-white shadow-sm hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-70 sm:px-4"
          }
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
        <CommandBarMoreMenu
          dark={dark}
          containerRef={overflowRef}
          buttonRef={moreButtonRef}
          open={overflowOpen}
          onToggle={() => {
            setOverflowOpen((value) => !value);
            setAccountOpen(false);
          }}
          onClose={() => setOverflowOpen(false)}
          menuButtonClass={menuButtonClass}
          menuPanelClass={menuPanelClass}
          lightingSettingsOpen={lightingSettingsOpen}
          showLoadDesign={showLoadDesign}
          isDesigner={isDesigner}
          isClientPreview={isClientPreview}
          presentModeActive={editorMode === "present"}
          onExport={onExport}
          lightingAvailable={viewMode === "3d" && Boolean(lightingSettingsSlot)}
          overflowSlot={overflowSlot}
          onToggleLoadDesign={onToggleLoadDesign}
          onNewPlan={onNewPlan}
          onToggleDesignerMode={onToggleDesignerMode}
          onToggleClientPreview={onToggleClientPreview}
          onOpenPresentExport={onOpenPresentExport}
          onOpenLightingSettings={() => setLightingSettingsOpen(true)}
          onCloseLightingSettings={closeLightingSettings}
          onFeedback={onFeedback}
        />

        <CommandBarAccountMenu
          dark={dark}
          containerRef={accountRef}
          open={accountOpen}
          onToggle={() => {
            setAccountOpen((value) => !value);
            setOverflowOpen(false);
          }}
          onClose={() => setAccountOpen(false)}
          menuButtonClass={menuButtonClass}
          menuPanelClass={menuPanelClass}
          isAuthed={isAuthed}
          planLabel={planLabel}
          canManageBilling={canManageBilling}
          isOpeningBillingPortal={isOpeningBillingPortal}
          onManageBilling={onManageBilling}
          onViewPlans={onViewPlans}
        />
      </div>
      {lightingSettingsSlot ? (
        <LightingSettingsDrawer
          open={
            lightingSettingsOpen &&
            !isClientPreview &&
            viewMode === "3d"
          }
          dark={dark}
          returnFocusRef={moreButtonRef}
          onClose={closeLightingSettings}
        >
          {lightingSettingsSlot}
        </LightingSettingsDrawer>
      ) : null}
    </div>
  );
}
