import type { RootState } from "@react-three/fiber";

type SizeStore = Pick<RootState, "setSize" | "set" | "get">;

/**
 * R3F's Canvas re-applies its container's size on every render, and its
 * equality check never passes (the measured rect has keys `state.size` lacks),
 * so each render of the canvas stored a new size object even when nothing had
 * moved. Every size subscriber then re-rendered on each page render (a click,
 * a selection): drei's Line and Html, and every component calling `useThree()`
 * without a selector, memoized or not. After this, a size equal to the current
 * one is skipped; a real resize still goes through.
 */
export function skipUnchangedCanvasSize(state: SizeStore) {
  const setSize = state.setSize;
  state.set({
    setSize: (width, height, top = 0, left = 0) => {
      const size = state.get().size;
      if (size.width === width && size.height === height && size.top === top && size.left === left) return;
      setSize(width, height, top, left);
    },
  });
}
