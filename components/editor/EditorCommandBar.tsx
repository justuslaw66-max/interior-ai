"use client";

import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import { LightingSettingsDrawer } from "@/components/editor/design-page/LightingSettingsDrawer";
import { handleWorkspaceMenuKeyDown } from "@/components/editor/workspaceMenuKeyboard";
import { ChevronDown, Ellipsis, PanelLeft, Plus, UserRound } from "lucide-react";
import { signIn, signOut } from "next-auth/react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
type EditorMode = "design" | "adjust" | "ai" | "buy" | "present";

export type EditorSaveStatus = {
  kind: "pending" | "saving" | "saved" | "failed" | "conflict";
  source: string;
  label: string;
  detail: string;
  tone: "error" | "saving" | "saved" | "pending";
  canRetry: boolean;
  lastSuccessfulSaveAt: number | null;
};

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

function getSaveStatusClassName(tone: EditorSaveStatus["tone"], dark: boolean) {
  if (dark) {
    if (tone === "error") return "designer-status-blocked";
    if (tone === "saving") return "designer-status-info";
    if (tone === "saved") return "designer-status-ready";
    return "designer-status-pending";
  }

  if (tone === "error") return "border-red-200 bg-red-50 text-red-800";
  if (tone === "saving") return "border-blue-200 bg-blue-50 text-blue-800";
  if (tone === "saved") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  return "border-neutral-200 bg-white text-neutral-700";
}

function getSaveStatusDotClassName(tone: EditorSaveStatus["tone"]) {
  if (tone === "error") return "bg-red-500";
  if (tone === "saving") return "bg-blue-500";
  if (tone === "saved") return "bg-emerald-500";
  return "bg-neutral-400";
}

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
  const closeLightingSettings = useCallback(
    () => setLightingSettingsOpen(false), []
  );

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
          label: "Millwork",
          testId: "editor-workflow-millwork",
          onClick: onMillwork,
          active: millworkActive,
          ariaLabel: "Custom Millwork Studio",
          title: "Custom Millwork Studio",
          legacyTestId: "open-custom-millwork-studio",
          screenReaderLabel: "Custom Millwork Studio",
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
          label: "AI Design",
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
  const signInWithReturn = () => {
    const callbackUrl = typeof window !== "undefined" ? window.location.href : "/";
    signIn("google", { callbackUrl });
  };
  const handleViewModeChange = (next: EditorViewMode) => {
    if (next !== "3d") setLightingSettingsOpen(false);
    onViewModeChange(next);
  };

  return (
    <div
      data-testid="editor-command-bar"
      className={`absolute left-0 right-0 top-0 z-50 flex h-9 items-center gap-2 overflow-visible border-b px-2 shadow-sm backdrop-blur transition-opacity duration-300 sm:px-4 ${
        dark ? "designer-command-bar" : "border-neutral-200 bg-white/95 text-neutral-950"
      } ${isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="flex min-w-0 flex-[1.25] items-center gap-1.5">
        {designSidebarToggleVisible ? (
          <button
            type="button"
            data-testid="editor-design-sidebar-toggle"
            data-state={designSidebarCollapsed ? "collapsed" : "expanded"}
            aria-label={
              designSidebarCollapsed
                ? "Open design sidebar"
                : "Collapse design sidebar"
            }
            aria-expanded={!designSidebarCollapsed}
            title="Toggle design sidebar (Ctrl/⌘ B)"
            className={
              dark
                ? "designer-control inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border"
                : "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 hover:text-neutral-950"
            }
            onClick={onToggleDesignSidebar}
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
        <button
          type="button"
          data-testid="command-undo"
          aria-label={undoName ? `Undo ${undoName}` : "Undo"}
          className={
            dark
              ? "designer-control inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border text-sm font-semibold leading-none disabled:cursor-not-allowed disabled:opacity-40"
              : "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-semibold leading-none text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          }
          onClick={onUndo}
          disabled={isClientPreview || !canUndo}
          title={undoName ? `Undo "${undoName}" (Cmd/Ctrl+Z)` : "Undo (Cmd/Ctrl+Z)"}
        >
          ↶
        </button>
        <button
          type="button"
          data-testid="command-redo"
          aria-label={redoName ? `Redo ${redoName}` : "Redo"}
          className={
            dark
              ? "designer-control inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border text-sm font-semibold leading-none disabled:cursor-not-allowed disabled:opacity-40"
              : "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-semibold leading-none text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          }
          onClick={onRedo}
          disabled={isClientPreview || !canRedo}
          title={redoName ? `Redo "${redoName}" (Cmd/Ctrl+Shift+Z)` : "Redo (Cmd/Ctrl+Shift+Z)"}
        >
          ↷
        </button>

        <div className="shrink-0">
          <EditorViewToggle value={viewMode} onChange={handleViewModeChange} dark={dark} />
        </div>

        <div ref={workspaceRef} className="relative shrink-0">
          <button
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
            aria-label="Pro mode active"
            className="inline-flex h-[30px] shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-2 text-[11px] font-bold text-blue-700"
          >
            <span className="sm:hidden">Pro</span>
            <span className="hidden sm:inline">Pro mode</span>
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

      <div className="flex min-w-0 flex-[0.9] items-center justify-end gap-1.5">
        <button
          type="button"
          data-testid="editor-command-new-plan"
          aria-label="Start a new floor plan"
          title="Start a new floor plan"
          className={
            dark
              ? "designer-control inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-300/30 bg-emerald-300/10 text-sm font-semibold leading-none text-emerald-100 hover:bg-emerald-300/20 sm:w-auto sm:px-3"
              : "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-sm font-semibold leading-none text-emerald-800 shadow-sm hover:bg-emerald-100 sm:w-auto sm:px-3"
          }
          onClick={onNewPlan}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
          <span className="hidden sm:inline">New plan</span>
        </button>

        <div
          data-testid="save-status"
          data-status={saveStatus.kind}
          data-source={saveStatus.source}
          data-last-successful-save-at={
            saveStatus.lastSuccessfulSaveAt
              ? new Date(saveStatus.lastSuccessfulSaveAt).toISOString()
              : ""
          }
          role="status"
          aria-live="polite"
          aria-label={`${saveStatus.label}. ${saveStatus.detail}`}
          title={`${saveStatus.label}: ${saveStatus.detail}`}
          className={`hidden h-[30px] min-w-0 items-center gap-1.5 rounded-full border px-2 text-xs md:flex ${
            saveStatus.canRetry ? "shrink-0" : ""
          } ${getSaveStatusClassName(
            saveStatus.tone,
            dark
          )}`}
        >
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${getSaveStatusDotClassName(saveStatus.tone)} ${
              saveStatus.tone === "saving" ? "animate-pulse" : ""
            }`}
            aria-hidden="true"
          />
          <span className="hidden min-w-0 max-w-28 truncate font-semibold lg:inline">
            {saveStatus.label}
          </span>
          <span className="hidden min-w-0 max-w-36 truncate xl:inline">
            {saveStatus.detail}
          </span>
          {saveStatus.canRetry ? (
            <button
              type="button"
              data-testid="save-status-retry"
              className={
                dark
                  ? "hidden shrink-0 rounded-full border border-white/20 px-2 py-0.5 font-semibold text-white hover:bg-white/10 xl:inline-flex"
                  : "hidden shrink-0 rounded-full border border-current/20 bg-white/70 px-2 py-0.5 font-semibold hover:bg-white xl:inline-flex"
              }
              onClick={onRetrySaveStatus}
            >
              Retry
            </button>
          ) : null}
        </div>

        <button
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
          {isSaving ? "Saving..." : "Save"}
        </button>

        <div ref={overflowRef} className="relative shrink-0">
          <button
            ref={moreButtonRef}
            type="button"
            data-testid="editor-command-overflow"
            aria-label="More"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            aria-controls={
              lightingSettingsOpen ? "lighting-settings-drawer" : undefined
            }
            className={
              dark
                ? "designer-control inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border text-sm font-semibold leading-none sm:w-auto sm:px-3"
                : "inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-semibold leading-none text-neutral-800 hover:bg-neutral-50 sm:w-auto sm:px-3"
            }
            onClick={() => {
              setOverflowOpen((value) => !value);
              setWorkspaceOpen(false);
              setAccountOpen(false);
            }}
          >
            <Ellipsis className="h-4 w-4 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">More</span>
          </button>
          {overflowOpen && (
            <div
              data-testid="editor-command-overflow-menu"
              role="menu"
              className={menuPanelClass}
            >
              {showLoadDesign && (
                <button
                  type="button"
                  data-testid="editor-command-overflow-load"
                  className={menuButtonClass}
                  onClick={() => {
                    setOverflowOpen(false);
                    onToggleLoadDesign();
                  }}
                >
                  My designs
                </button>
              )}
              <button
                type="button"
                data-testid="editor-command-overflow-pro-tools"
                className={menuButtonClass}
                onClick={() => {
                  setOverflowOpen(false);
                  onToggleDesignerMode();
                }}
              >
                {isDesigner ? "Exit Pro tools" : "Pro tools"}
              </button>
              {isDesigner && (
                <button
                  type="button"
                  data-testid="editor-command-overflow-preview"
                  className={menuButtonClass}
                  onClick={() => {
                    setOverflowOpen(false);
                    setLightingSettingsOpen(false);
                    onToggleClientPreview();
                  }}
                >
                  {isClientPreview ? "Exit preview" : "Preview"}
                </button>
              )}
              {editorMode === "present" && (
                <button
                  type="button"
                  data-testid="editor-command-overflow-present-export"
                  className={menuButtonClass}
                  onClick={() => {
                    setOverflowOpen(false);
                    onOpenPresentExport();
                  }}
                >
                  Export & Camera
                </button>
              )}
              {viewMode === "3d" && lightingSettingsSlot ? (
                <button
                  type="button"
                  role="menuitem"
                  data-testid="editor-command-overflow-lighting"
                  className={menuButtonClass}
                  onClick={() => {
                    setOverflowOpen(false);
                    setLightingSettingsOpen(true);
                  }}
                >
                  Lighting settings
                </button>
              ) : null}
              {overflowSlot ? (
                <div className="mt-1 border-t border-neutral-200 pt-1">
                  {overflowSlot}
                </div>
              ) : null}
              <div className="mt-1 border-t border-neutral-200 pt-1">
                <button
                  type="button"
                  data-testid="beta-feedback-open"
                  className={menuButtonClass}
                  onClick={() => {
                    setOverflowOpen(false);
                    onFeedback();
                  }}
                >
                  Feedback
                </button>
              </div>
            </div>
          )}
        </div>

        <div ref={accountRef} className="relative shrink-0">
          <button
            type="button"
            data-testid="editor-command-account"
            aria-label="Account"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            className={
              dark
                ? "designer-control inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border text-sm font-semibold leading-none sm:w-auto sm:px-3"
                : "inline-flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-neutral-200 bg-white text-sm font-semibold leading-none text-neutral-800 hover:bg-neutral-50 sm:w-auto sm:px-3"
            }
            onClick={() => {
              setAccountOpen((value) => !value);
              setWorkspaceOpen(false);
              setOverflowOpen(false);
            }}
          >
            <UserRound className="h-4 w-4 sm:hidden" aria-hidden="true" />
            <span className="hidden sm:inline">Account</span>
          </button>
          {accountOpen && (
            <div
              data-testid="editor-command-account-menu"
              role="menu"
              className={dark ? menuPanelClass : `${menuPanelClass} w-56`}
            >
              <div
                data-testid="editor-account-plan"
                className={
                  dark
                    ? "designer-work-muted mb-1 rounded-lg px-3 py-2 text-xs font-semibold"
                    : "mb-1 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs font-semibold text-neutral-600"
                }
              >
                {planLabel}
              </div>
              {isAuthed && (canManageBilling ? (
                <button
                  type="button"
                  data-testid="editor-command-manage-billing"
                  className={menuButtonClass}
                  disabled={isOpeningBillingPortal}
                  onClick={() => {
                    setAccountOpen(false);
                    onManageBilling();
                  }}
                >
                  {isOpeningBillingPortal ? "Opening billing…" : "Manage billing"}
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="editor-command-view-plans"
                  className={menuButtonClass}
                  onClick={() => {
                    setAccountOpen(false);
                    onViewPlans();
                  }}
                >
                  View Pro plans
                </button>
              ))}
              {isAuthed ? (
                <button
                  type="button"
                  data-testid="editor-command-sign-out"
                  className={menuButtonClass}
                  onClick={() => {
                    setAccountOpen(false);
                    signOut();
                  }}
                >
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  data-testid="editor-command-sign-in"
                  className={menuButtonClass}
                  onClick={() => {
                    setAccountOpen(false);
                    signInWithReturn();
                  }}
                >
                  Sign in
                </button>
              )}
            </div>
          )}
        </div>
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
