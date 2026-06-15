"use client";

import { AuthButtons } from "@/components/AuthButtons";
import { RoomSwitcher } from "@/components/RoomSwitcher";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { DesignSnapshot } from "@/lib/room-types";

type EditorMode = "design" | "adjust" | "ai" | "buy" | "present";

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
  onOpenPresentExport: () => void;
};

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
    <div className={`absolute left-0 right-0 top-0 z-50 flex h-14 items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-4 shadow-sm backdrop-blur transition-opacity duration-300 ${
      isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
    }`}>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          className={
            dark
              ? "h-9 w-9 rounded-xl bg-[#151820] text-sm text-neutral-200 disabled:opacity-50"
              : "h-9 w-9 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
          }
          onClick={onUndo}
          disabled={isClientPreview || !canUndo}
          title={undoName ? `Undo "${undoName}" (Cmd/Ctrl+Z)` : "Undo (Cmd/Ctrl+Z)"}
        >
          ↶
        </button>
        <button
          type="button"
          className={
            dark
              ? "h-9 w-9 rounded-xl bg-[#151820] text-sm text-neutral-200 disabled:opacity-50"
              : "h-9 w-9 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
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
            ? "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-2xl border border-white/10 bg-[#151820] p-1"
            : "absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-1 shadow-sm"
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
              ? "rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
              : "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          }
          onClick={onToggleDesignerMode}
          title={isDesigner ? "Exit Designer Mode" : "Enter Designer Mode (Pro)"}
        >
          {isDesigner ? "Designer on" : "Pro tools"}
        </button>

        {isDesigner && (
          <button
            data-testid="present-mode"
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
              isClientPreview
                ? "bg-red-600 text-white shadow hover:bg-red-700"
                : "border border-neutral-200 bg-white text-neutral-800 hover:bg-neutral-50"
            }`}
            onClick={onToggleClientPreview}
            title="Toggle Present Mode (P)"
          >
            {isClientPreview ? "Exit preview" : "Preview"}
          </button>
        )}

        {showLoadDesign && (
          <button
            data-testid="load-design"
            className={
              dark
                ? "rounded-xl bg-[#2a3a4a] px-3 py-2 text-sm font-semibold text-white hover:bg-[#3a4a5a]"
                : "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
            }
            onClick={onToggleLoadDesign}
            title="Load a saved design"
          >
            Load
          </button>
        )}

        <button
          data-testid="save-design"
          className={
            dark
              ? "rounded-xl bg-[#1b2030] px-4 py-2 text-sm font-semibold text-white"
              : "rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800"
          }
          onClick={onSave}
        >
          {isAuthed ? "Save" : "Save (Sign in)"}
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
