/**
 * Black-and-white 2D plan symbols, drawn from a product's real footprint.
 *
 * Coordinates are metres in the item's own plan frame (XZ, as ItemRenderer2D
 * draws it): x runs across the width from -width/2 to +width/2, z runs across
 * the depth from -depth/2 (the back, against the wall) to +depth/2 (the front).
 * Arc angles are degrees measured from +x towards +z.
 */

export type PlanSymbolStroke = "outline" | "detail" | "fine";

export type PlanSymbolPoint = readonly [x: number, z: number];

type ShapeStyle = {
  stroke: PlanSymbolStroke;
  /** Drawn dashed: something overhead, or a hidden edge. */
  dashed?: boolean;
  /** Painted paper-white first, so it hides lines drawn before it. */
  fill?: boolean;
};

export type PlanSymbolPolyline = ShapeStyle & {
  type: "polyline";
  points: PlanSymbolPoint[];
  closed: boolean;
};

export type PlanSymbolRect = ShapeStyle & {
  type: "rect";
  cx: number;
  cz: number;
  width: number;
  depth: number;
  radius: number;
};

export type PlanSymbolEllipse = ShapeStyle & {
  type: "ellipse";
  cx: number;
  cz: number;
  rx: number;
  rz: number;
};

export type PlanSymbolArc = ShapeStyle & {
  type: "arc";
  cx: number;
  cz: number;
  r: number;
  startDeg: number;
  endDeg: number;
};

export type PlanSymbolShape =
  | PlanSymbolPolyline
  | PlanSymbolRect
  | PlanSymbolEllipse
  | PlanSymbolArc;

export type PlanSymbolKind =
  // Living
  | "sofa"
  | "sectional_sofa"
  | "armchair"
  | "ottoman"
  | "coffee_table"
  | "side_table"
  | "tv_console"
  | "rug"
  | "floor_lamp"
  | "table_lamp"
  | "pendant_light"
  | "ceiling_fan"
  | "plant"
  // Dining
  | "dining_table"
  | "dining_set"
  | "round_dining_set"
  | "dining_chair"
  | "dining_bench"
  // Bedroom and study
  | "bed"
  | "nightstand"
  | "wardrobe"
  | "dresser"
  | "desk"
  | "office_chair"
  // Storage
  | "sideboard"
  | "storage"
  | "bookshelf"
  | "shoe_cabinet"
  // Kitchen and laundry
  | "kitchen_counter"
  | "hob"
  | "kitchen_sink"
  | "fridge"
  | "washing_machine"
  | "dryer"
  | "microwave"
  | "range_hood"
  // Bathroom
  | "toilet"
  | "basin"
  | "vanity"
  | "shower"
  | "bathtub";

export type PlanSymbolOptions = {
  /** Sofa seat cushions. */
  seats?: number;
  /** Which side a sectional's chaise is on, seen from the front. */
  chaiseSide?: "left" | "right";
  /** Hob burners (2-5). */
  burners?: number;
  /** Sink or vanity bowls (1-2). */
  bowls?: number;
  /** Draw a table round or oval rather than rectangular. */
  round?: boolean;
  /** Chairs around a dining set. */
  chairs?: number;
};

export type PlanSymbol = {
  kind: PlanSymbolKind;
  width: number;
  depth: number;
  shapes: PlanSymbolShape[];
};

export type PlanSymbolBuilder = (
  width: number,
  depth: number,
  options: PlanSymbolOptions
) => PlanSymbolShape[];
