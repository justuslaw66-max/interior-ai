import type { PlanSymbolBuilder, PlanSymbolPoint, PlanSymbolShape } from "./plan-symbol-types";
import { box, circle, clamp, ellipse, line, polyline, rect, spread } from "./plan-symbol-shapes";

/** Upper cabinets above a counter are drawn dashed, about 35 cm from the wall. */
export const kitchenCounterSymbol: PlanSymbolBuilder = (width, depth) => {
  const shapes: PlanSymbolShape[] = [
    rect(0, 0, width, depth, "outline", 0, { fill: true }),
    line([-width / 2, depth / 2 - 0.02], [width / 2, depth / 2 - 0.02], "fine"),
  ];
  if (depth > 0.45) {
    shapes.push(line([-width / 2, -depth / 2 + 0.35], [width / 2, -depth / 2 + 0.35], "fine", { dashed: true }));
  }
  return shapes;
};

function burnerLayout(width: number, depth: number, requested?: number): PlanSymbolPoint[] {
  const burners = requested ? clamp(Math.round(requested), 1, 5) : defaultBurners(width, depth);
  const usableDepth = depth - 0.08;
  const z = -0.03;
  if (width < 0.45 || (burners === 2 && width / depth < 1.2)) {
    return [[0, z - usableDepth * 0.24], [0, z + usableDepth * 0.24]];
  }
  if (burners <= 3) return spread(-width / 2, width / 2, burners).map((x) => [x, z] as const);
  const grid: PlanSymbolPoint[] = [
    [-width * 0.24, z - usableDepth * 0.24], [width * 0.24, z - usableDepth * 0.24],
    [-width * 0.24, z + usableDepth * 0.24], [width * 0.24, z + usableDepth * 0.24],
  ];
  return burners === 5 ? [...grid, [0, z]] : grid;
}

function defaultBurners(width: number, depth: number) {
  if (width < 0.45) return 2;
  if (width / depth >= 1.5) return width >= 0.83 ? 3 : 2;
  return width >= 0.85 ? 5 : 4;
}

export const hobSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const centres = burnerLayout(width, depth, options.burners);
  const spacing = centres.length > 1
    ? Math.min(...centres.slice(1).map(([x, z], index) => Math.hypot(x - centres[index][0], z - centres[index][1])))
    : Math.min(width, depth);
  const r = clamp(spacing * 0.36, 0.035, 0.11);
  const knobs = spread(-width / 2, width / 2, centres.length);
  return [
    rect(0, 0, width, depth, "outline", 0.015, { fill: true }),
    ...centres.flatMap(([x, z]) => [
      circle(x, z, r, "detail"),
      circle(x, z, r * 0.45, "fine"),
      line([x - r * 1.15, z], [x - r * 0.75, z], "fine"),
      line([x + r * 0.75, z], [x + r * 1.15, z], "fine"),
      line([x, z - r * 1.15], [x, z - r * 0.75], "fine"),
      line([x, z + r * 0.75], [x, z + r * 1.15], "fine"),
    ]),
    ...knobs.map((x) => circle(x, depth / 2 - 0.03, 0.012, "fine")),
  ];
};

function tap(x: number, backZ: number, reach: number): PlanSymbolShape[] {
  return [circle(x, backZ, 0.02, "fine", { fill: true }), line([x, backZ + 0.02], [x, backZ + reach], "detail")];
}

/** One or two bowls, and a ribbed drainer beside a single bowl when there is room. */
export const kitchenSinkSymbol: PlanSymbolBuilder = (width, depth, options) => {
  const bowls = options.bowls ?? (width >= 0.78 && width < 1 ? 2 : 1);
  const drainer = bowls === 1 && width >= 0.8 ? width * 0.42 : 0;
  const rim = 0.035;
  const bowlBack = -depth / 2 + 0.09;
  const bowlFront = depth / 2 - rim;
  const bowlZone = [-width / 2 + rim + drainer, width / 2 - rim] as const;
  const bowlWidth = (bowlZone[1] - bowlZone[0] - (bowls - 1) * 0.04) / bowls;
  const shapes: PlanSymbolShape[] = [rect(0, 0, width, depth, "outline", 0.02, { fill: true })];
  for (let index = 0; index < bowls; index += 1) {
    const x0 = bowlZone[0] + index * (bowlWidth + 0.04);
    const cx = x0 + bowlWidth / 2;
    shapes.push(box(x0, bowlBack, x0 + bowlWidth, bowlFront, "detail", 0.045));
    shapes.push(circle(cx, (bowlBack + bowlFront) / 2 + 0.03, 0.025, "fine"));
    shapes.push(circle(cx, (bowlBack + bowlFront) / 2 + 0.03, 0.008, "fine"));
  }
  if (drainer > 0) {
    const x0 = -width / 2 + rim;
    const x1 = x0 + drainer - 0.03;
    shapes.push(box(x0, bowlBack, x1, bowlFront, "fine", 0.02));
    for (const z of spread(bowlBack, bowlFront, 6)) shapes.push(line([x0 + 0.03, z], [x1 - 0.03, z], "fine"));
  }
  return [...shapes, ...tap((bowlZone[0] + bowlZone[1]) / 2, -depth / 2 + 0.045, 0.1)];
};

/** A full-height appliance: crossed, with its door line at the front. */
export const fridgeSymbol: PlanSymbolBuilder = (width, depth) => {
  const door = depth / 2 - clamp(depth * 0.08, 0.04, 0.07);
  return [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    line([-width / 2, door], [width / 2, door], "detail"),
    line([-width / 2, -depth / 2], [width / 2, door], "fine"),
    line([width / 2, -depth / 2], [-width / 2, door], "fine"),
  ];
};

function frontLoader(width: number, depth: number, dryer: boolean): PlanSymbolShape[] {
  const panel = -depth / 2 + clamp(depth * 0.16, 0.07, 0.11);
  const drumZ = (panel + depth / 2) / 2;
  const drum = clamp(Math.min(width, depth / 2 - panel) * 0.4, 0.1, 0.24);
  return [
    rect(0, 0, width, depth, "outline", 0.02, { fill: true }),
    line([-width / 2, panel], [width / 2, panel], "detail"),
    rect(-width * 0.28, (-depth / 2 + panel) / 2, width * 0.22, (panel + depth / 2) * 0.06 + 0.02, "fine", 0.005),
    circle(width * 0.3, (-depth / 2 + panel) / 2, 0.022, "fine"),
    circle(0, drumZ, drum, "detail"),
    circle(0, drumZ, drum * 0.72, "fine", { dashed: dryer }),
  ];
}

export const washingMachineSymbol: PlanSymbolBuilder = (width, depth) => frontLoader(width, depth, false);
export const dryerSymbol: PlanSymbolBuilder = (width, depth) => frontLoader(width, depth, true);

export const microwaveSymbol: PlanSymbolBuilder = (width, depth) => {
  const controls = width * 0.24;
  return [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    box(-width / 2 + 0.03, -depth / 2 + 0.04, width / 2 - controls, depth / 2 - 0.04, "detail", 0.015),
    ...spread(-depth / 2 + 0.04, depth / 2 - 0.04, 3).map((z) =>
      circle(width / 2 - controls / 2, z, Math.min(0.018, controls * 0.2), "fine")
    ),
  ];
};

/** Overhead, so dashed. */
export const rangeHoodSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "detail", 0.01, { dashed: true }),
  rect(0, -depth * 0.08, width * 0.6, depth * 0.55, "fine", 0.01, { dashed: true }),
];

export const toiletSymbol: PlanSymbolBuilder = (width, depth) => {
  const cistern = clamp(depth * 0.27, 0.15, 0.22);
  const bowlTop = -depth / 2 + cistern;
  const bowlDepth = depth / 2 - bowlTop;
  const bowlCentre = bowlTop + bowlDepth * 0.5;
  const bowlRx = width * 0.44;
  return [
    rect(0, -depth / 2 + cistern / 2, width, cistern, "outline", 0.03, { fill: true }),
    ellipse(0, bowlCentre, bowlRx, bowlDepth / 2, "outline", { fill: true }),
    ellipse(0, bowlCentre + bowlDepth * 0.06, bowlRx * 0.68, bowlDepth * 0.33, "detail"),
    line([-bowlRx * 0.72, bowlTop + 0.025], [bowlRx * 0.72, bowlTop + 0.025], "fine"),
    circle(0, -depth / 2 + cistern / 2, 0.018, "fine"),
  ];
};

export const basinSymbol: PlanSymbolBuilder = (width, depth) => {
  const front: PlanSymbolPoint[] = Array.from({ length: 17 }, (_, index) => {
    const t = Math.PI * (index / 16);
    return [(width / 2) * Math.cos(t), -depth * 0.1 + depth * 0.6 * Math.sin(t)] as const;
  });
  const outline: PlanSymbolPoint[] = [[-width / 2, -depth / 2], [width / 2, -depth / 2], ...front];
  return [
    polyline(outline, true, "outline", { fill: true }),
    ellipse(0, depth * 0.06, width * 0.36, depth * 0.3, "detail"),
    circle(0, depth * 0.06, 0.016, "fine"),
    ...tap(0, -depth / 2 + 0.04, 0.07),
  ];
};

export const vanitySymbol: PlanSymbolBuilder = (width, depth, options) => {
  const bowls = options.bowls ?? (width >= 1.2 ? 2 : 1);
  const bowlRx = clamp(width / bowls * 0.28, 0.14, 0.24);
  const bowlRz = clamp(depth * 0.3, 0.1, 0.18);
  return [
    rect(0, 0, width, depth, "outline", 0.01, { fill: true }),
    line([-width / 2, depth / 2 - 0.02], [width / 2, depth / 2 - 0.02], "fine"),
    ...spread(-width / 2, width / 2, bowls).flatMap((x) => [
      ellipse(x, depth * 0.06, bowlRx, bowlRz, "detail"),
      circle(x, depth * 0.06, 0.016, "fine"),
      ...tap(x, -depth / 2 + 0.05, 0.07),
    ]),
  ];
};

/** A shower tray: the falls to the drain drawn as a cross. */
export const showerSymbol: PlanSymbolBuilder = (width, depth) => [
  rect(0, 0, width, depth, "outline", 0, { fill: true }),
  rect(0, 0, width - 0.06, depth - 0.06, "fine"),
  line([-width / 2 + 0.03, -depth / 2 + 0.03], [width / 2 - 0.03, depth / 2 - 0.03], "fine"),
  line([width / 2 - 0.03, -depth / 2 + 0.03], [-width / 2 + 0.03, depth / 2 - 0.03], "fine"),
  circle(0, 0, 0.04, "detail", { fill: true }),
  circle(-width / 2 + 0.1, -depth / 2 + 0.1, 0.035, "fine"),
];

/** Bathtub with its head end at the left: the wider rounded end. */
export const bathtubSymbol: PlanSymbolBuilder = (width, depth) => {
  const rim = clamp(Math.min(width, depth) * 0.1, 0.05, 0.09);
  return [
    rect(0, 0, width, depth, "outline", 0.03, { fill: true }),
    rect(0, 0, width - rim * 2, depth - rim * 2, "detail", Math.min(width, depth) * 0.28),
    circle(width / 2 - rim - 0.09, 0, 0.025, "fine"),
    ...[-0.06, 0.06].map((z) => circle(width / 2 - rim / 2, z, 0.014, "fine")),
  ];
};
