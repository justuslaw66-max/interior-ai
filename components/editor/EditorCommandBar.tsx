"use client";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import { CommandBarAccountMenu } from "@/components/editor/command-bar/CommandBarAccountMenu";
import { CommandBarCanvasControls } from "@/components/editor/command-bar/CommandBarCanvasControls";
import { CommandBarMoreMenu } from "@/components/editor/command-bar/CommandBarMoreMenu";
import { CommandBarSaveStatus } from "@/components/editor/command-bar/CommandBarSaveStatus";
import { LightingSettingsDrawer } from "@/components/editor/design-page/LightingSettingsDrawer";
import { handleWorkspaceMenuKeyDown } from "@/components/editor/workspaceMenuKeyboard";
import { ChevronDown, Plus } from "lucide-react";
import { CLIENT_PREVIEW_COMMAND_BAR_ID, guardHiddenCommandAction } from "@/lib/useClientPreviewCommandBarFocus";
import type { EditorSaveStatus } from "@/lib/design-page-save-status";
import { GUEST_PROMPT_WORKFLOW_FALLBACK_ID, GUEST_SAVE_OPENER_ID } from "@/lib/guest-save-prompt";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
type EditorMode = "design" | "adjust" | "ai" | "buy" | "present";

type EditorCommandBarProps = {
  isClientPreview: boolean;
  dark?: boolean;
  aiDesignEnabled?: boolean;
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
  onMillwork?: () => void;
  onFurnish: () => void;
  onAiDesign: () => void;
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
  aiDesignEnabled = false,
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
  onMillwork,
  onFurnish,
  onAiDesign,
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
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [lightingSettingsOpen, setLightingSettingsOpen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeLightingSettings = useCallback(() => setLightingSettingsOpen(false), []);

  useEffect(() => {
    if (!workspaceOpen && !overflowOpen && !accountOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      const insideWorkspace = workspaceRef.current?.contains(target) ?? false;
      const insideOverflow = overflowRef.current?.contains(target) ?? false;
      const insideAccount = accountRef.current?.contains(target) ?? false;
      if (!insideWorkspace && !insideOverflow && !insideAccount) {
        setWorkspaceOpen(false);
        setOverflowOpen(false);
        setAccountOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (workspaceOpen) workspaceRef.current?.querySelector<HTMLElement>("button")?.focus();
        setWorkspaceOpen(false);
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
  }, [accountOpen, overflowOpen, workspaceOpen]);

  const workflowSteps: Array<{
    id: string;
    label: string;
    testId: string;
    onClick: () => void;
    active: boolean;
    ariaLabel?: string;
    title?: string;
    legacyTestId?: string;
    screenReaderLabel?: string;
  }> = [
    {
      id: "plan",
      label: "Plan",
      testId: "editor-workflow-plan",
      onClick: onPlan,
      active: !millworkActive && editorMode === "design",
    },
    ...(onMillwork
      ? [{
          id: "millwork",
          label: "Built-ins",
          testId: "editor-workflow-millwork",
          onClick: onMillwork,
          active: millworkActive,
          ariaLabel: "Built-ins",
          title: "Built-ins",
          legacyTestId: "open-custom-millwork-studio",
          screenReaderLabel: "Built-ins",
        }]
      : []),
    {
      id: "furnish",
      label: "Furnish",
      testId: "editor-workflow-furnish",
      onClick: onFurnish,
      active: !millworkActive && editorMode === "adjust",
    },
    ...(aiDesignEnabled
      ? [{
          id: "ai",
          label: "Suggest a layout",
          testId: "editor-workflow-ai",
          onClick: onAiDesign,
          active: !millworkActive && editorMode === "ai",
        }]
      : []),
    {
      id: "shop",
      label: "Shop",
      testId: "editor-workflow-shop",
      onClick: onShop,
      active: !millworkActive && editorMode === "buy",
    },
    {
      id: "export",
      label: "Export",
      testId: "editor-workflow-export",
      onClick: onExport,
      active: !millworkActive && editorMode === "present",
    },
  ];
  const activeWorkflowStep = workflowSteps.find((step) => step.active) ?? workflowSteps[0];
  const designSidebarToggleVisible =
    !millworkActive && (editorMode === "design" || editorMode === "adjust" || editorMode === "ai");
  const menuButtonClass = dark
    ? "designer-work-control flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold"
    : "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-100";
  const menuPanelClass = dark
    ? "designer-work-surface absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl p-2 shadow-2xl"
    : "absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl border border-neutral-200 bg-white p-2 text-neutral-900 shadow-2xl";
  const workspaceMenuPanelClass = dark
    ? "designer-work-surface absolute left-0 top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl p-2 shadow-2xl"
    : "absolute left-0 top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl border border-neutral-200 bg-white p-2 text-neutral-900 shadow-2xl";
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
      className={`absolute left-0 right-0 top-0 z-50 flex h-12 items-center gap-0 overflow-visible border-b px-2 shadow-sm backdrop-blur transition-opacity duration-300 sm:px-4 md:h-9 md:gap-2 ${
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

        <div ref={workspaceRef} className="relative shrink-0">
          <button id={GUEST_PROMPT_WORKFLOW_FALLBACK_ID}
            type="button"
            data-testid="editor-command-workspace"
            aria-label={`Workspace: ${activeWorkflowStep.label}`}
            aria-haspopup="menu"
            aria-expanded={workspaceOpen}
            className={
              dark
                ? "designer-control inline-flex h-[30px] items-center gap-1.5 rounded-lg border px-2.5 text-sm font-semibold leading-none sm:px-3"
                : "inline-flex h-[30px] items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-2.5 text-sm font-semibold leading-none text-neutral-800 shadow-sm hover:bg-neutral-50 sm:px-3"
            }
            onClick={(event) => {
              setWorkspaceOpen((value) => !value);
              setOverflowOpen(false);
              setAccountOpen(false);
              if (!workspaceOpen && event.detail === 0)
                window.requestAnimationFrame(() => workspaceRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
            }}
          >
            <span className="hidden text-xs font-medium opacity-60 lg:inline">
              Workspace
            </span>
            <span>{activeWorkflowStep.label}</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                workspaceOpen ? "rotate-180" : ""
              }`}
              aria-hidden="true"
            />
          </button>
          <div
            data-testid="editor-command-workspace-menu"
            role="menu"
            aria-label="Workspace"
            onKeyDown={handleWorkspaceMenuKeyDown}
            className={`${workspaceMenuPanelClass} ${
              workspaceOpen ? "" : "hidden"
            }`}
          >
            <div className="px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.14em] opacity-50">
              Workspace
            </div>
            {workflowSteps.map((step) => (
              <button
                key={step.id}
                type="button"
                role="menuitem"
                data-testid={step.testId}
                data-active={step.active ? "true" : "false"}
                aria-current={step.active ? "page" : undefined}
                aria-label={step.ariaLabel}
                title={step.title}
                className={menuButtonClass}
                onClick={() => {
                  workspaceRef.current?.querySelector<HTMLElement>("button")?.focus();
                  setWorkspaceOpen(false);
                  step.onClick();
                }}
              >
                {step.legacyTestId ? (
                  <span data-testid={step.legacyTestId}>
                    <span data-testid="open-cabinetry-studio">
                      {step.label}
                    </span>
                    {step.screenReaderLabel ? (
                      <span className="sr-only">{step.screenReaderLabel}</span>
                    ) : null}
                  </span>
                ) : (
                  <span>{step.label}</span>
                )}
                {step.active ? (
                  <span className="text-xs font-medium opacity-60">Current</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>

        {isDesigner && !isClientPreview ? (
          <span
            data-testid="pro-mode-indicator"
            role="status"
            aria-label="Pro tools on"
            className="inline-flex h-[30px] shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700"
          >
            <span className="sm:hidden">Pro</span>
            <span className="hidden sm:inline">Pro tools</span>
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
        <button
          type="button"
          data-testid="editor-command-new-plan"
          aria-label="Start a new design"
          title="Start a new design"
          className={
            dark
              ? "designer-control inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 text-sm font-semibold leading-none text-emerald-100 hover:bg-emerald-300/20 sm:w-auto sm:px-3"
              : "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold leading-none text-emerald-800 shadow-sm hover:bg-emerald-100 sm:w-auto sm:px-3"
          }
          onClick={onNewPlan}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          <span className="hidden sm:inline">New design</span>
        </button>

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
            setWorkspaceOpen(false);
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
          lightingAvailable={viewMode === "3d" && Boolean(lightingSettingsSlot)}
          overflowSlot={overflowSlot}
          onToggleLoadDesign={onToggleLoadDesign}
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
            setWorkspaceOpen(false);
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
