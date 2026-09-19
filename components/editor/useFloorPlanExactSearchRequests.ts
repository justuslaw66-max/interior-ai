"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PrivateFloorPlanExactSelection } from "@/lib/floor-plan-catalog-client";
import type { FloorPlanCatalogSearchResult } from "@/lib/floor-plan-catalog-repository";
import {
  postExactFloorPlanSearch,
  privateSelectionFromSearchRequest,
} from "@/lib/floor-plan-directory-client";
import type { FloorPlanExactSearchRequest } from "@/lib/floor-plan-directory-contract";
import {
  createFloorPlanExactSearchIdentity,
  FloorPlanExactSearchRequestAuthority,
  type FloorPlanExactSearchRequestBinding,
  type FloorPlanExactSearchRequestToken,
} from "@/lib/floor-plan-exact-search-request-authority";

type SearchStatus = "idle" | "loading" | "ready" | "error";

type SearchState = {
  identityRef: React.MutableRefObject<string | null>;
  resultsRef: React.MutableRefObject<FloorPlanCatalogSearchResult[]>;
  cursorRef: React.MutableRefObject<string | null>;
  selectionRef: React.MutableRefObject<PrivateFloorPlanExactSelection | null>;
  results: FloorPlanCatalogSearchResult[];
  cursor: string | null;
  status: SearchStatus;
  message: string;
  setResults: React.Dispatch<React.SetStateAction<FloorPlanCatalogSearchResult[]>>;
  setCursor: React.Dispatch<React.SetStateAction<string | null>>;
  setStatus: React.Dispatch<React.SetStateAction<SearchStatus>>;
  setMessage: React.Dispatch<React.SetStateAction<string>>;
  reset: () => void;
};

type SearchRunnerInput = Pick<
  SearchState,
  "resultsRef" | "cursorRef" | "setResults" | "setCursor" | "setStatus" | "setMessage"
> & {
  exactRequest: FloorPlanExactSearchRequest;
  authority: FloorPlanExactSearchRequestAuthority;
  binding: FloorPlanExactSearchRequestBinding;
  token: FloorPlanExactSearchRequestToken;
};

function resultSetIdentity(results: FloorPlanCatalogSearchResult[]) {
  return results.map((result) => result.id).join("\u001f");
}

function requestError(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

function useSearchState(identity: string | null): SearchState {
  const identityRef = useRef(identity);
  const resultsRef = useRef<FloorPlanCatalogSearchResult[]>([]);
  const cursorRef = useRef<string | null>(null);
  const selectionRef = useRef<PrivateFloorPlanExactSelection | null>(null);
  const [results, setResults] = useState<FloorPlanCatalogSearchResult[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [message, setMessage] = useState("");
  useEffect(() => {
    identityRef.current = identity;
  }, [identity, identityRef]);
  const reset = useCallback(() => {
    resultsRef.current = [];
    cursorRef.current = null;
    selectionRef.current = null;
    setResults([]);
    setCursor(null);
    setStatus("idle");
    setMessage("");
  }, []);
  return {
    identityRef, resultsRef, cursorRef, selectionRef,
    results, cursor, status, message,
    setResults, setCursor, setStatus, setMessage, reset,
  };
}

async function runInitialSearch(
  input: SearchRunnerInput & Pick<SearchState, "selectionRef">
) {
  try {
    const payload = await postExactFloorPlanSearch(input.exactRequest, input.token.signal);
    if (!input.authority.isCurrent(input.token, input.binding)) return;
    const cursor = payload.nextCursor ?? null;
    input.resultsRef.current = payload.results;
    input.cursorRef.current = cursor;
    input.selectionRef.current = privateSelectionFromSearchRequest(input.exactRequest);
    input.setResults(payload.results);
    input.setCursor(cursor);
    input.setStatus("ready");
  } catch (cause) {
    if (!input.authority.isCurrent(input.token, input.binding)) return;
    input.resultsRef.current = [];
    input.cursorRef.current = null;
    input.selectionRef.current = null;
    input.setResults([]);
    input.setCursor(null);
    input.setStatus("error");
    input.setMessage(requestError(cause, "Floor-plan search failed."));
  } finally {
    input.authority.finish(input.token);
  }
}

function useInitialSearch(
  exactRequest: FloorPlanExactSearchRequest | null,
  identity: string | null,
  authority: FloorPlanExactSearchRequestAuthority,
  state: SearchState
) {
  const {
    reset, resultsRef, cursorRef, selectionRef,
    setResults, setCursor, setStatus, setMessage,
  } = state;
  useEffect(() => {
    if (!exactRequest || !identity) {
      reset();
      return;
    }
    authority.activate(identity);
    const binding = { purpose: "initial", identity } as const;
    const token = authority.begin(binding);
    if (!token) return;
    reset();
    setStatus("loading");
    const timer = window.setTimeout(() => {
      void runInitialSearch({
        exactRequest, authority, binding, token,
        resultsRef, cursorRef, selectionRef, setResults,
        setCursor, setStatus, setMessage,
      });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      authority.cancel(token);
    };
  }, [
    authority, cursorRef, exactRequest, identity, reset, resultsRef, selectionRef,
    setCursor, setMessage, setResults, setStatus,
  ]);
}

async function runLoadMoreSearch(input: SearchRunnerInput) {
  try {
    const payload = await postExactFloorPlanSearch({
      ...input.exactRequest,
      cursor: input.binding.cursor,
    }, input.token.signal);
    const currentBinding = {
      ...input.binding,
      cursor: input.cursorRef.current ?? undefined,
      resultSetIdentity: resultSetIdentity(input.resultsRef.current),
    };
    if (!input.authority.isCurrent(input.token, currentBinding)) return;
    const results = [...input.resultsRef.current, ...payload.results];
    const cursor = payload.nextCursor ?? null;
    input.resultsRef.current = results;
    input.cursorRef.current = cursor;
    input.setResults(results);
    input.setCursor(cursor);
    input.setStatus("ready");
  } catch (cause) {
    const currentBinding = {
      ...input.binding,
      cursor: input.cursorRef.current ?? undefined,
      resultSetIdentity: resultSetIdentity(input.resultsRef.current),
    };
    if (!input.authority.isCurrent(input.token, currentBinding)) return;
    input.setStatus("error");
    input.setMessage(requestError(cause, "More floor plans could not be loaded."));
  } finally {
    input.authority.finish(input.token);
  }
}

function useLoadMoreSearch(
  exactRequest: FloorPlanExactSearchRequest | null,
  authority: FloorPlanExactSearchRequestAuthority,
  state: SearchState
) {
  const {
    identityRef, resultsRef, cursorRef,
    setResults, setCursor, setStatus, setMessage,
  } = state;
  return useCallback(async () => {
    const identity = identityRef.current;
    const cursor = cursorRef.current;
    if (!exactRequest || !identity || !cursor) return;
    const binding = {
      purpose: "load-more",
      identity,
      cursor,
      resultSetIdentity: resultSetIdentity(resultsRef.current),
    } as const;
    const token = authority.begin(binding);
    if (!token) return;
    setStatus("loading");
    setMessage("");
    await runLoadMoreSearch({
      exactRequest, authority, binding, token,
      resultsRef, cursorRef, setResults, setCursor, setStatus, setMessage,
    });
  }, [
    authority, cursorRef, exactRequest, identityRef, resultsRef,
    setCursor, setMessage, setResults, setStatus,
  ]);
}

export function useFloorPlanExactSearchRequests(
  exactRequest: FloorPlanExactSearchRequest | null
) {
  const [authority] = useState(() => new FloorPlanExactSearchRequestAuthority());
  const identity = useMemo(
    () => exactRequest ? createFloorPlanExactSearchIdentity(exactRequest) : null,
    [exactRequest]
  );
  const state = useSearchState(identity);
  useInitialSearch(exactRequest, identity, authority, state);
  const loadMoreSearch = useLoadMoreSearch(exactRequest, authority, state);
  const reset = state.reset;
  const invalidate = useCallback(() => {
    authority.invalidate();
    reset();
  }, [authority, reset]);
  useEffect(() => () => authority.dispose(), [authority]);
  return {
    authority,
    identityRef: state.identityRef,
    selectionRef: state.selectionRef,
    results: state.results,
    searchCursor: state.cursor,
    status: state.status,
    errorMessage: state.message,
    loadMoreSearch,
    invalidate,
  };
}
