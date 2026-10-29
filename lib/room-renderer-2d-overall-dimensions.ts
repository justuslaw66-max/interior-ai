/**
 * Where the 2D plan's overall width and depth guides sit (30 Oct 2026). They were 0.78 m out from
 * the plan at every zoom, so zoomed out they ran into the selected room's Width and Depth chips
 * (0.3 m and 0.46 m out from its walls) and its measurements. Now they're set in screen pixels:
 * 48px out, or past the selected room's chip when that room is on the plan's top or left edge.
 * The label whose guide runs up the screen is written up it, so it takes 20px across, not ~150.
 */
export const OVERALL_GUIDE_GAP_PX = 48;

/** RoomRenderer2D's room chips: Width 0.3 m above a room, Depth 0.46 m left of it. */
const ROOM_WIDTH_CHIP_OFFSET_M = 0.3;
const ROOM_DEPTH_CHIP_OFFSET_M = 0.46;
/** A room chip is 24px tall and up to about 110px wide ("Depth 12,345 mm"). */
const ROOM_CHIP_HALF_HEIGHT_PX = 12;
const ROOM_CHIP_HALF_WIDTH_PX = 55;
/** Half an overall label across its guide (20px either way), and 6px between it and the chip. */
const CLEARANCE_PX = 10 + 6;
/** A room this close to the plan's edge is on it. */
const EDGE_TOLERANCE_M = 0.05;

type Bounds = { left: number; top: number };

export function overallPlanGuideOffsetsM({
  planBounds,
  selectedRoomBounds,
  zoomPxPerM,
  rotated,
}: {
  planBounds: Bounds | null;
  selectedRoomBounds: Bounds | null;
  zoomPxPerM: number;
  /** The plan is turned a quarter: the width guide runs up the screen and the depth guide across. */
  rotated: boolean;
}) {
  const zoom = Math.max(1, zoomPxPerM);
  const onEdge = (side: keyof Bounds) =>
    planBounds !== null && selectedRoomBounds !== null && selectedRoomBounds[side] - planBounds[side] < EDGE_TOLERANCE_M;
  const onTop = onEdge("top");
  const onLeft = onEdge("left");
  // How far a chip reaches out across a guide: its half height beside a guide that runs across
  // the screen, its half width beside one that runs up it.
  const widthChipReachPx = rotated ? ROOM_CHIP_HALF_WIDTH_PX : ROOM_CHIP_HALF_HEIGHT_PX;
  const depthChipReachPx = rotated ? ROOM_CHIP_HALF_HEIGHT_PX : ROOM_CHIP_HALF_WIDTH_PX;
  const widthPx = Math.max(OVERALL_GUIDE_GAP_PX, onTop ? ROOM_WIDTH_CHIP_OFFSET_M * zoom + widthChipReachPx + CLEARANCE_PX : 0);
  const depthPx = Math.max(OVERALL_GUIDE_GAP_PX, onLeft ? ROOM_DEPTH_CHIP_OFFSET_M * zoom + depthChipReachPx + CLEARANCE_PX : 0);
  return {
    widthGuideOffsetM: widthPx / zoom,
    depthGuideOffsetM: depthPx / zoom,
    /** Which label is written up its guide. */
    verticalLabel: rotated ? ("width" as const) : ("depth" as const),
  };
}
