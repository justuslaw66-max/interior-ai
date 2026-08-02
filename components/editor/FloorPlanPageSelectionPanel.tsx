"use client";

import type { FloorPlanPageCandidate } from "@/lib/floor-plan-imports/types";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";

type FloorPlanPageSelectionPanelProps = {
  job: Pick<ConsumerFloorPlanImportJob, "id" | "renderedPagesJson">;
  candidates: FloorPlanPageCandidate[];
  selectedPageNumber: number | null;
  onSelectedPageNumberChange: (pageNumber: number) => void;
  onConfirm: () => void;
  submitting?: boolean;
  disabled?: boolean;
  dark?: boolean;
};

export default function FloorPlanPageSelectionPanel({
  job,
  candidates,
  selectedPageNumber,
  onSelectedPageNumberChange,
  onConfirm,
  submitting = false,
  disabled = false,
  dark = false,
}: FloorPlanPageSelectionPanelProps) {
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";

  return (
    <section data-testid="floor-plan-page-selection">
      <div className="text-xs font-semibold">Choose the floor-plan page</div>
      <p className={`mt-1 text-xs leading-4 ${subtle}`}>
        We ranked the pages using architectural linework, room labels, and
        printed dimensions. Confirm one page before geometry is created.
      </p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {candidates.map((candidate) => {
          const rendered = job.renderedPagesJson.find(
            (page) => page.pageNumber === candidate.pageNumber
          );
          const selected = selectedPageNumber === candidate.pageNumber;
          return (
            <button
              key={candidate.pageNumber}
              type="button"
              data-testid={`floor-plan-page-candidate-${candidate.pageNumber}`}
              aria-pressed={selected}
              className={[
                "overflow-hidden rounded-lg border text-left transition disabled:opacity-50",
                selected
                  ? "border-emerald-500 ring-2 ring-emerald-500/25"
                  : dark
                    ? "border-white/10"
                    : "border-neutral-200 hover:border-neutral-400",
              ].join(" ")}
              disabled={disabled || submitting}
              onClick={() =>
                onSelectedPageNumberChange(candidate.pageNumber)
              }
            >
              {rendered ? (
                // This owner-scoped route verifies both the job and asset IDs.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={`Floor-plan candidate page ${candidate.pageNumber}`}
                  className="aspect-[4/3] w-full bg-white object-contain"
                  src={`/api/floor-plan-imports/${encodeURIComponent(
                    job.id
                  )}/assets/${encodeURIComponent(rendered.assetKey)}`}
                />
              ) : null}
              <div className="p-2">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                  <span>Page {candidate.pageNumber}</span>
                  <span
                    className={
                      candidate.rank === 1
                        ? "text-emerald-600"
                        : subtle
                    }
                  >
                    {candidate.rank === 1
                      ? "Best match"
                      : `Rank ${candidate.rank}`}
                  </span>
                </div>
                <div className={`mt-1 text-[10px] leading-4 ${subtle}`}>
                  {candidate.roomLabelCount} room labels ·{" "}
                  {candidate.dimensionLabelCount} dimensions ·{" "}
                  {candidate.openingSymbolCount} openings
                </div>
              </div>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        disabled={
          disabled ||
          submitting ||
          selectedPageNumber === null
        }
        onClick={onConfirm}
      >
        {submitting ? "Analyzing selected page…" : "Use this page"}
      </button>
    </section>
  );
}
