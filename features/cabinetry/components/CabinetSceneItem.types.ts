import type { ThreeEvent } from "@react-three/fiber";

import type {
  CabinetDefinition,
  CabinetPart,
  CabinetPartType,
} from "../types";

export type CabinetDragState = {
  pointerId: number;
  additiveSelection: boolean;
  offsetX: number;
  offsetZ: number;
  startX: number;
  startZ: number;
  lastAcceptedPosition: [number, number, number];
};

export const CABINET_DRAG_START_DISTANCE_M = 0.005;

export type CabinetSemanticSelectionScope = "assembly" | "module" | "part";

export type CabinetSemanticSelection = {
  scope: CabinetSemanticSelectionScope;
  cabinetDefinitionId: string;
  cabinetInstanceId?: string;
  moduleId?: string;
  partId?: string;
  partType?: CabinetPartType;
  additive: boolean;
};

export type CabinetSceneItemProps = {
  definition: CabinetDefinition;
  generatedParts?: readonly CabinetPart[];
  showClearances?: boolean;
  position?: [number, number, number];
  rotationY?: number;
  selected?: boolean;
  highlightModuleId?: string;
  highlightPartId?: string;
  /** Adds preview-only separation lines to slab fronts without changing generated/export geometry. */
  showPreviewFrontEdges?: boolean;
  interactive?: boolean;
  instanceId?: string;
  viewMode?: "2d" | "3d";
  showPlanLabel?: boolean;
  onSelect?: (id: string, additive: boolean) => void;
  onSemanticSelect?: (selection: CabinetSemanticSelection) => void;
  locked?: boolean;
  onDraggingChange?: (dragging: boolean) => void;
  onDragPointerMove?: (event: ThreeEvent<PointerEvent>) => void;
  onMove?: (
    id: string,
    position: [number, number, number]
  ) => boolean | void;
  onDragEnd?: (id: string, position: [number, number, number]) => void;
  renderReadyKey?: string;
  onRenderReadyChange?: (key: string, ready: boolean) => void;
};
