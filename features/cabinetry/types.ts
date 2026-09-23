import type {
  MillworkAssemblyType,
  MillworkAssetManifest,
  MillworkAssemblyProfile,
  MillworkDefinition,
  MillworkFamily,
} from "@/features/millwork/types";

export type CabinetUnitType =
  | "base"
  | "wall"
  | "tall"
  | "vanity"
  | "tv_console"
  | "wardrobe";

export type CabinetFrontType =
  | "open"
  | "single_door"
  | "double_door"
  | "drawer_stack"
  | "door_and_drawer"
  | "slab_panel";

export type DoorStyle = "flat_slab" | "shaker" | "glass" | "fluted";

export type CabinetGrainDirection = "vertical" | "horizontal" | "none";
export type CabinetMaterialGrainBehavior = "directional" | "non_directional";
export type CabinetEdgeTreatment =
  | "matching_edge_band"
  | "contrasting_edge_band"
  | "solid_lipping"
  | "painted_edge"
  | "none";
export type CabinetExposedFace =
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom";
export type CabinetTreatedEdge = "top" | "right" | "bottom" | "left";
export type CabinetPartDimensionAxis = "width" | "height" | "depth";

export type HandleType =
  | "none"
  | "bar_pull"
  | "knob"
  | "edge_pull"
  | "push_to_open"
  | "hanging_rod"
  | "mudroom_hook"
  | "pantry_slide_pair"
  | "library_ladder_rail"
  | "stemware_rack"
  | "led_strip_channel"
  | "hamper_basket"
  | "hamper_slide_pair"
  | "shelf_pin_set"
  | "door_hinge_pair"
  | "drawer_slide_pair"
  | "anti_tip_anchor_bracket"
  | "leveling_foot";

export type CabinetMillworkComponentType =
  | "cabinet"
  | "ceiling_beam_array"
  | "coffered_ceiling_grid"
  | "trim_run"
  | "fireplace_surround_frame"
  | "wall_bed_panel"
  | "fold_down_worksurface";

export type CabinetCeilingBeamOrientation = "x" | "z";
export type CabinetTrimOrientation = "x" | "z";
export type CabinetTrimPlacement =
  | "baseboard"
  | "crown_moulding"
  | "casing"
  | "chair_rail"
  | "picture_rail"
  | "generic_trim";
export type CabinetTrimEndTreatment = "butt" | "mitered_return" | "coped" | "scribed";
export type CabinetStairScribeDirection = "rises_left" | "rises_right";
export type CabinetLifestyleInsertKind = "pet_bed" | "toy_bin" | "hobby_tray";
export type CabinetLaundryApplianceKind = "washer" | "dryer" | "washer_dryer" | "stacked_washer_dryer";
export type CabinetWallBedMattressSize = "single" | "double" | "queen" | "king";
export type CabinetWallBedOrientation = "vertical" | "horizontal";
export type CabinetWallBedDisplayState = "closed" | "open";
export type CabinetWallBedSideStorage = "none" | "left" | "right" | "both";

export interface CabinetMaterialRef {
  id: string;
  name: string;
  color?: string;
  textureUrl?: string;
  roughness?: number;
  metalness?: number;
  skuId?: string;
  grainBehavior?: CabinetMaterialGrainBehavior;
  matchingEdgeSkuId?: string;
  supportedEdgeTreatments?: CabinetEdgeTreatment[];
}

export interface CabinetHardwareRef {
  id: string;
  name: string;
  type: HandleType;
  skuId?: string;
}

export type CabinetValueSource =
  | "automatic"
  | "user_overridden"
  | "inherited"
  | "template_defined";

export interface CabinetParameterState {
  source: CabinetValueSource;
  locked?: boolean;
}

export type CabinetModuleSizingMode = "automatic" | "manual";
export type CabinetFillerSizingMode = "automatic" | "manual";
export type CabinetShelfSpacingMode = "even" | "custom";
export type CabinetFrontLayoutMode = "recommended" | "manual";
export type CabinetDrawerHeightMode = "equal" | "recommended" | "custom";
export type CabinetHandlePlacementMode = "automatic" | "custom";

export interface CabinetAutomationState {
  moduleSizingMode: CabinetModuleSizingMode;
  equalModuleSizing: boolean;
  fillerSizingMode: CabinetFillerSizingMode;
  shelfSpacingMode: CabinetShelfSpacingMode;
  frontLayoutMode: CabinetFrontLayoutMode;
  parameters: Record<string, CabinetParameterState>;
}

export type CabinetHostKind = "wall" | "niche" | "opening" | "rectangular_area" | "unhosted";
export type CabinetRequiredHostType = "Floor" | "Wall" | "Ceiling" | "Flexible";
/** Structured project-room context used for recommendations independently of a user-editable room name. */
export type CabinetRoomType = "living" | "bedroom" | "dining" | "kitchen" | "toilet" | "custom";
export type CabinetFitAlignment = "left" | "center" | "right";
export type CabinetFitMode = "fit_width" | "fit_height" | "fit_both" | "between_boundaries";

export interface CabinetHostOpening {
  id: string;
  kind: "door" | "window" | "outlet" | "obstruction";
  offsetMm: number;
  widthMm: number;
  heightMm?: number;
  bottomMm?: number;
  label?: string;
}

export interface CabinetHostSpace {
  id: string;
  kind: CabinetHostKind;
  label: string;
  roomId?: string;
  roomName?: string;
  roomType?: CabinetRoomType;
  wallId?: string;
  wall?: "north" | "south" | "east" | "west";
  /** Arbitrary room-local wall segment, stored in millimetres. */
  wallSegment?: {
    startXmm: number;
    startZmm: number;
    endXmm: number;
    endZmm: number;
    inwardNormalX: number;
    inwardNormalZ: number;
  };
  availableWidthMm: number;
  availableHeightMm: number;
  availableDepthMm?: number;
  baseboardOffsetMm?: number;
  installationClearanceLeftMm?: number;
  installationClearanceRightMm?: number;
  installationClearanceTopMm?: number;
  mountingHeightMm?: number;
  openings: CabinetHostOpening[];
}

export interface CabinetFitSegment {
  startMm: number;
  endMm: number;
  widthMm: number;
  centerOffsetMm: number;
}

export interface CabinetFitState {
  host: CabinetHostSpace;
  mode: CabinetFitMode;
  alignment: CabinetFitAlignment;
  segment: CabinetFitSegment;
  appliedAt: string;
}

export interface CabinetModuleDefinition {
  id: string;
  type: CabinetUnitType;
  millworkComponentType?: CabinetMillworkComponentType;
  width: number;
  height: number;
  depth: number;
  frontType: CabinetFrontType;
  doorStyle: DoorStyle;
  doorCount: number;
  /** Recommended derives a safe leaf count from the current opening width. */
  doorLayoutMode?: CabinetFrontLayoutMode;
  drawerCount: number;
  /** Custom proportions are stored bottom-to-top and normalized during generation. */
  drawerHeightMode?: CabinetDrawerHeightMode;
  drawerHeightProportions?: number[];
  shelfCount: number;
  shelfSpacingMode?: CabinetShelfSpacingMode;
  shelfPositionsMm?: number[];
  verticalDividerCount?: number;
  hangingRodCount?: number;
  hangingRodHeight?: number;
  hangingRodSpacing?: number;
  slatCount?: number;
  slatWidth?: number;
  slatDepth?: number;
  slatSpacing?: number;
  panelColumnCount?: number;
  panelRowCount?: number;
  panelFrameWidth?: number;
  panelFrameDepth?: number;
  ceilingBeamCount?: number;
  ceilingBeamWidth?: number;
  ceilingBeamDepth?: number;
  ceilingBeamOrientation?: CabinetCeilingBeamOrientation;
  ceilingGridColumnCount?: number;
  ceilingGridRowCount?: number;
  trimMemberCount?: number;
  trimProfileWidth?: number;
  trimProfileDepth?: number;
  trimOrientation?: CabinetTrimOrientation;
  trimPlacement?: CabinetTrimPlacement;
  trimSetoutHeight?: number;
  trimLeftEndTreatment?: CabinetTrimEndTreatment;
  trimRightEndTreatment?: CabinetTrimEndTreatment;
  trimReturnDepth?: number;
  trimMiterAngle?: number;
  trimRevealStripEnabled?: boolean;
  trimRevealStripHeight?: number;
  trimRevealStripDepth?: number;
  trimRevealStripInsetFromTop?: number;
  fireplaceOpeningWidth?: number;
  fireplaceOpeningHeight?: number;
  fireplaceLegWidth?: number;
  fireplaceHeaderHeight?: number;
  fireplaceMantelHeight?: number;
  fireplaceMantelDepth?: number;
  convertiblePanelThickness?: number;
  convertiblePanelHeight?: number;
  convertibleOpenDepth?: number;
  convertibleHingeHeight?: number;
  convertibleSupportLegCount?: number;
  convertibleSupportLegWidth?: number;
  convertibleSupportLegDepth?: number;
  wallBedMattressSize?: CabinetWallBedMattressSize;
  wallBedOrientation?: CabinetWallBedOrientation;
  wallBedDisplayState?: CabinetWallBedDisplayState;
  wallBedClearanceVisible?: boolean;
  wallBedSideStorage?: CabinetWallBedSideStorage;
  platformDeckThickness?: number;
  platformDeckOverhangFront?: number;
  platformDeckOverhangBack?: number;
  platformSupportRibCount?: number;
  platformSupportRibWidth?: number;
  platformSupportRibHeight?: number;
  stairScribeStepCount?: number;
  stairScribeHighHeight?: number;
  stairScribeLowHeight?: number;
  stairScribeDepth?: number;
  stairScribeDirection?: CabinetStairScribeDirection;
  roomDividerFinishedBack?: boolean;
  roomDividerBackPanelCount?: number;
  roomDividerBackPanelThickness?: number;
  roomDividerStabilizerFootCount?: number;
  roomDividerStabilizerFootWidth?: number;
  roomDividerStabilizerFootHeight?: number;
  roomDividerStabilizerFootDepth?: number;
  lifestyleInsertKind?: CabinetLifestyleInsertKind;
  lifestyleInsertCount?: number;
  lifestyleInsertDepth?: number;
  lifestyleInsertDeckHeight?: number;
  lifestyleInsertLipHeight?: number;
  wineRackColumnCount?: number;
  wineRackRowCount?: number;
  wineRackDepth?: number;
  wineRackDividerThickness?: number;
  seatDeckThickness?: number;
  seatCushionThickness?: number;
  seatCushionDepth?: number;
  seatCushionOverhangFront?: number;
  seatBackHeight?: number;
  seatBackThickness?: number;
  mudroomHookCount?: number;
  mudroomHookRailHeight?: number;
  mudroomHookProjection?: number;
  shoeCubbyCount?: number;
  shoeCubbyHeight?: number;
  shoeCubbyDepth?: number;
  shoeCubbyDividerThickness?: number;
  sinkCutoutEnabled?: boolean;
  sinkCutoutWidth?: number;
  sinkCutoutDepth?: number;
  sinkCutoutOffsetX?: number;
  sinkCutoutOffsetZ?: number;
  plumbingChaseWidth?: number;
  plumbingChaseHeight?: number;
  plumbingChaseDepth?: number;
  laundryApplianceBayEnabled?: boolean;
  laundryApplianceKind?: CabinetLaundryApplianceKind;
  laundryApplianceCount?: number;
  laundryApplianceWidth?: number;
  laundryApplianceHeight?: number;
  laundryApplianceDepth?: number;
  laundryApplianceSideClearance?: number;
  laundryApplianceTopClearance?: number;
  laundryApplianceBackClearance?: number;
  laundryUtilityChaseHeight?: number;
  laundryUtilityChaseDepth?: number;
  officeWorksurfaceEnabled?: boolean;
  officeWorksurfaceThickness?: number;
  officeWorksurfaceDepth?: number;
  officeWorksurfaceOverhangFront?: number;
  cableGrommetCount?: number;
  cableGrommetDiameter?: number;
  cableGrommetOffsetFromBack?: number;
  deskPowerChaseHeight?: number;
  deskPowerChaseDepth?: number;
  pantryPullOutTrayEnabled?: boolean;
  pantryPullOutTrayCount?: number;
  pantryPullOutTrayDepth?: number;
  pantryPullOutTrayFrontHeight?: number;
  pantryPullOutSlideClearance?: number;
  mediaWallEnabled?: boolean;
  mediaTvOpeningWidth?: number;
  mediaTvOpeningHeight?: number;
  mediaTvMountHeight?: number;
  mediaTvBlockingThickness?: number;
  mediaCableChaseWidth?: number;
  mediaCableChaseDepth?: number;
  mediaCableChaseHeight?: number;
  mediaVentSlotCount?: number;
  mediaVentSlotWidth?: number;
  mediaVentSlotHeight?: number;
  mediaVentSlotSpacing?: number;
  libraryLadderRailEnabled?: boolean;
  libraryLadderRailHeight?: number;
  libraryLadderRailDiameter?: number;
  libraryLadderRailProjection?: number;
  libraryLadderStandoffCount?: number;
  libraryLadderStandoffDiameter?: number;
  stemwareRackEnabled?: boolean;
  stemwareRackLaneCount?: number;
  stemwareRackDepth?: number;
  stemwareRackRailWidth?: number;
  stemwareRackLaneSpacing?: number;
  stemwareRackMountHeight?: number;
  lightingChannelEnabled?: boolean;
  lightingChannelCount?: number;
  lightingChannelDepth?: number;
  lightingChannelHeight?: number;
  lightingChannelInsetFromFront?: number;
  hamperPullOutEnabled?: boolean;
  hamperBasketCount?: number;
  hamperBasketDepth?: number;
  hamperBasketHeight?: number;
  hamperSlideClearance?: number;
  shelfPinRowsEnabled?: boolean;
  shelfPinRowPairCount?: number;
  shelfPinHoleCount?: number;
  shelfPinHoleSpacing?: number;
  shelfPinInsetFromFront?: number;
  shelfPinStartHeight?: number;
  doorHingeHardwareEnabled?: boolean;
  doorHingeCountPerDoor?: number;
  doorHingeInsetFromTopBottom?: number;
  installationCleatEnabled?: boolean;
  installationCleatHeight?: number;
  installationCleatThickness?: number;
  installationCleatInsetFromTop?: number;
  antiTipAnchorEnabled?: boolean;
  antiTipAnchorCount?: number;
  antiTipAnchorHeight?: number;
  antiTipAnchorInsetFromSides?: number;
  drawerBoxEnabled?: boolean;
  drawerBoxSideThickness?: number;
  drawerBoxBottomThickness?: number;
  drawerBoxHeightClearance?: number;
  drawerBoxBackClearance?: number;
  drawerSlideHardwareEnabled?: boolean;
  drawerSlideLength?: number;
  drawerSlideClearance?: number;
  materialId: string;
  frontMaterialId?: string;
  hardwareId?: string;
  /** Custom offsets shift every generated front handle from its automatic position. */
  handlePlacementMode?: CabinetHandlePlacementMode;
  handleOffsetX?: number;
  handleOffsetY?: number;
  hingeSide?: "left" | "right" | "double";
  /** Undefined keeps the material/part-aware automatic grain rule. */
  grainDirection?: CabinetGrainDirection;
  /** Undefined keeps matching edge banding on automatically exposed edges. */
  edgeTreatment?: CabinetEdgeTreatment;
  /** Required when edgeTreatment is contrasting_edge_band. */
  edgeMaterialId?: string;
  /** Undefined uses assembly-aware exposed-face inference; [] explicitly clears it. */
  exposedFaces?: CabinetExposedFace[];
}

export interface CabinetDefinition {
  id: string;
  name: string;
  version: number;
  units: "mm";
  millworkFamily?: MillworkFamily;
  millworkAssemblyType?: MillworkAssemblyType;
  /** Durable template identity used for reopen, reset, and contextual ranking. */
  sourcePresetId?: string;
  /** Durable placement constraint; old definitions may omit it. */
  requiredHostType?: CabinetRequiredHostType;
  totalWidth: number;
  height: number;
  depth: number;
  boardThickness: number;
  backPanelThickness: number;
  toeKickHeight: number;
  toeKickSetback?: number;
  toeKickDepth?: number;
  revealGap: number;
  leftFillerWidth?: number;
  rightFillerWidth?: number;
  leftFillerScribeAllowance?: number;
  rightFillerScribeAllowance?: number;
  includeLeftEndPanel?: boolean;
  includeRightEndPanel?: boolean;
  leftEndPanelThickness?: number;
  rightEndPanelThickness?: number;
  includeCountertop?: boolean;
  countertopThickness?: number;
  countertopOverhangLeft?: number;
  countertopOverhangRight?: number;
  countertopOverhangFront?: number;
  countertopOverhangBack?: number;
  countertopMaterialId?: string;
  includeBacksplash?: boolean;
  backsplashHeight?: number;
  backsplashThickness?: number;
  backsplashMaterialId?: string;
  levelingFeetEnabled?: boolean;
  levelingFootCount?: number;
  levelingFootHeight?: number;
  levelingFootDiameter?: number;
  levelingFootInsetFromSides?: number;
  levelingFootInsetFromFrontBack?: number;
  faceFrameEnabled?: boolean;
  faceFrameStileWidth?: number;
  faceFrameRailHeight?: number;
  faceFrameDepth?: number;
  faceFrameMaterialId?: string;
  islandSeatingOverhangEnabled?: boolean;
  islandSeatingOverhangDepth?: number;
  islandSupportPanelCount?: number;
  islandSupportPanelThickness?: number;
  islandSupportPanelDepth?: number;
  islandSupportPanelEndInset?: number;
  automation?: CabinetAutomationState;
  fitState?: CabinetFitState;
  modules: CabinetModuleDefinition[];
  materials: CabinetMaterialRef[];
  hardware: CabinetHardwareRef[];
  createdAt: string;
  updatedAt: string;
}

export type CabinetPartType =
  | "left_side_panel"
  | "right_side_panel"
  | "bottom_panel"
  | "top_panel"
  | "back_panel"
  | "shelf"
  | "vertical_divider"
  | "door_front"
  | "drawer_front"
  | "face_frame_stile"
  | "face_frame_rail"
  | "drawer_box_side"
  | "drawer_box_back"
  | "drawer_box_bottom"
  | "installation_cleat"
  | "anti_tip_anchor_bracket"
  | "leveling_foot"
  | "toe_kick"
  | "handle"
  | "hanging_rod"
  | "slat"
  | "panel_stile"
  | "panel_rail"
  | "ceiling_beam"
  | "trim_member"
  | "trim_return"
  | "trim_reveal_strip"
  | "convertible_panel"
  | "support_leg"
  | "hinge_rail"
  | "platform_deck"
  | "platform_support_rib"
  | "stair_scribe_panel"
  | "room_divider_back_panel"
  | "room_divider_stabilizer_foot"
  | "lifestyle_insert_deck"
  | "lifestyle_insert_lip"
  | "wine_rack_vertical_divider"
  | "wine_rack_horizontal_rail"
  | "seat_deck_panel"
  | "seat_cushion"
  | "seat_back_panel"
  | "mudroom_hook_rail"
  | "mudroom_hook"
  | "shoe_cubby_vertical_divider"
  | "shoe_cubby_shelf"
  | "sink_cutout_template"
  | "plumbing_chase_void"
  | "laundry_appliance_clearance"
  | "laundry_utility_chase"
  | "office_worksurface"
  | "cable_grommet_template"
  | "desk_power_chase"
  | "island_overhang_support_panel"
  | "pantry_pullout_tray_deck"
  | "pantry_pullout_tray_front"
  | "pantry_pullout_slide_pair"
  | "media_tv_blocking_panel"
  | "media_cable_chase"
  | "media_vent_slot_template"
  | "library_ladder_rail"
  | "library_ladder_standoff"
  | "stemware_rack_rail"
  | "led_lighting_channel"
  | "hamper_pullout_basket"
  | "hamper_pullout_slide_pair"
  | "shelf_pin_hole_row"
  | "door_hinge_pair"
  | "drawer_slide_pair"
  | "countertop"
  | "backsplash"
  | "filler"
  | "end_panel";

export interface CabinetPart {
  id: string;
  moduleId: string;
  type: CabinetPartType;
  position: {
    x: number;
    y: number;
    z: number;
  };
  size: {
    width: number;
    height: number;
    depth: number;
  };
  materialId: string;
  skuId?: string;
  metadata?: Record<string, unknown>;
}

export interface CabinetPartFabricationSpec {
  partId: string;
  moduleId: string;
  cutFace: {
    widthAxis: CabinetPartDimensionAxis;
    heightAxis: CabinetPartDimensionAxis;
    thicknessAxis: CabinetPartDimensionAxis;
  };
  grainDirection: CabinetGrainDirection;
  grainAxis: "cut_width" | "cut_height" | "none";
  edgeTreatment: CabinetEdgeTreatment;
  edgeMaterialId?: string;
  treatedEdges: CabinetTreatedEdge[];
  treatedLengthMm: number;
  exposedFaces: CabinetExposedFace[];
  source: "automatic" | "module_override";
}

export interface CabinetBOMItem {
  id: string;
  name: string;
  type: string;
  quantity: number;
  width?: number;
  height?: number;
  depth?: number;
  materialId?: string;
  skuId?: string;
  notes?: string;
}

export interface CabinetMaterialScheduleItem {
  id: string;
  materialId: string;
  materialName: string;
  skuId?: string;
  partCount: number;
  areaSqM: number;
  edgeBandingM: number;
  notes?: string;
}

export interface CabinetHardwareScheduleItem {
  id: string;
  hardwareId: string;
  hardwareName: string;
  hardwareType: HandleType;
  skuId?: string;
  quantity: number;
  moduleIds: string[];
  notes?: string;
  compatibilityStatus?: "compatible" | "review_required" | "incompatible";
  compatibilityReasons?: string[];
}

export interface CabinetEdgeBandingScheduleItem {
  id: string;
  materialId: string;
  materialName: string;
  edgeMaterialName: string;
  skuId?: string;
  totalLengthM: number;
  partCount: number;
  moduleIds: string[];
  partIds: string[];
  notes?: string;
  edgeTreatment?: CabinetEdgeTreatment;
  edgeMaterialId?: string;
}

export interface CabinetCutListItem {
  id: string;
  partId: string;
  moduleId: string;
  name: string;
  type: CabinetPartType;
  quantity: number;
  width: number;
  height: number;
  depth: number;
  materialId: string;
  materialName: string;
  edgeBandingMm: number;
  notes?: string;
  grainDirection?: CabinetGrainDirection;
  grainAxis?: "cut_width" | "cut_height" | "none";
  edgeTreatment?: CabinetEdgeTreatment;
  edgeMaterialId?: string;
  treatedEdges?: CabinetTreatedEdge[];
  exposedFaces?: CabinetExposedFace[];
  cutFace?: CabinetPartFabricationSpec["cutFace"];
}

export interface CabinetDimensionScheduleItem {
  id: string;
  scope: "overall" | "module";
  label: string;
  moduleId?: string;
  width: number;
  height: number;
  depth: number;
  frontOffsetX?: number;
  notes?: string;
}

export interface CabinetDrawingViewScheduleItem {
  id: string;
  viewType: "front_elevation" | "side_section" | "plan_footprint";
  sheetRef: string;
  label: string;
  moduleId?: string;
  scale: string;
  width: number;
  height?: number;
  depth?: number;
  offsetX?: number;
  offsetZ?: number;
  cutPlane?: "front" | "left" | "right" | "top";
  notes?: string;
}

export interface CabinetInstallerNote {
  id: string;
  severity: "info" | "coordination" | "field_verify";
  category: string;
  message: string;
  moduleId?: string;
}

export interface CabinetReleaseChecklistItem {
  id: string;
  phase:
    | "site_verification"
    | "design_approval"
    | "supplier_procurement"
    | "fabrication_review"
    | "installation_coordination";
  label: string;
  owner: "designer" | "client" | "supplier" | "fabricator" | "installer";
  status: "required" | "recommended" | "blocked";
  dueBefore: "quote_request" | "fabrication_release" | "installation";
  relatedArtifactTypes?: CabinetFabricationArtifact["type"][];
  notes: string;
}

export interface CabinetQuoteLineItem {
  id: string;
  category: "materials" | "hardware" | "fabrication" | "installation" | "contingency";
  label: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  notes?: string;
}

export interface CabinetQuoteSummary {
  currency: string;
  materialCost: number;
  hardwareCost: number;
  fabricationCost: number;
  installationAllowance: number;
  contingency: number;
  estimatedTotal: number;
  lineItems: CabinetQuoteLineItem[];
  assumptions: string[];
}

export interface CabinetSupplierSkuMappingItem {
  id: string;
  sourceType: "material" | "hardware" | "fabrication_service" | "installation_service";
  sourceId: string;
  displayName: string;
  supplierName: string;
  skuId?: string;
  status: "mapped" | "placeholder" | "custom_quote_required";
  quantity: number;
  unit: string;
  estimatedCost?: number;
  notes?: string;
}

export interface CabinetSupplierReadinessSnapshot {
  status: "ready_for_fabricator_review" | "needs_supplier_mapping";
  mappedSkuCount: number;
  missingSkuCount: number;
  customQuoteRequiredCount: number;
  releaseChecklistCount: number;
  releaseBlockerCount: number;
  notes: string[];
}

export interface CabinetFabricationReleaseReadinessSnapshot {
  status: "blocked" | "needs_review" | "ready_for_release";
  requiredGateCount: number;
  recommendedGateCount: number;
  blockerCount: number;
  fabricationReleaseGateCount: number;
  installationGateCount: number;
  supplierMissingSkuCount: number;
  customQuoteRequiredCount: number;
  notes: string[];
}

export interface CabinetFabricationArtifact {
  type:
    | "package_json"
    | "documentation_csv"
    | "shop_drawing_svg"
    | "fabrication_dxf"
    | "glb"
    | "source_definition"
    | "installer_work_order_json"
    | "project_schedule_json"
    | "project_schedule_csv"
    | "project_scope_json"
    | "project_drawing_set_json"
    | "project_cut_list_json"
    | "project_finish_schedule_json"
    | "project_procurement_json"
    | "project_fabrication_release_json"
    | "project_field_verification_json"
    | "project_installation_plan_json"
    | "project_cnc_batch_json"
    | "project_approval_package_json"
    | "project_revision_package_json"
    | "project_quote_package_json"
    | "project_purchase_readiness_json"
    | "project_handoff_package_json"
    | "project_rfq_json";
  fileName: string;
  durable: boolean;
  notes?: string;
}

export interface CabinetFabricationQuoteRequest {
  schema: "custom_millwork.rfq.v1";
  requestVersion: number;
  generatedAt: string;
  sourceType: "cabinet_definition";
  cabinetDefinitionId: string;
  millworkDefinition: MillworkDefinition<CabinetDefinition>;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  dimensions: {
    width: number;
    height: number;
    depth: number;
    units: "mm";
  };
  sourceDefinitionFingerprint: string;
  readiness: CabinetSupplierReadinessSnapshot;
  fabricationReleaseReadiness: CabinetFabricationReleaseReadinessSnapshot;
  requestedDeliverables: string[];
  supplierSkuMappings: CabinetSupplierSkuMappingItem[];
  artifacts: CabinetFabricationArtifact[];
  bom: CabinetBOMItem[];
  documentation: Pick<
    CabinetDocumentationSnapshot,
    | "dimensionSchedule"
    | "drawingViewSchedule"
    | "materialSchedule"
    | "hardwareSchedule"
    | "edgeBandingSchedule"
    | "cutList"
    | "installerNotes"
    | "releaseChecklist"
  >;
  quoteSummary: CabinetQuoteSummary;
  assumptions: string[];
}

export interface CabinetSourceDefinitionExport {
  schema: "custom_millwork.source_definition.v1";
  exportVersion: number;
  generatedAt: string;
  sourceType: "cabinet_definition";
  cabinetDefinition: CabinetDefinition;
  millworkDefinition: MillworkDefinition<CabinetDefinition>;
  sourceDefinitionFingerprint: string;
  notes: string[];
}

export interface CabinetDocumentationSnapshot {
  assemblyProfile: MillworkAssemblyProfile;
  dimensionSchedule: CabinetDimensionScheduleItem[];
  drawingViewSchedule: CabinetDrawingViewScheduleItem[];
  materialSchedule: CabinetMaterialScheduleItem[];
  hardwareSchedule: CabinetHardwareScheduleItem[];
  edgeBandingSchedule: CabinetEdgeBandingScheduleItem[];
  cutList: CabinetCutListItem[];
  installerNotes: CabinetInstallerNote[];
  releaseChecklist: CabinetReleaseChecklistItem[];
  quoteSummary: CabinetQuoteSummary;
  supplierSkuMappings: CabinetSupplierSkuMappingItem[];
  supplierReadiness: CabinetSupplierReadinessSnapshot;
  fabricationReleaseReadiness: CabinetFabricationReleaseReadinessSnapshot;
}

export interface CabinetDocumentationPackage {
  schema: "custom_millwork.package.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "cabinet_definition";
  cabinetDefinition: CabinetDefinition;
  millworkDefinition: MillworkDefinition<CabinetDefinition>;
  sourceDefinitionFingerprint: string;
  bom: CabinetBOMItem[];
  documentation: CabinetDocumentationSnapshot;
  quoteRequest: CabinetFabricationQuoteRequest;
  notes: string[];
}

export interface PlacedCabinetAsset {
  id: string;
  assetType: "parametric_cabinet";
  assetManifest?: MillworkAssetManifest;
  assemblyType: MillworkAssemblyType;
  cabinetDefinitionId: string;
  cabinetDefinition: CabinetDefinition;
  millworkDefinition?: MillworkDefinition<CabinetDefinition>;
  millworkDefinitionVersion: number;
  glbAssetUrl?: string;
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  roomId?: string;
  materials: CabinetMaterialRef[];
  hardware: CabinetHardwareRef[];
  bomSnapshot: CabinetBOMItem[];
  materialScheduleSnapshot?: CabinetMaterialScheduleItem[];
  hardwareScheduleSnapshot?: CabinetHardwareScheduleItem[];
  edgeBandingScheduleSnapshot?: CabinetEdgeBandingScheduleItem[];
  cutListSnapshot?: CabinetCutListItem[];
  dimensionScheduleSnapshot?: CabinetDimensionScheduleItem[];
  drawingViewScheduleSnapshot?: CabinetDrawingViewScheduleItem[];
  installerNotesSnapshot?: CabinetInstallerNote[];
  releaseChecklistSnapshot?: CabinetReleaseChecklistItem[];
  quoteSummarySnapshot?: CabinetQuoteSummary;
  supplierSkuMappingsSnapshot?: CabinetSupplierSkuMappingItem[];
  supplierReadinessSnapshot?: CabinetSupplierReadinessSnapshot;
  fabricationReleaseReadinessSnapshot?: CabinetFabricationReleaseReadinessSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface CabinetPlacedAssetPackage {
  schema: "custom_millwork.placed_asset_package.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet";
  assetManifest: MillworkAssetManifest;
  placedAsset: PlacedCabinetAsset;
  cabinetDefinition: CabinetDefinition;
  millworkDefinition: MillworkDefinition<CabinetDefinition>;
  sourceDefinitionFingerprint: string;
  bom: CabinetBOMItem[];
  documentation: CabinetDocumentationSnapshot;
  quoteRequest: CabinetFabricationQuoteRequest;
  installerWorkOrder: CabinetPlacedAssetInstallerWorkOrder;
  notes: string[];
}

export interface CabinetPlacedAssetInstallerWorkOrder {
  schema: "custom_millwork.installer_work_order.v1";
  workOrderVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet";
  assetManifest: MillworkAssetManifest;
  placedAsset: PlacedCabinetAsset;
  sourceDefinitionFingerprint: string;
  roomId?: string;
  roomName: string;
  dimensions: {
    width: number;
    height: number;
    depth: number;
    units: "mm";
  };
  siteTransform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    positionUnits: "m";
    rotationUnits: "rad";
  };
  installationScope: {
    assemblyType: MillworkAssemblyType;
    moduleCount: number;
    wallMountedOrTall: boolean;
    requiresAnchoringReview: boolean;
    serviceCoordinationRequired: boolean;
    releaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
    releaseBlockerCount: number;
  };
  documentation: Pick<
    CabinetDocumentationSnapshot,
    | "dimensionSchedule"
    | "drawingViewSchedule"
    | "materialSchedule"
    | "hardwareSchedule"
    | "edgeBandingSchedule"
    | "cutList"
    | "installerNotes"
    | "releaseChecklist"
  >;
  artifacts: CabinetFabricationArtifact[];
  notes: string[];
}

export interface CabinetProjectScheduleAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  sourceDefinitionFingerprint: string;
  width: number;
  height: number;
  depth: number;
  moduleCount: number;
  bomLineCount: number;
  materialScheduleCount: number;
  hardwareScheduleCount: number;
  edgeBandingScheduleCount: number;
  edgeBandingTotalM: number;
  cutListCount: number;
  estimatedTotal: number;
  supplierReadinessStatus: CabinetSupplierReadinessSnapshot["status"];
  fabricationReleaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  releaseBlockerCount: number;
  updatedAt: string;
}

export interface CabinetProjectScheduleRoomSummary {
  roomId?: string;
  roomName: string;
  assetCount: number;
  assemblyTypes: MillworkAssemblyType[];
  estimatedTotal: number;
  edgeBandingTotalM: number;
  releaseBlockerCount: number;
}

export interface CabinetProjectScheduleTotals {
  roomCount: number;
  assetCount: number;
  moduleCount: number;
  bomLineCount: number;
  materialScheduleCount: number;
  hardwareScheduleCount: number;
  edgeBandingScheduleCount: number;
  edgeBandingTotalM: number;
  cutListCount: number;
  estimatedTotal: number;
  releaseChecklistCount: number;
  releaseBlockerCount: number;
  supplierMissingSkuCount: number;
  customQuoteRequiredCount: number;
}

export interface CabinetProjectSchedulePackage {
  schema: "custom_millwork.project_schedule.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  rooms: CabinetProjectScheduleRoomSummary[];
  assets: CabinetProjectScheduleAssetSummary[];
  totals: CabinetProjectScheduleTotals;
  assetManifests: MillworkAssetManifest[];
  placedAssets: PlacedCabinetAsset[];
  notes: string[];
}

export interface CabinetProjectScopeFamilySummary {
  family: MillworkFamily;
  assetCount: number;
  assemblyTypes: MillworkAssemblyType[];
  assetIds: string[];
  roomNames: string[];
  sourceDefinitionFingerprints: string[];
  totalWidthMm: number;
  estimatedTotal: number;
  currency: string;
}

export interface CabinetProjectScopeAssemblySummary {
  assemblyType: MillworkAssemblyType;
  family: MillworkFamily;
  assetCount: number;
  assetIds: string[];
  roomNames: string[];
  sourceDefinitionFingerprints: string[];
  moduleCount: number;
  cutListCount: number;
}

export interface CabinetProjectScopeCoverageItem {
  scopeId: "mvp" | "phase_2" | "phase_3" | "phase_4" | "phase_5" | "phase_6";
  label: string;
  status: "represented" | "partially_represented" | "not_represented";
  representedFamilies: MillworkFamily[];
  representedAssemblyTypes: MillworkAssemblyType[];
  assetCount: number;
  notes: string;
}

export interface CabinetProjectScopeTotals {
  assetCount: number;
  roomCount: number;
  familyCount: number;
  assemblyTypeCount: number;
  cabinetryAssetCount: number;
  broaderBuiltInAssetCount: number;
  phaseRepresentedCount: number;
  sourceDefinitionFingerprintCount: number;
  estimatedTotal: number;
  currency: string;
}

export interface CabinetProjectScopePackage {
  schema: "custom_millwork.project_scope.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  schedule: CabinetProjectSchedulePackage;
  totals: CabinetProjectScopeTotals;
  families: CabinetProjectScopeFamilySummary[];
  assemblies: CabinetProjectScopeAssemblySummary[];
  coverage: CabinetProjectScopeCoverageItem[];
  scopePolicy: {
    sourceOfTruth: "cabinet_definition";
    supportsBroaderCustomBuiltIns: boolean;
    reason: string;
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectDrawingSetSheetSummary {
  id: string;
  assetId: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sheetRef: string;
  sheetTitle: string;
  shopDrawingFileName: string;
  viewTypes: CabinetDrawingViewScheduleItem["viewType"][];
  viewCount: number;
  dimensionRowCount: number;
  width: number;
  height: number;
  depth: number;
  units: "mm";
  reviewStatus: "needs_review" | "blocked" | "ready_for_submittal";
  relatedArtifactTypes: CabinetFabricationArtifact["type"][];
  notes?: string;
}

export interface CabinetProjectDrawingSetAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  shopDrawingFileName: string;
  placedPackageFileName: string;
  drawingViewCount: number;
  dimensionRowCount: number;
  frontElevationCount: number;
  sideSectionCount: number;
  planFootprintCount: number;
  releaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  releaseBlockerCount: number;
  updatedAt: string;
}

export interface CabinetProjectDrawingSetTotals {
  roomCount: number;
  assetCount: number;
  sheetCount: number;
  drawingViewCount: number;
  dimensionRowCount: number;
  frontElevationCount: number;
  sideSectionCount: number;
  planFootprintCount: number;
  shopDrawingFileCount: number;
  releaseBlockerCount: number;
}

export interface CabinetProjectDrawingSetPackage {
  schema: "custom_millwork.project_drawing_set.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  schedule: CabinetProjectSchedulePackage;
  revisionPackage: CabinetProjectRevisionPackage;
  approvalPackage: CabinetProjectApprovalPackage;
  totals: CabinetProjectDrawingSetTotals;
  assets: CabinetProjectDrawingSetAssetSummary[];
  sheets: CabinetProjectDrawingSetSheetSummary[];
  drawingReviewPolicy: {
    requiresDesignerReview: boolean;
    requiresClientReview: boolean;
    requiresFabricatorReview: boolean;
    requiresFieldVerification: boolean;
    reason: string;
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectFabricationQuoteRequest {
  schema: "custom_millwork.project_rfq.v1";
  requestVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  schedule: CabinetProjectSchedulePackage;
  totals: CabinetProjectScheduleTotals;
  rooms: CabinetProjectScheduleRoomSummary[];
  assets: CabinetProjectScheduleAssetSummary[];
  assetQuoteRequests: CabinetFabricationQuoteRequest[];
  requestedDeliverables: string[];
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectProcurementLineItem {
  id: string;
  sourceType: CabinetSupplierSkuMappingItem["sourceType"];
  sourceId: string;
  displayName: string;
  supplierName: string;
  skuId?: string;
  status: CabinetSupplierSkuMappingItem["status"];
  quantity: number;
  unit: string;
  estimatedCost: number;
  assetIds: string[];
  roomNames: string[];
  assemblyTypes: MillworkAssemblyType[];
  notes?: string;
}

export interface CabinetProjectProcurementTotals {
  lineCount: number;
  mappedSkuCount: number;
  placeholderSkuCount: number;
  customQuoteRequiredCount: number;
  materialCost: number;
  hardwareCost: number;
  fabricationCost: number;
  installationCost: number;
  estimatedTotal: number;
  currency: string;
}

export interface CabinetProjectProcurementPackage {
  schema: "custom_millwork.project_procurement.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  schedule: CabinetProjectSchedulePackage;
  totals: CabinetProjectProcurementTotals;
  lineItems: CabinetProjectProcurementLineItem[];
  rooms: CabinetProjectScheduleRoomSummary[];
  assets: CabinetProjectScheduleAssetSummary[];
  checkoutPolicy: {
    includeInCheckout: false;
    reason: string;
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectFinishMaterialSummary {
  materialId: string;
  materialName: string;
  skuId?: string;
  color?: string;
  textureUrl?: string;
  partCount: number;
  areaSqM: number;
  edgeBandingM: number;
  assetIds: string[];
  roomNames: string[];
  assemblyTypes: MillworkAssemblyType[];
  supplierStatus?: CabinetSupplierSkuMappingItem["status"];
  notes?: string;
}

export interface CabinetProjectFinishHardwareSummary {
  hardwareId: string;
  hardwareName: string;
  hardwareType: HandleType;
  skuId?: string;
  quantity: number;
  assetIds: string[];
  roomNames: string[];
  assemblyTypes: MillworkAssemblyType[];
  supplierStatus?: CabinetSupplierSkuMappingItem["status"];
  notes?: string;
}

export interface CabinetProjectFinishEdgeBandingSummary {
  materialId: string;
  materialName: string;
  edgeMaterialName: string;
  skuId?: string;
  totalLengthM: number;
  partCount: number;
  assetIds: string[];
  roomNames: string[];
  assemblyTypes: MillworkAssemblyType[];
  notes?: string;
}

export interface CabinetProjectFinishAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  materialScheduleCount: number;
  hardwareScheduleCount: number;
  edgeBandingScheduleCount: number;
  edgeBandingTotalM: number;
  supplierReadinessStatus: CabinetSupplierReadinessSnapshot["status"];
  customQuoteRequiredCount: number;
  updatedAt: string;
}

export interface CabinetProjectFinishScheduleTotals {
  assetCount: number;
  roomCount: number;
  materialCount: number;
  hardwareCount: number;
  edgeBandingCount: number;
  materialAreaSqM: number;
  edgeBandingTotalM: number;
  hardwareQuantity: number;
  mappedSkuCount: number;
  missingSkuCount: number;
  customQuoteRequiredCount: number;
}

export interface CabinetProjectFinishSchedulePackage {
  schema: "custom_millwork.project_finish_schedule.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  schedule: CabinetProjectSchedulePackage;
  procurementPackage: CabinetProjectProcurementPackage;
  totals: CabinetProjectFinishScheduleTotals;
  materials: CabinetProjectFinishMaterialSummary[];
  hardware: CabinetProjectFinishHardwareSummary[];
  edgeBanding: CabinetProjectFinishEdgeBandingSummary[];
  assets: CabinetProjectFinishAssetSummary[];
  finishReviewPolicy: {
    requiresDesignerApproval: boolean;
    requiresClientApproval: boolean;
    requiresSupplierConfirmation: boolean;
    reason: string;
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectRevisionAssetSnapshot {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  sourceDefinitionFingerprint: string;
  revisionStatus: "baseline" | "unchanged" | "changed" | "added" | "removed";
  dimensions: {
    width: number;
    height: number;
    depth: number;
    units: "mm";
  };
  siteTransform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    positionUnits: "m";
    rotationUnits: "rad";
  };
  materialIds: string[];
  hardwareIds: string[];
  bomLineCount: number;
  materialScheduleCount: number;
  hardwareScheduleCount: number;
  edgeBandingTotalM: number;
  quoteTotal: number;
  supplierReadinessStatus: CabinetSupplierReadinessSnapshot["status"];
  fabricationReleaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  createdAt: string;
  updatedAt: string;
}

export interface CabinetProjectRevisionChangeItem {
  id: string;
  assetId: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  scope:
    | "asset_added"
    | "asset_removed"
    | "source_version"
    | "source_fingerprint"
    | "dimension"
    | "placement"
    | "room"
    | "material"
    | "hardware"
    | "bom"
    | "edge_banding"
    | "quote"
    | "supplier_readiness"
    | "fabrication_release";
  severity: "info" | "review_required" | "release_blocking";
  previousValue?: string;
  currentValue?: string;
  requiresApproval: boolean;
  relatedArtifactTypes: CabinetFabricationArtifact["type"][];
  notes: string;
}

export interface CabinetProjectRevisionTotals {
  currentAssetCount: number;
  previousAssetCount: number;
  addedAssetCount: number;
  removedAssetCount: number;
  changedAssetCount: number;
  unchangedAssetCount: number;
  changeItemCount: number;
  reviewRequiredCount: number;
  releaseBlockingCount: number;
  dimensionChangeCount: number;
  placementChangeCount: number;
  materialChangeCount: number;
  hardwareChangeCount: number;
  quoteDelta: number;
  edgeBandingDeltaM: number;
}

export interface CabinetProjectRevisionPackage {
  schema: "custom_millwork.project_revision_package.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  currentSchedule: CabinetProjectSchedulePackage;
  previousSchedule?: CabinetProjectSchedulePackage;
  totals: CabinetProjectRevisionTotals;
  assets: CabinetProjectRevisionAssetSnapshot[];
  changes: CabinetProjectRevisionChangeItem[];
  revisionPolicy: {
    baselineComparisonAvailable: boolean;
    requiresDesignerReview: boolean;
    requiresClientReview: boolean;
    requiresFabricatorNotification: boolean;
    reason: string;
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectQuoteCategorySummary {
  category: CabinetQuoteLineItem["category"];
  label: string;
  lineCount: number;
  estimatedTotal: number;
}

export interface CabinetProjectQuoteAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  categoryTotals: CabinetProjectQuoteCategorySummary[];
  lineItemCount: number;
  estimatedTotal: number;
  currency: string;
  assumptionsCount: number;
  supplierReadinessStatus: CabinetSupplierReadinessSnapshot["status"];
  fabricationReleaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  customQuoteRequiredCount: number;
  updatedAt: string;
}

export interface CabinetProjectQuoteRoomSummary {
  roomId?: string;
  roomName: string;
  assetCount: number;
  estimatedTotal: number;
  currency: string;
}

export interface CabinetProjectQuoteTotals {
  assetCount: number;
  roomCount: number;
  lineItemCount: number;
  materialCost: number;
  hardwareCost: number;
  fabricationCost: number;
  installationAllowance: number;
  contingency: number;
  estimatedTotal: number;
  customQuoteRequiredCount: number;
  supplierMissingSkuCount: number;
  releaseBlockerCount: number;
  currency: string;
}

export interface CabinetProjectQuotePackage {
  schema: "custom_millwork.project_quote.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  quoteStatus: "draft_estimate" | "needs_supplier_quote" | "ready_for_client_review";
  schedule: CabinetProjectSchedulePackage;
  procurementPackage: CabinetProjectProcurementPackage;
  approvalPackage: CabinetProjectApprovalPackage;
  fabricationReleasePackage: CabinetProjectFabricationReleasePackage;
  totals: CabinetProjectQuoteTotals;
  categoryTotals: CabinetProjectQuoteCategorySummary[];
  rooms: CabinetProjectQuoteRoomSummary[];
  assets: CabinetProjectQuoteAssetSummary[];
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
  disclaimer: string;
}

export interface CabinetProjectPurchaseReadinessLineItem {
  id: string;
  sourceType: CabinetSupplierSkuMappingItem["sourceType"];
  sourceId: string;
  displayName: string;
  supplierName: string;
  skuId?: string;
  procurementStatus: CabinetSupplierSkuMappingItem["status"];
  purchaseAction:
    | "supplier_catalog_candidate"
    | "requires_supplier_mapping"
    | "requires_custom_quote"
    | "hold_for_approval";
  checkoutEligible: boolean;
  quantity: number;
  unit: string;
  estimatedCost: number;
  assetIds: string[];
  roomNames: string[];
  assemblyTypes: MillworkAssemblyType[];
  notes?: string;
}

export interface CabinetProjectPurchaseReadinessAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  checkoutCandidateCount: number;
  quoteRequiredCount: number;
  estimatedCatalogSubtotal: number;
  estimatedCustomQuoteSubtotal: number;
  supplierReadinessStatus: CabinetSupplierReadinessSnapshot["status"];
  fabricationReleaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  updatedAt: string;
}

export interface CabinetProjectPurchaseReadinessTotals {
  assetCount: number;
  roomCount: number;
  lineCount: number;
  checkoutCandidateCount: number;
  supplierMappingRequiredCount: number;
  customQuoteRequiredCount: number;
  holdForApprovalCount: number;
  estimatedCatalogSubtotal: number;
  estimatedCustomQuoteSubtotal: number;
  estimatedPurchaseSubtotal: number;
  estimatedProjectQuoteTotal: number;
  currency: string;
}

export interface CabinetProjectPurchaseReadinessPackage {
  schema: "custom_millwork.project_purchase_readiness.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  purchaseReadiness: "blocked" | "needs_quote" | "ready_for_purchase_review";
  canCreateCheckout: false;
  canIssuePurchaseOrder: boolean;
  schedule: CabinetProjectSchedulePackage;
  procurementPackage: CabinetProjectProcurementPackage;
  quotePackage: CabinetProjectQuotePackage;
  approvalPackage: CabinetProjectApprovalPackage;
  fabricationReleasePackage: CabinetProjectFabricationReleasePackage;
  totals: CabinetProjectPurchaseReadinessTotals;
  lineItems: CabinetProjectPurchaseReadinessLineItem[];
  assets: CabinetProjectPurchaseReadinessAssetSummary[];
  checkoutPolicy: {
    includeInCheckout: false;
    reason: string;
  };
  nextActions: string[];
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectFieldVerificationChecklistItem {
  id: string;
  assetId: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  scope:
    | "site_measurement"
    | "placement"
    | "clearance"
    | "wall_floor_ceiling"
    | "service_coordination"
    | "anchoring"
    | "access";
  owner: "designer" | "installer" | "fabricator";
  status: "required" | "recommended";
  dueBefore: CabinetReleaseChecklistItem["dueBefore"];
  label: string;
  sourceNoteId?: string;
  relatedArtifactTypes: CabinetFabricationArtifact["type"][];
  notes: string;
}

export interface CabinetProjectFieldVerificationAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  dimensions: {
    width: number;
    height: number;
    depth: number;
    units: "mm";
  };
  siteTransform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    positionUnits: "m";
    rotationUnits: "rad";
  };
  requiredCheckCount: number;
  recommendedCheckCount: number;
  fieldVerifyNoteCount: number;
  coordinationNoteCount: number;
  releaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  releaseBlockerCount: number;
  placedPackageFileName: string;
  installerWorkOrderFileName: string;
  updatedAt: string;
}

export interface CabinetProjectFieldVerificationRoomSummary {
  roomId?: string;
  roomName: string;
  assetCount: number;
  assetIds: string[];
  requiredCheckCount: number;
  recommendedCheckCount: number;
  fieldVerifyNoteCount: number;
  coordinationNoteCount: number;
  releaseBlockerCount: number;
}

export interface CabinetProjectFieldVerificationTotals {
  roomCount: number;
  assetCount: number;
  checklistCount: number;
  requiredCheckCount: number;
  recommendedCheckCount: number;
  fieldVerifyNoteCount: number;
  coordinationNoteCount: number;
  placementCheckCount: number;
  releaseBlockerCount: number;
}

export interface CabinetProjectFieldVerificationPackage {
  schema: "custom_millwork.project_field_verification.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  verificationStatus: "blocked" | "field_verification_required" | "ready_for_release_review";
  canReleaseWithoutFieldVerification: false;
  schedule: CabinetProjectSchedulePackage;
  fabricationReleasePackage: CabinetProjectFabricationReleasePackage;
  installationPlanPackage: CabinetProjectInstallationPlanPackage;
  totals: CabinetProjectFieldVerificationTotals;
  rooms: CabinetProjectFieldVerificationRoomSummary[];
  assets: CabinetProjectFieldVerificationAssetSummary[];
  checklist: CabinetProjectFieldVerificationChecklistItem[];
  fieldVerificationPolicy: {
    requiresHumanVerification: true;
    reason: string;
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectFabricationReleaseAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  releaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  releaseBlockerCount: number;
  requiredGateCount: number;
  fabricationReleaseGateCount: number;
  installationGateCount: number;
  supplierMissingSkuCount: number;
  customQuoteRequiredCount: number;
  cutListCount: number;
  edgeBandingTotalM: number;
  drawingViewCount: number;
  installerNoteCount: number;
  placedPackageFileName: string;
  installerWorkOrderFileName: string;
  shopDrawingFileName: string;
  fabricationDxfFileName: string;
  updatedAt: string;
}

export interface CabinetProjectFabricationReleaseTotals {
  assetCount: number;
  readyForReleaseCount: number;
  needsReviewCount: number;
  blockedCount: number;
  requiredGateCount: number;
  releaseBlockerCount: number;
  fabricationReleaseGateCount: number;
  installationGateCount: number;
  supplierMissingSkuCount: number;
  customQuoteRequiredCount: number;
  cutListCount: number;
  edgeBandingTotalM: number;
}

export interface CabinetProjectFabricationReleasePackage {
  schema: "custom_millwork.project_fabrication_release.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  status: CabinetFabricationReleaseReadinessSnapshot["status"];
  canReleaseToFabrication: boolean;
  canIssuePurchaseOrder: boolean;
  schedule: CabinetProjectSchedulePackage;
  procurementPackage: CabinetProjectProcurementPackage;
  quoteRequest: CabinetProjectFabricationQuoteRequest;
  totals: CabinetProjectFabricationReleaseTotals;
  assets: CabinetProjectFabricationReleaseAssetSummary[];
  releaseDecision: {
    requiresHumanApproval: boolean;
    reason: string;
    nextActions: string[];
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectInstallationAssetPlan {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  installSequence: number;
  dimensions: {
    width: number;
    height: number;
    depth: number;
    units: "mm";
  };
  siteTransform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
    positionUnits: "m";
    rotationUnits: "rad";
  };
  wallMountedOrTall: boolean;
  requiresAnchoringReview: boolean;
  serviceCoordinationRequired: boolean;
  releaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  releaseBlockerCount: number;
  requiredGateCount: number;
  installationGateCount: number;
  installerNoteCount: number;
  fieldVerifyNoteCount: number;
  coordinationNoteCount: number;
  estimatedInstallHours: number;
  placedPackageFileName: string;
  installerWorkOrderFileName: string;
  updatedAt: string;
}

export interface CabinetProjectInstallationRoomPlan {
  roomId?: string;
  roomName: string;
  installSequence: number;
  assetCount: number;
  assetIds: string[];
  assemblyTypes: MillworkAssemblyType[];
  installerWorkOrderFileNames: string[];
  requiredGateCount: number;
  installationGateCount: number;
  releaseBlockerCount: number;
  anchoringReviewCount: number;
  serviceCoordinationCount: number;
  installerNoteCount: number;
  estimatedInstallHours: number;
}

export interface CabinetProjectInstallationTotals {
  roomCount: number;
  assetCount: number;
  installerWorkOrderCount: number;
  requiredGateCount: number;
  installationGateCount: number;
  releaseBlockerCount: number;
  anchoringReviewCount: number;
  serviceCoordinationCount: number;
  fieldVerifyNoteCount: number;
  coordinationNoteCount: number;
  estimatedInstallHours: number;
}

export interface CabinetProjectInstallationPlanPackage {
  schema: "custom_millwork.project_installation_plan.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  installationReadiness: "blocked" | "needs_review" | "ready_for_install";
  schedule: CabinetProjectSchedulePackage;
  fabricationReleasePackage: CabinetProjectFabricationReleasePackage;
  rooms: CabinetProjectInstallationRoomPlan[];
  assets: CabinetProjectInstallationAssetPlan[];
  totals: CabinetProjectInstallationTotals;
  sequencingNotes: string[];
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectCutListPartItem {
  id: string;
  assetId: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  partId: string;
  moduleId: string;
  name: string;
  type: CabinetPartType;
  quantity: number;
  width: number;
  height: number;
  depth: number;
  units: "mm";
  materialId: string;
  materialName: string;
  edgeBandingMm: number;
  edgeBandingM: number;
  grainDirection?: CabinetGrainDirection;
  grainAxis?: "cut_width" | "cut_height" | "none";
  edgeTreatment?: CabinetEdgeTreatment;
  edgeMaterialId?: string;
  treatedEdges?: CabinetTreatedEdge[];
  exposedFaces?: CabinetExposedFace[];
  cutFace?: CabinetPartFabricationSpec["cutFace"];
  shopDrawingFileName: string;
  fabricationDxfFileName: string;
  notes?: string;
}

export interface CabinetProjectCutListMaterialSummary {
  materialId: string;
  materialName: string;
  partCount: number;
  quantity: number;
  areaSqM: number;
  edgeBandingM: number;
  assetIds: string[];
  roomNames: string[];
  assemblyTypes: MillworkAssemblyType[];
}

export interface CabinetProjectCutListAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  cutListCount: number;
  materialCount: number;
  edgeBandingM: number;
  shopDrawingFileName: string;
  fabricationDxfFileName: string;
  fabricationReleaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  releaseBlockerCount: number;
  updatedAt: string;
}

export interface CabinetProjectCutListTotals {
  roomCount: number;
  assetCount: number;
  partRowCount: number;
  totalQuantity: number;
  materialCount: number;
  materialAreaSqM: number;
  edgeBandingTotalM: number;
  dxfFileCount: number;
  shopDrawingFileCount: number;
  releaseBlockerCount: number;
}

export interface CabinetProjectCutListPackage {
  schema: "custom_millwork.project_cut_list.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  schedule: CabinetProjectSchedulePackage;
  drawingSetPackage: CabinetProjectDrawingSetPackage;
  revisionPackage: CabinetProjectRevisionPackage;
  totals: CabinetProjectCutListTotals;
  assets: CabinetProjectCutListAssetSummary[];
  materials: CabinetProjectCutListMaterialSummary[];
  parts: CabinetProjectCutListPartItem[];
  cutListReviewPolicy: {
    requiresFabricatorReview: boolean;
    requiresCncReview: boolean;
    requiresDesignerApproval: boolean;
    reason: string;
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectCncBatchAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  dxfFileName: string;
  placedPackageFileName: string;
  cutListCount: number;
  materialScheduleCount: number;
  edgeBandingTotalM: number;
  fabricationReleaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  releaseBlockerCount: number;
  machiningReviewRequired: boolean;
  updatedAt: string;
}

export interface CabinetProjectCncBatchMaterialSummary {
  materialId: string;
  materialName: string;
  skuId?: string;
  partCount: number;
  areaSqM: number;
  edgeBandingM: number;
  assetIds: string[];
  roomNames: string[];
}

export interface CabinetProjectCncBatchTotals {
  assetCount: number;
  dxfFileCount: number;
  cutListCount: number;
  materialScheduleCount: number;
  materialAreaSqM: number;
  edgeBandingTotalM: number;
  machiningReviewRequiredCount: number;
  releaseBlockerCount: number;
}

export interface CabinetProjectCncBatchPackage {
  schema: "custom_millwork.project_cnc_batch.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  cncReadiness: "blocked" | "needs_review" | "ready_for_fabricator_review";
  schedule: CabinetProjectSchedulePackage;
  fabricationReleasePackage: CabinetProjectFabricationReleasePackage;
  totals: CabinetProjectCncBatchTotals;
  materials: CabinetProjectCncBatchMaterialSummary[];
  assets: CabinetProjectCncBatchAssetSummary[];
  reviewChecklist: string[];
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectApprovalItem {
  id: string;
  assetId: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  phase: CabinetReleaseChecklistItem["phase"];
  owner: CabinetReleaseChecklistItem["owner"];
  status: CabinetReleaseChecklistItem["status"];
  dueBefore: CabinetReleaseChecklistItem["dueBefore"];
  label: string;
  relatedArtifactTypes: CabinetFabricationArtifact["type"][];
  notes: string;
}

export interface CabinetProjectApprovalTotals {
  assetCount: number;
  approvalItemCount: number;
  requiredCount: number;
  recommendedCount: number;
  blockedCount: number;
  clientApprovalCount: number;
  designerApprovalCount: number;
  supplierApprovalCount: number;
  fabricatorApprovalCount: number;
  installerApprovalCount: number;
  quoteRequestGateCount: number;
  fabricationReleaseGateCount: number;
  installationGateCount: number;
}

export interface CabinetProjectApprovalPackage {
  schema: "custom_millwork.project_approval_package.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  approvalStatus: "blocked" | "needs_review" | "ready_for_signature";
  canSubmitForClientApproval: boolean;
  canSubmitForFabricatorReview: boolean;
  canReleaseAfterSignoff: boolean;
  schedule: CabinetProjectSchedulePackage;
  fabricationReleasePackage: CabinetProjectFabricationReleasePackage;
  procurementPackage: CabinetProjectProcurementPackage;
  totals: CabinetProjectApprovalTotals;
  approvalItems: CabinetProjectApprovalItem[];
  signoffPolicy: {
    requiresDesignerApproval: boolean;
    requiresClientApproval: boolean;
    requiresSupplierConfirmation: boolean;
    requiresFabricatorApproval: boolean;
    requiresInstallerCoordination: boolean;
    reason: string;
  };
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export interface CabinetProjectHandoffAssetSummary {
  id: string;
  roomId?: string;
  roomName: string;
  displayName: string;
  assemblyType: MillworkAssemblyType;
  sourceDefinitionId: string;
  sourceDefinitionVersion: number;
  sourceDefinitionFingerprint: string;
  placedPackageFileName: string;
  shopDrawingFileName: string;
  fabricationDxfFileName: string;
  installerWorkOrderFileName: string;
  supplierReadinessStatus: CabinetSupplierReadinessSnapshot["status"];
  fabricationReleaseStatus: CabinetFabricationReleaseReadinessSnapshot["status"];
  approvalStatus: CabinetProjectApprovalPackage["approvalStatus"];
  purchaseReadiness: CabinetProjectPurchaseReadinessPackage["purchaseReadiness"];
  cutListCount: number;
  edgeBandingTotalM: number;
  estimatedTotal: number;
  currency: string;
  updatedAt: string;
}

export interface CabinetProjectHandoffTotals {
  roomCount: number;
  assetCount: number;
  packageCount: number;
  artifactCount: number;
  durableArtifactCount: number;
  sessionArtifactCount: number;
  requiredApprovalCount: number;
  fieldVerificationRequiredCount: number;
  releaseBlockerCount: number;
  cutListCount: number;
  edgeBandingTotalM: number;
  estimatedTotal: number;
  currency: string;
}

export interface CabinetProjectHandoffChecklistItem {
  id: string;
  label: string;
  owner: "designer" | "client" | "supplier" | "fabricator" | "installer";
  status: "required" | "recommended" | "ready";
  dueBefore: CabinetReleaseChecklistItem["dueBefore"] | "client_handoff" | "purchase_review";
  relatedArtifactTypes: CabinetFabricationArtifact["type"][];
  notes: string;
}

export interface CabinetProjectHandoffPackage {
  schema: "custom_millwork.project_handoff_package.v1";
  packageVersion: number;
  generatedAt: string;
  sourceType: "placed_parametric_cabinet_project";
  projectId?: string;
  projectName?: string;
  handoffStatus: "blocked" | "needs_review" | "ready_for_handoff_review";
  canIssueToClient: boolean;
  canIssueToFabricator: boolean;
  canIssueToInstaller: boolean;
  canIssueForPurchaseReview: boolean;
  packages: {
    schedule: CabinetProjectSchedulePackage;
    scopePackage: CabinetProjectScopePackage;
    finishSchedulePackage: CabinetProjectFinishSchedulePackage;
    procurementPackage: CabinetProjectProcurementPackage;
    revisionPackage: CabinetProjectRevisionPackage;
    drawingSetPackage: CabinetProjectDrawingSetPackage;
    cutListPackage: CabinetProjectCutListPackage;
    quotePackage: CabinetProjectQuotePackage;
    purchaseReadinessPackage: CabinetProjectPurchaseReadinessPackage;
    fabricationReleasePackage: CabinetProjectFabricationReleasePackage;
    installationPlanPackage: CabinetProjectInstallationPlanPackage;
    fieldVerificationPackage: CabinetProjectFieldVerificationPackage;
    cncBatchPackage: CabinetProjectCncBatchPackage;
    approvalPackage: CabinetProjectApprovalPackage;
    rfqPackage: CabinetProjectFabricationQuoteRequest;
  };
  totals: CabinetProjectHandoffTotals;
  assets: CabinetProjectHandoffAssetSummary[];
  handoffChecklist: CabinetProjectHandoffChecklistItem[];
  artifacts: CabinetFabricationArtifact[];
  assumptions: string[];
}

export type CabinetValidationSeverity = "error" | "warning" | "info";

export interface CabinetValidationTarget {
  scope: "assembly" | "module" | "fit";
  field?: string;
  moduleIds?: string[];
  hostId?: string;
}

export type CabinetValidationFixAction =
  | { type: "patch_module"; moduleId: string; patch: Partial<CabinetModuleDefinition> }
  | { type: "patch_definition"; patch: Partial<CabinetDefinition> }
  | { type: "sync_dimensions" }
  | { type: "resize_overall_width"; widthMm: number }
  | { type: "set_width_locks"; moduleIds: string[]; locked: boolean }
  | { type: "refit"; mode: CabinetFitMode; hostId: string };

export interface CabinetValidationAutoFix {
  id: string;
  label: string;
  description: string;
  confirmation: "none" | "preview";
  action: CabinetValidationFixAction;
}

export interface CabinetValidationIssue {
  id: string;
  code: string;
  severity: CabinetValidationSeverity;
  field?: string;
  title: string;
  message: string;
  target: CabinetValidationTarget;
  resolution: string;
  fixes?: CabinetValidationAutoFix[];
}

export type CabinetValidationIssueDraft = Pick<CabinetValidationIssue, "severity" | "message"> &
  Partial<Omit<CabinetValidationIssue, "severity" | "message">>;

export interface CabinetValidationResult {
  valid: boolean;
  issues: CabinetValidationIssue[];
}
