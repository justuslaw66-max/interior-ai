import type { HistoryManager } from "@/lib/historyManager";

type GestureHistory = Pick<HistoryManager, "begin" | "commit">;

/**
 * Opens or closes the history transaction that brackets one canvas gesture (a room move, room
 * resize or plan-overlay drag), so the whole gesture is one undo step: call it with `active` true
 * when the gesture starts and false when it ends.
 *
 * A slider's coalesced transaction can still be open when the gesture starts, and begin() refuses
 * to nest, so it is flushed first. The gesture then owns only a transaction begin() actually
 * opened: if something else still holds one, the gesture leaves it for its owner to close.
 */
export function syncGestureTransaction(
  history: GestureHistory,
  flushCoalescedHistoryTransaction: () => void,
  activeRef: { current: boolean },
  active: boolean,
  name: string
): void {
  if (active && !activeRef.current) {
    flushCoalescedHistoryTransaction();
    activeRef.current = history.begin(name);
  } else if (!active && activeRef.current) {
    history.commit();
    activeRef.current = false;
  }
}
