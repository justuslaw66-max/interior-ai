export {
  AUBURN_CONFIGURATION_GROUPS,
  AUBURN_CONFIGURATION_PRODUCT_IDS,
  JARON_CONFIGURATION_GROUPS,
  JARON_CONFIGURATION_PRODUCT_IDS,
  MODEL_FAMILY_BY_PRODUCT_ID,
  MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID,
  type AuburnConfigurationDiagramKey,
  type JaronConfigurationArmKey,
  type JaronConfigurationDiagramKey,
} from "@/lib/design-page-model-maps";
export {
  HOUSE_ROOM_WALL_SNAP_DISTANCE_METERS,
  ROOM_DIMENSION_DEFAULTS,
  buildHousePlan2D,
  resolveHouseRoomDimensionEditPlacement,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
export {
  PLAN_OPENING_DEFAULT_HEIGHT_METERS,
  PLAN_OPENING_EDGE_PADDING_METERS,
  PLAN_OPENING_MAX_HEIGHT_METERS,
  PLAN_OPENING_MIN_HEIGHT_METERS,
  getPlanOpeningWallSpanMeters,
  mapPlanOpeningsToRoomRenderer,
  type RoomRendererOpening,
} from "@/lib/design-page-plan-overlays";
export { getFurnitureWallInset } from "@/lib/design-page-geometry";
export {
  clampOpeningToNearestClearInterval,
  validateTracedOpeningPlacement,
} from "@/lib/floor-plan-tracing";
export { isCatalogPlacementFootprintInsideRoom } from "@/lib/catalog-placement";
export {
  getHighResolutionSwatchUrl,
  getMaterialDisplayLabel,
} from "@/lib/catalog/variant-normalization";
export {
  buildInnerFloorGeometry2D,
  buildRoomWallSegments2D,
  buildWallBandGeometry2D,
  mergeSharedWallSegments2D,
  splitWallBandByOpenings2D,
} from "@/lib/room-renderer-2d-walls";
