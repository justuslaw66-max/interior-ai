import type { PlanSymbolBuilder, PlanSymbolShape } from "./plan-symbol-types";
import {
  arc,
  box,
  chair,
  circle,
  clamp,
  cushion,
  dividers,
  ellipse,
  line,
  polyline,
  rect,
  spread,
} from "./plan-symbol-shapes";

const CHAIR_TUCK = 0.12;

export const diningTableSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const round = options.round ?? Math.abs(width - depth) <= Math.max(width, depth) * 0.06;
  const inset = clamp(Math.min(width, depth) * 0.04, 0.02, 0.035);
  if (round) {
    return [
      ellipse(0, 0, width / 2, depth / 2, "outline", { fill: true }),
      ellipse(0, 0, width / 2 - inset, depth / 2 - inset, "fine"),
    ];
  }
  return [
    rect(0, 0, width, depth, "outline", 0.012, { fill: true }),
    rect(0, 0, width - inset * 2, depth - inset * 2, "fine", 0.008),
  ];
};

/**
 * A rectangular table with its chairs, all inside the set's footprint.
 * Chairs sit along both long sides, and at the ends once the table is long
 * enough for them (about 1.8 m of table).
 */
export const diningSetSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const chairSize = clamp(Math.min(width, depth) * 0.3, 0.38, 0.48);
  const reach = chairSize - CHAIR_TUCK;
  const withEnds = options.chairs ? options.chairs >= 8 : width - reach * 2 >= 1.75;
  const tableWidth = width - (withEnds ? reach * 2 : 0.04);
  const tableDepth = depth - reach * 2;
  const perSide = options.chairs
    ? Math.max(1, Math.floor((options.chairs - (withEnds ? 2 : 0)) / 2))
    : clamp(Math.floor(tableWidth / 0.62), 1, 5);
  const chairs: PlanSymbolShape[] = [];
  for (const x of spread(-tableWidth / 2, tableWidth / 2, perSide)) {
    chairs.push(...chair(x, -depth / 2 + chairSize / 2, 90, chairSize, chairSize));
    chairs.push(...chair(x, depth / 2 - chairSize / 2, -90, chairSize, chairSize));
  }
  if (withEnds) {
    chairs.push(...chair(-width / 2 + chairSize / 2, 0, 0, chairSize, chairSize));
    chairs.push(...chair(width / 2 - chairSize / 2, 0, 180, chairSize, chairSize));
  }
  return [...chairs, ...diningTableSymbol(tableWidth, tableDepth, { round: false })];
};

export const roundDiningSetSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const radius = Math.min(width, depth) / 2;
  const chairSize = clamp(radius * 0.42, 0.36, 0.46);
  const tableRadius = radius - chairSize + CHAIR_TUCK;
  // An even number of chairs, so they face each other across the table.
  const count = options.chairs ?? clamp(2 * Math.round((Math.PI * tableRadius) / 0.62), 2, 8);
  const chairs: PlanSymbolShape[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = -90 + (360 / count) * index;
    const radians = (angle * Math.PI) / 180;
    const distance = radius - chairSize / 2;
    chairs.push(
      ...chair(Math.cos(radians) * distance, Math.sin(radians) * distance, angle + 180, chairSize, chairSize)
    );
  }
  return [...chairs, ...diningTableSymbol(tableRadius * 2, tableRadius * 2, { round: true })];
};

export const diningChairSymbol: PlanSymbolBuilder = (width, depth) => chair(0, 0, 90, width, depth, "outline");

export const diningBenchSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "outline", 0.02, { fill: true }),
  rect(0, 0, width - 0.05, depth - 0.05, "fine", 0.015),
];

function bedPillows(width: number, top: number, depth: number): PlanSymbolShape[] {
  const count = width >= 1.2 ? 2 : 1;
  const gap = 0.05;
  const pillowWidth = clamp((width - 0.12 - gap * (count + 1)) / count, 0.4, 0.7);
  const pillowDepth = clamp(depth * 0.17, 0.26, 0.38);
  const z = top + 0.04 + pillowDepth / 2;
  return spread(-width / 2, width / 2, count).map((x) =>
    cushion(x, z, pillowWidth, pillowDepth, 0, "detail")
  );
}

export const bedSymbol: PlanSymbolBuilder = (width, depth) => {
  const left = -width / 2;
  const right = width / 2;
  const back = -depth / 2;
  const front = depth / 2;
  const headboard = clamp(depth * 0.04, 0.05, 0.09);
  const mattressTop = back + headboard;
  const pillowDepth = clamp(depth * 0.17, 0.26, 0.38);
  const fold = mattressTop + 0.04 + pillowDepth + 0.1;
  const corner = clamp(width * 0.22, 0.18, 0.38);
  return [
    box(left, back, right, front, "outline", 0.02, { fill: true }),
    box(left, back, right, mattressTop, "detail", 0.01),
    ...bedPillows(width, mattressTop, depth),
    line([left, fold], [right, fold], "detail"),
    line([left, fold + 0.07], [right, fold + 0.07], "fine"),
    polyline([[right, front - corner], [right - corner * 0.85, front - corner * 0.55], [right - corner, front]], false, "fine"),
  ];
};

export const nightstandSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "outline", 0.012, { fill: true }),
  line([-width / 2 + 0.02, depth / 2 - 0.025], [width / 2 - 0.02, depth / 2 - 0.025], "fine"),
  circle(0, -0.02, clamp(Math.min(width, depth) * 0.22, 0.06, 0.12), "fine"),
];

/**
 * A wardrobe: the hanging rail along its length with hangers across it,
 * and the doors at the front split into leaves of about half a metre.
 */
export const wardrobeSymbol: PlanSymbolBuilder = (width, depth) => {
  const left = -width / 2;
  const right = width / 2;
  const doorLine = depth / 2 - clamp(depth * 0.05, 0.02, 0.035);
  const railZ = (-depth / 2 + doorLine) / 2;
  const reach = (doorLine + depth / 2) * 0.4;
  const hangerCount = Math.max(2, Math.floor((width - 0.1) / 0.075));
  const hangers = spread(left + 0.05, right - 0.05, hangerCount).map((x, index) => {
    const lean = [0, 0.006, -0.004, 0.009, -0.007][index % 5];
    return line([x - lean, railZ - reach], [x + lean, railZ + reach], "fine");
  });
  const leaves = clamp(Math.round(width / 0.5), 1, 8);
  return [
    rect(0, 0, width, depth, "outline", 0, { fill: true }),
    line([left + 0.02, railZ], [right - 0.02, railZ], "fine", { dashed: true }),
    ...hangers,
    line([left, doorLine], [right, doorLine], "detail"),
    ...dividers(left, right, leaves).map((x) => line([x, doorLine], [x, depth / 2], "fine")),
  ];
};

function cabinetSymbol(width: number, depth: number, doorWidth: number): PlanSymbolShape[] {
  const doors = clamp(Math.round(width / doorWidth), 1, 10);
  const front = depth / 2 - clamp(depth * 0.06, 0.015, 0.03);
  return [
    rect(0, 0, width, depth, "outline", 0.006, { fill: true }),
    line([-width / 2, front], [width / 2, front], "fine"),
    ...dividers(-width / 2, width / 2, doors).map((x) => line([x, -depth / 2 + 0.02], [x, depth / 2], "fine")),
  ];
}

export const dresserSymbol: PlanSymbolBuilder = (width, depth) => cabinetSymbol(width, depth, 0.45);
export const sideboardSymbol: PlanSymbolBuilder = (width, depth) => cabinetSymbol(width, depth, 0.45);
export const storageSymbol: PlanSymbolBuilder = (width, depth) => cabinetSymbol(width, depth, 0.45);
/** Shoe cabinets have narrower doors, with slanted shelves showing through the top. */
export const shoeCabinetSymbol: PlanSymbolBuilder = (width, depth) => [
  ...cabinetSymbol(width, depth, 0.4),
  ...spread(-width / 2, width / 2, Math.max(1, Math.round(width / 0.4))).map((x) =>
    line([x - 0.08, -depth / 2 + 0.06], [x + 0.08, depth / 2 - 0.08], "fine", { dashed: true })
  ),
];

/** Open shelving: the shelf front and the books standing on it, no doors. */
export const bookshelfSymbol: PlanSymbolBuilder = (width, depth) => {
  const bays = clamp(Math.round(width / 0.8), 1, 8);
  const shelfFront = depth / 2 - 0.02;
  return [
    rect(0, 0, width, depth, "outline", 0, { fill: true }),
    line([-width / 2, shelfFront], [width / 2, shelfFront], "fine"),
    ...dividers(-width / 2, width / 2, bays).map((x) => line([x, -depth / 2], [x, depth / 2], "detail")),
    ...spread(-width / 2, width / 2, Math.max(2, Math.floor(width / 0.11))).map((x, index) =>
      line([x, -depth / 2 + 0.03], [x, shelfFront - 0.03 - (index % 3) * 0.02], "fine")
    ),
  ];
};

export const deskSymbol: PlanSymbolBuilder = (width, depth) => {
  const shapes: PlanSymbolShape[] = [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    rect(0, 0, width - 0.04, depth - 0.04, "fine", 0.008),
  ];
  if (width >= 0.9) {
    const screen = clamp(width * 0.4, 0.45, 0.7);
    shapes.push(rect(0, -depth / 2 + 0.1, screen, 0.03, "detail", 0.005, { fill: true }));
    shapes.push(rect(0, -depth / 2 + 0.135, screen * 0.3, 0.04, "fine", 0.005));
  }
  return shapes;
};

export const officeChairSymbol: PlanSymbolBuilder = (width, depth) => {
  const r = Math.min(width, depth) / 2;
  return [
    circle(0, 0, r, "fine", { dashed: true }),
    rect(0, r * 0.12, r * 1.25, r * 1.2, "detail", r * 0.35, { fill: true }),
    arc(0, r * 0.3, r * 0.92, 205, 335, "detail"),
    rect(-r * 0.75, r * 0.1, r * 0.16, r * 0.8, "fine", r * 0.08, { fill: true }),
    rect(r * 0.75, r * 0.1, r * 0.16, r * 0.8, "fine", r * 0.08, { fill: true }),
  ];
};
