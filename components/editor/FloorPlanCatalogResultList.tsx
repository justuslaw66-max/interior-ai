"use client";

import Image from "next/image";
import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";

type ResultGroup = { projectName: string; plans: FloorPlanCatalogSearchResult[] };

type FloorPlanCatalogResultListProps = {
  dark: boolean;
  canEdit: boolean;
  groups: ResultGroup[];
  resultListId?: string;
  testId: string;
  applyingResultId: string | null;
  applyError: { id: string; message: string } | null;
  onUse: (result: FloorPlanCatalogSearchResult, startAsNewDesign: boolean) => void;
};

export default function FloorPlanCatalogResultList({
  dark,
  canEdit,
  groups,
  resultListId,
  testId,
  applyingResultId,
  applyError,
  onUse,
}: FloorPlanCatalogResultListProps) {
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";
  return (
    <div id={resultListId} className="mt-2 grid gap-4" data-testid={testId}>
      {groups.map((group) => (
        <section key={group.projectName}>
          <div className={`mb-2 text-[11px] font-semibold uppercase tracking-wide ${subtle}`}>
            {group.projectName} · {group.plans.length} layout{group.plans.length === 1 ? "" : "s"}
          </div>
          <div className="grid gap-3">
            {group.plans.map((result) => {
              const unitMatch = result.unitMatches[0] ?? null;
              const isApplying = applyingResultId === result.id;
              const verificationBadge = result.verificationTier === "construction_verified"
                ? "Construction verified"
                : "Source verified";
              return (
                <article
                  key={result.id}
                  data-testid={`floor-plan-library-result-${result.layoutId}`}
                  className={dark
                    ? "designer-control overflow-hidden rounded-lg border border-white/10"
                    : "overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm"}
                >
                  <div className={dark ? "bg-white" : "bg-neutral-50"}>
                    {result.previewUrl ? (
                      <Image
                        src={result.previewUrl}
                        alt={`${result.label} source floor plan`}
                        width={1200}
                        height={800}
                        className="h-40 w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-28 items-center justify-center bg-neutral-100 px-6 text-center text-xs font-semibold text-neutral-500">
                        Verified editable floor plan
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold">{result.label}</div>
                        <div className={`mt-0.5 text-[11px] ${subtle}`}>
                          {result.flatType}{result.floorAreaSqm ? ` · ${result.floorAreaSqm} m²` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1">
                        {unitMatch ? (
                          <span data-testid="floor-plan-unit-match-badge" className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">
                            Exact unit
                          </span>
                        ) : null}
                        <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800">
                          {verificationBadge}
                        </span>
                      </div>
                    </div>
                    <div data-testid={unitMatch ? "floor-plan-unit-match" : undefined} className={`mt-2 text-[11px] ${subtle}`}>
                      {unitMatch
                        ? `Block ${unitMatch.block} · ${unitMatch.label}`
                        : `Blocks ${result.matchedBlocks.join(", ")}`}
                    </div>
                    <p className={`mt-1 text-[11px] leading-4 ${subtle}`}>{result.verificationNote}</p>
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        data-testid={`apply-address-floor-plan-${result.layoutId}`}
                        disabled={!canEdit || applyingResultId !== null}
                        aria-busy={isApplying}
                        onClick={() => onUse(result, true)}
                        className={dark
                          ? "rounded-md bg-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-200 disabled:opacity-50"
                          : "rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"}
                      >
                        {isApplying ? "Opening…" : "Start a new design"}
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || applyingResultId !== null}
                        onClick={() => onUse(result, false)}
                        className={dark
                          ? "designer-control rounded-md border px-3 py-1.5 text-[11px] font-semibold disabled:opacity-50"
                          : "rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-neutral-600 hover:bg-neutral-50 disabled:opacity-50"}
                      >
                        Replace current plan…
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3">
                      {result.sourceUrl && result.sourcePage !== null ? (
                        <a href={`${result.sourceUrl.split("#")[0]}#page=${result.sourcePage}`} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-blue-700">
                          Source page {result.sourcePage}
                        </a>
                      ) : <span className={`text-[10px] ${subtle}`}>Published revision</span>}
                      {unitMatch?.sourceUrl ? (
                        <a href={`${unitMatch.sourceUrl.split("#")[0]}#page=${unitMatch.sourcePdfPage}`} target="_blank" rel="noreferrer" className="text-[10px] font-semibold text-blue-700">
                          Unit evidence
                        </a>
                      ) : null}
                    </div>
                    {applyError?.id === result.id ? (
                      <p role="alert" className="mt-2 text-[11px] text-red-700">{applyError.message}</p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {groups[0]?.plans[0] ? (
        <p className={`text-[10px] leading-4 ${subtle}`}>{groups[0].plans[0].accuracyNotice}</p>
      ) : null}
    </div>
  );
}
