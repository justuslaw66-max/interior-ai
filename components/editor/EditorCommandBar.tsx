"use client";

import { AuthButtons } from "@/components/AuthButtons";
import { RoomSwitcher } from "@/components/RoomSwitcher";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { DesignSnapshot } from "@/lib/room-types";

type EditorMode = "design" | "adjust" | "ai" | "buy" | "present";

export type EditorSaveStatus = {
  kind: string;
  source: string;
  label: string;
  detail: string;
  tone: "error" | "saving" | "saved" | "pending";
  canRetry: boolean;
};

type EditorCommandBarProps = {
  isClientPreview: boolean;
  dark?: boolean;
  aiDesignEnabled?: boolean;
  editorMode: EditorMode;
  viewMode: EditorViewMode;
  isDesigner: boolean;
  isAuthed: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  designSnapshot: DesignSnapshot;
  onPlan: () => void;
  onFurnish: () => void;
  onAiDesign: () => void;
  onShop: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onViewModeChange: (next: EditorViewMode) => void;
  onSwitchRoom: (roomId: string) => void;
  onAddDesignerRoom: () => void;
  onRenameRoom: (roomId: string, nextName: string) => void;
  onToggleDesignerMode: () => void;
  onToggleClientPreview: () => void;
  showLoadDesign: boolean;
  onToggleLoadDesign: () => void;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  saveStatus: EditorSaveStatus;
  onRetrySaveStatus: () => void | Promise<void>;
  onOpenPresentExport: () => void;
};

function getSaveStatusClassName(tone: EditorSaveStatus["tone"], dark: boolean) {
  if (dark) {
    if (tone === "error") return "border-red-400/40 bg-red-500/10 text-red-100";
    if (tone === "saving") return "border-sky-400/40 bg-sky-500/10 text-sky-100";
    if (tone === "saved") return "border-emerald-400/40 bg-emerald-500/10 text-emerald-100";
    return "border-white/10 bg-white/5 text-neutral-200";
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
  canUndo,
  canRedo,
  undoName,
  redoName,
  designSnapshot,
  onPlan,
  onFurnish,
  onAiDesign,
  onShop,
  onExport,
  onUndo,
  onRedo,
  onViewModeChange,
  onSwitchRoom,
  onAddDesignerRoom,
  onRenameRoom,
  onToggleDesignerMode,
  onToggleClientPreview,
  showLoadDesign,
  onToggleLoadDesign,
  onSave,
  isSaving = false,
  saveStatus,
  onRetrySaveStatus,
  onOpenPresentExport,
}: EditorCommandBarProps) {
  const disabled = editorMode === "present" || isClientPreview;
  const workflowSteps: Array<{
    mode: EditorMode;
    label: string;
    testId: string;
    onClick: () => void;
  }> = [
    { mode: "design", label: "Plan", testId: "editor-workflow-plan", onClick: onPlan },
    { mode: "adjust", label: "Furnish", testId: "editor-workflow-furnish", onClick: onFurnish },
    ...(aiDesignEnabled
      ? [{ mode: "ai" as const, label: "AI Design", testId: "editor-workflow-ai", onClick: onAiDesign }]
      : []),
    { mode: "buy", label: "Shop", testId: "editor-workflow-shop", onClick: onShop },
    { mode: "present", label: "Export", testId: "editor-workflow-export", onClick: onExport },
  ];
  const workflowButtonClass = (active: boolean) => {
    if (dark) {
      return [
        "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
        active ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-200 hover:bg-white/10",
      ].join(" ");
    }
    return [
      "rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
      active ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-700 hover:bg-neutral-100",
    ].join(" ");
  };

  return (
    <div data-testid="editor-command-bar" className={`absolute left-0 right-0 top-0 z-50 flex h-14 items-center justify-between gap-2 overflow-hidden border-b border-neutral-200 bg-white/95 px-2 shadow-sm backdrop-blur transition-opacity duration-300 sm:gap-3 sm:px-4 ${
      isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
    }`}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          data-testid="command-undo"
          aria-label={undoName ? `Undo ${undoName}` : "Undo"}
          className={
            dark
              ? "h-10 w-10 shrink-0 rounded-xl bg-[#151820] text-base font-semibold text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              : "h-10 w-10 shrink-0 rounded-xl border border-neutral-200 bg-white text-base font-semibold text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
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
              ? "h-10 w-10 shrink-0 rounded-xl bg-[#151820] text-base font-semibold text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              : "h-10 w-10 shrink-0 rounded-xl border border-neutral-200 bg-white text-base font-semibold text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          }
          onClick={onRedo}
          disabled={isClientPreview || !canRedo}
          title={redoName ? `Redo "${redoName}" (Cmd/Ctrl+Shift+Z)` : "Redo (Cmd/Ctrl+Shift+Z)"}
        >
          ↷
        </button>

        <div className="shrink-0">
          <EditorViewToggle
            value={viewMode}
            onChange={onViewModeChange}
            dark={dark}
          />
        </div>

        {isDesigner && (
          <div className="hidden min-w-0 2xl:block">
            <RoomSwitcher
              snapshot={designSnapshot}
              onSwitchRoom={onSwitchRoom}
              onAddRoom={onAddDesignerRoom}
              onRenameRoom={onRenameRoom}
              disabled={disabled}
            />
          </div>
        )}
      </div>

      <div
        className={
          dark
            ? "absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-[#151820] p-1 md:flex"
            : "absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-1 shadow-sm md:flex"
        }
        aria-label="Design workflow"
      >
        {workflowSteps.map((step) => (
          <button
            key={step.mode}
            type="button"
            data-testid={step.testId}
            data-active={editorMode === step.mode ? "true" : "false"}
            aria-pressed={editorMode === step.mode}
            className={workflowButtonClass(editorMode === step.mode)}
            onClick={step.onClick}
          >
            {step.label}
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <AuthButtons isAuthed={isAuthed} />

        <button
          data-testid="designer-mode-toggle"
          className={
            isDesigner
              ? "hidden h-10 w-40 shrink-0 items-center justify-center rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 sm:inline-flex"
              : "hidden h-10 w-40 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 sm:inline-flex"
          }
          onClick={onToggleDesignerMode}
          title={isDesigner ? "Exit Pro tools" : "Enter Pro tools"}
        >
          {isDesigner ? "Exit Pro tools" : "Pro tools"}
        </button>

        <div className="hidden h-10 w-28 shrink-0 sm:block">
          {isDesigner ? (
            <button
              data-testid="present-mode"
              className={`h-10 w-full rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                isClientPreview
                  ? "bg-red-600 text-white shadow hover:bg-red-700"
                  : "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
              }`}
              onClick={onToggleClientPreview}
              title="Toggle Present Mode (P)"
            >
              {isClientPreview ? "Exit preview" : "Preview"}
            </button>
          ) : (
            <span className="block h-10 w-full" aria-hidden="true" />
          )}
        </div>

        {showLoadDesign && (
          <button
            data-testid="load-design"
            className={
              dark
                ? "hidden rounded-xl bg-[#2a3a4a] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3a4a5a] sm:inline-flex"
                : "hidden rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 sm:inline-flex"
            }
            onClick={onToggleLoadDesign}
            title="Load a saved design"
          >
            Load
          </button>
        )}

        <div
          data-testid="save-status"
          data-status={saveStatus.kind}
          data-source={saveStatus.source}
          title={`${saveStatus.label}: ${saveStatus.detail}`}
          className={`hidden min-w-0 max-w-[240px] items-center gap-2 rounded-full border px-3 py-1.5 text-xs shadow-sm lg:flex ${getSaveStatusClassName(
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
          <span className="min-w-0 truncate font-semibold">
            {saveStatus.label}
            <span className="font-normal opacity-75"> · {saveStatus.detail}</span>
          </span>
          {saveStatus.canRetry ? (
            <button
              type="button"
              data-testid="save-status-retry"
              className={
                dark
                  ? "shrink-0 rounded-full border border-white/20 px-2 py-0.5 font-semibold text-white hover:bg-white/10"
                  : "shrink-0 rounded-full border border-current/20 bg-white/70 px-2 py-0.5 font-semibold hover:bg-white"
              }
              onClick={onRetrySaveStatus}
            >
              Retry
            </button>
          ) : null}
        </div>

        <button
          data-testid="save-design"
          className={
            dark
              ? "shrink-0 rounded-xl bg-[#1b2030] px-3 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-70 sm:px-4"
              : "shrink-0 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-70 sm:px-4"
          }
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? (
            "Saving..."
          ) : isAuthed ? (
            "Save"
          ) : (
            <>
              <span className="hidden sm:inline">Save (Sign in)</span>
              <span className="sm:hidden">Save</span>
            </>
          )}
        </button>

        {editorMode === "present" && (
          <button
            className={
              dark
                ? "rounded-xl bg-[#151820] px-3 py-2 text-sm text-neutral-200"
                : "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 hover:bg-neutral-50"
            }
            onClick={onOpenPresentExport}
          >
            Export & Camera
          </button>
        )}
      </div>
    </div>
  );
}
