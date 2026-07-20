"use client";

import { Box, Redo2, RotateCcw, Undo2, X } from "lucide-react";

import type { CabinetStudioExperience } from "../studioOnboarding";
import type { CabinetryStudioProps } from "./CabinetryStudio.contract";

export interface CabinetStudioHeaderProps {
  experience: CabinetStudioExperience;
  isProWorkspace: boolean;
  mode: CabinetryStudioProps["mode"];
  canUndo: boolean;
  canRedo: boolean;
  onChooseExperience: (experience: CabinetStudioExperience) => void;
  onUndo: () => void;
  onRedo: () => void;
  onRestoreTemplate: () => void;
  onClose?: () => void;
}

export function CabinetStudioHeader({
  experience,
  isProWorkspace,
  mode,
  canUndo,
  canRedo,
  onChooseExperience,
  onUndo,
  onRedo,
  onRestoreTemplate,
  onClose,
}: CabinetStudioHeaderProps) {
  if (experience === "guided") {
    return (
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-neutral-950 text-white shadow-sm">
            <Box className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Custom Millwork Studio</h2>
            <p className="truncate text-xs text-neutral-500">Simple to start, powerful when needed.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div role="group" className="hidden items-center rounded-xl bg-neutral-100 p-1 sm:flex" aria-label="Editor workspace">
            <button
              type="button"
              data-testid="cabinet-experience-guided"
              aria-pressed="true"
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-neutral-950 shadow-sm"
            >
              Guided setup
            </button>
            {isProWorkspace ? (
              <button
                type="button"
                data-testid="cabinet-experience-detailed"
                aria-pressed="false"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-950"
                onClick={() => onChooseExperience("detailed")}
              >
                Detailed editor
              </button>
            ) : null}
          </div>
          <div className="flex items-center rounded-xl border border-neutral-200 bg-white p-1">
            <button
              type="button"
              data-testid="cabinet-undo"
              aria-label="Undo last millwork change"
              title="Undo"
              className="grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-testid="cabinet-redo"
              aria-label="Redo last millwork change"
              title="Redo"
              className="grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Redo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              data-testid="cabinet-restore-template"
              aria-label="Restore template defaults"
              title="Restore template defaults"
              className="grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100"
              onClick={onRestoreTemplate}
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            data-testid="cabinetry-studio-close"
            aria-label="Close cabinetry studio"
            className="grid h-9 w-9 place-items-center rounded-xl text-neutral-600 hover:bg-neutral-100"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>
    );
  }

  return (
    <div className="flex min-h-14 items-center justify-between border-b border-neutral-200 bg-white px-4">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-neutral-900 text-white">
          <Box className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Custom Millwork Studio</h2>
          <p className="text-xs text-neutral-500">{mode === "edit" ? "Edit custom cabinetry" : "Create custom cabinetry"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div role="group" className="hidden items-center rounded-lg bg-neutral-100 p-1 sm:flex" aria-label="Editor workspace">
          <button
            type="button"
            data-testid="cabinet-experience-guided"
            aria-pressed="false"
            className="rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 hover:text-neutral-950"
            onClick={() => onChooseExperience("guided")}
          >
            Guided setup
          </button>
          <button
            type="button"
            data-testid="cabinet-experience-detailed"
            aria-pressed="true"
            className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-neutral-950 shadow-sm"
          >
            Detailed editor
          </button>
        </div>
        <div className="flex items-center rounded-lg border border-neutral-200 p-0.5">
          <button
            type="button"
            data-testid="cabinet-undo"
            aria-label="Undo last millwork change"
            title="Undo"
            className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            data-testid="cabinet-redo"
            aria-label="Redo last millwork change"
            title="Redo"
            className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-30"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            data-testid="cabinet-restore-template"
            aria-label="Restore template defaults"
            title="Restore template defaults"
            className="grid h-7 w-7 place-items-center rounded-md text-neutral-600 hover:bg-neutral-100"
            onClick={onRestoreTemplate}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
        <button
          type="button"
          data-testid="cabinetry-studio-close"
          aria-label="Close cabinetry studio"
          className="grid h-8 w-8 place-items-center rounded-lg text-neutral-600 hover:bg-neutral-100"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
