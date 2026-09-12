export const ROOM_PLAN_CLICK_DISTANCE_PX = 6;

type SurfaceTarget = { kind: "floor" | "wall"; roomId: string; id: string };
type SurfaceClick = {
  delta: number;
  stopPropagation: () => void;
  nativeEvent: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean };
};

export function selectRoomSurfaceFromClick(
  event: SurfaceClick,
  target: SurfaceTarget,
  onSelectRoom?: (roomId: string, options?: { additive?: boolean }) => void,
  onSelectSurfaceTarget?: (target: SurfaceTarget) => void
) {
  event.stopPropagation();
  // R3F retains underlying initial hits and can dispatch click after a drag.
  if (event.delta > ROOM_PLAN_CLICK_DISTANCE_PX) return;
  const additive = target.kind === "floor" && (
    event.nativeEvent.shiftKey || event.nativeEvent.metaKey || event.nativeEvent.ctrlKey
  );
  if (additive) onSelectRoom?.(target.roomId, { additive: true });
  else if (onSelectSurfaceTarget) onSelectSurfaceTarget(target);
  else onSelectRoom?.(target.roomId);
}
