import type { PlanSymbolBuilder, PlanSymbolShape } from "./plan-symbol-types";
import { box, circle, clamp, dividers, line, rect, spread } from "./plan-symbol-shapes";
import { bedSymbol, deskSymbol } from "./plan-symbols-dining-bedroom";

/**
 * More bedroom, study and storage symbols (batch 2, 11 Nov 2026): bunk bed, cot, dressing
 * table, study table, tall cabinet, shoe bench, coat rack and altar cabinet.
 */

/** A bunk bed: the lower bed, the upper bunk dashed above it, and the ladder up the side near the foot. */
export const bunkBedSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const inset = clamp(Math.min(width, depth) * 0.03, 0.015, 0.04);
  const ladderLength = clamp(depth * 0.2, 0.15, 0.45);
  const left = -width / 2 + inset, rail = left + clamp(width * 0.06, 0.02, 0.07);
  const bottom = depth / 2 - inset - clamp(depth * 0.04, 0.02, 0.08), top = bottom - ladderLength;
  return [
    ...bedSymbol(width, depth, options),
    rect(0, 0, width - inset * 2, depth - inset * 2, "detail", 0.01, { dashed: true }),
    line([rail, top], [rail, bottom], "fine"),
    ...spread(top, bottom, clamp(Math.round(ladderLength / 0.1), 2, 5)).map((z) => line([left, z], [rail, z], "fine")),
  ];
};

/** A baby cot: the mattress, ringed by its bars. */
export const cotSymbol: PlanSymbolBuilder = (width, depth) => {
  const rail = clamp(Math.min(width, depth) * 0.06, 0.02, 0.05);
  const left = -width / 2 + rail, right = width / 2 - rail;
  const bars = clamp(Math.round((depth - rail * 2) / 0.08), 3, 20);
  return [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    rect(0, 0, width - rail * 2, depth - rail * 2, "detail", 0.01),
    ...spread(-depth / 2 + rail, depth / 2 - rail, bars).flatMap((z) => [
      line([-width / 2, z], [left, z], "fine"),
      line([right, z], [width / 2, z], "fine"),
    ]),
  ];
};

/** A dressing table: the table and its mirror line at the back, the stool in front. */
export const dressingTableSymbol: PlanSymbolBuilder = (width, depth) => {
  const tableFront = -depth / 2 + depth * 0.62;
  const stool = clamp(Math.min(width * 0.4, (depth / 2 - tableFront) * 1.6), 0.08, 0.42);
  const stoolZ = (tableFront + depth / 2) / 2;
  return [
    box(-width / 2, -depth / 2, width / 2, tableFront, "outline", 0.01, { fill: true }),
    line([-width * 0.3, -depth / 2 + 0.03], [width * 0.3, -depth / 2 + 0.03], "detail"),
    ...dividers(-width / 2, width / 2, 3).map((x) => line([x, tableFront - (tableFront + depth / 2) * 0.15], [x, tableFront], "fine")),
    rect(0, stoolZ, stool, Math.max(0.01, Math.min(stool * 0.8, depth / 2 - tableFront - 0.01)), "detail", stool * 0.2, { fill: true }),
  ];
};

/** A study table: a desk, with its wall shelf dashed above the back. */
export const studyTableSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const shelf = clamp(depth * 0.45, 0.15, 0.32);
  return [
    ...deskSymbol(width, depth, options),
    box(-width / 2 + 0.01, -depth / 2 + 0.01, width / 2 - 0.01, -depth / 2 + shelf, "detail", 0, { dashed: true }),
  ];
};

/** A tall (full-height) cabinet: doors at the front, crossed corner to corner as plans mark full height. */
export const tallCabinetSymbol: PlanSymbolBuilder = (width, depth) => {
  const front = depth / 2 - clamp(depth * 0.06, 0.015, 0.03);
  const doors = clamp(Math.round(width / 0.5), 1, 8);
  return [
    rect(0, 0, width, depth, "outline", 0, { fill: true }),
    line([-width / 2, front], [width / 2, front], "fine"),
    ...dividers(-width / 2, width / 2, doors).map((x) => line([x, front], [x, depth / 2], "fine")),
    line([-width / 2, -depth / 2], [width / 2, front], "fine"),
    line([width / 2, -depth / 2], [-width / 2, front], "fine"),
  ];
};

/** A shoe bench: a cushioned top over the shoe slats, shown dashed underneath. */
export const shoeBenchSymbol: PlanSymbolBuilder = (width, depth) => {
  const inset = clamp(Math.min(width, depth) * 0.08, 0.015, 0.04);
  return [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    rect(0, 0, width - inset * 2, depth - inset * 2, "detail", Math.min(depth * 0.15, 0.05)),
    ...spread(-depth / 2 + inset, depth / 2 - inset, 2).map((z) => line([-width / 2 + inset, z], [width / 2 - inset, z], "fine", { dashed: true })),
  ];
};

/** A standing coat rack: its base, and the hooks round the pole. */
export const coatRackSymbol: PlanSymbolBuilder = (width, depth) => {
  const r = Math.min(width, depth) / 2;
  const hooks: PlanSymbolShape[] = [0, 60, 120, 180, 240, 300].map((degrees) => {
    const radians = (degrees * Math.PI) / 180;
    return line([Math.cos(radians) * r * 0.18, Math.sin(radians) * r * 0.18], [Math.cos(radians) * r * 0.62, Math.sin(radians) * r * 0.62], "fine");
  });
  return [circle(0, 0, r, "fine", { dashed: true }), ...hooks, circle(0, 0, r * 0.18, "outline", { fill: true })];
};

/** An altar cabinet: the cabinet with doors, its raised altar shelf at the back, and the urn on it. */
export const altarCabinetSymbol: PlanSymbolBuilder = (width, depth) => {
  const front = depth / 2 - clamp(depth * 0.06, 0.015, 0.03);
  const shelfFront = -depth / 2 + depth * 0.4;
  const doors = clamp(Math.round(width / 0.45), 1, 6);
  return [
    rect(0, 0, width, depth, "outline", 0.006, { fill: true }),
    line([-width / 2, front], [width / 2, front], "fine"),
    ...dividers(-width / 2, width / 2, doors).map((x) => line([x, front], [x, depth / 2], "fine")),
    box(-width / 2 + 0.02, -depth / 2 + 0.02, width / 2 - 0.02, shelfFront, "detail", 0.01, { fill: true }),
    circle(0, (-depth / 2 + shelfFront) / 2, clamp(Math.min(width, depth) * 0.08, 0.02, 0.06), "fine"),
  ];
};
