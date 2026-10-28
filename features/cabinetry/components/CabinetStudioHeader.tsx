"use client";

import { Box, Redo2, RotateCcw, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

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

const WORKSPACE_OPTIONS = [
  { value: "guided", label: "Guided setup", testId: "cabinet-experience-guided" },
  { value: "detailed", label: "Detailed editor", testId: "cabinet-experience-detailed" },
] as const;

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
  const chooseOther = (next: CabinetStudioExperience) => {
    if (next !== experience) onChooseExperience(next);
  };
  if (experience === "guided") {
    return (
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-separator bg-surface px-4 py-2 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-control-primary text-control-on-primary shadow-sm">
            <Box className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">Built-ins</h2>
            <p className="truncate text-xs text-label-secondary">Simple to start, powerful when needed.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:block">
            <SegmentedControl label="Editor workspace" size="compact" value="guided" onChange={chooseOther}
              options={isProWorkspace ? WORKSPACE_OPTIONS : WORKSPACE_OPTIONS.slice(0, 1)} />
          </div>
          <div className="flex items-center rounded-xl border border-separator bg-surface p-1">
            <Button
              data-testid="cabinet-undo"
              aria-label="Undo last change"
              title="Undo"
              variant="quiet" size="icon"
              disabled={!canUndo}
              onClick={onUndo}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button
              data-testid="cabinet-redo"
              aria-label="Redo last change"
              title="Redo"
              variant="quiet" size="icon"
              disabled={!canRedo}
              onClick={onRedo}
            >
              <Redo2 className="h-4 w-4" />
            </Button>
            <Button
              data-testid="cabinet-restore-template"
              aria-label="Restore template defaults"
              title="Restore template defaults"
              variant="quiet" size="icon"
              onClick={onRestoreTemplate}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
          <Button
            data-testid="cabinetry-studio-close"
            aria-label="Close built-ins"
            variant="quiet" size="icon"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </header>
    );
  }

  return (
    <div className="flex min-h-14 items-center justify-between border-b border-separator bg-surface px-4">
      <div className="flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-control-primary text-control-on-primary">
          <Box className="h-4 w-4" />
        </div>
        <div>
          <h2 className="text-sm font-semibold">Built-ins</h2>
          <p className="text-xs text-label-secondary">{mode === "edit" ? "Edit a built-in" : "Create a built-in"}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="hidden sm:block">
          <SegmentedControl label="Editor workspace" size="compact" value="detailed" onChange={chooseOther} options={WORKSPACE_OPTIONS} />
        </div>
        <div className="flex items-center rounded-lg border border-separator p-0.5">
          <Button
            data-testid="cabinet-undo"
            aria-label="Undo last change"
            title="Undo"
            variant="quiet" size="icon"
            disabled={!canUndo}
            onClick={onUndo}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            data-testid="cabinet-redo"
            aria-label="Redo last change"
            title="Redo"
            variant="quiet" size="icon"
            disabled={!canRedo}
            onClick={onRedo}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            data-testid="cabinet-restore-template"
            aria-label="Restore template defaults"
            title="Restore template defaults"
            variant="quiet" size="icon"
            onClick={onRestoreTemplate}
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          data-testid="cabinetry-studio-close"
          aria-label="Close built-ins"
          variant="quiet" size="icon"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
