"use client";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import { AccountMenuItems, CommandBarAccountMenu } from "@/components/editor/command-bar/CommandBarAccountMenu";
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
import { CANVAS_TOOLBAR_MEDIA_QUERY, useMediaQuery } from "@/lib/useMediaQuery";
import { useCallback, useRef, useState, type ReactNode } from "react";
type EditorMode = "design" | "adjust" | "ai" | "buy";

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
  /** History and the view: the canvas's controls read them (the toolbar, the phone's pills). */
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
  /** The design's name, at every width, and Rename design, which the phone Menu also offers. */
  designTitle?: string; onRenameDesign?: () => void;
  saveStatus: EditorSaveStatus;
  onRetrySaveStatus: () => void | Promise<void>;
  contextSlot?: ReactNode;
  overflowSlot?: ReactNode;
  lightingSettingsSlot?: ReactNode;
};

// Built-ins and Suggest a layout open from inside Furnish, so Furnish stays current while either
// is open. The sidebar toggle shows in Plan and Furnish.
function commandBarSteps({ editorMode, millworkActive = false, onPlan, onFurnish, onShop }: Pick<
  EditorCommandBarProps, "editorMode" | "millworkActive" | "onPlan" | "onFurnish" | "onShop"
>) {
  const steps: CommandBarStep[] = [
    { id: "plan", number: 1, label: "Plan", testId: "editor-workflow-plan", onSelect: onPlan,
      active: !millworkActive && editorMode === "design" },
    { id: "furnish", number: 2, label: "Furnish", testId: "editor-workflow-furnish", onSelect: onFurnish,
      active: millworkActive || editorMode === "adjust" || editorMode === "ai" },
    { id: "shop", number: 3, label: "Shop", testId: "editor-workflow-shop", onSelect: onShop,
      active: !millworkActive && editorMode === "buy" },
  ];
  const focusFallbackStepId = steps.find((step) => step.active)?.id ?? "plan";
  const sidebarToggleVisible = !millworkActive && (editorMode === "design" || editorMode === "adjust" || editorMode === "ai");
  return { steps, focusFallbackStepId, sidebarToggleVisible };
}

/** More's and Account's items and panels; the phone Menu opens from the left of the bar. */
function commandBarMenuClasses(dark: boolean, wide: boolean) {
  const menuButtonClass = dark
    ? "designer-work-control flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold"
    : "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-100";
  // A menu taller than the screen (a short phone, a 44px row per item) scrolls inside itself.
  const menuPanelClass = `absolute max-h-[calc(100dvh-4.5rem)] overflow-y-auto ${wide ? "right-0" : "left-0"} ${dark
    ? "designer-work-surface top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl p-2 shadow-2xl"
    : "top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl border border-neutral-200 bg-white p-2 text-neutral-900 shadow-2xl"}`;
  return { menuButtonClass, menuPanelClass };
}

/**
 * The editor's bar (UX 4c and 4d, the approved TopBar and PhonePlan mockups). From md: the name
 * with the save status under it, the steps in the centre, then Get Pro, Save, Download, Share,
 * More and Account. On phones a 56px header: Menu (More's items and the account's), the name and
 * status, Save and Share; the steps are a bar along the bottom.
 */
export default function EditorCommandBar(props: EditorCommandBarProps) {
  const { isClientPreview, dark = false, viewMode, isDesigner } = props;
  const { designSidebarCollapsed, onToggleDesignSidebar, onOpenMyDesigns, showLoadDesign } = props;
  const { saveStatus, onRetrySaveStatus, contextSlot, overflowSlot, lightingSettingsSlot } = props;
  const wide = useMediaQuery(CANVAS_TOOLBAR_MEDIA_QUERY);
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

  const { steps, focusFallbackStepId, sidebarToggleVisible } = commandBarSteps(props);
  const { menuButtonClass, menuPanelClass } = commandBarMenuClasses(dark, wide);
  const account = {
    dark, menuButtonClass, isAuthed: props.isAuthed, accountReady: props.accountReady, accountName: props.accountName,
    planLabel: props.planLabel, canManageBilling: props.canManageBilling, isOpeningBillingPortal: props.isOpeningBillingPortal,
    onManageBilling: props.onManageBilling, onViewPlans: props.onViewPlans,
  };
  const moreMenu = (
    <CommandBarMoreMenu
      dark={dark}
      phone={!wide}
      accountSlot={<AccountMenuItems {...account} onClose={() => setOverflowOpen(false)} />}
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
      lightingAvailable={viewMode === "3d" && Boolean(lightingSettingsSlot)}
      overflowSlot={overflowSlot}
      onOpenMyDesigns={onOpenMyDesigns} onNewPlan={props.onNewPlan}
      onToggleDesignerMode={props.onToggleDesignerMode} onToggleClientPreview={props.onToggleClientPreview}
      onFeedback={props.onFeedback} onDownload={props.onDownload}
      onRenameDesign={props.onRenameDesign}
      onOpenLightingSettings={() => setLightingSettingsOpen(true)} onCloseLightingSettings={closeLightingSettings}
    />
  );

  return (
    <div
      id={CLIENT_PREVIEW_COMMAND_BAR_ID}
      data-testid="editor-command-bar"
      inert={isClientPreview}
      aria-hidden={isClientPreview}
      onClickCapture={guardHiddenCommandAction}
      className={`absolute left-0 right-0 top-0 z-50 flex h-(--editor-bar-h) items-center gap-1 overflow-visible border-b px-1 shadow-sm transition-opacity duration-300 md:gap-4 md:px-4 md:backdrop-blur ${
        dark ? "designer-command-bar" : "border-neutral-200 bg-white/95 text-neutral-950"
      } ${isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="flex min-w-0 flex-1 basis-0 items-center gap-1 md:gap-3">
        {wide ? null : moreMenu}
        <CommandBarHomeLink dark={dark} myDesignsAvailable={showLoadDesign} onOpenMyDesigns={onOpenMyDesigns} />
        <div className="ml-1.5 flex min-w-0 flex-1 flex-col justify-center gap-0.5 md:ml-0 md:flex-initial">
          <CommandBarDesignTitle dark={dark} title={props.designTitle} onRename={props.onRenameDesign} />
          <CommandBarSaveStatus dark={dark} saveStatus={saveStatus} onRetrySaveStatus={onRetrySaveStatus} />
        </div>
        <CommandBarCanvasControls
          dark={dark}
          isClientPreview={isClientPreview}
          sidebarToggleVisible={sidebarToggleVisible && wide}
          designSidebarCollapsed={designSidebarCollapsed}
          onToggleDesignSidebar={onToggleDesignSidebar}
          undoName={props.undoName}
          onUndo={props.onUndo}
        />
        <CommandBarProIndicator visible={isDesigner && !isClientPreview} />
        {/* Room info left the bar for More (UX 4c); 4f makes it the Plan panel's room header. */}
        {contextSlot ? <div data-testid="editor-command-context" hidden>{contextSlot}</div> : null}
      </div>

      <CommandBarStepTabs dark={dark} steps={steps} focusFallbackStepId={focusFallbackStepId} />

      <div className="flex shrink-0 items-center justify-end gap-1 md:min-w-max md:flex-1 md:basis-0 md:gap-2">
        <CommandBarGetProButton dark={dark} accountReady={props.accountReady} canUpgrade={props.canUpgrade} onGetPro={props.onGetPro} />
        <CommandBarSaveButton dark={dark} isSaving={props.isSaving ?? false} cloudBacked={saveStatus.cloudBacked} onSave={props.onSave} />
        <CommandBarDownloadButton dark={dark} onDownload={props.onDownload} />
        <CommandBarShareButton dark={dark} isSharing={props.isSharing ?? false} onShare={props.onShare} />
        {wide ? moreMenu : null}
        {wide ? (
          <CommandBarAccountMenu
            {...account}
            containerRef={accountRef}
            open={accountOpen}
            onToggle={() => { setAccountOpen((value) => !value); setOverflowOpen(false); }}
            onClose={() => setAccountOpen(false)}
            menuPanelClass={menuPanelClass}
          />
        ) : null}
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
