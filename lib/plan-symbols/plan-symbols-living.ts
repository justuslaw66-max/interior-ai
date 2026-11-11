import type { PlanSymbolBuilder, PlanSymbolPoint, PlanSymbolShape } from "./plan-symbol-types";
import {
  arc,
  box,
  circle,
  clamp,
  cushion,
  dividers,
  ellipse,
  line,
  placePoints,
  polyline,
  rect,
} from "./plan-symbol-shapes";

/** Seat cushions that fit a seat run, about 60-75 cm each. */
function seatCount(seatWidth: number, requested?: number) {
  if (requested) return clamp(Math.round(requested), 1, 6);
  return clamp(Math.round(seatWidth / 0.68), 1, 4);
}

function sofaThrowPillows(x0: number, x1: number, backZ: number, seatDepth: number): PlanSymbolShape[] {
  const size = clamp(Math.min((x1 - x0) * 0.2, seatDepth * 0.55), 0.22, 0.42);
  if (x1 - x0 < size * 3) return [];
  const z = backZ + size * 0.5;
  return [
    cushion(x0 + size * 0.62, z, size, size * 0.9, -12, "fine"),
    cushion(x1 - size * 0.62, z, size, size * 0.9, 12, "fine"),
  ];
}

export const sofaSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const left = -width / 2;
  const right = width / 2;
  const back = -depth / 2;
  const front = depth / 2;
  const arm = clamp(width * 0.085, 0.08, 0.2);
  const backDepth = clamp(depth * 0.22, 0.12, 0.24);
  const seats = seatCount(width - arm * 2, options.seats);
  const seatTop = back + backDepth;
  return [
    box(left, back, right, front, "outline", 0.04, { fill: true }),
    box(left, back, left + arm, front, "detail", 0.035),
    box(right - arm, back, right, front, "detail", 0.035),
    box(left + arm, back, right - arm, seatTop, "detail", 0.02),
    ...dividers(left + arm, right - arm, seats).map((x) =>
      line([x, seatTop], [x, front - 0.01], "fine")
    ),
    ...sofaThrowPillows(left + arm, right - arm, seatTop, front - seatTop),
  ];
};

export const sectionalSofaSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const mirror = options.chaiseSide === "left" ? -1 : 1;
  const half = width / 2;
  const back = -depth / 2;
  const front = depth / 2;
  const arm = clamp(width * 0.05, 0.08, 0.18);
  const backDepth = clamp(depth * 0.14, 0.12, 0.24);
  const mainFront = back + clamp(depth * 0.58, 0.75, Math.max(0.75, depth - 0.3));
  const chaise = clamp(width * 0.32, 0.75, 1.05);
  const seatTop = back + backDepth;
  const flip = (points: PlanSymbolPoint[]) => points.map(([x, z]) => [x * mirror, z] as const);
  const mainSeatRight = half - chaise;
  const outline: PlanSymbolPoint[] = [
    [-half, back], [half, back], [half, front], [half - chaise, front],
    [half - chaise, mainFront], [-half, mainFront],
  ];
  return [
    polyline(flip(outline), true, "outline", { fill: true }),
    polyline(flip([[-half + arm, back], [-half + arm, mainFront]]), false, "detail"),
    polyline(flip([[half - arm, back], [half - arm, front]]), false, "detail"),
    polyline(flip([[-half + arm, seatTop], [half - arm, seatTop]]), false, "detail"),
    polyline(flip([[mainSeatRight, mainFront], [half - arm, mainFront]]), false, "fine"),
    ...dividers(-half + arm, mainSeatRight, seatCount(mainSeatRight + half - arm, options.seats)).map((x) =>
      polyline(flip([[x, seatTop], [x, mainFront]]), false, "fine")
    ),
    polyline(flip([[mainSeatRight, seatTop], [mainSeatRight, mainFront]]), false, "fine"),
  ];
};

export const armchairSymbol: PlanSymbolBuilder = (width, depth) => {
  const left = -width / 2;
  const right = width / 2;
  const back = -depth / 2;
  const front = depth / 2;
  const arm = clamp(width * 0.17, 0.07, 0.16);
  const backDepth = clamp(depth * 0.24, 0.1, 0.2);
  return [
    box(left, back, right, front, "outline", Math.min(width, depth) * 0.14, { fill: true }),
    box(left + arm, back + backDepth, right - arm, front - 0.015, "detail", 0.04),
    line([left + arm, back + backDepth], [right - arm, back + backDepth], "detail"),
  ];
};

export const ottomanSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "outline", Math.min(width, depth) * 0.18, { fill: true }),
  rect(0, 0, width - 0.06, depth - 0.06, "fine", Math.min(width, depth) * 0.14),
];

function isRound(width: number, depth: number, round?: boolean) {
  return round ?? Math.abs(width - depth) <= Math.max(width, depth) * 0.06;
}

/** A table top: round or oval when it is (nearly) square or asked to be. */
function tableTop(width: number, depth: number, round: boolean | undefined, inset: number): PlanSymbolShape[] {
  if (isRound(width, depth, round)) {
    return [
      ellipse(0, 0, width / 2, depth / 2, "outline", { fill: true }),
      ellipse(0, 0, width / 2 - inset, depth / 2 - inset, "fine"),
    ];
  }
  return [
    rect(0, 0, width, depth, "outline", 0.015, { fill: true }),
    rect(0, 0, width - inset * 2, depth - inset * 2, "fine", 0.01),
  ];
}

export const coffeeTableSymbol: PlanSymbolBuilder = (width, depth, options) =>
  tableTop(width, depth, options.round, clamp(Math.min(width, depth) * 0.07, 0.02, 0.04));

export const sideTableSymbol: PlanSymbolBuilder = (width, depth, options) =>
  tableTop(width, depth, options.round ?? true, clamp(Math.min(width, depth) * 0.08, 0.015, 0.03));

export const tvConsoleSymbol: PlanSymbolBuilder = (width, depth) => {
  const back = -depth / 2;
  const doors = clamp(Math.round(width / 0.5), 1, 6);
  const tvWidth = clamp(width * 0.72, 0.5, 1.9);
  const panel = clamp(depth * 0.12, 0.03, 0.05);
  const tvZ = back + clamp(depth * 0.3, 0.1, 0.16);
  return [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    line([-width / 2 + 0.015, depth / 2 - 0.02], [width / 2 - 0.015, depth / 2 - 0.02], "fine"),
    ...dividers(-width / 2, width / 2, doors).map((x) => line([x, depth / 2 - 0.02], [x, depth / 2], "fine")),
    rect(0, tvZ + panel * 0.9, tvWidth * 0.32, panel * 1.2, "fine", 0.01, { fill: true }),
    rect(0, tvZ, tvWidth, panel, "detail", 0.006, { fill: true }),
  ];
};

export const rugSymbol: PlanSymbolBuilder = (width, depth) => {
  const fringe = clamp(Math.min(width, depth) * 0.035, 0.03, 0.06);
  const bodyLeft = -width / 2 + fringe;
  const bodyRight = width / 2 - fringe;
  const count = Math.max(4, Math.round(depth / 0.05));
  const ticks = Array.from({ length: count + 1 }, (_, index) => -depth / 2 + (depth * index) / count);
  return [
    box(bodyLeft, -depth / 2, bodyRight, depth / 2, "detail"),
    box(bodyLeft + 0.05, -depth / 2 + 0.05, bodyRight - 0.05, depth / 2 - 0.05, "fine", 0, { dashed: true }),
    ...ticks.flatMap((z) => [
      line([-width / 2, z], [bodyLeft, z], "fine"),
      line([bodyRight, z], [width / 2, z], "fine"),
    ]),
  ];
};

function lampSymbol(width: number, depth: number, dashed: boolean): PlanSymbolShape[] {
  const r = Math.min(width, depth) / 2;
  return [
    circle(0, 0, r, dashed ? "detail" : "outline", { fill: !dashed, dashed }),
    circle(0, 0, r * 0.32, "fine", { dashed }),
    line([-r * 0.707, -r * 0.707], [r * 0.707, r * 0.707], "fine", { dashed }),
    line([-r * 0.707, r * 0.707], [r * 0.707, -r * 0.707], "fine", { dashed }),
  ];
}

export const floorLampSymbol: PlanSymbolBuilder = (width, depth) => lampSymbol(width, depth, false);
export const tableLampSymbol: PlanSymbolBuilder = (width, depth) => lampSymbol(width, depth, false);
export const pendantLightSymbol: PlanSymbolBuilder = (width, depth) => lampSymbol(width, depth, true);

function fanBlade(sweep: number, angleDeg: number): PlanSymbolShape {
  const inner = sweep * 0.17;
  const outer = sweep * 0.94;
  const rootHalf = sweep * 0.045;
  const tipHalf = sweep * 0.12;
  const points: PlanSymbolPoint[] = [
    [inner, -rootHalf], [outer - tipHalf * 0.4, -tipHalf], [outer, -tipHalf * 0.35],
    [outer, tipHalf * 0.35], [outer - tipHalf * 0.4, tipHalf], [inner, rootHalf],
  ];
  // Overhead: no paper, so the furniture under the fan still shows.
  return polyline(placePoints(points, angleDeg, 0, 0), true, "detail");
}

export const ceilingFanSymbol: PlanSymbolBuilder = (width, depth) => {
  const sweep = Math.min(width, depth) / 2;
  return [
    circle(0, 0, sweep, "fine", { dashed: true }),
    fanBlade(sweep, -90),
    fanBlade(sweep, 30),
    fanBlade(sweep, 150),
    circle(0, 0, sweep * 0.2, "detail"),
    circle(0, 0, sweep * 0.09, "fine"),
  ];
};

export const plantSymbol: PlanSymbolBuilder = (width, depth) => {
  const r = Math.min(width, depth) / 2;
  const leaves = 9;
  const shapes: PlanSymbolShape[] = [];
  for (let index = 0; index < leaves; index += 1) {
    const angle = (360 / leaves) * index;
    const leaf: PlanSymbolPoint[] = [[r * 0.2, 0], [r * 0.6, -r * 0.16], [r, 0], [r * 0.6, r * 0.16]];
    shapes.push(polyline(placePoints(leaf, angle, 0, 0), true, "fine"));
    shapes.push(polyline(placePoints([[r * 0.2, 0], [r * 0.95, 0]], angle, 0, 0), false, "fine"));
  }
  shapes.push(circle(0, 0, r * 0.3, "outline", { fill: true }));
  shapes.push(arc(0, 0, r * 0.22, 200, 340, "fine"));
  return shapes;
};
