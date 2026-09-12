"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HousePlanTemplate, HousePlanTemplateApplyOptions } from "@/lib/design-page-house-plan";
import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";
import {
  buildStructuredFloorPlanAddressQuery,
  filterFloorPlanSearchResults,
  floorPlanSearchFacets,
  groupFloorPlanSearchResults,
} from "@/lib/floor-plan-consumer-search";
import { fetchFloorPlanBrowsePage } from "@/lib/floor-plan-directory-client";
import { FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID } from "@/lib/floor-plan-upload-dialog-focus";
import FloorPlanAddressFields from "./FloorPlanAddressFields";
import FloorPlanSelectionContext from "./FloorPlanSelectionContext";
import FloorPlanCatalogResultList from "./FloorPlanCatalogResultList";
import FloorPlanOptionalConfigurationPanel from "./FloorPlanOptionalConfigurationPanel";
import { useFloorPlanExactSearchRequests } from "./useFloorPlanExactSearchRequests";
import { useFloorPlanResultApplicationRequests } from "./useFloorPlanResultApplicationRequests";

type FloorPlanAddressSearchProps = {
  dark?: boolean;
  canEdit: boolean;
  onApplyPlanTemplate: (
    template: HousePlanTemplate,
    options?: HousePlanTemplateApplyOptions
  ) => void;
};

export default function FloorPlanAddressSearch({
  dark = false,
  canEdit,
  onApplyPlanTemplate,
}: FloorPlanAddressSearchProps) {
  const [address, setAddress] = useState("");
  const [floor, setFloor] = useState("");
  const [stack, setStack] = useState("");
  const exactRequest = useMemo(
    () => buildStructuredFloorPlanAddressQuery({ address, floor, stack, limit: 12 }),
    [address, floor, stack]
  );
  const exactSearch = useFloorPlanExactSearchRequests(exactRequest);
  const applicationOwner = useMemo(() => ({
    authority: exactSearch.authority,
    identityRef: exactSearch.identityRef,
    selectionRef: exactSearch.selectionRef,
    onApplyPlanTemplate,
  }), [
    exactSearch.authority,
    exactSearch.identityRef,
    exactSearch.selectionRef,
    onApplyPlanTemplate,
  ]);
  const application = useFloorPlanResultApplicationRequests(applicationOwner);
  const {
    results, searchCursor, status, errorMessage, loadMoreSearch,
  } = exactSearch;
  const {
    applyingResultId, applyError, pendingApplication,
    applyCatalogResult, chooseAuthoredVariant, cancelPendingApplication,
    confirmPendingApplication,
  } = application;
  const applicationDisabled = !canEdit || Boolean(applyingResultId);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseResults, setBrowseResults] = useState<FloorPlanCatalogSearchResult[]>([]);
  const [browseCursor, setBrowseCursor] = useState<string | null>(null);
  const [browseStatus, setBrowseStatus] = useState<"loading" | "ready" | "error">("loading");
  const [browseErrorMessage, setBrowseErrorMessage] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [flatTypeFilter, setFlatTypeFilter] = useState("");
  const loadBrowse = useCallback(async (cursor: string | null, append: boolean) => {
    setBrowseStatus("loading");
    setBrowseErrorMessage("");
    try {
      const payload = await fetchFloorPlanBrowsePage(cursor);
      setBrowseResults((current) => append ? [...current, ...payload.results] : payload.results);
      setBrowseCursor(payload.nextCursor ?? null);
      setBrowseStatus("ready");
    } catch (cause) {
      setBrowseStatus("error");
      setBrowseErrorMessage(cause instanceof Error ? cause.message : "Floor-plan library failed to load.");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadBrowse(null, false), 0);
    return () => window.clearTimeout(timer);
  }, [loadBrowse]);

  const invalidateExactInput = () => {
    exactSearch.invalidate();
    application.reset();
  };
  const hasExactInput = exactRequest !== null;
  const exactSearchReady = hasExactInput && status === "ready";
  const hasAddress = address.trim().length >= 2;
  const sourceResults = hasAddress ? results : browseOpen ? browseResults : [];
  const facets = floorPlanSearchFacets(sourceResults);
  const effectiveProjectFilter = facets.projects.includes(projectFilter) ? projectFilter : "";
  const effectiveFlatTypeFilter = facets.flatTypes.includes(flatTypeFilter) ? flatTypeFilter : "";
  const groups = groupFloorPlanSearchResults(filterFloorPlanSearchResults(sourceResults, {
    project: effectiveProjectFilter,
    flatType: effectiveFlatTypeFilter,
  }));
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";
  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs"
    : "rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-xs text-neutral-700";

  const requestUpload = () => {
    window.dispatchEvent(new Event("floor-plan-upload-requested"));
    document.getElementById("floor-plan-upload")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <section
      className={`${dark ? "designer-recessed rounded-xl border border-white/10 p-3" : "rounded-xl border border-blue-100 bg-blue-50/70 p-3"} ph-no-capture`}
      data-testid="floor-plan-address-library"
    >
      <div className="text-sm font-semibold">Find your home by address</div>
      <p className={`mt-1 text-xs ${subtle}`}>
        Add both floor and stack to search privately for an exact unit match.
      </p>
      <FloorPlanAddressFields
        dark={dark}
        address={address}
        floor={floor}
        stack={stack}
        browseOpen={browseOpen}
        browseCount={browseResults.length}
        browseStatus={browseStatus}
        browseAddressSummary="Every approved plan in the library"
        onAddressChange={(value) => {
          invalidateExactInput();
          setAddress(value);
          if (value.trim()) setBrowseOpen(false);
        }}
        onFloorChange={(value) => { invalidateExactInput(); setFloor(value); }}
        onStackChange={(value) => { invalidateExactInput(); setStack(value); }}
        onToggleBrowse={() => {
          invalidateExactInput();
          setAddress("");
          setFloor("");
          setStack("");
          setBrowseOpen((value) => !value);
        }}
      />

      <div className={`mt-2 min-h-5 text-xs ${subtle}`} aria-live="polite">
        {hasAddress && !hasExactInput ? "Enter both floor and stack to search." : null}
        {hasExactInput && status === "loading" ? "Searching floor plans…" : null}
        {hasExactInput && status === "error" ? errorMessage : null}
        {exactSearchReady && results.length === 0
          ? "No approved floor plan found for that exact unit yet."
          : null}
        {exactSearchReady && results.length > 0 ? (
          <span data-testid="floor-plan-address-result-count">
            {results.length} editable layout{results.length === 1 ? "" : "s"} found · Exact unit match
          </span>
        ) : null}
        {!hasAddress && browseOpen && browseStatus === "loading" ? "Loading approved plans…" : null}
        {!hasAddress && browseOpen && browseStatus === "error" ? browseErrorMessage : null}
      </div>

      {exactSearchReady && results.length === 0 ? (
        <div className={dark ? "mt-2 rounded-lg border border-white/10 p-3" : "mt-2 rounded-lg border border-blue-200 bg-white p-3"}>
          <div className="text-xs font-semibold">No directory match yet</div>
          <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
            Directory requests are not available yet. You can still open your own plan now.
          </p>
          <button id={FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID} type="button" className={`${control} mt-2`} onClick={requestUpload}>
            Upload your floor plan
          </button>
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
        <div role="region" aria-label="Confirm floor-plan configuration" data-testid="floor-plan-configuration-confirmation" className={dark ? "mt-3 rounded-xl border border-white/10 p-3" : "mt-3 rounded-xl border border-sky-200 bg-white p-3 shadow-sm"}>
          <div className="text-sm font-semibold">Confirm this source layout</div>
          <p className={`mt-1 text-[11px] leading-4 ${subtle}`}>
            Review the source-supported options before opening this immutable published layout.
          </p>
          <FloorPlanSelectionContext result={pendingApplication.result} subtle={subtle} />
          <FloorPlanOptionalConfigurationPanel
            document={pendingApplication.template.canonical.document}
            publicGroups={pendingApplication.result.authoredConfigurationGroups ?? []}
            selectedRevisionId={pendingApplication.template.canonical.revisionId}
            onChoosePublicVariant={(group, option) => void chooseAuthoredVariant(group, option)}
            disabled={applicationDisabled}
            dark={dark}
            compact
          />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" className={control} onClick={cancelPendingApplication}>Cancel</button>
            <button type="button" className="rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white" disabled={applicationDisabled} onClick={confirmPendingApplication}>
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
          resultListId={hasAddress ? undefined : "floor-plan-library-browse-results"}
          testId={hasAddress ? "floor-plan-address-results" : "floor-plan-library-browse-results"}
          applyingResultId={applyingResultId}
          applyError={applyError}
          onUse={(result, startAsNewDesign) => void applyCatalogResult(result, startAsNewDesign)}
        />
      ) : null}

      {hasExactInput && searchCursor ? (
        <button type="button" className={`${control} mt-3 w-full`} disabled={status === "loading"} onClick={() => void loadMoreSearch()}>
          Show more matches
        </button>
      ) : null}
      {!hasAddress && browseOpen && browseCursor ? (
        <button type="button" className={`${control} mt-3 w-full`} disabled={browseStatus === "loading"} onClick={() => void loadBrowse(browseCursor, true)}>
          Show more approved plans
        </button>
      ) : null}
    </section>
  );
}
