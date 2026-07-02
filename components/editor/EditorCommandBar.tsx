"use client";

import EditorViewToggle, { type EditorViewMode } from "@/components/editor/EditorViewToggle";
import { signIn, signOut } from "next-auth/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

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
  onPlan: () => void;
  onFurnish: () => void;
  onAiDesign: () => void;
  onShop: () => void;
  onExport: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onViewModeChange: (next: EditorViewMode) => void;
  onToggleDesignerMode: () => void;
  onToggleClientPreview: () => void;
  showLoadDesign: boolean;
  onToggleLoadDesign: () => void;
  onSave: () => void | Promise<void>;
  isSaving?: boolean;
  saveStatus: EditorSaveStatus;
  onRetrySaveStatus: () => void | Promise<void>;
  onOpenPresentExport: () => void;
  contextSlot?: ReactNode;
  overflowSlot?: ReactNode;
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
  onPlan,
  onFurnish,
  onAiDesign,
  onShop,
  onExport,
  onUndo,
  onRedo,
  onViewModeChange,
  onToggleDesignerMode,
  onToggleClientPreview,
  showLoadDesign,
  onToggleLoadDesign,
  onSave,
  isSaving = false,
  saveStatus,
  onRetrySaveStatus,
  onOpenPresentExport,
  contextSlot,
  overflowSlot,
}: EditorCommandBarProps) {
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);

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
        "inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold transition-colors",
        active ? "bg-white text-neutral-950 shadow-sm" : "text-neutral-200 hover:bg-white/10",
      ].join(" ");
    }
    return [
      "inline-flex h-9 items-center rounded-xl px-3 text-sm font-semibold transition-colors",
      active ? "bg-neutral-900 text-white shadow-sm" : "text-neutral-700 hover:bg-neutral-100",
    ].join(" ");
  };
  const menuButtonClass = dark
    ? "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-neutral-100 hover:bg-white/10"
    : "flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold text-neutral-800 hover:bg-neutral-100";
  const menuPanelClass = dark
    ? "absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl border border-white/10 bg-[#12151d] p-2 text-neutral-100 shadow-2xl"
    : "absolute right-0 top-[calc(100%+0.5rem)] z-[80] w-64 rounded-2xl border border-neutral-200 bg-white p-2 text-neutral-900 shadow-2xl";
  const signInWithReturn = () => {
    const callbackUrl = typeof window !== "undefined" ? window.location.href : "/";
    signIn("google", { callbackUrl });
  };

  return (
    <div
      data-testid="editor-command-bar"
      className={`absolute left-0 right-0 top-0 z-50 flex h-14 items-center gap-2 overflow-visible border-b px-2 shadow-sm backdrop-blur transition-opacity duration-300 sm:px-4 ${
        dark ? "border-white/10 bg-[#080a0f]/95 text-neutral-100" : "border-neutral-200 bg-white/95 text-neutral-950"
      } ${isClientPreview ? "pointer-events-none opacity-0" : "opacity-100"}`}
    >
      <div className="flex min-w-0 flex-[1.25] items-center gap-1.5">
        <button
          type="button"
          data-testid="command-undo"
          aria-label={undoName ? `Undo ${undoName}` : "Undo"}
          className={
            dark
              ? "h-9 w-9 shrink-0 rounded-xl bg-white/5 text-sm font-semibold text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              : "h-9 w-9 shrink-0 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
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
              ? "h-9 w-9 shrink-0 rounded-xl bg-white/5 text-sm font-semibold text-neutral-200 disabled:cursor-not-allowed disabled:opacity-40"
              : "h-9 w-9 shrink-0 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
          }
          onClick={onRedo}
          disabled={isClientPreview || !canRedo}
          title={redoName ? `Redo "${redoName}" (Cmd/Ctrl+Shift+Z)` : "Redo (Cmd/Ctrl+Shift+Z)"}
        >
          ↷
        </button>

        <div className="shrink-0">
          <EditorViewToggle value={viewMode} onChange={onViewModeChange} dark={dark} />
        </div>

        <div
          className={
            dark
              ? "hidden shrink-0 items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 xl:flex"
              : "hidden shrink-0 items-center gap-1 rounded-2xl border border-neutral-200 bg-white p-1 shadow-sm xl:flex"
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
      </div>

      <div className="pointer-events-none hidden min-w-0 flex-[0.8] items-center justify-center lg:flex xl:flex-[0.95]">
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
        <div
          data-testid="save-status"
          data-status={saveStatus.kind}
          data-source={saveStatus.source}
          title={`${saveStatus.label}: ${saveStatus.detail}`}
          className={`hidden h-9 min-w-0 items-center gap-1.5 rounded-full border px-2 text-xs md:flex ${getSaveStatusClassName(
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
          <span className="hidden min-w-0 max-w-24 truncate font-semibold xl:inline">
            {saveStatus.label}
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
              ? "h-9 shrink-0 rounded-xl bg-white px-3 text-sm font-semibold text-neutral-950 disabled:cursor-wait disabled:opacity-70 sm:px-4"
              : "h-9 shrink-0 rounded-xl bg-neutral-900 px-3 text-sm font-semibold text-white shadow-sm hover:bg-neutral-800 disabled:cursor-wait disabled:opacity-70 sm:px-4"
          }
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "Saving..." : "Save"}
        </button>

        <div ref={overflowRef} className="relative shrink-0">
          <button
            type="button"
            data-testid="editor-command-overflow"
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            className={
              dark
                ? "h-9 rounded-xl border border-white/10 px-3 text-sm font-semibold text-neutral-100 hover:bg-white/10"
                : "h-9 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
            }
            onClick={() => {
              setOverflowOpen((value) => !value);
              setAccountOpen(false);
            }}
          >
            More
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
                  Load
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
              {overflowSlot ? (
                <div className={dark ? "mt-1 border-t border-white/10 pt-1" : "mt-1 border-t border-neutral-200 pt-1"}>
                  {overflowSlot}
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div ref={accountRef} className="relative shrink-0">
          <button
            type="button"
            data-testid="editor-command-account"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            className={
              dark
                ? "h-9 rounded-xl border border-white/10 px-3 text-sm font-semibold text-neutral-100 hover:bg-white/10"
                : "h-9 rounded-xl border border-neutral-200 bg-white px-3 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
            }
            onClick={() => {
              setAccountOpen((value) => !value);
              setOverflowOpen(false);
            }}
          >
            Account
          </button>
          {accountOpen && (
            <div
              data-testid="editor-command-account-menu"
              role="menu"
              className={dark ? menuPanelClass : `${menuPanelClass} w-56`}
            >
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
    </div>
  );
}
