import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { DesignItem } from "@/lib/room-types";
import {
  metersToMm,
  radiansToDeg,
  type EditorAnnotation2D,
  type EditorScene2D,
  type FixedElement2D,
  type RoomOpening2D,
} from "@/lib/editorScene";

type ItemPlanningBoundsByInstanceId = Record<string, { w: number; d: number; h: number }>;

type BuildEditorScene2DParams = {
  roomWidth: number;
  roomDepth: number;
  items: DesignItem[];
  catalogItems: typeof CATALOG_ITEMS;
  itemPlanningBoundsByInstanceId: ItemPlanningBoundsByInstanceId;
  selectedInstanceId: string | null;
  planAnnotations: EditorAnnotation2D[];
  planOpenings: RoomOpening2D[];
  planFixedElements: FixedElement2D[];
};

export function buildEditorScene2D({
  roomWidth,
  roomDepth,
  items,
  catalogItems,
  itemPlanningBoundsByInstanceId,
  selectedInstanceId,
  planAnnotations,
  planOpenings,
  planFixedElements,
}: BuildEditorScene2DParams): EditorScene2D {
  return {
    room: {
      widthMm: metersToMm(roomWidth),
      depthMm: metersToMm(roomDepth),
    },
    items: items.map((item) => {
      const product = catalogItems[item.productId];
      const planning = itemPlanningBoundsByInstanceId[item.instanceId];
      const dimsW = planning?.w ?? product?.dimsMm.w ?? 0;
      const dimsD = planning?.d ?? product?.dimsMm.d ?? 0;
      const dimsH = planning?.h ?? product?.dimsMm.h ?? 0;
      return {
        id: item.instanceId,
        catalogItemId: item.productId,
        positionMm: {
          x: metersToMm(item.position[0]),
          z: metersToMm(item.position[2]),
        },
        rotationDeg: radiansToDeg(item.rotationY ?? 0),
        widthMm: dimsW,
        depthMm: dimsD,
        heightMm: dimsH,
        label: product?.title ?? item.productId,
        category: product?.category ?? "item",
      };
    }),
    selectedItemId: selectedInstanceId,
    annotations: planAnnotations,
    openings: planOpenings,
    fixedElements: planFixedElements,
  };
}

type CreatePlanAnnotationParams = {
  id: string;
  kind: EditorAnnotation2D["kind"];
  text: string;
};

export function createPlanAnnotation({
  id,
  kind,
  text,
}: CreatePlanAnnotationParams): EditorAnnotation2D {
  const cleanText = text.trim();
  if (kind === "callout") {
    return {
      id,
      xMm: 450,
      zMm: 450,
      text: cleanText,
      kind,
      anchorXMm: 0,
      anchorZMm: 0,
    };
  }

  return {
    id,
    xMm: 0,
    zMm: 0,
    text: cleanText,
    kind,
  };
}
