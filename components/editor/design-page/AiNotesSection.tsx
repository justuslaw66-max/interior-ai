"use client";

import { Button } from "@/components/ui/Button";

export type AiNotesSectionProps = {
  loading: boolean;
  /** The room has products, or a floor or wall from the tile catalogue (18 Oct 2026). */
  canGenerate: boolean;
  onGenerate: () => void;
};

/**
 * AI notes on the active room, for Pro, at the foot of Suggest a layout (J, 5 Oct): a summary, the
 * reasoning and suggestions to apply, in the AI notes dialog. They used to sit in Present & export.
 */
export function AiNotesSection({ loading, canGenerate, onGenerate }: AiNotesSectionProps) {
  return (
    <section aria-labelledby="ai-notes-heading" data-testid="ai-notes-section" className="space-y-2 rounded-xl border border-neutral-200 bg-white p-3">
      <h3 id="ai-notes-heading" className="text-sm font-semibold text-neutral-900">
        AI notes
      </h3>
      <p className="text-xs text-neutral-600">A summary of this room&apos;s layout and finishes, why it works, and suggestions you can apply.</p>
      <Button data-testid="ai-notes-generate" className="w-full" disabled={loading || !canGenerate} onClick={onGenerate}>
        {loading ? "Generating…" : "Get AI notes"}
      </Button>
      {canGenerate ? null : <p className="text-xs text-neutral-600">Add products or a floor or wall finish to the room first.</p>}
    </section>
  );
}
