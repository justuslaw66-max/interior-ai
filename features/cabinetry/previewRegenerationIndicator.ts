import { useEffect, useReducer } from "react";

export const CABINET_PREVIEW_REGENERATION_INDICATOR_DELAY_MS = 200;

export interface CabinetPreviewIndicatorState {
  pending: boolean;
  visible: boolean;
  cycle: number;
}

export type CabinetPreviewIndicatorAction =
  | { type: "synchronize"; pending: boolean }
  | { type: "delay_elapsed"; cycle: number };

export const INITIAL_CABINET_PREVIEW_INDICATOR_STATE: CabinetPreviewIndicatorState = {
  pending: false,
  visible: false,
  cycle: 0,
};

/**
 * A small state machine keeps elapsed callbacks tied to the pending cycle that
 * created them. A stale timeout can therefore never reopen an indicator after
 * regeneration has completed or a later regeneration has started.
 */
export function reduceCabinetPreviewIndicator(
  state: CabinetPreviewIndicatorState,
  action: CabinetPreviewIndicatorAction
): CabinetPreviewIndicatorState {
  if (action.type === "synchronize") {
    if (action.pending === state.pending) return state;
    return {
      pending: action.pending,
      visible: false,
      cycle: state.cycle + 1,
    };
  }

  if (!state.pending || action.cycle !== state.cycle || state.visible) {
    return state;
  }
  return { ...state, visible: true };
}

export function useDelayedCabinetPreviewRegenerationIndicator(
  pending: boolean,
  delayMs = CABINET_PREVIEW_REGENERATION_INDICATOR_DELAY_MS
): boolean {
  const [state, dispatch] = useReducer(
    reduceCabinetPreviewIndicator,
    INITIAL_CABINET_PREVIEW_INDICATOR_STATE
  );

  useEffect(() => {
    dispatch({ type: "synchronize", pending });
  }, [pending]);

  useEffect(() => {
    if (!pending || !state.pending || state.visible) return;
    const cycle = state.cycle;
    const timeout = window.setTimeout(
      () => dispatch({ type: "delay_elapsed", cycle }),
      Math.max(0, delayMs)
    );
    return () => window.clearTimeout(timeout);
  }, [delayMs, pending, state.cycle, state.pending, state.visible]);

  return pending && state.pending && state.visible;
}
