import type { PlanSymbolBuilder } from "./plan-symbol-types";
import { box, circle, clamp, dividers, line, rect, spread } from "./plan-symbol-shapes";

/**
 * More kitchen, laundry and bathroom symbols (batch 2, 11 Nov 2026): kitchen island, built-in
 * oven, dishwasher, wall cabinets, fridge housing, ceiling drying rack, water heater, shower
 * screen, towel rail and mirror cabinet. Things fixed high on a wall or ceiling are dashed.
 */

/** A kitchen island: the worktop, with the seating overhang dashed along the front. */
export const kitchenIslandSymbol: PlanSymbolBuilder = (width, depth) => {
  const overhang = depth / 2 - clamp(depth * 0.3, 0.15, 0.3);
  return [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    line([-width / 2, overhang], [width / 2, overhang], "fine", { dashed: true }),
    ...dividers(-width / 2, width / 2, clamp(Math.round(width / 0.6), 1, 8)).map((x) => line([x, -depth / 2], [x, overhang], "fine")),
  ];
};

/** A built-in oven under the worktop: its door at the front, with the handle and the shelves inside. */
export const ovenSymbol: PlanSymbolBuilder = (width, depth) => {
  const door = depth / 2 - clamp(depth * 0.1, 0.02, 0.06);
  const inset = clamp(width * 0.08, 0.015, 0.05);
  return [
    rect(0, 0, width, depth, "outline", 0.005, { fill: true }),
    line([-width / 2, door], [width / 2, door], "detail"),
    line([-width / 2 + inset * 2, (door + depth / 2) / 2], [width / 2 - inset * 2, (door + depth / 2) / 2], "fine"),
    box(-width / 2 + inset, -depth / 2 + inset, width / 2 - inset, door - inset, "fine", 0, { dashed: true }),
    line([-width / 2 + inset, (-depth / 2 + door) / 2], [width / 2 - inset, (-depth / 2 + door) / 2], "fine", { dashed: true }),
  ];
};

/** A dishwasher: its door at the front, two racks inside and the spray arm between them. */
export const dishwasherSymbol: PlanSymbolBuilder = (width, depth) => {
  const door = depth / 2 - clamp(depth * 0.1, 0.02, 0.06);
  const inset = clamp(width * 0.08, 0.015, 0.05);
  const middle = (-depth / 2 + door) / 2;
  return [
    rect(0, 0, width, depth, "outline", 0.005, { fill: true }),
    line([-width / 2, door], [width / 2, door], "detail"),
    ...spread(-depth / 2 + inset, door - inset, 2).map((z) => line([-width / 2 + inset, z], [width / 2 - inset, z], "fine", { dashed: true })),
    line([-width * 0.3, middle], [width * 0.3, middle], "fine"),
    circle(0, middle, clamp(width * 0.05, 0.005, 0.03), "fine"),
  ];
};

/** Wall cabinets, overhead: dashed, with their doors about 45 cm wide. */
export const wallCabinetSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "detail", 0, { dashed: true }),
  ...dividers(-width / 2, width / 2, clamp(Math.round(width / 0.45), 1, 12)).map((x) => line([x, -depth / 2], [x, depth / 2], "fine", { dashed: true })),
];

/** A fridge housing: the tall cabinet's sides and top, and the fridge standing in it. */
export const fridgeHousingSymbol: PlanSymbolBuilder = (width, depth) => {
  const panel = clamp(width * 0.04, 0.012, 0.03);
  const left = -width / 2 + panel, right = width / 2 - panel, back = -depth / 2 + panel;
  const door = depth / 2 - clamp(depth * 0.08, 0.04, 0.07);
  return [
    rect(0, 0, width, depth, "outline", 0, { fill: true }),
    box(left, back, right, depth / 2, "detail"),
    line([left, door], [right, door], "detail"),
    line([left, back], [right, door], "fine"),
    line([right, back], [left, door], "fine"),
  ];
};

/** A ceiling drying rack: dashed, its poles along its length between two brackets. */
export const dryingRackSymbol: PlanSymbolBuilder = (width, depth) => {
  const bracket = clamp(width * 0.05, 0.02, 0.06);
  const poles = clamp(Math.round(depth / 0.12), 2, 8);
  return [
    box(-width / 2, -depth / 2, -width / 2 + bracket, depth / 2, "detail", 0, { dashed: true }),
    box(width / 2 - bracket, -depth / 2, width / 2, depth / 2, "detail", 0, { dashed: true }),
    ...spread(-depth / 2, depth / 2, poles).map((z) => line([-width / 2 + bracket, z], [width / 2 - bracket, z], "fine", { dashed: true })),
  ];
};

/** A storage water heater, high on the bathroom wall: dashed, its tank and its outlet. */
export const waterHeaterSymbol: PlanSymbolBuilder = (width, depth) => {
  const r = Math.min(width, depth) / 2;
  return [
    rect(0, 0, width, depth, "detail", r * 0.3, { dashed: true }),
    circle(0, 0, r * 0.8, "detail", { dashed: true }),
    circle(0, 0, r * 0.15, "fine", { dashed: true }),
  ];
};

/** A shower screen: a glass panel, drawn like a window, its glass on the centreline. */
export const showerScreenSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "outline", 0, { fill: true }),
  line([-width / 2, 0], [width / 2, 0], "fine"),
];

/** A towel rail: the bar, standing off the wall on its two brackets. */
export const towelRailSymbol: PlanSymbolBuilder = (width, depth) => {
  const bar = clamp(depth * 0.35, 0.01, 0.03);
  const bracket = clamp(width * 0.05, 0.01, 0.03);
  return [
    rect(0, depth / 2 - bar / 2, width, bar, "outline", bar / 2, { fill: true }),
    box(-width / 2 + bracket, -depth / 2, -width / 2 + bracket * 2, depth / 2 - bar, "fine"),
    box(width / 2 - bracket * 2, -depth / 2, width / 2 - bracket, depth / 2 - bar, "fine"),
  ];
};

/** A mirror cabinet above the basin: dashed, with its doors. */
export const mirrorCabinetSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "detail", 0, { dashed: true }),
  ...dividers(-width / 2, width / 2, clamp(Math.round(width / 0.4), 1, 4)).map((x) => line([x, -depth / 2], [x, depth / 2], "fine", { dashed: true })),
];
