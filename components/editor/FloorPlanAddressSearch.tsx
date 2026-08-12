"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  HousePlanTemplate,
  HousePlanTemplateApplyOptions,
} from "@/lib/design-page-house-plan";
import type { FloorPlanLibraryUnitQuery } from "@/lib/floor-plan-address-search";
import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";
import {
  buildCanonicalFloorPlanTemplate,
  buildCanonicalFloorPlanTemplateForAuthoredVariant,
} from "@/lib/floor-plan-catalog-client";
import type {
  PublicFloorPlanAuthoredVariantGroup,
} from "@/lib/floor-plan-authored-variant-links";
import {
  buildStructuredFloorPlanAddressQuery,
  filterFloorPlanSearchResults,
  floorPlanSearchFacets,
  groupFloorPlanSearchResults,
} from "@/lib/floor-plan-consumer-search";
import FloorPlanAddressFields from "./FloorPlanAddressFields";
import FloorPlanCatalogResultList from "./FloorPlanCatalogResultList";
import FloorPlanOptionalConfigurationPanel from "./FloorPlanOptionalConfigurationPanel";
import { inspectFloorPlanOptionalConfigurations } from "@/lib/floor-plan-optional-configurations";
import { FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID } from "@/lib/floor-plan-upload-dialog-focus";
type FloorPlanAddressSearchProps = {
  dark?: boolean;
  canEdit: boolean;
  onApplyPlanTemplate: (
    template: HousePlanTemplate,
    options?: HousePlanTemplateApplyOptions
  ) => void;
};

type FloorPlanSearchResponse = {
  query: string;
  unitQuery: FloorPlanLibraryUnitQuery | null;
  count: number;
  nextCursor?: string | null;
  results: FloorPlanCatalogSearchResult[];
  error?: string;
};

type PendingFloorPlanApplication = {
  result: FloorPlanCatalogSearchResult;
  template: HousePlanTemplate;
  startAsNewDesign: boolean;
};

async function readSearchResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as FloorPlanSearchResponse;
  if (!response.ok) throw new Error(payload.error || "Floor-plan search failed.");
  return payload;
}

export default function FloorPlanAddressSearch({
  dark = false,
  canEdit,
  onApplyPlanTemplate,
}: FloorPlanAddressSearchProps) {
  const [address, setAddress] = useState("");
  const [floor, setFloor] = useState("");
  const [stack, setStack] = useState("");
  const query = useMemo(
    () => buildStructuredFloorPlanAddressQuery({ address, floor, stack }),
    [address, floor, stack]
  );
  const [results, setResults] = useState<FloorPlanCatalogSearchResult[]>([]);
  const [searchCursor, setSearchCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [searchedUnit, setSearchedUnit] = useState<FloorPlanLibraryUnitQuery | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseResults, setBrowseResults] = useState<FloorPlanCatalogSearchResult[]>([]);
  const [browseCursor, setBrowseCursor] = useState<string | null>(null);
  const [browseStatus, setBrowseStatus] = useState<"loading" | "ready" | "error">("loading");
  const [browseErrorMessage, setBrowseErrorMessage] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [flatTypeFilter, setFlatTypeFilter] = useState("");
  const [requestRecorded, setRequestRecorded] = useState(false);
  const [applyingResultId, setApplyingResultId] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<{ id: string; message: string } | null>(null);
  const [pendingApplication, setPendingApplication] = useState<PendingFloorPlanApplication | null>(null);

  const loadBrowse = useCallback(async (cursor: string | null, append: boolean) => {
    setBrowseStatus("loading");
    setBrowseErrorMessage("");
    try {
      const params = new URLSearchParams({ browse: "1", limit: "12" });
      if (cursor) params.set("cursor", cursor);
      const payload = await readSearchResponse(await fetch(`/api/floor-plans?${params}`));
      setBrowseResults((current) => append ? [...current, ...payload.results] : payload.results);
      setBrowseCursor(payload.nextCursor ?? null);
      setBrowseStatus("ready");
    } catch (cause) {
      setBrowseStatus("error");
      setBrowseErrorMessage(cause instanceof Error ? cause.message : "Floor-plan library failed to load.");
    }
  }, []);

  useEffect(() => {
    void loadBrowse(null, false);
  }, [loadBrowse]);

  useEffect(() => {
    if (address.trim().length < 2) {
      setResults([]);
      setSearchCursor(null);
      setStatus("idle");
      setSearchedUnit(null);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      setErrorMessage("");
      setRequestRecorded(false);
      try {
        const params = new URLSearchParams({ q: query, limit: "12" });
        const payload = await readSearchResponse(
          await fetch(`/api/floor-plans?${params}`, { signal: controller.signal })
        );
        setResults(payload.results);
        setSearchCursor(payload.nextCursor ?? null);
        setSearchedUnit(payload.unitQuery);
        setStatus("ready");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setResults([]);
        setStatus("error");
        setErrorMessage(cause instanceof Error ? cause.message : "Floor-plan search failed.");
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, query]);

  const loadMoreSearch = async () => {
    if (!searchCursor) return;
    setStatus("loading");
    try {
      const params = new URLSearchParams({ q: query, limit: "12", cursor: searchCursor });
      const payload = await readSearchResponse(await fetch(`/api/floor-plans?${params}`));
      setResults((current) => [...current, ...payload.results]);
      setSearchCursor(payload.nextCursor ?? null);
      setStatus("ready");
    } catch (cause) {
      setStatus("error");
      setErrorMessage(cause instanceof Error ? cause.message : "More floor plans could not be loaded.");
    }
  };

  const applyCatalogResult = async (
    result: FloorPlanCatalogSearchResult,
    startAsNewDesign: boolean
  ) => {
    if (applyingResultId) return;
    setApplyingResultId(result.id);
    setApplyError(null);
    setPendingApplication(null);
    try {
      const response = await fetch(result.revisionUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const serverMessage = payload && typeof payload === "object" && !Array.isArray(payload) &&
          typeof (payload as { error?: unknown }).error === "string"
          ? (payload as { error: string }).error
          : "The verified floor plan could not be loaded.";
        throw new Error(serverMessage);
      }
      const template = buildCanonicalFloorPlanTemplate(result, payload);
      if (
        template.canonical && (
          inspectFloorPlanOptionalConfigurations(template.canonical.document).length > 0 ||
          (result.authoredConfigurationGroups?.length ?? 0) > 0
        )
      ) {
        setPendingApplication({ result, template, startAsNewDesign });
      } else {
        onApplyPlanTemplate(template, { startAsNewDesign });
      }
    } catch (cause) {
      setApplyError({
        id: result.id,
        message: cause instanceof Error ? cause.message : "The verified floor plan could not be opened.",
      });
    } finally {
      setApplyingResultId(null);
    }
  };

  const chooseAuthoredVariant = async (
    group: PublicFloorPlanAuthoredVariantGroup,
    option: PublicFloorPlanAuthoredVariantGroup["options"][number]
  ) => {
    if (!pendingApplication || applyingResultId) return;
    setApplyingResultId(option.revisionId);
    setApplyError(null);
    try {
      const response = await fetch(option.revisionUrl, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error("The selected reviewed layout could not be loaded.");
      const template = buildCanonicalFloorPlanTemplateForAuthoredVariant({
        baseResult: pendingApplication.result,
        groupId: group.groupId,
        option,
        responseValue: payload,
      });
      setPendingApplication((current) => current ? { ...current, template } : current);
    } catch (cause) {
      setApplyError({
        id: pendingApplication.result.id,
        message: cause instanceof Error
          ? cause.message
          : "The selected reviewed layout could not be loaded.",
      });
    } finally {
      setApplyingResultId(null);
    }
  };

  const confirmPendingApplication = () => {
    if (!pendingApplication) return;
    onApplyPlanTemplate(pendingApplication.template, {
      startAsNewDesign: pendingApplication.startAsNewDesign,
    });
    setPendingApplication(null);
  };

  const hasSearchQuery = address.trim().length >= 2;
  const sourceResults = hasSearchQuery ? results : browseOpen ? browseResults : [];
  const facets = floorPlanSearchFacets(sourceResults);
  const effectiveProjectFilter = facets.projects.includes(projectFilter) ? projectFilter : "";
  const effectiveFlatTypeFilter = facets.flatTypes.includes(flatTypeFilter) ? flatTypeFilter : "";
  const filteredResults = filterFloorPlanSearchResults(sourceResults, {
    project: effectiveProjectFilter,
    flatType: effectiveFlatTypeFilter,
  });
  const groups = groupFloorPlanSearchResults(filteredResults);
  const exactUnitMatch = results[0]?.unitMatches[0] ?? null;
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";
  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs"
    : "rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700";

  const recordMissingAddressRequest = () => {
    setRequestRecorded(true);
    window.dispatchEvent(new CustomEvent("floor-plan-address-requested", {
      detail: { address, floor: floor || null, stack: stack || null },
    }));
    const url = new URL(window.location.href);
    url.searchParams.set("floorPlanRequest", "1");
    window.history.replaceState({ ...window.history.state, floorPlanRequest: true }, "", url);
  };

  const requestUpload = () => {
    window.dispatchEvent(new Event("floor-plan-upload-requested"));
    document.getElementById("floor-plan-upload")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className={dark ? "designer-recessed rounded-xl border border-white/10 p-3" : "rounded-xl border border-blue-100 bg-blue-50/70 p-3"} data-testid="floor-plan-address-library">
      <div className="text-sm font-semibold">Find your home by address</div>
      <p className={`mt-1 text-xs ${subtle}`}>
        Search the address first, then add floor and stack for an exact unit match.
      </p>
      <FloorPlanAddressFields
        dark={dark}
        address={address}
        floor={floor}
        stack={stack}
        browseOpen={browseOpen}
        browseCount={browseResults.length}
        browseStatus={browseStatus}
        browseAddressSummary={browseResults[0]?.addressLabel ?? "Every approved plan in the library"}
        onAddressChange={(value) => { setAddress(value); if (value.trim()) setBrowseOpen(false); }}
        onFloorChange={setFloor}
        onStackChange={setStack}
        onToggleBrowse={() => { setAddress(""); setFloor(""); setStack(""); setBrowseOpen((value) => !value); }}
      />

      <div className={`mt-2 min-h-5 text-xs ${subtle}`} aria-live="polite">
        {hasSearchQuery && status === "loading" ? "Searching floor plans…" : null}
        {hasSearchQuery && status === "error" ? errorMessage : null}
        {hasSearchQuery && status === "ready" && results.length === 0
          ? searchedUnit
            ? `No mapped plan found for ${searchedUnit.label} at that address.`
            : "No approved floor plan found for that address yet."
          : null}
        {hasSearchQuery && status === "ready" && results.length > 0 ? (
          <span data-testid="floor-plan-address-result-count">
            {results.length} editable layout{results.length === 1 ? "" : "s"} found
            {exactUnitMatch ? ` for Block ${exactUnitMatch.block} ${exactUnitMatch.label}` : ""}
          </span>
        ) : null}
        {!hasSearchQuery && browseOpen && browseStatus === "loading" ? "Loading approved plans…" : null}
        {!hasSearchQuery && browseOpen && browseStatus === "error" ? browseErrorMessage : null}
      </div>

      {hasSearchQuery && status === "ready" && results.length === 0 ? (
        <div className={dark ? "mt-2 rounded-lg border border-white/10 p-3" : "mt-2 rounded-lg border border-blue-200 bg-white p-3"}>
          <div className="text-xs font-semibold">Help us add this address</div>
          <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
            This request is noted on this page for now; no address details are saved to our database.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={control} disabled={requestRecorded} onClick={recordMissingAddressRequest}>
              {requestRecorded ? "Request noted" : "Request this address"}
            </button>
            <button id={FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID} type="button" className={control} onClick={requestUpload}>Upload a plan</button>
          </div>
        </div>
      ) : null}

      {sourceResults.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2" data-testid="floor-plan-search-facets">
          <select className={control} value={effectiveProjectFilter} onChange={(event) => setProjectFilter(event.target.value)} aria-label="Filter by project">
            <option value="">All projects</option>
            {facets.projects.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select className={control} value={effectiveFlatTypeFilter} onChange={(event) => setFlatTypeFilter(event.target.value)} aria-label="Filter by flat type">
            <option value="">All flat types</option>
            {facets.flatTypes.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      ) : null}

      {pendingApplication?.template.canonical ? (
        <div
          role="region"
          aria-label="Confirm floor-plan configuration"
          data-testid="floor-plan-configuration-confirmation"
          className={dark
            ? "mt-3 rounded-xl border border-white/10 p-3"
            : "mt-3 rounded-xl border border-sky-200 bg-white p-3 shadow-sm"}
        >
          <div className="text-sm font-semibold">Confirm this source layout</div>
          <p className={`mt-1 text-[11px] leading-4 ${subtle}`}>
            You selected {pendingApplication.result.label}. Review the source-supported
            options before opening it. The published geometry will not change unless a
            separate reviewed revision is explicitly selected.
          </p>
          <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
            Each available choice loads its own approved immutable revision. Source
            annotations never patch or invent geometry in your selected plan.
          </p>
          <FloorPlanOptionalConfigurationPanel
            document={pendingApplication.template.canonical.document}
            publicGroups={pendingApplication.result.authoredConfigurationGroups ?? []}
            selectedRevisionId={pendingApplication.template.canonical.revisionId}
            onChoosePublicVariant={(group, option) => void chooseAuthoredVariant(group, option)}
            disabled={Boolean(applyingResultId)}
            dark={dark}
            compact
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              className={control}
              onClick={() => setPendingApplication(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
              onClick={confirmPendingApplication}
            >
              Use selected reviewed layout
            </button>
          </div>
        </div>
      ) : null}

      {groups.length > 0 ? (
        <FloorPlanCatalogResultList
          dark={dark}
          canEdit={canEdit}
          groups={groups}
          resultListId={hasSearchQuery ? undefined : "floor-plan-library-browse-results"}
          testId={hasSearchQuery ? "floor-plan-address-results" : "floor-plan-library-browse-results"}
          applyingResultId={applyingResultId}
          applyError={applyError}
          onUse={(result, startAsNewDesign) => void applyCatalogResult(result, startAsNewDesign)}
        />
      ) : null}

      {hasSearchQuery && searchCursor ? (
        <button type="button" className={`${control} mt-3 w-full`} disabled={status === "loading"} onClick={() => void loadMoreSearch()}>
          Show more matches
        </button>
      ) : null}
      {!hasSearchQuery && browseOpen && browseCursor ? (
        <button type="button" className={`${control} mt-3 w-full`} disabled={browseStatus === "loading"} onClick={() => void loadBrowse(browseCursor, true)}>
          Show more approved plans
        </button>
      ) : null}
    </section>
  );
}
