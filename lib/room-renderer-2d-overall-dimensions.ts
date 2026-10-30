/**
 * Where the 2D plan's overall width and depth guides and their labels sit (30 Oct 2026). They were
 * 0.78 m out from the plan at every zoom, so zoomed out they ran into the selected room's Width and
 * Depth chips and its measurements. Now each guide is 48px out on screen, and keeps clear of them:
 * - the guide that runs across the screen moves out past them (only the top or bottom edge's guide
 *   can, as there's room above and below the plan);
 * - the guide that runs up the screen stays 48px out (pushed further, it went under a tablet's step
 *   panel) and its label slides along it, off the chip or the measurements it would cover. When the
 *   plan is too short on screen for that, it moves out instead: there's room beside a small plan.
 * The label on a guide that runs up the screen is written up it, so it takes 24px across, not ~160.
 */
export const OVERALL_GUIDE_GAP_PX = 48;

/** An overall label: 24px across its guide and up to ~160px along it, with 6px between it and the rest. */
const LABEL_HALF_ACROSS_PX = 12;
const LABEL_HALF_ALONG_PX = 80;
const GAP_PX = 6;

export type OverallPlanBounds = { left: number; right: number; top: number; bottom: number };
type Axis = "x" | "z";
/** Something drawn on the selected room: its centre in the world, and its half size on screen along each world axis. */
type Obstacle = { at: Record<Axis, number>; halfPx: Record<Axis, number> };
/** Something on the screen, anchored at a world point and nudged in screen px (y down), with its half size. */
type ScreenBox = { x: number; z: number; dx?: number; dy?: number; halfW: number; halfH: number };

/**
 * RoomRenderer2D's selected room: the Width chip 0.3 m above it and the Depth chip 0.46 m left of
 * it (24 × up to ~115px), and the measurements at its top right corner, nudged 14px right
 * and 16px up (three lines, about 195 × 62px). The chips and measurements face the screen, so on a
 * turned plan (screen up is world +x, screen right is world +z) their width runs along world z.
 */
function selectedRoomObstacles(room: OverallPlanBounds, zoom: number, rotated: boolean): Obstacle[] {
  const toWorld = ({ x, z, dx = 0, dy = 0, halfW, halfH }: ScreenBox): Obstacle =>
    rotated
      ? { at: { x: x - dy / zoom, z: z + dx / zoom }, halfPx: { x: halfH, z: halfW } }
      : { at: { x: x + dx / zoom, z: z + dy / zoom }, halfPx: { x: halfW, z: halfH } };
  return [
    toWorld({ x: (room.left + room.right) / 2, z: room.top - 0.3, halfW: 58, halfH: 12 }),
    toWorld({ x: room.left - 0.46, z: (room.top + room.bottom) / 2, halfW: 58, halfH: 12 }),
    toWorld({ x: room.right, z: room.top, dx: 14, dy: -16, halfW: 100, halfH: 31 }),
  ];
}

/** The label's centre along its guide, as near the plan's middle as it can be while clear of the obstacles, if it can be. */
function labelCentreM(fromM: number, toM: number, obstacles: readonly { atM: number; halfAlongPx: number }[], zoom: number) {
  const middle = (fromM + toM) / 2;
  const awayM = (obstacle: { halfAlongPx: number }) => (LABEL_HALF_ALONG_PX + obstacle.halfAlongPx + GAP_PX) / zoom;
  const clear = (at: number) => obstacles.every((obstacle) => Math.abs(at - obstacle.atM) >= awayM(obstacle) - 1e-9);
  const candidates = [middle, ...obstacles.flatMap((obstacle) => [obstacle.atM - awayM(obstacle), obstacle.atM + awayM(obstacle)])];
  const fits = candidates.filter((at) => at >= fromM && at <= toM && clear(at));
  return fits.sort((a, b) => Math.abs(a - middle) - Math.abs(b - middle))[0] ?? null;
}

/**
 * One guide, `across` being the world axis it's set out along (z for width, x for depth), from the
 * plan's `edgeM` (top or left) outwards. `pushed`: it runs across the screen, so it moves out.
 */
function guideLayout(obstacles: readonly Obstacle[], across: Axis, edgeM: number, fromM: number, toM: number, zoom: number, pushed: boolean) {
  const along: Axis = across === "z" ? "x" : "z";
  const placed = obstacles.map((obstacle) => ({
    outPx: (edgeM - obstacle.at[across]) * zoom, halfAcrossPx: obstacle.halfPx[across],
    atM: obstacle.at[along], halfAlongPx: obstacle.halfPx[along],
  }));
  const clearancePx = (obstacle: (typeof placed)[number]) => obstacle.halfAcrossPx + LABEL_HALF_ACROSS_PX + GAP_PX;
  const pushedPx = Math.max(OVERALL_GUIDE_GAP_PX, ...placed.map((obstacle) => obstacle.outPx + clearancePx(obstacle)));
  const crossing = placed.filter((obstacle) => Math.abs(obstacle.outPx - OVERALL_GUIDE_GAP_PX) < clearancePx(obstacle));
  const slidM = pushed ? null : labelCentreM(fromM, toM, crossing, zoom);
  return slidM === null
    ? { offsetM: pushedPx / zoom, labelM: (fromM + toM) / 2 }
    : { offsetM: OVERALL_GUIDE_GAP_PX / zoom, labelM: slidM };
}

export function overallPlanGuideLayout({
  planBounds,
  selectedRoomBounds,
  zoomPxPerM,
  rotated,
}: {
  planBounds: OverallPlanBounds | null;
  selectedRoomBounds: OverallPlanBounds | null;
  zoomPxPerM: number;
  /** The plan is turned a quarter: the width guide runs up the screen and the depth guide across. */
  rotated: boolean;
}) {
  const zoom = Math.max(1, zoomPxPerM);
  const plan = planBounds ?? { left: 0, right: 0, top: 0, bottom: 0 };
  const obstacles = planBounds && selectedRoomBounds ? selectedRoomObstacles(selectedRoomBounds, zoom, rotated) : [];
  const width = guideLayout(obstacles, "z", plan.top, plan.left, plan.right, zoom, !rotated);
  const depth = guideLayout(obstacles, "x", plan.left, plan.top, plan.bottom, zoom, rotated);
  return {
    widthGuideOffsetM: width.offsetM,
    depthGuideOffsetM: depth.offsetM,
    widthLabelX: width.labelM,
    depthLabelZ: depth.labelM,
    /** Which label is written up its guide. */
    verticalLabel: rotated ? ("width" as const) : ("depth" as const),
  };
}
