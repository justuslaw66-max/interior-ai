"use client";

import type { ReactNode } from "react";
import type { PresentExportDialogProps } from "@/components/editor/design-page/PresentExportDialog";
import { AiNotesSection } from "@/components/editor/design-page/AiNotesSection";
import { LayoutVersionsSection } from "@/components/editor/design-page/LayoutVersionsSection";
import { planStepFooter } from "@/components/editor/design-page/PlanDisplaySection";

type StepTools = PresentExportDialogProps | null | undefined;

/**
 * Layout versions of the active room, for Pro, above Furnish's own foot (the room's total and
 * Continue to Shop), on phones too (J, 5 Oct). They used to sit in Present & export.
 */
export function furnishStepFooter(step: string | undefined, tools: StepTools) {
  if (!tools || step !== "furnish" || !tools.configuration.canUseAdvancedPlanControls) return null;
  return (
    <LayoutVersionsSection
      activeRoom={tools.state.activeRoom}
      nameInput={tools.state.layoutVersionNameInput}
      onNameChange={tools.actions.onLayoutVersionNameChange}
      onSave={tools.actions.onSaveLayoutVersion}
      onRestore={tools.actions.onRestoreLayoutVersion}
      onDelete={tools.actions.onDeleteLayoutVersion}
    />
  );
}

/** AI notes on the active room, for Pro, at the foot of Suggest a layout (J, 5 Oct). */
export function aiStepFooter(step: string | undefined, tools: StepTools) {
  if (!tools || step !== "ai" || !tools.configuration.canUseAdvancedExportStyles) return null;
  return <AiNotesSection loading={tools.state.aiNotesLoading} hasItems={tools.state.hasItems} onGenerate={tools.actions.onGenerateAiNotes} />;
}

/** What the region adds to the step panel: a section at the foot of the step, and Furnish's above its own foot. */
export function stepPanelFooters(step: string | undefined, tools: StepTools): { stepFooter: ReactNode; furnishFooter: ReactNode } {
  return { stepFooter: planStepFooter(step, tools) ?? aiStepFooter(step, tools), furnishFooter: furnishStepFooter(step, tools) };
}
