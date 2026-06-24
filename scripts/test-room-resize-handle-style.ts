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
const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const designPageSource = fs.readFileSync(designPagePath, "utf8");
const roomSelectCallbackSource =
  designPageSource.match(
    /const handlePlacementAwareRoomSelect = useCallback\([\s\S]*?\n  \);\n\n  const nudgePendingCatalogPlacement/
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
  /data-testid="active-room-measurement-hud"[\s\S]*?Double-click W\/D/,
  "The active room measurement HUD should use short helper copy."
);

assert.doesNotMatch(
  source,
  /Double-click W\/D labels to edit/,
  "The active room measurement HUD should not use the bulky long helper copy."
);

assert.doesNotMatch(
  source,
  /background: "#22c55e",[\s\S]*?data-testid=\{`room-resize-handle-/,
  "Resize handles should not return to the large solid-green treatment."
);

assert.match(
  source,
  /const stopNativeRoomDragEvent = \(event: ThreeEvent<PointerEvent>\) => \{[\s\S]*?event\.nativeEvent\.stopImmediatePropagation\?\.\(\);[\s\S]*?\};/,
  "Room drag start and move should stop immediate native propagation so 2D pan controls never start during room drags."
);

assert.match(
  source,
  /onPointerUp=\{\(event\) => \{[\s\S]*?drag\?\.kind === "room"[\s\S]*?clearActiveDrag\(\);[\s\S]*?releasePointerCaptureIfSupported\(event\);[\s\S]*?\}\}/,
  "Room drag release should clear the room drag without blocking the native pointerup used by 2D pan controls."
);

assert.doesNotMatch(
  source,
  /onPointerUp=\{\(event\) => \{[\s\S]*?drag\?\.kind === "room"[\s\S]*?stopNativeRoomDragEvent\(event\);[\s\S]*?releasePointerCaptureIfSupported\(event\);[\s\S]*?\}\}/,
  "Room drag release should not stop the native pointerup event, or MapControls can remain stuck panning."
);

assert.match(
  source,
  /onRoomDragStateChange\?: \(isDragging: boolean\) => void;/,
  "RoomRenderer2D should expose room drag state so 2D pan controls can be locked while rooms move."
);

assert.match(
  source,
  /onRoomDragStateChange\?\.\(true\);[\s\S]*?setRoomSnapPreview\(null\);/,
  "Room drag start should report active dragging before movement begins."
);

assert.match(
  source,
  /if \(dragTargetRef\.current\?\.kind === "room"\) \{[\s\S]*?onRoomDragStateChange\?\.\(false\);[\s\S]*?\}/,
  "Room drag cleanup should always unlock 2D pan controls."
);

assert.match(
  designPageSource,
  /const \[planRoomDragging, setPlanRoomDragging\] = useState\(false\);/,
  "The design page should track active 2D room dragging."
);

assert.match(
  designPageSource,
  /onRoomDragStateChange=\{handlePlanRoomDragStateChange\}/,
  "The design page should receive room drag state from RoomRenderer2D."
);

assert.match(
  designPageSource,
  /enabled=\{!sofaDragging && !planRoomDragging\}/,
  "MapControls should be disabled while a 2D room drag is active."
);

assert.match(
  roomSelectCallbackSource,
  /const handlePlacementAwareRoomSelect = useCallback\([\s\S]*?clearNonRoomSelection\(\);[\s\S]*?setSelectedPlanRoomId\(roomId\);[\s\S]*?if \(editorMode !== "present"\) setEditorMode\("design"\);[\s\S]*?if \(designSnapshotRef\.current\.activeRoomId === roomId\)/,
  "Selecting a room should clear stale door/window overlay selection before the inspector decides what is selected."
);

assert.doesNotMatch(
  roomSelectCallbackSource,
  /if \(viewMode === "2d"\) \{[\s\S]*?clearNonRoomSelection\(\);[\s\S]*?setSelectedPlanRoomId\(roomId\);[\s\S]*?\}/,
  "Room selection cleanup should not be limited to 2D, or 3D room clicks can leave the side panel on a selected door."
);

assert.match(
  designPageSource,
  /const visiblePlanOpening = selectedPlanOpening;/,
  "The side inspector should only show a selected door/window when an opening overlay is explicitly selected."
);

assert.doesNotMatch(
  designPageSource,
  /const visiblePlanOpening = useMemo\([\s\S]*?recentOpenings\.find/,
  "The side inspector should not auto-promote a recent connected doorway into a selected door."
);

console.log("Room resize handle style guardrails passed.");
