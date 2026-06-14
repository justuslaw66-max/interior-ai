"use client";

import { AuthButtons } from "@/components/AuthButtons";
import { RoomSwitcher } from "@/components/RoomSwitcher";
import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { DesignSnapshot } from "@/lib/room-types";

type EditorMode = "design" | "adjust" | "buy" | "present";

type EditorCommandBarProps = {
  isClientPreview: boolean;
  dark?: boolean;
  editorMode: EditorMode;
  viewMode: EditorViewMode;
  isDesigner: boolean;
  isAuthed: boolean;
  canUndo: boolean;
  canRedo: boolean;
  undoName: string | null;
  redoName: string | null;
  designSnapshot: DesignSnapshot;
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
  editorMode,
  viewMode,
  isDesigner,
  isAuthed,
  canUndo,
  canRedo,
  undoName,
  redoName,
  designSnapshot,
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

  return (
    <div className={`absolute left-0 right-0 top-0 z-50 flex h-16 items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-3 shadow-sm backdrop-blur transition-opacity duration-300 ${
      isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"
    }`}>
      <div className="flex min-w-0 items-center gap-2">
        <button
          type="button"
          className={
            dark
              ? "h-10 w-10 rounded-xl bg-[#151820] text-sm text-neutral-200 disabled:opacity-50"
              : "h-10 w-10 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
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
              ? "h-10 w-10 rounded-xl bg-[#151820] text-sm text-neutral-200 disabled:opacity-50"
              : "h-10 w-10 rounded-xl border border-neutral-200 bg-white text-sm text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
          }
          onClick={onRedo}
          disabled={isClientPreview || !canRedo}
          title={redoName ? `Redo "${redoName}" (Cmd/Ctrl+Shift+Z)` : "Redo (Cmd/Ctrl+Shift+Z)"}
        >
          ↷
        </button>
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        <div className="shrink-0">
          <EditorViewToggle
            value={viewMode}
            onChange={onViewModeChange}
            dark={dark}
          />
        </div>

        <RoomSwitcher
          snapshot={designSnapshot}
          onSwitchRoom={onSwitchRoom}
          onAddRoom={isDesigner ? onAddDesignerRoom : undefined}
          onRenameRoom={onRenameRoom}
          disabled={disabled}
        />
      </div>

      <div className="flex shrink-0 items-center gap-2">
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
          {isDesigner ? "Designer on" : "Designer"}
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
                : "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
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
              : "rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
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
