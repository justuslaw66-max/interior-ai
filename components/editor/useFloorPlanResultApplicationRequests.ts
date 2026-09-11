"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { HousePlanTemplate, HousePlanTemplateApplyOptions } from "@/lib/design-page-house-plan";
import type { PublicFloorPlanAuthoredVariantGroup } from "@/lib/floor-plan-authored-variant-links";
import {
  buildCanonicalFloorPlanTemplate,
  buildCanonicalFloorPlanTemplateForAuthoredVariant,
  buildFloorPlanBrowseResultForAuthoredVariant,
  type PrivateFloorPlanExactSelection,
} from "@/lib/floor-plan-catalog-client";
import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";
import {
  fetchPublicFloorPlanRevision,
  resolveExactFloorPlanAuthoredVariant,
} from "@/lib/floor-plan-directory-client";
import {
  type FloorPlanExactSearchRequestAuthority,
  type FloorPlanExactSearchRequestBinding,
  type FloorPlanExactSearchRequestToken,
} from "@/lib/floor-plan-exact-search-request-authority";
import { inspectFloorPlanOptionalConfigurations } from "@/lib/floor-plan-optional-configurations";

export type PendingFloorPlanApplication = {
  result: FloorPlanCatalogSearchResult;
  template: HousePlanTemplate;
  startAsNewDesign: boolean;
  privateSelection: PrivateFloorPlanExactSelection | null;
};

type ApplyPlanTemplate = (
  template: HousePlanTemplate,
  options?: HousePlanTemplateApplyOptions
) => void;

type BrowseVariantRequest = { id: number; controller: AbortController };

type ApplicationState = {
  applyingResultId: string | null;
  applyingRef: React.MutableRefObject<string | null>;
  setApplyingResultId: React.Dispatch<React.SetStateAction<string | null>>;
  applyError: { id: string; message: string } | null;
  setApplyError: React.Dispatch<React.SetStateAction<{ id: string; message: string } | null>>;
  pendingApplication: PendingFloorPlanApplication | null;
  pendingRef: React.MutableRefObject<PendingFloorPlanApplication | null>;
  browseVariantRef: React.MutableRefObject<BrowseVariantRequest | null>;
  commitPending: (pending: PendingFloorPlanApplication | null) => void;
  reset: () => void;
  dispose: () => void;
};

type ApplicationOwner = {
  authority: FloorPlanExactSearchRequestAuthority;
  identityRef: React.MutableRefObject<string | null>;
  selectionRef: React.MutableRefObject<PrivateFloorPlanExactSelection | null>;
  onApplyPlanTemplate: ApplyPlanTemplate;
};

function requestError(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function useApplicationState(): ApplicationState {
  const [applyingResultId, setApplyingResultId] = useState<string | null>(null);
  const applyingRef = useRef<string | null>(null);
  const [applyError, setApplyError] = useState<{ id: string; message: string } | null>(null);
  const [pendingApplication, setPendingApplication] = useState<PendingFloorPlanApplication | null>(null);
  const pendingRef = useRef<PendingFloorPlanApplication | null>(null);
  const browseVariantRef = useRef<BrowseVariantRequest | null>(null);
  const commitPending = useCallback((pending: PendingFloorPlanApplication | null) => {
    pendingRef.current = pending;
    setPendingApplication(pending);
  }, []);
  const dispose = useCallback(() => {
    browseVariantRef.current?.controller.abort();
    browseVariantRef.current = null;
  }, []);
  const reset = useCallback(() => {
    dispose();
    applyingRef.current = null;
    setApplyingResultId(null);
    setApplyError(null);
    commitPending(null);
  }, [commitPending, dispose]);
  return {
    applyingResultId, applyingRef, setApplyingResultId,
    applyError, setApplyError, pendingApplication, pendingRef,
    browseVariantRef, commitPending, reset, dispose,
  };
}

function applicationBinding(
  result: FloorPlanCatalogSearchResult,
  identity: string | null
): FloorPlanExactSearchRequestBinding | null {
  if (result.matchLevel !== "unit" || !identity) return null;
  return {
    purpose: "application",
    identity,
    resultId: result.id,
    selectedRevisionId: result.revisionId,
  };
}

function isTokenCurrent(input: {
  authority: FloorPlanExactSearchRequestAuthority;
  token: FloorPlanExactSearchRequestToken | null;
  binding: FloorPlanExactSearchRequestBinding | null;
}) {
  return !input.token || Boolean(
    input.binding && input.authority.isCurrent(input.token, input.binding)
  );
}

type CatalogApplicationContext = {
  binding: FloorPlanExactSearchRequestBinding | null;
  token: FloorPlanExactSearchRequestToken | null;
  selection: PrivateFloorPlanExactSelection | null;
};

function startCatalogApplication(
  input: ApplicationOwner & ApplicationState & { result: FloorPlanCatalogSearchResult }
): CatalogApplicationContext | null {
  if (input.applyingRef.current) return null;
  input.authority.abortPurpose("authored-variant");
  const identity = input.identityRef.current;
  const selection = input.result.matchLevel === "unit" ? input.selectionRef.current : null;
  if (input.result.matchLevel === "unit" && (!identity || !selection)) return null;
  const binding = applicationBinding(input.result, identity);
  const token = binding ? input.authority.begin(binding) : null;
  if (binding && !token) return null;
  input.applyingRef.current = input.result.id;
  input.setApplyingResultId(input.result.id);
  input.setApplyError(null);
  input.commitPending(null);
  return { binding, token, selection };
}

function commitCatalogApplication(input: ApplicationOwner & ApplicationState & {
  result: FloorPlanCatalogSearchResult;
  startAsNewDesign: boolean;
  selection: PrivateFloorPlanExactSelection | null;
  payload: unknown;
}) {
  const template = buildCanonicalFloorPlanTemplate(
    input.result,
    input.payload,
    input.selection ?? undefined
  );
  const needsConfirmation = template.canonical && (
    inspectFloorPlanOptionalConfigurations(template.canonical.document).length > 0 ||
    (input.result.authoredConfigurationGroups?.length ?? 0) > 0
  );
  if (needsConfirmation) {
    input.commitPending({
      result: input.result,
      template,
      startAsNewDesign: input.startAsNewDesign,
      privateSelection: input.selection,
    });
    return;
  }
  input.onApplyPlanTemplate(template, { startAsNewDesign: input.startAsNewDesign });
}

async function runCatalogApplication(input: ApplicationOwner & ApplicationState & {
  result: FloorPlanCatalogSearchResult;
  startAsNewDesign: boolean;
}) {
  const context = startCatalogApplication(input);
  if (!context) return;
  const { binding, token, selection } = context;
  const browseRequest = token ? null : startBrowseVariantRequest(input);
  const isCurrent = () => token
    ? isTokenCurrent({ authority: input.authority, token, binding })
    : Boolean(browseRequest && !browseRequest.controller.signal.aborted &&
        input.browseVariantRef.current === browseRequest);
  try {
    const payload = await fetchPublicFloorPlanRevision(input.result, token?.signal ?? browseRequest?.controller.signal);
    if (!isCurrent()) return;
    commitCatalogApplication({ ...input, selection, payload });
  } catch (cause) {
    if (!isCurrent()) return;
    input.setApplyError({
      id: input.result.id,
      message: requestError(cause, "The verified floor plan could not be opened."),
    });
  } finally {
    if (isCurrent()) {
      input.applyingRef.current = null;
      input.setApplyingResultId(null);
    }
    if (token) input.authority.finish(token);
    if (browseRequest && input.browseVariantRef.current === browseRequest) {
      input.browseVariantRef.current = null;
    }
  }
}

async function resolveAuthoredVariant(input: {
  pending: PendingFloorPlanApplication;
  group: PublicFloorPlanAuthoredVariantGroup;
  option: PublicFloorPlanAuthoredVariantGroup["options"][number];
  signal?: AbortSignal;
  isCurrent: () => boolean;
}) {
  let matchedResult: FloorPlanCatalogSearchResult;
  if (input.pending.result.matchLevel === "unit") {
    if (!input.pending.privateSelection) throw new Error("Search again before changing layout.");
    matchedResult = await resolveExactFloorPlanAuthoredVariant(
      input.pending.privateSelection,
      input.option.revisionId,
      input.signal
    );
    if (!input.isCurrent()) return null;
  } else {
    matchedResult = buildFloorPlanBrowseResultForAuthoredVariant(
      input.pending.result,
      input.option
    );
  }
  const payload = await fetchPublicFloorPlanRevision(matchedResult, input.signal);
  if (!input.isCurrent()) return null;
  const template = input.pending.privateSelection && matchedResult.matchLevel === "unit"
    ? buildCanonicalFloorPlanTemplateForAuthoredVariant({
        baseResult: input.pending.result,
        matchedResult,
        groupId: input.group.groupId,
        option: input.option,
        responseValue: payload,
        privateSelection: input.pending.privateSelection,
      })
    : buildCanonicalFloorPlanTemplate(matchedResult, payload);
  return { matchedResult, template };
}

function variantBinding(input: {
  pending: PendingFloorPlanApplication;
  identity: string | null;
  option: PublicFloorPlanAuthoredVariantGroup["options"][number];
}): FloorPlanExactSearchRequestBinding | null {
  if (input.pending.result.matchLevel !== "unit" || !input.identity) return null;
  return {
    purpose: "authored-variant",
    identity: input.identity,
    resultId: input.pending.result.id,
    selectedRevisionId: input.pending.template.canonical?.revisionId ??
      input.pending.result.revisionId,
    requestedVariantRevisionId: input.option.revisionId,
  };
}

function startBrowseVariantRequest(state: ApplicationState) {
  const request = {
    id: (state.browseVariantRef.current?.id ?? 0) + 1,
    controller: new AbortController(),
  };
  state.browseVariantRef.current?.controller.abort();
  state.browseVariantRef.current = request;
  return request;
}

async function runAuthoredVariant(input: ApplicationOwner & ApplicationState & {
  group: PublicFloorPlanAuthoredVariantGroup;
  option: PublicFloorPlanAuthoredVariantGroup["options"][number];
}) {
  const pending = input.pendingRef.current;
  if (!pending || input.applyingRef.current) return;
  const binding = variantBinding({
    pending,
    identity: input.identityRef.current,
    option: input.option,
  });
  const token = binding ? input.authority.begin(binding) : null;
  if (binding && !token) return;
  const browseRequest = binding ? null : startBrowseVariantRequest(input);
  const isCurrent = () => token && binding
    ? input.authority.isCurrent(token, binding) && input.pendingRef.current === pending
    : Boolean(browseRequest && !browseRequest.controller.signal.aborted &&
        input.browseVariantRef.current?.id === browseRequest.id &&
        input.pendingRef.current === pending);
  input.applyingRef.current = input.option.revisionId;
  input.setApplyingResultId(input.option.revisionId);
  input.setApplyError(null);
  try {
    const resolved = await resolveAuthoredVariant({
      pending,
      group: input.group,
      option: input.option,
      signal: token?.signal ?? browseRequest?.controller.signal,
      isCurrent,
    });
    if (!resolved || !isCurrent()) return;
    input.applyingRef.current = null;
    input.setApplyingResultId(null);
    input.commitPending({
      ...pending,
      result: resolved.matchedResult,
      template: resolved.template,
    });
  } catch (cause) {
    if (!isCurrent()) return;
    input.applyingRef.current = null;
    input.setApplyingResultId(null);
    input.setApplyError({
      id: pending.result.id,
      message: requestError(cause, "The selected reviewed layout could not be loaded."),
    });
  } finally {
    if (token) input.authority.finish(token);
    if (browseRequest && input.browseVariantRef.current?.id === browseRequest.id) {
      input.browseVariantRef.current = null;
    }
  }
}

function usePendingApplicationActions(
  owner: ApplicationOwner,
  state: ApplicationState
) {
  const { authority, onApplyPlanTemplate } = owner;
  const {
    browseVariantRef, applyingRef, setApplyingResultId,
    pendingRef, commitPending,
  } = state;
  const cancelPendingApplication = useCallback(() => {
    authority.abortPurpose("authored-variant");
    browseVariantRef.current?.controller.abort();
    browseVariantRef.current = null;
    applyingRef.current = null;
    setApplyingResultId(null);
    commitPending(null);
  }, [authority, applyingRef, browseVariantRef, commitPending, setApplyingResultId]);
  const confirmPendingApplication = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending || applyingRef.current) return;
    onApplyPlanTemplate(pending.template, {
      startAsNewDesign: pending.startAsNewDesign,
    });
    commitPending(null);
  }, [applyingRef, commitPending, onApplyPlanTemplate, pendingRef]);
  return { cancelPendingApplication, confirmPendingApplication };
}

export function useFloorPlanResultApplicationRequests(owner: ApplicationOwner) {
  const state = useApplicationState();
  const applyCatalogResult = useCallback(
    (result: FloorPlanCatalogSearchResult, startAsNewDesign: boolean) =>
      runCatalogApplication({ ...owner, ...state, result, startAsNewDesign }),
    [owner, state]
  );
  const chooseAuthoredVariant = useCallback((
    group: PublicFloorPlanAuthoredVariantGroup,
    option: PublicFloorPlanAuthoredVariantGroup["options"][number]
  ) => runAuthoredVariant({ ...owner, ...state, group, option }), [owner, state]);
  const pendingActions = usePendingApplicationActions(owner, state);
  const reset = state.reset;
  const dispose = state.dispose;
  useEffect(() => () => dispose(), [dispose]);
  return {
    applyingResultId: state.applyingResultId,
    applyError: state.applyError,
    pendingApplication: state.pendingApplication,
    reset,
    applyCatalogResult,
    chooseAuthoredVariant,
    ...pendingActions,
  };
}
