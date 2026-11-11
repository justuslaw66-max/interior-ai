/**
 * The plan symbol of a door or window in a room-drawn plan, as plain lines on the floor (x, z in
 * metres). The 2D editor draws these with WebGL lines; the Download PDF's plan page draws the
 * same lines as vectors, so both show the same door swings and glazing.
 */

export type OpeningSymbolPoint = { x: number; z: number };
export type OpeningSymbolWall = "north" | "south" | "east" | "west";
export type OpeningSymbolDoorStyle = "swing" | "sliding" | "folding" | "open";

/** What a line is: glazing and jambs, a door leaf, its swing, a sliding leaf or a folding run. */
export type OpeningSymbolRole = "glazing" | "jamb" | "swing_leaf" | "swing_arc" | "sliding_leaf" | "folding_leaf";
export type OpeningSymbolLine = { role: OpeningSymbolRole; points: OpeningSymbolPoint[] };

export type OpeningSymbolInput = {
  start: OpeningSymbolPoint;
  end: OpeningSymbolPoint;
  kind: "door" | "window";
  doorStyle?: OpeningSymbolDoorStyle;
  wall: OpeningSymbolWall;
  /** The host's resolved inward normal, where the opening has one; else the wall side's. */
  inwardNormal?: OpeningSymbolPoint;
};

const GLAZING_OFFSET_METERS = 0.045;
const SLIDING_OFFSET_METERS = 0.055;
const FOLD_DEPTH_METERS = 0.07;
const SWING_SAMPLES = 9;

export function openingSymbolInwardNormal(wall: OpeningSymbolWall, resolved?: OpeningSymbolPoint): OpeningSymbolPoint {
  if (resolved) return { x: resolved.x, z: resolved.z };
  if (wall === "north") return { x: 0, z: 1 };
  if (wall === "south") return { x: 0, z: -1 };
  if (wall === "west") return { x: 1, z: 0 };
  return { x: -1, z: 0 };
}

const offset = (point: OpeningSymbolPoint, normal: OpeningSymbolPoint, distance: number) =>
  ({ x: point.x + normal.x * distance, z: point.z + normal.z * distance });

function windowLines(start: OpeningSymbolPoint, end: OpeningSymbolPoint, inward: OpeningSymbolPoint): OpeningSymbolLine[] {
  const firstStart = offset(start, inward, -GLAZING_OFFSET_METERS);
  const firstEnd = offset(end, inward, -GLAZING_OFFSET_METERS);
  const secondStart = offset(start, inward, GLAZING_OFFSET_METERS);
  const secondEnd = offset(end, inward, GLAZING_OFFSET_METERS);
  return [
    { role: "glazing", points: [firstStart, firstEnd] },
    { role: "glazing", points: [secondStart, secondEnd] },
    { role: "jamb", points: [firstStart, secondStart] },
    { role: "jamb", points: [firstEnd, secondEnd] },
  ];
}

function slidingLines(start: OpeningSymbolPoint, end: OpeningSymbolPoint, inward: OpeningSymbolPoint): OpeningSymbolLine[] {
  const along = { x: end.x - start.x, z: end.z - start.z };
  const firstEnd = { x: start.x + along.x * 0.58, z: start.z + along.z * 0.58 };
  const secondStart = offset({ x: start.x + along.x * 0.42, z: start.z + along.z * 0.42 }, inward, SLIDING_OFFSET_METERS);
  return [
    { role: "sliding_leaf", points: [start, firstEnd] },
    { role: "sliding_leaf", points: [secondStart, offset(end, inward, SLIDING_OFFSET_METERS)] },
  ];
}

/** The leaf stands open at 90 degrees from the hinge at `start`; the arc runs from the closed end to it. */
function swingLines(start: OpeningSymbolPoint, end: OpeningSymbolPoint, inward: OpeningSymbolPoint): OpeningSymbolLine[] {
  const width = Math.max(0.001, Math.hypot(end.x - start.x, end.z - start.z));
  const along = { x: (end.x - start.x) / width, z: (end.z - start.z) / width };
  const arc = Array.from({ length: SWING_SAMPLES }, (_, index) => {
    const angle = (index / (SWING_SAMPLES - 1)) * (Math.PI / 2);
    return {
      x: start.x + along.x * width * Math.cos(angle) + inward.x * width * Math.sin(angle),
      z: start.z + along.z * width * Math.cos(angle) + inward.z * width * Math.sin(angle),
    };
  });
  return [
    { role: "swing_leaf", points: [start, offset(start, inward, width)] },
    { role: "swing_arc", points: arc },
  ];
}

function foldingLines(start: OpeningSymbolPoint, end: OpeningSymbolPoint, inward: OpeningSymbolPoint): OpeningSymbolLine[] {
  const points = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const fold = index === 0 || index === 4 ? 0 : index % 2 === 0 ? -FOLD_DEPTH_METERS : FOLD_DEPTH_METERS;
    return offset({ x: start.x + (end.x - start.x) * ratio, z: start.z + (end.z - start.z) * ratio }, inward, fold);
  });
  return [{ role: "folding_leaf", points }];
}

/** An open doorway draws no symbol: the gap in the wall is the drawing. */
export function buildOpeningSymbolLines2D(input: OpeningSymbolInput): OpeningSymbolLine[] {
  const inward = openingSymbolInwardNormal(input.wall, input.inwardNormal);
  if (input.kind === "window") return windowLines(input.start, input.end, inward);
  if (input.doorStyle === "open") return [];
  if (input.doorStyle === "sliding") return slidingLines(input.start, input.end, inward);
  if (!input.doorStyle || input.doorStyle === "swing") return swingLines(input.start, input.end, inward);
  return foldingLines(input.start, input.end, inward);
}
