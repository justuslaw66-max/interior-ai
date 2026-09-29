"use client";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import { CommandBarAccountMenu } from "@/components/editor/command-bar/CommandBarAccountMenu";
import { CommandBarCanvasControls } from "@/components/editor/command-bar/CommandBarCanvasControls";
import { CommandBarDesignTitle } from "@/components/editor/command-bar/CommandBarDesignTitle";
import { CommandBarDownloadButton } from "@/components/editor/command-bar/CommandBarDownloadButton";
import { CommandBarGetProButton } from "@/components/editor/command-bar/CommandBarGetProButton";
import { CommandBarHomeLink } from "@/components/editor/command-bar/CommandBarHomeLink";
import { CommandBarMoreMenu } from "@/components/editor/command-bar/CommandBarMoreMenu";
import { CommandBarProIndicator } from "@/components/editor/command-bar/CommandBarProIndicator";
import { CommandBarSaveButton } from "@/components/editor/command-bar/CommandBarSaveButton";
import { CommandBarSaveStatus } from "@/components/editor/command-bar/CommandBarSaveStatus";
import { CommandBarShareButton } from "@/components/editor/command-bar/CommandBarShareButton";
import { CommandBarStepTabs, type CommandBarStep } from "@/components/editor/command-bar/CommandBarStepTabs";
import { LightingSettingsDrawer, useLightingSettingsOpen } from "@/components/editor/design-page/LightingSettingsDrawer";
import { CLIENT_PREVIEW_COMMAND_BAR_ID, guardHiddenCommandAction } from "@/lib/useClientPreviewCommandBarFocus";
import type { EditorSaveStatus } from "@/lib/design-page-save-status";
import { useDismissibleMenu } from "@/lib/useDismissibleMenu";
import { useCallback, useRef, useState, type ReactNode } from "react";
type EditorMode = "design" | "adjust" | "ai" | "buy" | "present";

type EditorCommandBarProps = {
  isClientPreview: boolean;
  dark?: boolean;
  editorMode: EditorMode;
  viewMode: EditorViewMode;
  isDesigner: boolean;
  isAuthed: boolean;
  /** The account corner waits for the session; Get Pro also waits for the plan, then shows unless it is Pro. */
  accountReady: boolean; accountName: string | null; canUpgrade: boolean; onGetPro?: () => void;
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
  onOpenMyDesigns: () => void;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  /** Share and Download show when given handlers. Share saves the design first if it isn't in the cloud. */
  onShare?: () => void; isSharing?: boolean; onDownload?: () => void;
  /** The design's name, shown from `xl`, and Rename design, which More offers below that. */
  designTitle?: string; onRenameDesign?: () => void;
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
  isAuthed, accountReady, accountName, canUpgrade, onGetPro,
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
  onOpenMyDesigns,
  onSave,
  isSaving = false, onShare, isSharing = false, onDownload, designTitle, onRenameDesign,
  saveStatus,
  onRetrySaveStatus,
  onOpenPresentExport,
  contextSlot,
  overflowSlot,
  lightingSettingsSlot,
}: EditorCommandBarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [lightingSettingsOpen, setLightingSettingsOpen] = useLightingSettingsOpen(viewMode);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeLightingSettings = useCallback(() => setLightingSettingsOpen(false), [setLightingSettingsOpen]);
  // More and Account close on a press outside them or on Escape, which hands focus back to their
  // button; arrow keys move through their items (AX5).
  useDismissibleMenu({ open: overflowOpen, containerRef: overflowRef, onDismiss: (byKeyboard) => {
    setOverflowOpen(false);
    if (byKeyboard) moreButtonRef.current?.focus();
  } });
  useDismissibleMenu({ open: accountOpen, containerRef: accountRef, onDismiss: (byKeyboard) => {
    setAccountOpen(false);
    if (byKeyboard) accountRef.current?.querySelector<HTMLElement>('[data-testid="editor-command-account"]')?.focus();
  } });

  // Built-ins and Suggest a layout open from inside Furnish, so Furnish stays current while either is open.
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

  return (
    <div
      id={CLIENT_PREVIEW_COMMAND_BAR_ID}
      data-testid="editor-command-bar"
      inert={isClientPreview}
      aria-hidden={isClientPreview}
      onClickCapture={guardHiddenCommandAction}
      className={`absolute left-0 right-0 top-0 z-50 flex h-12 items-center gap-0 overflow-visible border-b px-2 shadow-sm transition-opacity duration-300 sm:px-4 md:h-(--editor-bar-h) md:gap-4 md:backdrop-blur ${
        dark ? "designer-command-bar" : "border-neutral-200 bg-white/95 text-neutral-950"
      } ${isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="flex min-w-0 items-center gap-1 md:flex-1 md:basis-0 md:gap-3">
        <CommandBarHomeLink dark={dark} myDesignsAvailable={showLoadDesign} onOpenMyDesigns={onOpenMyDesigns} />
        <div className="hidden min-w-0 flex-col justify-center gap-0.5 md:flex">
          <CommandBarDesignTitle dark={dark} title={designTitle} onRename={onRenameDesign} />
          <CommandBarSaveStatus dark={dark} saveStatus={saveStatus} onRetrySaveStatus={onRetrySaveStatus} />
        </div>
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
          onViewModeChange={onViewModeChange}
        />
        <CommandBarProIndicator visible={isDesigner && !isClientPreview} />
        {contextSlot ? (
          <div
            data-testid="editor-command-context"
            className="pointer-events-auto hidden min-w-0 flex-1 items-center justify-center overflow-hidden min-[1800px]:flex"
          >
            {contextSlot}
          </div>
        ) : null}
      </div>

      <CommandBarStepTabs dark={dark} steps={steps} focusFallbackStepId={focusFallbackStepId} />

      <div className="ml-auto flex shrink-0 items-center justify-end gap-0.5 md:ml-0 md:min-w-max md:flex-1 md:basis-0 md:gap-2">
        <CommandBarGetProButton dark={dark} accountReady={accountReady} canUpgrade={canUpgrade} onGetPro={onGetPro} />
        <CommandBarSaveButton dark={dark} isSaving={isSaving} onSave={onSave} />
        <CommandBarDownloadButton dark={dark} onDownload={onDownload} />
        <CommandBarShareButton dark={dark} isSharing={isSharing} onShare={onShare} />
        <CommandBarMoreMenu
          dark={dark}
          containerRef={overflowRef}
          buttonRef={moreButtonRef}
          open={overflowOpen}
          onToggle={() => { setOverflowOpen((value) => !value); setAccountOpen(false); }}
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
          onOpenMyDesigns={onOpenMyDesigns} onNewPlan={onNewPlan}
          onToggleDesignerMode={onToggleDesignerMode} onToggleClientPreview={onToggleClientPreview}
          onOpenPresentExport={onOpenPresentExport} onFeedback={onFeedback} onDownload={onDownload} onRenameDesign={onRenameDesign}
          onOpenLightingSettings={() => setLightingSettingsOpen(true)} onCloseLightingSettings={closeLightingSettings}
        />

        <CommandBarAccountMenu
          dark={dark}
          containerRef={accountRef}
          open={accountOpen}
          onToggle={() => { setAccountOpen((value) => !value); setOverflowOpen(false); }}
          onClose={() => setAccountOpen(false)}
          menuButtonClass={menuButtonClass}
          menuPanelClass={menuPanelClass}
          isAuthed={isAuthed} accountReady={accountReady} accountName={accountName} planLabel={planLabel}
          canManageBilling={canManageBilling} isOpeningBillingPortal={isOpeningBillingPortal}
          onManageBilling={onManageBilling} onViewPlans={onViewPlans}
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
