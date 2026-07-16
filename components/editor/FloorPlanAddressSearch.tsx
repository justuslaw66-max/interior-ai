"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { HousePlanTemplate } from "@/lib/design-page-house-plan";
import type {
  FloorPlanLibrarySearchResult,
  FloorPlanLibraryUnitQuery,
} from "@/lib/floor-plan-address-search";

type FloorPlanAddressSearchProps = {
  dark?: boolean;
  canEdit: boolean;
  onApplyPlanTemplate: (template: HousePlanTemplate) => void;
};

type FloorPlanSearchResponse = {
  query: string;
  unitQuery: FloorPlanLibraryUnitQuery | null;
  count: number;
  results: FloorPlanLibrarySearchResult[];
  error?: string;
};

export default function FloorPlanAddressSearch({
  dark = false,
  canEdit,
  onApplyPlanTemplate,
}: FloorPlanAddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FloorPlanLibrarySearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [searchedUnit, setSearchedUnit] = useState<FloorPlanLibraryUnitQuery | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseResults, setBrowseResults] = useState<FloorPlanLibrarySearchResult[]>([]);
  const [browseStatus, setBrowseStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [browseErrorMessage, setBrowseErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    const loadBrowseLibrary = async () => {
      try {
        const response = await fetch("/api/floor-plans?browse=1&limit=50", {
          signal: controller.signal,
        });
        const payload = (await response.json()) as FloorPlanSearchResponse;
        if (!response.ok) throw new Error(payload.error || "Floor-plan library failed to load.");
        setBrowseResults(payload.results);
        setBrowseStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setBrowseResults([]);
        setBrowseStatus("error");
        setBrowseErrorMessage(
          error instanceof Error ? error.message : "Floor-plan library failed to load."
        );
      }
    };

    void loadBrowseLibrary();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length < 2) {
      setResults([]);
      setStatus("idle");
      setErrorMessage("");
      setSearchedUnit(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      setErrorMessage("");
      try {
        const response = await fetch(
          `/api/floor-plans?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal }
        );
        const payload = (await response.json()) as FloorPlanSearchResponse;
        if (!response.ok) throw new Error(payload.error || "Floor-plan search failed.");
        setResults(payload.results);
        setSearchedUnit(payload.unitQuery);
        setStatus("ready");
      } catch (error) {
        if (controller.signal.aborted) return;
        setResults([]);
        setSearchedUnit(null);
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : "Floor-plan search failed.");
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const surfaceClass = dark
    ? "designer-recessed rounded-xl border border-white/10 p-3"
    : "rounded-xl border border-blue-100 bg-blue-50/70 p-3";
  const inputClass = dark
    ? "designer-control mt-2 w-full rounded-lg border px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-500"
    : "mt-2 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  const subtleClass = dark ? "text-neutral-400" : "text-neutral-600";
  const hasSearchQuery = query.trim().length >= 2;
  const exactUnitMatch = results[0]?.unitMatches[0] ?? null;
  const visibleResults = hasSearchQuery
    ? results
    : browseOpen
      ? browseResults
      : [];
  const browseAddressSummary = browseResults[0]?.addressLabel ??
    "Browse every floor plan added to the address library.";

  return (
    <section className={surfaceClass} data-testid="floor-plan-address-library">
      <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
        Find your home by address
      </div>
      <p className={`mt-1 text-xs ${subtleClass}`}>
        Search a block or street, or browse every imported plan below. Include
        #floor-stack for an exact unit match.
      </p>
      <label className="sr-only" htmlFor="floor-plan-address-search">
        Search floor plans by address
      </label>
      <input
        id="floor-plan-address-search"
        data-testid="floor-plan-address-search"
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          if (event.target.value.trim()) setBrowseOpen(false);
        }}
        placeholder="Try 810A Chai Chee St #12-509"
        autoComplete="street-address"
        className={inputClass}
      />

      <button
        type="button"
        data-testid="floor-plan-library-browse-toggle"
        aria-expanded={browseOpen}
        aria-controls="floor-plan-library-browse-results"
        onClick={() => {
          setQuery("");
          setBrowseOpen((current) => !current);
        }}
        className={
          dark
            ? "designer-control mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2.5 text-left"
            : "mt-3 flex w-full items-center justify-between gap-3 rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-left shadow-sm hover:border-blue-300 hover:bg-blue-50"
        }
      >
        <span className="min-w-0">
          <span className={dark ? "block text-xs font-semibold text-neutral-100" : "block text-xs font-semibold text-neutral-900"}>
            Browse imported floor plans
          </span>
          <span className={`mt-0.5 block truncate text-[10px] ${subtleClass}`}>
            {browseAddressSummary}
          </span>
        </span>
        <span className={dark ? "shrink-0 text-[11px] font-semibold text-blue-200" : "shrink-0 text-[11px] font-semibold text-blue-700"}>
          {browseStatus === "loading"
            ? "Loading..."
            : browseStatus === "error"
              ? "Unavailable"
              : `${browseResults.length} plan${browseResults.length === 1 ? "" : "s"}`}
          <span aria-hidden="true" className="ml-1">
            {browseOpen ? "−" : "+"}
          </span>
        </span>
      </button>

      <div className={`mt-2 min-h-5 text-xs ${subtleClass}`} aria-live="polite">
        {hasSearchQuery && status === "loading" && "Searching floor plans..."}
        {hasSearchQuery && status === "error" && errorMessage}
        {hasSearchQuery && status === "ready" && results.length === 0 &&
          (searchedUnit
            ? `No mapped floor plan found for ${searchedUnit.label} at that address.`
            : "No floor plans found for that address yet.")}
        {hasSearchQuery && status === "ready" && results.length > 0 && (
          <span data-testid="floor-plan-address-result-count">
            {results.length} editable layout{results.length === 1 ? "" : "s"} found
            {exactUnitMatch
              ? ` for Block ${exactUnitMatch.block} ${exactUnitMatch.label}`
              : ""}
          </span>
        )}
        {!hasSearchQuery && browseOpen && browseStatus === "loading" &&
          "Loading imported floor plans..."}
        {!hasSearchQuery && browseOpen && browseStatus === "error" &&
          browseErrorMessage}
        {!hasSearchQuery && browseOpen && browseStatus === "ready" && (
          <span data-testid="floor-plan-library-browse-result-count">
            {browseResults.length} imported editable layout
            {browseResults.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {visibleResults.length > 0 && (
        <div
          id={hasSearchQuery ? undefined : "floor-plan-library-browse-results"}
          className="mt-2 grid gap-3"
          data-testid={
            hasSearchQuery
              ? "floor-plan-address-results"
              : "floor-plan-library-browse-results"
          }
        >
          {visibleResults.map((result) => {
            const unitMatch = result.unitMatches[0] ?? null;
            return (
            <article
              key={result.id}
              data-testid={`floor-plan-library-result-${result.layoutId}`}
              className={
                dark
                  ? "designer-control overflow-hidden rounded-lg border border-white/10"
                  : "overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm"
              }
            >
              <div className={dark ? "bg-white" : "bg-neutral-50"}>
                <Image
                  src={result.previewUrl}
                  alt={`${result.label} source floor plan`}
                  width={1200}
                  height={800}
                  className="h-40 w-full object-contain"
                />
              </div>
              <div className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className={dark ? "text-sm font-semibold text-neutral-100" : "text-sm font-semibold text-neutral-900"}>
                      {result.label}
                    </div>
                    <div className={`mt-0.5 text-[11px] ${subtleClass}`}>
                      {result.projectName} · {result.flatType}
                      {result.floorAreaSqm ? ` · ${result.floorAreaSqm} m2` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-1">
                    {unitMatch && (
                      <span
                        data-testid="floor-plan-unit-match-badge"
                        className={dark ? "rounded-full bg-emerald-300/15 px-2 py-1 text-[10px] font-semibold text-emerald-100" : "rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800"}
                      >
                        {unitMatch.distributionStatus === "verified"
                          ? "HDB unit match"
                          : "Unit mapped"}
                      </span>
                    )}
                    <span className={dark ? "rounded-full bg-amber-400/15 px-2 py-1 text-[10px] font-semibold text-amber-100" : "rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800"}>
                      Approximate plan
                    </span>
                  </div>
                </div>
                <div
                  data-testid={unitMatch ? "floor-plan-unit-match" : undefined}
                  className={`mt-2 text-[11px] ${subtleClass}`}
                >
                  {unitMatch
                    ? `Exact unit: Block ${unitMatch.block} · ${unitMatch.label}`
                    : `Match: ${result.matchedBlocks
                        .map((block) => `Block ${block}`)
                        .join(", ")}`}
                </div>
                {unitMatch?.sourceUrl && (
                  <a
                    href={`${unitMatch.sourceUrl.split("#")[0]}#page=${unitMatch.sourcePdfPage}`}
                    target="_blank"
                    rel="noreferrer"
                    title={unitMatch.sourceTitle ?? undefined}
                    className={dark ? "mt-1 inline-block text-[10px] font-semibold text-blue-300 hover:text-blue-200" : "mt-1 inline-block text-[10px] font-semibold text-blue-700 hover:text-blue-800"}
                  >
                    HDB unit distribution, brochure p. {unitMatch.sourceBrochurePage}
                  </a>
                )}
                <p className={`mt-1 text-[11px] leading-4 ${subtleClass}`}>
                  {result.verificationNote}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <a
                    href={`${result.sourceUrl.split("#")[0]}#page=${result.sourcePage}`}
                    target="_blank"
                    rel="noreferrer"
                    className={dark ? "text-[11px] font-semibold text-blue-300 hover:text-blue-200" : "text-[11px] font-semibold text-blue-700 hover:text-blue-800"}
                  >
                    Source PDF, page {result.sourcePage}
                  </a>
                  <button
                    type="button"
                    data-testid={`apply-address-floor-plan-${result.layoutId}`}
                    disabled={!canEdit}
                    onClick={() => onApplyPlanTemplate(result.template)}
                    className={
                      dark
                        ? "rounded-md bg-emerald-300 px-3 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
                        : "rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                    }
                  >
                    Use editable plan
                  </button>
                </div>
              </div>
            </article>
            );
          })}
          <p className={`text-[10px] leading-4 ${subtleClass}`}>
            {visibleResults[0].accuracyNotice}
          </p>
        </div>
      )}
    </section>
  );
}
