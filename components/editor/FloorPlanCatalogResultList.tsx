"use client";

import Image from "next/image";
import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";
import type { PlanMeasurementUnit } from "@/lib/design-page-types";
import { formatDisplayArea } from "@/lib/display-units";

import { floorPlanOrientationLabel } from "./FloorPlanSelectionContext";
import { Button } from "@/components/ui/Button";
type ResultGroup = { projectName: string; plans: FloorPlanCatalogSearchResult[] };

type FloorPlanCatalogResultListProps = {
  canEdit: boolean;
  groups: ResultGroup[];
  resultListId?: string;
  testId: string;
  applyingResultId: string | null;
  applyError: { id: string; message: string } | null;
  onUse: (result: FloorPlanCatalogSearchResult, startAsNewDesign: boolean) => void;
  measurementUnit: PlanMeasurementUnit;
};

export default function FloorPlanCatalogResultList({
  canEdit,
  groups,
  resultListId,
  testId,
  applyingResultId,
  applyError,
  onUse,
  measurementUnit,
}: FloorPlanCatalogResultListProps) {
  const subtle = "text-label-secondary";
  return (
    <div id={resultListId} className="mt-2 grid gap-4" data-testid={testId}>
      {groups.map((group) => (
        <section key={group.projectName}>
          <div className={`mb-2 text-xs font-semibold uppercase tracking-wide ${subtle}`}>
            {group.projectName} · {group.plans.length} layout{group.plans.length === 1 ? "" : "s"}
          </div>
          <div className="grid gap-3">
            {group.plans.map((result) => {
              const exactMatch = result.matchLevel === "unit";
              const isApplying = applyingResultId === result.id;
              return (
                <article
                  key={result.id}
                  data-testid={`floor-plan-library-result-${result.layoutId}`}
                  className="ph-no-capture overflow-hidden rounded-lg border border-box-border bg-surface-elevated-secondary shadow-sm" data-surface="floating"
                >
                  <div className="bg-neutral-50">
                    {result.previewUrl ? (
                      <Image
                        src={result.previewUrl}
                        alt={`${result.label} source floor plan`}
                        width={1200}
                        height={800}
                        className="h-40 w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center bg-tile px-6 text-center text-xs font-semibold text-label-secondary">
                        Verified editable floor plan
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{result.label}</div>
                        <div className={`mt-0.5 text-xs ${subtle}`}>
                          {result.flatType}{result.floorAreaSqm ? ` · ${formatDisplayArea(result.floorAreaSqm, measurementUnit)}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {exactMatch ? (
                          <span data-testid="floor-plan-unit-match-badge" className="rounded-full bg-success-tint px-2 py-1 text-xs font-semibold text-on-success-tint">
                            Exact unit match
                          </span>
                        ) : null}
                        <span className="rounded-full bg-success-tint px-2 py-1 text-xs font-semibold text-on-success-tint">
                          {result.verificationTier === "construction_verified" ? "Construction verified" : "Source verified"}
                        </span>
                      </div>
                    </div>
                    <div data-testid={exactMatch ? "floor-plan-unit-match" : undefined} className={`mt-2 text-xs ${subtle}`}>
                      {exactMatch ? "Private address match" : "Published layout"}
                    </div>
                    <p data-testid="floor-plan-orientation" className={`mt-1 text-xs ${subtle}`}>{floorPlanOrientationLabel(result)} Preview shows the published source when available.</p>
                    <p className={`mt-1 text-xs leading-4 ${subtle}`}>{result.verificationNote}</p>
                    <div className="mt-3 grid gap-2">
                      <Button
                        data-testid={`apply-address-floor-plan-${result.layoutId}`}
                        disabled={!canEdit || applyingResultId !== null}
                        aria-busy={isApplying}
                        onClick={() => onUse(result, true)}
                        variant="primary" size="compact"
                      >
                        {isApplying ? "Opening…" : "Start a new design"}
                      </Button>
                      <Button
                        disabled={!canEdit || applyingResultId !== null}
                        onClick={() => onUse(result, false)}
                        variant="secondary" size="compact"
                      >
                        Replace current design…
                      </Button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {result.sourceUrl && result.sourcePage !== null ? (
                        <a href={`${result.sourceUrl.split("#")[0]}#page=${result.sourcePage}`} target="_blank" rel="noreferrer" className="text-xs font-semibold text-link">
                          Source page {result.sourcePage}
                        </a>
                      ) : <span className={`text-xs ${subtle}`}>Published revision</span>}
                    </div>
                    {applyError?.id === result.id ? (
                      <p role="alert" className="mt-2 text-xs text-on-danger-tint">{applyError.message}</p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {groups[0]?.plans[0] ? <p className={`text-xs leading-4 ${subtle}`}>{groups[0].plans[0].accuracyNotice}</p> : null}
    </div>
  );
}
