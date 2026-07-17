import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type {
  EditorAnnotation2D,
  FixedElement2D,
  RoomOpening2D,
} from "@/lib/editorScene";
import type { DesignItem } from "@/lib/room-types";
import {
  buildDesignPageSelectionInspectorSummary,
  isDesignPageSelectionInspectorVisible,
} from "@/lib/useDesignPageSelectionInspectorModel";

type SummaryParams = Parameters<typeof buildDesignPageSelectionInspectorSummary>[0];
type SurfaceInspectorParams = SummaryParams["surfaceInspector"];
type SummaryOverrides = Partial<Omit<SummaryParams, "surfaceInspector">> & {
  surfaceInspector?: Partial<SurfaceInspectorParams>;
};

const root = process.cwd();
const workspaceSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const modelSource = readFileSync(
  join(root, "lib/useDesignPageSelectionInspectorModel.ts"),
  "utf8"
);
const planEditingFacadeSource = readFileSync(
  join(root, "lib/useDesignPagePlanEditingFacade.ts"),
  "utf8"
);
const planWorkspaceFacadeSource = readFileSync(
  join(root, "lib/useDesignPagePlanWorkspaceFacade.ts"),
  "utf8"
);
const planAuthoringRegistrationSource = readFileSync(
  join(root, "lib/useDesignPagePlanAuthoringRegistration.ts"),
  "utf8"
);

assert.match(
  planEditingFacadeSource,
  /useDesignPageSelectionInspectorModel\(\{[\s\S]*?state:\s*\{[\s\S]*?configuration:\s*\{/,
  "The plan-editing facade should compose the selection-inspector model through grouped contracts."
);
assert.match(planWorkspaceFacadeSource, /useDesignPagePlanEditingFacade\(\{/);
assert.match(
  planAuthoringRegistrationSource,
  /useDesignPagePlanWorkspaceRegistrationFacade\(\{/,
  "Plan authoring should register the grouped plan boundary through its controller adapter."
);
assert.doesNotMatch(
  workspaceSource,
  /const selectedObjectInspector\s*=\s*useMemo/,
  "Selection summary derivation should remain owned by the extracted model."
);
assert.match(
  modelSource,
  /const visiblePlanOpening = useMemo\([\s\S]*?selectedPlanOverlayId[\s\S]*?planOpenings\.find\(\(opening\) => opening\.id === selectedPlanOverlayId\)[\s\S]*?: null,/,
  "Only an explicitly selected overlay should become the visible opening."
);
assert.doesNotMatch(
  modelSource,
  /recentOpenings\.find/,
  "Recent openings must not be promoted into the selection inspector."
);

const defaultSurfaceInspector: SurfaceInspectorParams = {
  displayName: "Oak finish",
  isCeiling: false,
  isWall: false,
  wallDefaultHeight: 2.8,
  wallFaceId: null,
  wallHeight: 2.6,
};

const baseParams: SummaryParams = {
  activeRoomName: "Living Room",
  items: [],
  planMeasurementUnit: "mm",
  selectedIds: new Set<string>(),
  selectedItem: null,
  selectedItemPlanningDimensionsMm: null,
  selectedPlanAnnotation: null,
  selectedPlanFixedElement: null,
  selectedPlanRoom: null,
  selectedProduct: null,
  surfaceInspector: defaultSurfaceInspector,
  visiblePlanOpening: null,
  visiblePlanOpeningRoomName: "Whole plan",
};

function summarize(overrides: SummaryOverrides = {}) {
  return buildDesignPageSelectionInspectorSummary({
    ...baseParams,
    ...overrides,
    surfaceInspector: {
      ...defaultSurfaceInspector,
      ...overrides.surfaceInspector,
    },
  });
}

const chair: DesignItem = {
  instanceId: "chair-1",
  productId: "chair",
  variantId: "chair-default",
  position: [0, 0, 0],
  rotationY: Math.PI / 2,
  locked: true,
  qty: 2,
};
const table: DesignItem = {
  instanceId: "table-1",
  productId: "table",
  variantId: "table-default",
  position: [1, 0, 1],
};
const product = {
  id: "chair",
  title: "Reading Chair",
  category: "accent_chair",
  commerce: {
    type: "affiliate",
    data: {
      url: "https://example.com/chair",
      retailer: "Example",
      priceHint: 2499,
    },
  },
} as CatalogItemSchema;
const room: HousePlanRoom2D = {
  id: "living-room",
  name: "Living Room",
  roomType: "living",
  shape: "rectangle",
  x: 0,
  z: 0,
  w: 5,
  d: 4,
};
const opening: RoomOpening2D = {
  id: "door-1",
  roomId: room.id,
  wall: "east",
  offsetMm: 350,
  widthMm: 900,
  kind: "door",
};
const fixedElement: FixedElement2D = {
  id: "island-1",
  kind: "island",
  label: "Kitchen island",
  xMm: 1200,
  zMm: 900,
  widthMm: 1800,
  depthMm: 800,
  rotationDeg: 90,
};
const annotation: EditorAnnotation2D = {
  id: "note-1",
  xMm: 450,
  zMm: 750,
  text: "Keep path clear",
  kind: "note",
};

assert.deepEqual(
  summarize({
    items: [chair, table],
    selectedIds: new Set([chair.instanceId, table.instanceId]),
    selectedItem: chair,
    selectedProduct: product,
    visiblePlanOpening: opening,
    visiblePlanOpeningRoomName: room.name,
  }),
  {
    kind: "Furniture selection",
    title: "2 items selected",
    detail: "Living Room",
    metrics: ["1 locked", "3 total qty"],
  },
  "Multiple selected IDs should take precedence and preserve quantity and lock totals."
);

assert.deepEqual(
  summarize({
    activeRoomName: null,
    selectedIds: new Set([chair.instanceId]),
    selectedItem: chair,
    selectedItemPlanningDimensionsMm: { w: 2100, d: 950, h: 830 },
    selectedProduct: product,
  }),
  {
    kind: "Furniture",
    title: "Reading Chair",
    detail: "Current room",
    metrics: ["2,100 mm x 950 mm", "90°", "$2499"],
  },
  "A furniture summary should prefer configured dimensions and retain rotation and price formatting."
);

assert.deepEqual(
  summarize({
    selectedPlanAnnotation: annotation,
    selectedPlanFixedElement: fixedElement,
    selectedPlanRoom: room,
    visiblePlanOpening: opening,
    visiblePlanOpeningRoomName: room.name,
  }),
  {
    kind: "Door",
    title: "Door on east",
    detail: "Living Room",
    metrics: ["900 mm wide", "350 mm from center"],
  },
  "An explicitly selected opening should take precedence over other plan objects."
);

assert.deepEqual(
  summarize({
    selectedPlanAnnotation: annotation,
    selectedPlanFixedElement: fixedElement,
    selectedPlanRoom: room,
  }),
  {
    kind: "Built-in",
    title: "Kitchen island",
    detail: "Plan fixture",
    metrics: ["1,800 mm x 800 mm", "90°"],
  },
  "A selected built-in should take precedence over annotations and rooms."
);

assert.deepEqual(
  summarize({ selectedPlanAnnotation: annotation, selectedPlanRoom: room }),
  {
    kind: "Annotation",
    title: "Keep path clear",
    detail: "note",
    metrics: ["450 mm x 750 mm"],
  },
  "A selected annotation should take precedence over its room."
);

assert.deepEqual(
  summarize({
    selectedPlanRoom: room,
    surfaceInspector: {
      displayName: "Warm white",
      isCeiling: true,
      isWall: true,
      wallFaceId: "east",
      wallHeight: 2.7,
    },
  }),
  {
    kind: "Wall",
    title: "East wall wall",
    detail: "Living Room · Warm white",
    metrics: ["2,700 mm high"],
  },
  "A wall face should retain precedence when wall and ceiling surface flags overlap."
);

assert.deepEqual(
  summarize({
    selectedPlanRoom: room,
    surfaceInspector: {
      displayName: "Soft grey",
      isCeiling: true,
      wallDefaultHeight: 2.8,
    },
  }),
  {
    kind: "Ceiling",
    title: "Living Room ceiling",
    detail: "Soft grey",
    metrics: ["2,800 mm high"],
  },
  "A ceiling target should use the default room height in its summary."
);

assert.deepEqual(
  summarize({ selectedPlanRoom: room }),
  {
    kind: "Room",
    title: "Living Room",
    detail: "living room · 20.0 sqm",
    metrics: [],
  },
  "A room summary should retain its type and calculated area."
);

assert.equal(summarize(), null, "The model should return no summary when nothing is selected.");

assert.equal(
  isDesignPageSelectionInspectorVisible({
    editorMode: "design",
    hasInspectorSummary: true,
    hasSelectedProduct: false,
    isClientPreview: false,
  }),
  true,
  "Design mode should show a populated selection summary."
);
assert.equal(
  isDesignPageSelectionInspectorVisible({
    editorMode: "design",
    hasInspectorSummary: true,
    hasSelectedProduct: false,
    isClientPreview: true,
  }),
  false,
  "Client preview should hide the selection inspector."
);
assert.equal(
  isDesignPageSelectionInspectorVisible({
    editorMode: "design",
    hasInspectorSummary: false,
    hasSelectedProduct: false,
    isClientPreview: false,
  }),
  false,
  "An empty selection should hide the selection inspector."
);
assert.equal(
  isDesignPageSelectionInspectorVisible({
    editorMode: "adjust",
    hasInspectorSummary: true,
    hasSelectedProduct: true,
    isClientPreview: false,
  }),
  false,
  "Adjust mode should defer selected-product details to the product panel."
);
assert.equal(
  isDesignPageSelectionInspectorVisible({
    editorMode: "adjust",
    hasInspectorSummary: true,
    hasSelectedProduct: false,
    isClientPreview: false,
  }),
  true,
  "Adjust mode should keep plan-object summaries visible when no product is selected."
);

console.log("design page selection-inspector model guardrails passed");
