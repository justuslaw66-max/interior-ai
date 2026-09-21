export const OPENING_DRAG_POINTER_BUTTON = 0;

export type OpeningPointerDown = {
  /** Only the primary button drags an opening; the others orbit, pan or zoom the camera. */
  button: number;
  interactive: boolean;
  /** This renderer can move the opening: a move handler, and for a threshold a resolved host with room to move. */
  dragEnabled: boolean;
};

/**
 * A pointer-down may claim the opening only when this renderer owns the whole gesture, which is
 * exactly when it starts the opening drag. An unclaimed pointer-down belongs to OrbitControls, and
 * selectStructureTarget cannot refuse it: event.delta is still 0 before the pointer moves, and a
 * drag that ends on a canonical wall deliberately keeps the opening selection, so an orbit would
 * leave the opening selected. Those gestures select through the delta-guarded click instead.
 */
export function shouldOpeningPointerDownSelect(event: OpeningPointerDown): boolean {
  return event.interactive && event.button === OPENING_DRAG_POINTER_BUTTON && event.dragEnabled;
}
