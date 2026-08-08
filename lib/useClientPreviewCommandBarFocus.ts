"use client";

import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  type Dispatch,
  type MouseEvent,
  type MutableRefObject,
  type SetStateAction,
} from "react";

export const CLIENT_PREVIEW_COMMAND_BAR_ID = "editor-command-bar-root";
export const CLIENT_PREVIEW_FALLBACK_ACTION_ID = "editor-command-more-action";
export const CLIENT_PREVIEW_EXIT_ACTION_ID = "client-preview-exit-action";

type SemanticOpener = {
  element: HTMLElement;
  semanticIdentity: string;
};

type PreviewFocusSession = {
  entryGeneration: number;
  restoreGeneration: number | null;
  opener: SemanticOpener | null;
  focusTransferred: boolean;
  restoreRequested: boolean;
};

type UseClientPreviewCommandBarFocusInput = {
  active: boolean;
  rawActive: boolean;
  scopeKey: string;
  setRawActive: Dispatch<SetStateAction<boolean>>;
};

type PreviewFocusRefs = {
  generation: MutableRefObject<number>;
  session: MutableRefObject<PreviewFocusSession | null>;
  previousActive: MutableRefObject<boolean>;
  rawActive: MutableRefObject<boolean>;
  active: MutableRefObject<boolean>;
  unmounted: MutableRefObject<boolean>;
  lastFocusedEntryGeneration: MutableRefObject<number>;
};

function getCommandBarElement() {
  const element = document.getElementById(CLIENT_PREVIEW_COMMAND_BAR_ID);
  return element instanceof HTMLDivElement ? element : null;
}

function getFallbackActionElement() {
  const element = document.getElementById(CLIENT_PREVIEW_FALLBACK_ACTION_ID);
  return element instanceof HTMLButtonElement ? element : null;
}

function getExitActionElement() {
  const element = document.getElementById(CLIENT_PREVIEW_EXIT_ACTION_ID);
  return element instanceof HTMLButtonElement ? element : null;
}

function getSemanticIdentity(element: HTMLElement) {
  const identity =
    element.dataset.testid ??
    element.getAttribute("aria-label") ??
    element.id;
  return identity || element.tagName.toLowerCase();
}

function isAvailableFocusTarget(element: HTMLElement | null) {
  if (
    !element?.isConnected ||
    element.closest('[hidden], [inert], [aria-hidden="true"]') ||
    element.getAttribute("aria-disabled") === "true"
  ) {
    return false;
  }
  if (
    (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) &&
    element.disabled
  ) {
    return false;
  }
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    Number(style.opacity) > 0 &&
    rect.width > 0 &&
    rect.height > 0 &&
    rect.left >= 0 &&
    rect.top >= 0 &&
    rect.right <= window.innerWidth &&
    rect.bottom <= window.innerHeight
  );
}

function captureCommandBarOpener(
  commandBar: HTMLElement | null
): SemanticOpener | null {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !commandBar?.contains(activeElement)) {
    return null;
  }
  return {
    element: activeElement,
    semanticIdentity: getSemanticIdentity(activeElement),
  };
}

function focusOwnerNeedsTransfer(commandBar: HTMLElement | null) {
  const activeElement = document.activeElement;
  return (
    !(activeElement instanceof HTMLElement) ||
    activeElement === document.body ||
    activeElement === document.documentElement ||
    !activeElement.isConnected ||
    Boolean(activeElement.closest('[hidden], [inert], [aria-hidden="true"]')) ||
    Boolean(commandBar?.contains(activeElement))
  );
}

function findCurrentSemanticOpener(semanticIdentity: string) {
  const commandBar = getCommandBarElement();
  if (!commandBar) return null;
  for (const candidate of commandBar.getElementsByTagName("*")) {
    if (
      candidate instanceof HTMLElement &&
      getSemanticIdentity(candidate) === semanticIdentity
    ) {
      return candidate;
    }
  }
  return null;
}

function resolveRestoreTarget(
  opener: SemanticOpener | null,
  fallback: HTMLButtonElement | null
) {
  if (
    opener &&
    getSemanticIdentity(opener.element) === opener.semanticIdentity &&
    isAvailableFocusTarget(opener.element)
  ) {
    return opener.element;
  }
  const currentOpener = opener
    ? findCurrentSemanticOpener(opener.semanticIdentity)
    : null;
  if (isAvailableFocusTarget(currentOpener)) return currentOpener;
  return isAvailableFocusTarget(fallback) ? fallback : null;
}

export function guardHiddenCommandAction(event: MouseEvent<HTMLDivElement>) {
  if (!event.currentTarget.inert) return;
  event.preventDefault();
  event.stopPropagation();
}

function updateClientPreviewState(
  nextValue: SetStateAction<boolean>,
  refs: PreviewFocusRefs,
  setRawActive: Dispatch<SetStateAction<boolean>>
) {
  const previous = refs.rawActive.current;
  const next = typeof nextValue === "function" ? nextValue(previous) : nextValue;
  if (next === previous) return;
  refs.rawActive.current = next;
  const generation = refs.generation.current + 1;
  refs.generation.current = generation;
  if (next) {
    refs.session.current = {
      entryGeneration: generation,
      restoreGeneration: null,
      opener: captureCommandBarOpener(getCommandBarElement()),
      focusTransferred: false,
      restoreRequested: false,
    };
  } else if (refs.session.current) {
    refs.session.current = {
      ...refs.session.current,
      restoreGeneration: generation,
      restoreRequested:
        refs.session.current.focusTransferred ||
        document.activeElement === getExitActionElement(),
    };
  }
  setRawActive(next);
}

function cancelClientPreviewForScope(
  active: boolean,
  refs: PreviewFocusRefs,
  setRawActive: Dispatch<SetStateAction<boolean>>
) {
  refs.generation.current += 1;
  refs.session.current = null;
  refs.lastFocusedEntryGeneration.current = 0;
  refs.previousActive.current = active;
  if (!refs.rawActive.current) return;
  refs.rawActive.current = false;
  setRawActive(false);
}

function focusClientPreviewExit(refs: PreviewFocusRefs) {
  let session = refs.session.current;
  if (!session) {
    const entryGeneration = refs.generation.current + 1;
    refs.generation.current = entryGeneration;
    session = {
      entryGeneration,
      restoreGeneration: null,
      opener: captureCommandBarOpener(getCommandBarElement()),
      focusTransferred: false,
      restoreRequested: false,
    };
    refs.session.current = session;
  }
  if (
    refs.lastFocusedEntryGeneration.current === session.entryGeneration ||
    (!session.opener && !focusOwnerNeedsTransfer(getCommandBarElement())) ||
    !isAvailableFocusTarget(getExitActionElement())
  ) {
    return;
  }
  refs.lastFocusedEntryGeneration.current = session.entryGeneration;
  refs.session.current = { ...session, focusTransferred: true };
  getExitActionElement()?.focus({ preventScroll: true });
}

function restoreClientPreviewOpener(
  session: PreviewFocusSession,
  restoreGeneration: number,
  refs: PreviewFocusRefs
) {
  if (
    refs.unmounted.current ||
    refs.generation.current !== restoreGeneration ||
    refs.session.current !== session ||
    refs.active.current
  ) {
    return;
  }
  const target = resolveRestoreTarget(session.opener, getFallbackActionElement());
  if (target) target.focus({ preventScroll: true });
  refs.session.current = null;
}

function scheduleClientPreviewRestore(
  session: PreviewFocusSession,
  refs: PreviewFocusRefs
) {
  const restoreGeneration = session.restoreGeneration ?? refs.generation.current;
  const restore = () => restoreClientPreviewOpener(session, restoreGeneration, refs);
  const animations = getCommandBarElement()?.getAnimations() ?? [];
  if (animations.length === 0) {
    restore();
    return;
  }
  void Promise.allSettled(animations.map((animation) => animation.finished)).then(
    restore
  );
}

function runClientPreviewFocusTransition(
  active: boolean,
  refs: PreviewFocusRefs
) {
  const wasActive = refs.previousActive.current;
  refs.previousActive.current = active;
  if (!wasActive && active) {
    focusClientPreviewExit(refs);
    return;
  }
  const session = refs.session.current;
  if (wasActive && !active && session?.restoreRequested) {
    scheduleClientPreviewRestore(session, refs);
  }
}

export function useClientPreviewCommandBarFocus({
  active,
  rawActive,
  scopeKey,
  setRawActive,
}: UseClientPreviewCommandBarFocusInput) {
  const generationRef = useRef(0);
  const sessionRef = useRef<PreviewFocusSession | null>(null);
  const previousActiveRef = useRef(active);
  const previousScopeKeyRef = useRef(scopeKey);
  const rawActiveRef = useRef(rawActive);
  const activeRef = useRef(active);
  const unmountedRef = useRef(false);
  const lastFocusedEntryGenerationRef = useRef(0);
  const refs = useMemo<PreviewFocusRefs>(
    () => ({
      generation: generationRef,
      session: sessionRef,
      previousActive: previousActiveRef,
      rawActive: rawActiveRef,
      active: activeRef,
      unmounted: unmountedRef,
      lastFocusedEntryGeneration: lastFocusedEntryGenerationRef,
    }),
    []
  );

  useLayoutEffect(() => {
    rawActiveRef.current = rawActive;
    activeRef.current = active;
  }, [active, rawActive]);

  const setClientPreview = useCallback<Dispatch<SetStateAction<boolean>>>(
    (nextValue) => updateClientPreviewState(nextValue, refs, setRawActive),
    [refs, setRawActive]
  );

  useLayoutEffect(() => {
    const scopeChanged = previousScopeKeyRef.current !== scopeKey;
    previousScopeKeyRef.current = scopeKey;
    if (scopeChanged) {
      cancelClientPreviewForScope(active, refs, setRawActive);
      return;
    }
    runClientPreviewFocusTransition(active, refs);
  }, [active, refs, scopeKey, setRawActive]);

  useLayoutEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      generationRef.current += 1;
      sessionRef.current = null;
    };
  }, []);

  return {
    actions: { setClientPreview },
  };
}
