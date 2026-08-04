"use client";

import { useCallback, useEffect } from "react";

import { buildDesignEditorUrl } from "@/lib/design-editor-url";
import type { DesignPageCloudLoadResult } from "@/lib/design-page-types";
import type { DesignPageCoreShellRegistration } from "@/lib/useDesignPageCoreShellRegistration";
import type { DesignPagePersistenceWorkspaceRegistration } from "@/lib/useDesignPagePersistenceWorkspaceRegistration";

type DesignUrlContext = Pick<URLSearchParams, "get">;

export type RequestedDesignLoadDecision =
  | { kind: "none" | "waiting" | "current" }
  | { kind: "load"; designId: string };

export type RequestedDesignLoadCompletion =
  | { kind: "unchanged" }
  | { kind: "replace"; href: string };

export function resolveRequestedDesignLoadDecision(input: {
  requestedDesignId: string;
  currentDesignId: string | null;
  authenticated: boolean;
  localBackupHydrated: boolean;
}): RequestedDesignLoadDecision {
  if (!input.requestedDesignId) return { kind: "none" };
  if (!input.authenticated || !input.localBackupHydrated) {
    return { kind: "waiting" };
  }
  if (input.currentDesignId === input.requestedDesignId) {
    return { kind: "current" };
  }
  return { kind: "load", designId: input.requestedDesignId };
}

export function resolveRequestedDesignLoadCompletion(input: {
  active: boolean;
  result: DesignPageCloudLoadResult;
  currentDesignId: string | null;
  context: DesignUrlContext;
}): RequestedDesignLoadCompletion {
  if (!input.active || input.result === "loaded" || input.result === "superseded") {
    return { kind: "unchanged" };
  }
  return {
    kind: "replace",
    href: input.currentDesignId
      ? buildDesignEditorUrl({
          designId: input.currentDesignId,
          context: input.context,
        })
      : "/design",
  };
}

export type UseDesignPageRequestedDesignWorkspaceRegistrationInput = {
  boundaries: {
    coreShell: DesignPageCoreShellRegistration;
    persistence: DesignPagePersistenceWorkspaceRegistration;
  };
};

/** Coordinates canonical route identity with the existing persistence owner. */
export function useDesignPageRequestedDesignWorkspaceRegistration({
  boundaries: { coreShell, persistence },
}: UseDesignPageRequestedDesignWorkspaceRegistrationInput) {
  const base = coreShell.boundaries.base;
  const { router, searchParams } = base.derived.navigation;
  const requestedDesignId = searchParams.get("designId") ?? "";
  const currentDesignId = base.state.identity.designId;
  const authenticated = Boolean(base.state.identity.session?.user);
  const localBackupHydrated = coreShell.state.document.localBackupHydrated;
  const loadDesign = persistence.actions.persistence.loadDesign;
  const cancelDesignLoad = persistence.actions.persistence.cancelDesignLoad;

  useEffect(() => {
    const decision = resolveRequestedDesignLoadDecision({
      requestedDesignId,
      currentDesignId,
      authenticated,
      localBackupHydrated,
    });
    if (decision.kind !== "load") return;

    let active = true;
    void loadDesign(decision.designId).then((result) => {
      const completion = resolveRequestedDesignLoadCompletion({
        active,
        result,
        currentDesignId,
        context: searchParams,
      });
      if (completion.kind === "replace") router.replace(completion.href);
    });
    return () => {
      active = false;
      cancelDesignLoad();
    };
  }, [
    authenticated,
    cancelDesignLoad,
    currentDesignId,
    loadDesign,
    localBackupHydrated,
    requestedDesignId,
    router,
    searchParams,
  ]);

  const openSavedDesign = useCallback(
    (designId: string) => {
      persistence.actions.persistence.closeMyDesigns();
      router.push(buildDesignEditorUrl({ designId, context: searchParams }));
    },
    [persistence.actions.persistence, router, searchParams]
  );

  return {
    actions: { openSavedDesign },
  };
}

export type DesignPageRequestedDesignWorkspaceRegistration = ReturnType<
  typeof useDesignPageRequestedDesignWorkspaceRegistration
>;
