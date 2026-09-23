import type { MutableRefObject } from "react";
import {
  hasExternalEditorModal,
  isElementInTopmostEditorDialog,
} from "@/components/editor/design-system/editorDialogRegistry";
import {
  isEligibleReturnFocusTarget,
  isValidReturnFocusTarget,
} from "@/components/editor/design-system/editorDialogFocus";

type RestorationOptions = {
  returnFocusId?: string;
  returnFocusIds?: readonly string[];
  focusRestorationEnabledRef?: { current: boolean };
  generation: number;
  restoreFrameRef: MutableRefObject<number | null>;
  generationRef: MutableRefObject<number>;
  unmountedRef: MutableRefObject<boolean>;
};

function canRestore(options: RestorationOptions) {
  return !options.unmountedRef.current &&
    options.generationRef.current === options.generation &&
    options.focusRestorationEnabledRef?.current !== false &&
    !hasExternalEditorModal();
}

function restoreSemanticTarget(
  semanticIds: readonly string[],
  options: RestorationOptions,
  framesRemaining = 12
) {
  options.restoreFrameRef.current = window.requestAnimationFrame(() => {
    options.restoreFrameRef.current = null;
    if (!canRestore(options)) return;
    const candidates = semanticIds
      .map((id) => document.getElementById(id))
      .filter((candidate): candidate is HTMLElement =>
        candidate instanceof HTMLElement &&
        isEligibleReturnFocusTarget(candidate) &&
        isElementInTopmostEditorDialog(candidate)
      );
    const target = candidates.find(isValidReturnFocusTarget);
    if (target) {
      if (document.activeElement !== target) {
        target.focus({ preventScroll: true });
        if (document.activeElement !== target) target.focus();
      }
      if (document.activeElement === target) return;
    } else {
      candidates[0]?.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: "auto",
      });
    }
    if (framesRemaining > 1) {
      restoreSemanticTarget(semanticIds, options, framesRemaining - 1);
    }
  });
}

export function scheduleEditorDialogFocusRestoration(
  opener: HTMLElement | null,
  ownedTopmostFocus: boolean,
  options: RestorationOptions
) {
  const semanticIds = [
    ...(options.returnFocusIds ?? []),
    ...(options.returnFocusId ? [options.returnFocusId] : []),
  ];
  options.restoreFrameRef.current = window.requestAnimationFrame(() => {
    // React removes a closing portal after layout-effect cleanup. Wait one
    // paint before rejecting a semantic target as visually obscured.
    options.restoreFrameRef.current = window.requestAnimationFrame(() => {
      options.restoreFrameRef.current = null;
      if (!ownedTopmostFocus || !canRestore(options)) return;
      if (semanticIds.length > 0) {
        restoreSemanticTarget(semanticIds, options);
      } else if (
        opener &&
        isElementInTopmostEditorDialog(opener) &&
        isValidReturnFocusTarget(opener)
      ) {
        opener.focus({ preventScroll: true });
      }
    });
  });
}
