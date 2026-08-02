import type { ThreeEvent } from "@react-three/fiber";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type {
  ConfigurableNodeTransform,
  PlanMeasurementUnit,
  WallDescriptor,
} from "@/lib/design-page-types";
import type {
  DesignItem,
  RoomPlanPolygonPoint,
  RoomPlanShape,
} from "@/lib/room-types";

export type FurnitureProps = {
  product: CatalogItemSchema;
  planningBoundsMm?: { w: number; d: number; h: number };
  nodeTransforms?: Record<string, ConfigurableNodeTransform>;
  variantColor: string;
  variantName?: string;
  variantId: string;
  variantRenderAssets?: CatalogItemSchema["variants"][number]["renderAssets"];
  hangingHeightCm?: number;
  initialPosition?: [number, number, number];
  initialRotationY?: number;
  roomWidth?: number;
  roomDepth?: number;
  roomOriginX?: number;
  roomOriginZ?: number;
  roomPlanShape?: RoomPlanShape;
  roomPlanPolygon?: RoomPlanPolygonPoint[];
  roomPlanHoles?: RoomPlanPolygonPoint[][];
  wallThickness?: number;
  wallContactInset?: number;
  margin?: number;
  snapDistance?: number;
  enableSnap?: boolean;
  allowCrossRoomDrag?: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  walls?: WallDescriptor[];
  instanceId: string;
  isSelected?: boolean;
  isPrimarySelected?: boolean;
  onSelect?: (id: string, additive: boolean) => void;
  onMove?: (id: string, pos: [number, number, number]) => boolean | void;
  onDragPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onDuplicate?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRotate?: (
    id: string,
    rotationY: number,
    meta?: {
      source?: "keyboard" | "handle" | "inspector" | "canvas";
      snap?: boolean;
    }
  ) => boolean | void;
  onDragEnd?: (id: string, pos: [number, number, number]) => void;
  locked?: boolean;
  interactive?: boolean;
  showSelection?: boolean;
  showLocks?: boolean;
  onSnapPulse?: () => void;
  onSnapSuccess?: () => void;
  items?: DesignItem[];
  materialPreset?: string;
  materialOverrides?: DesignItem["materialOverrides"];
  itemPlanningBoundsByInstanceId?: Record<string, { w: number; d: number; h: number }>;
  showGuidesAndMeasurements?: boolean;
  cartPreviewed?: boolean;
  viewMode?: EditorViewMode;
  planShowLabels?: boolean;
  planShowDimensions?: boolean;
  planMeasurementUnit?: PlanMeasurementUnit;
  rotationSnapStepRadians?: number;
  rotationSnapStepDegrees?: number;
  rotationSnapEnabled?: boolean;
  renderQuality?: "standard" | "lite";
  renderReadyKey?: string;
  onRenderReadyChange?: (key: string, ready: boolean) => void;
  "data-testid"?: string;
};
