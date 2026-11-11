import type { PlanSymbolBuilder, PlanSymbolPoint, PlanSymbolShape } from "./plan-symbol-types";
import { box, chair, circle, clamp, cushion, dividers, line, polyline, rect, spread } from "./plan-symbol-shapes";
import { sofaSymbol } from "./plan-symbols-living";

/**
 * More living-room and balcony symbols (batch 2, 11 Nov 2026): U-shaped sofa, sofa bed,
 * daybed, recliner, console table, bar stool, wall TV, piano, aircon fan-coil, outdoor set,
 * planter box and bay-window seat. Same frame and conventions as plan-symbol-types.ts.
 */

/** A U-shaped sofa: a back along the wall, a return seat at each end towards the front. */
export const uShapedSofaSymbol: PlanSymbolBuilder = (width, depth) => {
  const half = width / 2, back = -depth / 2, front = depth / 2;
  const arm = clamp(width * 0.04, 0.08, 0.16);
  const seatTop = back + clamp(depth * 0.12, 0.12, 0.24);
  const returnWidth = clamp(width * 0.27, 0.6, Math.max(0.6, width / 2 - 0.3));
  const mainFront = back + clamp(depth * 0.45, 0.7, Math.max(0.7, depth - 0.3));
  const outline: PlanSymbolPoint[] = [
    [-half, back], [half, back], [half, front], [half - returnWidth, front], [half - returnWidth, mainFront],
    [-half + returnWidth, mainFront], [-half + returnWidth, front], [-half, front],
  ];
  const inner = half - returnWidth;
  return [
    polyline(outline, true, "outline", { fill: true }),
    line([-half + arm, back], [-half + arm, front], "detail"),
    line([half - arm, back], [half - arm, front], "detail"),
    line([-half + arm, seatTop], [half - arm, seatTop], "detail"),
    line([-inner, seatTop], [-inner, mainFront], "fine"),
    line([inner, seatTop], [inner, mainFront], "fine"),
    ...dividers(-inner, inner, clamp(Math.round((inner * 2) / 0.68), 1, 4)).map((x) => line([x, seatTop], [x, mainFront], "fine")),
  ];
};

/** A sofa bed: a sofa with its folded mattress dashed inside the seat. */
export const sofaBedSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const arm = clamp(width * 0.085, 0.08, 0.2);
  const seatTop = -depth / 2 + clamp(depth * 0.22, 0.12, 0.24);
  return [
    ...sofaSymbol(width, depth, options),
    box(-width / 2 + arm + 0.03, seatTop + 0.03, width / 2 - arm - 0.03, depth / 2 - 0.03, "fine", 0.01, { dashed: true }),
  ];
};

/** A daybed or chaise longue: one raised end with a bolster, the seat running from it. */
export const chaiseLoungeSymbol: PlanSymbolBuilder = (width, depth) => {
  const left = -width / 2, end = left + clamp(width * 0.18, 0.15, 0.35);
  return [
    rect(0, 0, width, depth, "outline", Math.min(width, depth) * 0.12, { fill: true }),
    box(left, -depth / 2, end, depth / 2, "detail", Math.min(width, depth) * 0.1),
    cushion(end + clamp(depth * 0.3, 0.12, 0.25), 0, clamp(depth * 0.4, 0.15, 0.35), clamp(depth * 0.55, 0.2, 0.45), 0, "fine"),
  ];
};

/** A recliner: an armchair at the back, its footrest dashed in front (drawn out). */
export const reclinerSymbol: PlanSymbolBuilder = (width, depth) => {
  const left = -width / 2, right = width / 2, back = -depth / 2, front = depth / 2;
  const seatFront = back + depth * 0.78;
  const arm = clamp(width * 0.17, 0.07, 0.16);
  return [
    box(left, back, right, seatFront, "outline", Math.min(width, depth) * 0.12, { fill: true }),
    box(left + arm, back + clamp(depth * 0.2, 0.1, 0.2), right - arm, seatFront - 0.015, "detail", 0.04),
    box(left + arm, seatFront, right - arm, front, "detail", 0.03, { dashed: true }),
  ];
};

/** A console table: a slim top with its inner edge. */
export const consoleTableSymbol: PlanSymbolBuilder = (width, depth) => {
  const inset = clamp(Math.min(width, depth) * 0.1, 0.01, 0.03);
  return [
    rect(0, 0, width, depth, "outline", 0.008, { fill: true }),
    rect(0, 0, width - inset * 2, depth - inset * 2, "fine", 0.006),
  ];
};

/** A bar or counter stool: a round seat over its footrest ring. */
export const barStoolSymbol: PlanSymbolBuilder = (width, depth) => {
  const r = Math.min(width, depth) / 2;
  return [circle(0, 0, r, "fine", { dashed: true }), circle(0, 0, r * 0.72, "outline", { fill: true }), circle(0, 0, r * 0.5, "fine")];
};

/** A wall-mounted TV: overhead, so dashed, with its screen line at the front. */
export const wallTvSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "detail", 0, { dashed: true }),
  line([-width / 2 + 0.02, depth / 2 - depth * 0.3], [width / 2 - 0.02, depth / 2 - depth * 0.3], "fine", { dashed: true }),
];

/** An upright piano: the case, and the keyboard along the front. */
export const pianoSymbol: PlanSymbolBuilder = (width, depth) => {
  const keysBack = depth / 2 - clamp(depth * 0.35, 0.12, 0.25);
  const cheek = clamp(width * 0.04, 0.03, 0.07);
  const keys = clamp(Math.round((width - cheek * 2) / 0.045), 4, 52);
  return [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    box(-width / 2 + cheek, keysBack, width / 2 - cheek, depth / 2 - 0.01, "detail"),
    ...dividers(-width / 2 + cheek, width / 2 - cheek, keys).map((x) => line([x, keysBack], [x, depth / 2 - 0.01], "fine")),
  ];
};

/** An aircon fan-coil, high on the wall: dashed, with its louvre along the front. */
export const airconSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "detail", Math.min(width, depth) * 0.15, { dashed: true }),
  ...spread(depth * 0.05, depth / 2 - depth * 0.08, 2).map((z) => line([-width / 2 + 0.04, z], [width / 2 - 0.04, z], "fine", { dashed: true })),
];

/** A balcony set: a small round table between two chairs facing it. */
export const outdoorSetSymbol: PlanSymbolBuilder = (width, depth) => {
  const tableR = clamp(Math.min(width * 0.2, depth * 0.45), 0.15, 0.4);
  const chairWidth = clamp(Math.min(depth * 0.6, (width / 2 - tableR) * 0.9), 0.1, 0.55);
  const chairDepth = clamp(Math.min(depth * 0.6, width / 2 - tableR - 0.02), 0.1, 0.55);
  const offset = width / 2 - chairDepth / 2;
  return [
    ...chair(-offset, 0, 0, chairWidth, chairDepth),
    ...chair(offset, 0, 180, chairWidth, chairDepth),
    circle(0, 0, tableR, "outline", { fill: true }),
    circle(0, 0, tableR * 0.8, "fine"),
  ];
};

/** A planter box: its rim, and the plants growing along it. */
export const planterBoxSymbol: PlanSymbolBuilder = (width, depth) => {
  const rim = clamp(Math.min(width, depth) * 0.08, 0.015, 0.04);
  const plantR = clamp(depth / 2 - rim * 1.5, 0.03, 0.2);
  const plants = clamp(Math.floor((width - rim * 2) / (plantR * 2.2)), 1, 12);
  return [
    rect(0, 0, width, depth, "outline", 0, { fill: true }),
    rect(0, 0, width - rim * 2, depth - rim * 2, "fine"),
    ...spread(-width / 2 + rim, width / 2 - rim, plants).map((x) => circle(x, 0, plantR, "fine")),
  ];
};

/** A bay-window seat: the ledge with seat cushions about 60 cm long, against the glass at the back. */
export const bayWindowSeatSymbol: PlanSymbolBuilder = (width, depth) => {
  const inset = clamp(depth * 0.08, 0.02, 0.05);
  const cushions = clamp(Math.round(width / 0.6), 1, 8);
  const shapes: PlanSymbolShape[] = [rect(0, 0, width, depth, "outline", 0, { fill: true })];
  shapes.push(...spread(-width / 2, width / 2, cushions).map((x) =>
    rect(x, inset / 2, width / cushions - inset, depth - inset * 3, "fine", Math.min(depth * 0.1, 0.04))));
  return shapes;
};
