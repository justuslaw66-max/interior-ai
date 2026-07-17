import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rendererPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "renderers",
  "RoomRenderer2D.tsx"
);
const source = fs.readFileSync(rendererPath, "utf8");
const designPagePath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageWorkspace.tsx"
);
const designPageSource = fs.readFileSync(designPagePath, "utf8");
const canvasInteractionControllerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPageCanvasInteractionController.ts"
  ),
  "utf8"
);
const cameraWorkspaceFacadeSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPageCameraWorkspaceFacade.ts"
  ),
  "utf8"
);
const editorInteractionRegistrationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPageEditorInteractionRegistration.ts"
  ),
  "utf8"
);
const placementTargetControllerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPagePlacementTargetController.ts"
  ),
  "utf8"
);
const surfaceTargetingFacadeSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPageSurfaceTargetingFacade.ts"
  ),
  "utf8"
);
const designSceneStructureSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignSceneStructureLayer.tsx"
  ),
  "utf8"
);
const roomPlanControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageRoomPlanController.ts"),
  "utf8"
);
const selectionInspectorModelSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageSelectionInspectorModel.ts"),
  "utf8"
);
const designSceneCanvasSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignSceneCanvas.tsx"
  ),
  "utf8"
);
const roomDrawingPath = path.join(process.cwd(), "lib", "useFloorPlanRoomDrawing.ts");
const roomDrawingSource = fs.readFileSync(roomDrawingPath, "utf8");
const floorPlanUploadPanelPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "FloorPlanUploadPanel.tsx"
);
const floorPlanUploadPanelSource = fs.readFileSync(floorPlanUploadPanelPath, "utf8");
const roomSelectCallbackSource =
  placementTargetControllerSource.match(
    /const handlePlacementAwareRoomSelect = useCallback\([\s\S]*?\n  \);\n\n  const handleRendererSurfaceTargetSelect/
  )?.[0] ?? "";
const roomPointerUpSource =
  source.match(
    /onPointerUp=\{\(event\) => \{[\s\S]*?const drag = dragTargetRef\.current;[\s\S]*?releasePointerCaptureIfSupported\(event\);\n\s*\}\}/
  )?.[0] ?? "";
const roomBodyPointerDownSource =
  source.match(
    /position=\{\[0, 0\.0009, 0\]\}[\s\S]*?onPointerDown=\{\(event\) => \{[\s\S]*?roomBodyPointerRef\.current = \{[\s\S]*?clientY: event\.nativeEvent\.clientY,[\s\S]*?\};[\s\S]*?\}\}/
  )?.[0] ?? "";

assert.match(
  source,
  /const activeRoomHandleColor = "#16a34a";/,
  "Active room resize handles should use a calmer green than the selected room outline."
);

assert.match(
  source,
  /width: handle\.shape === "edge-z" \? 12 : handle\.shape === "edge-x" \? 36 : 20,/,
  "Resize handles should stay visually slim instead of oversized blocks."
);

assert.match(
  source,
  /height: handle\.shape === "edge-z" \? 36 : handle\.shape === "edge-x" \? 12 : 20,/,
  "Resize handles should use slim edge grips and small corner handles."
);

assert.match(
  source,
  /background: "rgba\(255,255,255,0\.88\)",[\s\S]*?border: `1\.5px solid \$\{activeRoomHandleColor\}`/,
  "Resize handles should render as clean outlined controls rather than solid green blocks."
);

assert.match(
  source,
  /data-testid="active-room-measurement-hud"[\s\S]*?Click Width or Depth to edit/,
  "The active room measurement HUD should explain the single-click edit interaction."
);

assert.doesNotMatch(
  source,
  /Double-click (?:W\/D|Width or Depth)/,
  "Room dimension labels should not require an undiscoverable double-click interaction."
);

assert.match(
  source,
  /data-testid="active-room-dimension-width"[\s\S]*?onClick=\{\(event\) =>/,
  "The width label should open its editor with one click."
);

assert.doesNotMatch(
  source,
  /background: "#22c55e",[\s\S]*?data-testid=\{`room-resize-handle-/,
  "Resize handles should not return to the large solid-green treatment."
);

assert.match(
  source,
  /MAX_WALL_DRAW_SEGMENT_LENGTH_METERS = ROOM_DIMENSION_DEFAULTS\.max/,
  "Wall draw measurement labels should share the room dimension maximum."
);

assert.match(
  source,
  /function isWallDrawSegmentLengthRenderable[\s\S]*?length <= MAX_WALL_DRAW_SEGMENT_LENGTH_METERS/,
  "Wall draw measurement labels should not render for invalid or oversized segments."
);

assert.match(
  source,
  /function areWallDrawSegmentsRenderable[\s\S]*?isWallDrawSegmentLengthRenderable\(points\[index - 1\], points\[index\]\)/,
  "Wall draw traces should be hidden when any persisted segment is invalid or oversized."
);

assert.match(
  source,
  /if \(!isWallDrawSegmentLengthRenderable\(previousPoint, point\)\) return null;/,
  "Oversized wall draw segments should be hidden before they can show rogue labels."
);

assert.match(
  source,
  /const canRenderWallDrawTrace = isStraightWallDrawMode && wallDrawSegmentsRenderable;/,
  "Straight-wall trace rendering should be disabled for stale oversized geometry."
);

assert.match(
  source,
  /max=\{MAX_WALL_DRAW_SEGMENT_LENGTH_METERS \* 1000\}/,
  "Wall segment length editors should expose the same maximum used by validation."
);

assert.match(
  source,
  /const wallDrawInProgress = isStraightWallDrawMode && activeDrawRoomPoints\.length > 0;/,
  "Renderer should track when wall drawing is in progress."
);

assert.match(
  source,
  /isActiveRoom && showDimensions && !wallDrawInProgress/,
  "Active room dimension badges should be suppressed while wall drawing is in progress."
);

assert.match(
  source,
  /ROOM_DIMENSION_EDITOR_MAX_MILLIMETERS = ROOM_DIMENSION_DEFAULTS\.max \* 1000/,
  "Room dimension editors should share the room dimension maximum."
);

assert.match(
  source,
  /value=\{editingRoomDimension\.value\}[\s\S]*?onChange=\{\(event\) => updateDimensionEditorValue\(event\.currentTarget\.value\)\}/,
  "Room dimension editors should be controlled so oversized typed values cannot linger visually."
);

assert.match(
  source,
  /finalMillimeters > ROOM_DIMENSION_EDITOR_MAX_MILLIMETERS[\s\S]*?commitDimensionEdit\(value\);/,
  "Oversized room dimension editor values should auto-commit into validation and close."
);

assert.match(
  roomDrawingSource,
  /valueMeters > ROOM_DIMENSION_DEFAULTS\.max/,
  "Oversized wall segment edits should be rejected before changing draw geometry."
);

assert.match(
  roomDrawingSource,
  /function hasOversizedWallDrawSegment[\s\S]*?length > ROOM_DIMENSION_DEFAULTS\.max/,
  "Room drawing state should detect stale oversized wall segments."
);

assert.match(
  roomDrawingSource,
  /function isWallDrawSegmentWithinRoomLimit[\s\S]*?length <= ROOM_DIMENSION_DEFAULTS\.max/,
  "Straight-wall point commits should share the room dimension maximum."
);

assert.match(
  roomDrawingSource,
  /if \(lastPoint && !isWallDrawSegmentWithinRoomLimit\(lastPoint, snappedPoint\)\) \{[\s\S]*?resetFloorPlanTraceRoomPoints\(\);[\s\S]*?showRuleToast\("Enter a valid wall length\."\);/,
  "Oversized straight-wall clicks should be rejected before they can render as rogue line rooms."
);

assert.match(
  roomDrawingSource,
  /if \(lastPoint && !isWallDrawSegmentWithinRoomLimit\(lastPoint, snappedPoint\)\) \{[\s\S]*?setBlankGridRoomPreviewPoint\(null\);[\s\S]*?return;/,
  "Oversized straight-wall previews should be hidden before they can stretch across the plan."
);

assert.match(
  roomDrawingSource,
  /hasOversizedWallDrawSegment\(floorPlanTraceRoomPoints\)[\s\S]*?setFloorPlanTraceRoomPoints\(\[\]\);/,
  "Stale oversized wall draw geometry should be self-healed instead of staying visible."
);

assert.match(
  roomDrawingSource,
  /lengthMm > ROOM_DIMENSION_DEFAULTS\.max \* 1000/,
  "Exact wall length placement should reject oversized wall lengths."
);

assert.match(
  floorPlanUploadPanelSource,
  /data-testid="floor-plan-exact-wall-length"[\s\S]*?max=\{ROOM_DIMENSION_DEFAULTS\.max \* 1000\}/,
  "Exact wall length input should expose the same maximum as room dimensions."
);

assert.match(
  roomPlanControllerSource,
  /valueMeters > ROOM_DIMENSION_DEFAULTS\.max[\s\S]*?showToast\("Enter a valid room dimension\."\);/,
  "2D room dimension commits should reject oversized values instead of silently clamping them."
);

assert.match(
  placementTargetControllerSource,
  /const handlePlacementAwareRoomSelect = useCallback\([\s\S]*?handleResetFloorPlanTraceRoomPoints\(\);/,
  "Selecting a committed room should clear stale wall-draw points before selected-room controls render."
);

assert.match(
  designPageSource,
  /useDesignPageSurfaceTargetingFacade\(\{/,
  "The workspace should compose the surface-targeting facade."
);

assert.match(
  surfaceTargetingFacadeSource,
  /useDesignPagePlacementTargetController\(\{/,
  "The surface-targeting facade should retain placement-aware room selection ownership."
);

assert.match(
  designPageSource,
  /select: handlePlacementAwareRoomSelect,/,
  "The workspace should wire the controller-owned room-selection action into the scene."
);

assert.match(
  source,
  /const stopNativeRoomDragEvent = \(event: ThreeEvent<PointerEvent>\) => \{[\s\S]*?event\.nativeEvent\.stopImmediatePropagation\?\.\(\);[\s\S]*?\};/,
  "Room drag start and move should stop immediate native propagation so 2D pan controls never start during room drags."
);

assert.match(
  source,
  /data-testid="selected-room-move"[\s\S]*?onPointerDown=\{\(event\) => startExplicitRoomMove\(room, event\)\}/,
  "Room movement should be available only through the selected-room move handle."
);

assert.match(
  source,
  /const roomBodyClickThresholdPx = 6;/,
  "Room body clicks should use a small pixel threshold so drag gestures can pan the plan."
);

assert.match(
  roomBodyPointerDownSource,
  /roomBodyPointerRef\.current = \{[\s\S]*?roomId: room\.id,[\s\S]*?clientX: event\.nativeEvent\.clientX,[\s\S]*?clientY: event\.nativeEvent\.clientY/,
  "Room body pointerdown should only remember click-start data in normal select mode."
);

assert.doesNotMatch(
  roomBodyPointerDownSource,
  /stopNativeRoomDragEvent|stopPropagation|setPointerCaptureIfSupported|onRoomDragStateChange|setRoomDragPreview|dragTargetRef\.current/,
  "Room body pointerdown must not start room dragging or block MapControls pan gestures."
);

assert.match(
  roomPointerUpSource,
  /drag\?\.kind === "room"[\s\S]*?clearActiveDrag\(\);[\s\S]*?releasePointerCaptureIfSupported\(event\);/,
  "Room drag release should clear the room drag without blocking the native pointerup used by 2D pan controls."
);

assert.doesNotMatch(
  roomPointerUpSource,
  /stopNativeRoomDragEvent\(event\);/,
  "Room drag release should not stop the native pointerup event, or MapControls can remain stuck panning."
);

assert.match(
  source,
  /onRoomDragStateChange\?: \(isDragging: boolean\) => void;/,
  "RoomRenderer2D should expose room drag state so 2D pan controls can be locked while rooms move."
);

assert.match(
  source,
  /const startExplicitRoomMove = \([\s\S]*?onRoomDragStateChange\?\.\(true\);[\s\S]*?setRoomSnapPreview\(null\);/,
  "Only explicit room move should report active dragging before movement begins."
);

assert.match(
  source,
  /const dragKind = dragTargetRef\.current\?\.kind;[\s\S]*?if \(dragKind === "room"\) \{[\s\S]*?onRoomDragStateChange\?\.\(false\);[\s\S]*?\}/,
  "Room drag cleanup should always unlock 2D pan controls."
);

assert.match(
  canvasInteractionControllerSource,
  /const \[planRoomDragging, setPlanRoomDragging\] = useState\(false\);/,
  "The canvas interaction controller should track active 2D room dragging."
);

assert.match(
  designSceneStructureSource,
  /<RoomRenderer2D[\s\S]*?onRoomDragStateChange=\{actions\.rooms\.setDragging\}/,
  "The structure layer should receive room drag state from RoomRenderer2D."
);

assert.match(
  designSceneStructureSource,
  /<RoomRenderer2D[\s\S]*?onRoomResizeStateChange=\{actions\.rooms\.setResizing\}/,
  "The structure layer should receive room resize state from RoomRenderer2D."
);

assert.match(
  designPageSource,
  /setDragging: handlePlanRoomDragStateChange,[\s\S]*?setResizing: handlePlanRoomResizeStateChange,/,
  "The design page should wire room drag and resize state into the structure layer."
);

assert.match(
  canvasInteractionControllerSource,
  /const controlsEnabled =\s*!canvasObjectDragging &&\s*!planRoomDragging &&\s*!planRoomResizing &&\s*!planOverlayDragging/,
  "The canvas interaction controller should disable scene controls while a 2D room drag is active."
);
assert.match(
  cameraWorkspaceFacadeSource,
  /useDesignPageCanvasInteractionController\(\{[\s\S]*?cameraAnimating: navigationController\.refs\.isCameraAnimatingRef/,
  "The camera workspace facade should preserve the canvas interaction controller's navigation lock boundary."
);
assert.match(
  editorInteractionRegistrationSource,
  /const camera = useDesignPageCameraWorkspaceFacade\(\{/,
  "Editor interaction should own the camera workspace registration."
);
assert.match(
  designPageSource,
  /camera: cameraWorkspace,[\s\S]*?controlsEnabled: canvasControlsEnabled,[\s\S]*?changePlanRoomDragging: handlePlanRoomDragStateChange,[\s\S]*?changePlanRoomResizing: handlePlanRoomResizeStateChange/,
  "The design page should consume the registered facade-owned room drag locks."
);
assert.match(
  designPageSource,
  /buildDesignPageSceneRegionAdapter\(\{[\s\S]*?controlsEnabled: canvasControlsEnabled/,
  "The design page should pass the controller-owned interaction lock into the scene adapter."
);

assert.match(
  designSceneCanvasSource,
  /<MapControls[\s\S]*?enabled=\{state\.controlsEnabled\}/,
  "The Canvas shell should apply the design page's interaction lock to MapControls."
);

assert.match(
  roomSelectCallbackSource,
  /const handlePlacementAwareRoomSelect = useCallback\([\s\S]*?clearNonRoomSelection\(\);[\s\S]*?setSelectedPlanRoomId\(roomId\);[\s\S]*?if \(decision\.shouldSetDesignMode\) setEditorMode\("design"\);[\s\S]*?if \(decision\.shouldSwitchRoom\) handleSwitchRoom\(roomId\);/,
  "Selecting a room should clear stale door/window overlay selection before the inspector decides what is selected."
);

assert.doesNotMatch(
  roomSelectCallbackSource,
  /if \(viewMode === "2d"\) \{[\s\S]*?clearNonRoomSelection\(\);[\s\S]*?setSelectedPlanRoomId\(roomId\);[\s\S]*?\}/,
  "Room selection cleanup should not be limited to 2D, or 3D room clicks can leave the side panel on a selected door."
);

assert.match(
  selectionInspectorModelSource,
  /const visiblePlanOpening = useMemo\([\s\S]*?selectedPlanOverlayId[\s\S]*?planOpenings\.find\(\(opening\) => opening\.id === selectedPlanOverlayId\)[\s\S]*?: null,/,
  "The side inspector should only show a selected door/window when an opening overlay is explicitly selected."
);

assert.doesNotMatch(
  selectionInspectorModelSource,
  /const visiblePlanOpening = useMemo\([\s\S]*?recentOpenings\.find/,
  "The side inspector should not auto-promote a recent connected doorway into a selected door."
);

console.log("Room resize handle style guardrails passed.");
