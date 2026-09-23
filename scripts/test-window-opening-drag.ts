import assert from "node:assert/strict";
import fs from "node:fs";
import { metersToMm, type RoomOpening2D } from "@/lib/editorScene";
import {
  HOUSE_PLAN_TEMPLATES, resolveHousePlanTemplateOpeningMetrics, type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import { mapPlanOpeningsToRoomRenderer } from "@/lib/design-page-plan-overlays";
import {
  designPageOpeningHasMoveRoom, validateDesignPageOpeningPlacement,
} from "@/lib/design-page-opening-placement";
import {
  legacyOpeningOffsetAtWorldPoint, worldPointAtOpeningHostAlong,
} from "@/lib/design-page-opening-interaction";
import type { DesignPageOpeningMetricsPatch } from "@/lib/design-page-opening-metrics";
import { moveDesignPageOpening } from "@/lib/useDesignPageOpeningMoveAction";
import { MIN_OPENING_CORNER_CLEARANCE_METERS, validateTracedOpeningPlacement } from "@/lib/floor-plan-tracing";
import * as THREE from "three";
import {
  createWindowDragPlane, getWindowDragPosition, type WindowDragBounds,
} from "@/components/editor/renderers/house-plan-3d/windowOpeningDrag";
import {
  OPENING_DRAG_POINTER_BUTTON, shouldOpeningPointerDownSelect,
} from "@/components/editor/renderers/house-plan-3d/openingPointerSelection";

const start: WindowDragBounds = {
  offset: 0.25, sourceOffset: 0.25, sourceDirection: 1,
  bottom: 0.9, width: 1.4, height: 1.2, wallLength: 4.8, wallHeight: 2.6,
};
assert.deepEqual(getWindowDragPosition(start, 0, 0), { offsetMeters: 0.25, bottomMeters: 0.9 });
assert.deepEqual(getWindowDragPosition(start, 0.4, -0.3), { offsetMeters: 0.65, bottomMeters: 0.6 });
assert.deepEqual(getWindowDragPosition(start, 100, 100), { offsetMeters: 1.52, bottomMeters: 1.4 });
assert.deepEqual(getWindowDragPosition(start, -100, -100), { offsetMeters: -1.52, bottomMeters: 0 });
assert.deepEqual(
  getWindowDragPosition({ ...start, sourceOffset: -0.5, sourceDirection: -1 }, 0.4, 0.2),
  { offsetMeters: -0.9, bottomMeters: 1.1 },
  "A mirrored face with a reversed wall direction must update the source opening in the correct direction."
);
for (let index = -100; index <= 100; index++) {
  const result = getWindowDragPosition(start, index / 7, -index / 11);
  assert.ok(Math.abs(result.offsetMeters) + start.width / 2 <= start.wallLength / 2 - MIN_OPENING_CORNER_CLEARANCE_METERS + 1e-9);
  assert.ok(result.bottomMeters >= 0 && result.bottomMeters + start.height <= start.wallHeight + 1e-9);
}
const opening: RoomOpening2D = {
  id: "window", roomId: "living", kind: "window", wall: "west",
  offsetMm: 250, widthMm: 1400, heightMm: 1200, bottomMm: 900,
};
const room: HousePlanRoom2D = { id: "living", name: "Living", roomType: "living", shape: "rectangle", x: 0, z: 0, w: 4.2, d: 4.8 };
for (const offsetMm of [-1520, 1520]) {
  assert.deepEqual(validateTracedOpeningPlacement({ ...opening, offsetMm }, [room]), { valid: true },
    "A drag clamped at the exact corner clearance must not be rejected by floating-point rounding.");
}
assert.equal(validateTracedOpeningPlacement({ ...opening, offsetMm: 1521 }, [room]).valid, false);
const calls: { route: string; id: string; metrics: DesignPageOpeningMetricsPatch }[] = [];
const options = {
  openingsRef: { current: [opening] },
  canonicalTopology: undefined,
  moveOpening: (id: string, offsetMeters: number) => calls.push({ route: "move", id, metrics: { offsetMeters } }),
  updateMetrics: (id: string, metrics: DesignPageOpeningMetricsPatch) => calls.push({ route: "metrics", id, metrics }),
};
moveDesignPageOpening(options, opening.id, 0.65, 0.6);
assert.deepEqual(calls.pop(), { route: "metrics", id: "window", metrics: { offsetMeters: 0.65, bottomMeters: 0.6 } });
assert.equal(opening.widthMm, 1400);
assert.equal(opening.heightMm, 1200);
moveDesignPageOpening(options, opening.id, 0.5);
assert.equal(calls.pop()?.route, "move", "2D gestures must retain the established horizontal-only path.");
options.openingsRef.current = [{ ...opening, evidence: { sillHeight: "site_measured" } }];
moveDesignPageOpening(options, opening.id, 0.4, 0.5);
assert.deepEqual(calls.pop()?.metrics, { offsetMeters: 0.4 }, "Dragging must not override locked measurements.");
options.openingsRef.current = [{ ...opening, kind: "door" }];
moveDesignPageOpening(options, opening.id, 0.3, 0.5);
assert.deepEqual(calls.pop()?.metrics, { offsetMeters: 0.3 }, "Doors must stay on the floor.");
options.openingsRef.current = [opening];
moveDesignPageOpening({ ...options, canonicalTopology: {
  moveOpening: () => true, resizeOpening: () => true,
  updateOpeningMetrics: (id, metrics) => { calls.push({ route: "canonical", id, metrics }); return true; },
} }, opening.id, 0.5, 0.7);
assert.deepEqual(calls, [{ route: "canonical", id: "window", metrics: { offsetMeters: 0.5, bottomMeters: 0.7 } }],
  "Both axes must reach the same canonical mutation without a duplicate legacy write or a measurement-only edit.");

// Pointer rays for a 900x620 canvas, moved in screen pixels from a world point.
const canvasSize = { width: 900, height: 620 };
function pixelOf(camera: THREE.Camera, point: THREE.Vector3) {
  const ndc = point.clone().project(camera);
  return new THREE.Vector2((ndc.x + 1) / 2 * canvasSize.width, (1 - ndc.y) / 2 * canvasSize.height);
}
function screenDirection(camera: THREE.Camera, from: THREE.Vector3, direction: THREE.Vector3) {
  return pixelOf(camera, from.clone().addScaledVector(direction, 0.3)).sub(pixelOf(camera, from)).normalize();
}
function rayAtPixel(camera: THREE.Camera, pixel: THREE.Vector2) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(pixel.x / canvasSize.width * 2 - 1, 1 - pixel.y / canvasSize.height * 2), camera);
  return raycaster.ray;
}
function dragDelta(camera: THREE.Camera, drag: ReturnType<typeof createWindowDragPlane>, axis: THREE.Vector3,
  grab: THREE.Vector3, screen: THREE.Vector2, pixels: number) {
  const point = rayAtPixel(camera, pixelOf(camera, grab).addScaledVector(screen, pixels))
    .intersectPlane(drag.plane, new THREE.Vector3());
  assert.ok(point, "The drag plane must stay reachable for a small pointer move.");
  point.sub(drag.origin);
  return { horizontal: point.dot(axis), vertical: point.y };
}
function perspectiveCamera(position: THREE.Vector3, target: THREE.Vector3) {
  const camera = new THREE.PerspectiveCamera(45, canvasSize.width / canvasSize.height, 0.05, 200);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  return camera;
}

// The mounted e2e diagonal wall (-2,-2.75)->(1,0.25) seen from the default camera is 4-7 degrees off the view ray.
const diagonalAxis = new THREE.Vector3(3, 0, 3).normalize();
const diagonalNormal = new THREE.Vector3(-diagonalAxis.z, 0, diagonalAxis.x);
const diagonalGrab = new THREE.Vector3(-0.5, 1.35, -1.25);
const defaultCamera = perspectiveCamera(new THREE.Vector3(6.2, 3.6, 7.2), new THREE.Vector3(0, 1, 0));
const grazingRay = rayAtPixel(defaultCamera, pixelOf(defaultCamera, diagonalGrab));
const grazingDrag = createWindowDragPlane(grazingRay, diagonalGrab, diagonalNormal, 0);
assert.equal(grazingDrag.vertical, false, "A grazing wall must not take a two-axis wall-plane drag.");
const physicalNormal = screenDirection(defaultCamera, diagonalGrab, diagonalNormal);
const physicalTangent = screenDirection(defaultCamera, diagonalGrab, diagonalAxis);
const wallPlaneNoise = dragDelta(defaultCamera, {
  plane: new THREE.Plane().setFromNormalAndCoplanarPoint(diagonalNormal, diagonalGrab),
  origin: diagonalGrab, vertical: true,
}, diagonalAxis, diagonalGrab, physicalNormal, 5);
assert.ok(Math.abs(wallPlaneNoise.horizontal) > 0.3,
  "Precondition: at this angle a 5 px perpendicular wobble moves a wall-plane drag by decimetres.");
for (const pixels of [5, 75]) {
  const noise = dragDelta(defaultCamera, grazingDrag, diagonalAxis, diagonalGrab, physicalNormal, pixels);
  assert.ok(Math.abs(noise.horizontal) < 0.01, `A ${pixels} px drag along the physical normal must not slide a grazing window.`);
  assert.ok(Math.abs(noise.vertical) < 1e-9, "A grazing drag must leave the sill alone.");
}
const grazingAlong = dragDelta(defaultCamera, grazingDrag, diagonalAxis, diagonalGrab, physicalTangent, 90);
assert.ok(grazingAlong.horizontal > 0.1, "A drag along the projected tangent must still move a grazing window.");
assert.ok(Math.abs(grazingAlong.vertical) < 1e-9);

// A wall that faces the camera keeps the two-axis wall-plane drag that follows the pointer.
const facingCamera = perspectiveCamera(
  diagonalGrab.clone().addScaledVector(diagonalNormal, 4).add(new THREE.Vector3(0, 0.4, 0)), diagonalGrab
);
const facingDrag = createWindowDragPlane(
  rayAtPixel(facingCamera, pixelOf(facingCamera, diagonalGrab)), diagonalGrab, diagonalNormal, 0
);
assert.equal(facingDrag.vertical, true, "A wall facing the camera must keep the vertical sill drag.");
const up = dragDelta(facingCamera, facingDrag, diagonalAxis, diagonalGrab, new THREE.Vector2(0, -1), 40);
assert.ok(up.vertical > 0.05 && Math.abs(up.horizontal) < 0.01, "Dragging up must raise the sill without sliding.");
const across = dragDelta(facingCamera, facingDrag, diagonalAxis, diagonalGrab,
  screenDirection(facingCamera, diagonalGrab, diagonalAxis), 40);
assert.ok(Math.abs(across.horizontal) > 0.05 && Math.abs(across.vertical) < 0.01,
  "Dragging along the wall must slide the window without changing the sill.");

// An orbit drag that starts on an opening must not select it. Only the gesture this renderer owns
// may select on pointer-down: selectStructureTarget sees event.delta 0 there, so its drag guard
// cannot refuse the selection, and a drag that ends on a canonical wall keeps it.
assert.equal(OPENING_DRAG_POINTER_BUTTON, 0, "Only the primary button drags an opening.");
for (const [pointerDown, expected, note] of [
  [{ button: 0, interactive: true, dragEnabled: true }, true,
    "A drag this renderer owns must select the opening it grabs."],
  [{ button: 0, interactive: true, dragEnabled: false }, false,
    "An opening this renderer cannot drag must leave the gesture, and the selection, to the camera."],
  [{ button: 2, interactive: true, dragEnabled: true }, false, "A right-button camera pan must not select."],
  [{ button: 1, interactive: true, dragEnabled: true }, false, "A middle-button camera gesture must not select."],
  [{ button: 0, interactive: false, dragEnabled: true }, false, "A non-interactive scene selects nothing."],
] as const) {
  assert.equal(shouldOpeningPointerDownSelect(pointerDown), expected, note);
}

// Each call site below is pinned as one literal, whitespace aside, because a wildcard cannot tell
// the rule apart from a broken caller: between the call and its `return` it borrows the `) return;`
// of a later statement, and over the arguments it accepts constants (`button: 0`, `dragEnabled:
// true`) that make the rule always true and hand every camera gesture back to the opening.
const collapseWhitespace = (source: string) => source.replace(/\s+/g, " ");
const thresholdSource = fs.readFileSync(
  "components/editor/renderers/house-plan-3d/wallAndOpeningMeshes.tsx", "utf8"
);
assert.match(thresholdSource,
  /import \{[^}]*shouldOpeningPointerDownSelect[^}]*\} from "\.\/openingPointerSelection";/,
  "The opening threshold mesh must take its pointer-down rule from the shared module.");
const thresholdPointerDown = thresholdSource.slice(
  thresholdSource.indexOf("onPointerDown="), thresholdSource.indexOf("onPointerMove=")
);
assert.ok(thresholdPointerDown.includes("onSelectTarget(target, event)"),
  "Precondition: the threshold pointer-down still owns the drag-start selection.");
const thresholdGuard = "event.stopPropagation(); "
  + "if (!shouldOpeningPointerDownSelect({ button: event.button, interactive, "
  + "dragEnabled: canDragOpening }) || !resolvedHost) return;";
assert.ok(collapseWhitespace(thresholdPointerDown).includes(thresholdGuard),
  `The threshold pointer-down must open with exactly "${thresholdGuard}": it refuses a gesture this `
  + "renderer does not own, judged by the live pointer button, this mesh's own drag capability and "
  + "the resolved host, while R3F propagation stays stopped for the camera.");
for (const owned of ["onSelectTarget(target, event)", "stopStructurePointerEvent(event)"]) {
  assert.ok(thresholdPointerDown.indexOf("shouldOpeningPointerDownSelect") < thresholdPointerDown.indexOf(owned),
    `An unowned pointer-down must return before ${owned}: the camera keeps the gesture and the selection.`);
}
const thresholdCapability = "const canDragOpening = interactive && "
  + "Boolean(sourceOpening?.movableOnHost && resolvedHost && onMoveOpening);";
assert.ok(collapseWhitespace(thresholdSource).includes(thresholdCapability),
  `The threshold may claim a drag only for an opening with room to move: exactly "${thresholdCapability}". `
  + "An opening the placement rules pin in place would select, freeze the camera and never move.");

// 2D claims the same drags through RoomRenderer2D's startOpeningMoveDrag, so it has to refuse the
// openings the threshold refuses. Selection stays ahead of the refusal: a pinned opening must still
// open its inspector on pointer-down instead of swallowing the gesture.
const planRendererSource = fs.readFileSync(
  "components/editor/renderers/RoomRenderer2D.tsx", "utf8"
);
const planDragCapability = "const host = getResolvedOpeningHost(opening); "
  + "if (!host || !opening.movableOnHost) return false;";
assert.ok(collapseWhitespace(planRendererSource).includes(planDragCapability),
  `The 2D opening drag may start only for an opening with room to move: exactly "${planDragCapability}". `
  + "Otherwise a 2D drag captures the pointer for a move the placement rules can never commit, which is "
  + "what makes a template door feel stuck.");
const planDragStart = planRendererSource.slice(
  planRendererSource.indexOf("const startOpeningMoveDrag ="),
  planRendererSource.indexOf("const handleOpeningMove =")
);
assert.ok(planDragStart.indexOf("onSelectOverlay?.(openingId)") < planDragStart.indexOf("opening.movableOnHost"),
  "A pinned 2D opening must still be selected on pointer-down before the drag start refuses it.");

const windowMeshSource = fs.readFileSync(
  "components/editor/renderers/house-plan-3d/WindowOpeningMesh.tsx", "utf8"
);
const windowPointerDown = windowMeshSource.slice(
  windowMeshSource.indexOf("onPointerDown="), windowMeshSource.indexOf("onClick=")
);
assert.ok(collapseWhitespace(windowPointerDown).includes("event.stopPropagation(); if (!startDrag(event)) return;"),
  "A window may select on pointer-down only when its drag actually starts, and an unclaimed one must "
  + "still stop R3F propagation: exactly \"event.stopPropagation(); if (!startDrag(event)) return;\".");
for (const owned of ["props.onSelectTarget(target, event)", "stopPointer(event)"]) {
  assert.ok(windowPointerDown.indexOf("startDrag(event)") < windowPointerDown.indexOf(owned),
    `An unclaimed window pointer-down must return before ${owned}.`);
}
const windowDragGuard = "if (!shouldOpeningPointerDownSelect({ button: event.button, "
  + "interactive: options.interactive, dragEnabled: Boolean(options.onMoveOpening) })) return false;";
assert.ok(collapseWhitespace(
  fs.readFileSync("components/editor/renderers/house-plan-3d/useWindowOpeningDrag.ts", "utf8")
).includes(windowDragGuard),
  `The window drag hook must claim a pointer-down through exactly "${windowDragGuard}": the rule has `
  + "to see the live pointer button, the scene's interactive flag and the real move handler, or a "
  + "right-button pan selects the window and sticks.");

// A drag the threshold claims has to be able to commit, so every template door needs another legal
// centre on its host: compact_two_bed's bathroom and Bedroom 2 doors each own a 1.4 m entry-wall
// segment (#41), and narrow_one_bed's entry door owns the 1.6 m the entry shares with the living
// room. The projection must say exactly when the validator accepts another centre on the host.
function templatePlan(templateId: string) {
  const template = HOUSE_PLAN_TEMPLATES.find((candidate) => candidate.id === templateId);
  assert.ok(template, `Precondition: the ${templateId} template exists.`);
  const rooms: HousePlanRoom2D[] = template.rooms.map((source) => ({
    id: source.id, name: source.name, roomType: source.roomType, shape: source.shape,
    x: source.x, z: source.z, w: source.width, d: source.depth,
  }));
  const place = (kind: RoomOpening2D["kind"], roomId: string, wall: RoomOpening2D["wall"],
    widthMeters: number, offsetMeters: number, index: number): RoomOpening2D => {
    const source = template.rooms.find((candidate) => candidate.id === roomId)!;
    const metrics = resolveHousePlanTemplateOpeningMetrics(
      wall === "north" || wall === "south" ? source.width : source.depth, widthMeters, offsetMeters
    );
    return { id: `${kind}-${index}`, roomId, wall, kind,
      offsetMm: metersToMm(metrics.offsetMeters), widthMm: metersToMm(metrics.widthMeters) };
  };
  const openings = [
    ...template.doorways.map((doorway, index) => place("door", doorway.fromRoomId, doorway.wall,
      doorway.widthMeters ?? 0.9, doorway.offsetMeters ?? 0, index)),
    ...template.windows.map((spec, index) => place("window", spec.roomId, spec.wall,
      spec.widthMeters ?? 1, spec.offsetMeters ?? 0, index)),
  ];
  return { rooms, openings, projected: mapPlanOpeningsToRoomRenderer(openings, rooms) };
}
for (const templateId of ["compact_two_bed", "narrow_one_bed"]) {
  const { rooms, openings, projected } = templatePlan(templateId);
  const placement = { rooms, planWidthMeters: 10, planDepthMeters: 10 };
  for (const opening of projected) {
    const resolution = opening.hostResolution;
    assert.equal(resolution?.status, "resolved", `Precondition: ${templateId} ${opening.id} has a host.`);
    if (resolution?.status !== "resolved") continue;
    const host = resolution.host;
    const source = openings.find((candidate) => candidate.id === opening.id)!;
    let accepted = false;
    for (let along = 0; along <= host.spanMeters && !accepted; along += 0.01) {
      const offsetMeters = legacyOpeningOffsetAtWorldPoint(host, worldPointAtOpeningHostAlong(host, along));
      accepted = offsetMeters !== null && Math.abs(along - host.alongSegmentMeters) > 0.005 &&
        validateDesignPageOpeningPlacement({ ...source, offsetMm: metersToMm(offsetMeters) },
          openings, source.id, placement).valid;
    }
    assert.equal(opening.movableOnHost, accepted,
      `${templateId} ${opening.id} must be movable on its host exactly when the move owner accepts another centre.`);
  }
}
assert.deepEqual(
  templatePlan("compact_two_bed").projected.filter((opening) => opening.kind === "door")
    .map((opening) => opening.movableOnHost),
  [true, true, true, true, true],
  "compact_two_bed: every door, including entry -> bathroom and entry -> Bedroom 2, must have room to "
  + "move on its own wall segment instead of overlapping on the Bedroom 2 wall."
);
assert.deepEqual(
  templatePlan("narrow_one_bed").projected.filter((opening) => opening.kind === "door")
    .map((opening) => opening.movableOnHost),
  [true, true, true, true],
  "narrow_one_bed: every door, including entry -> living on the 1.6 m the entry shares with the "
  + "living room, must have room to move."
);

// narrow_one_bed used to be the pinned case: a 0.9 m entry door on the 1.2 m the entry shared with
// the living room, where two 0.18 m corner clearances leave 0.84 m of usable wall and so no legal
// centre at all. The template now shares 1.6 m, so that geometry is kept here as a fixture rather
// than shipped: without it nothing would prove the projection ever reports no room to move, which is
// the only case the 3D threshold and RoomRenderer2D's drag start exist to refuse.
const pinnedRooms: HousePlanRoom2D[] = [
  { id: "living", name: "Living Room", roomType: "living", shape: "rectangle",
    x: 1.7, z: 2.1, w: 3.4, d: 4.2 },
  { id: "entry", name: "Entry", roomType: "custom", shape: "rectangle",
    x: 4.5, z: 4.1, w: 2.2, d: 2.2 },
];
const pinnedDoor: RoomOpening2D = { id: "pinned-door", roomId: "entry", wall: "west", kind: "door",
  offsetMm: metersToMm(-0.4), widthMm: metersToMm(0.9) };
assert.deepEqual(
  validateDesignPageOpeningPlacement(pinnedDoor, [], pinnedDoor.id,
    { rooms: pinnedRooms, planWidthMeters: 10, planDepthMeters: 10 }),
  { valid: false, reason: "opening_too_wide", label: "Too wide for this wall" },
  "Precondition: 0.9 m of door plus two 0.18 m corner clearances does not fit the 1.2 m these rooms "
  + "share, so no centre on that host is legal."
);
assert.equal(mapPlanOpeningsToRoomRenderer([pinnedDoor], pinnedRooms)[0]?.movableOnHost, false,
  "An opening the placement rules pin in place must project movableOnHost false: that is the value "
  + "the 3D threshold and RoomRenderer2D's startOpeningMoveDrag both refuse a drag on."
);

// The structure layer projects every opening's move room on each 2D and 3D render, so the check has
// to stay polynomial in the openings that share one wall. Subtracting a spacing band splits at most
// one free interval in two; keeping the emptied halves doubled the list for every other opening.
const crowdedWall = { physicalWallId: "floor:1:crowded", alongSegmentMeters: 11, spanMeters: 22 };
const crowdAt = (along: number) => ({ host: { ...crowdedWall, alongSegmentMeters: along }, widthMeters: 0.6 });
const crowd = Array.from({ length: 22 }, (_, index) => crowdAt(0.5 + index));
const moving = crowdAt(11);
assert.equal(designPageOpeningHasMoveRoom(moving, crowd), false,
  "Spacing bands 1.56 m wide every 1 m, plus the corner clearance, leave no centre on a 22 m wall.");
const withGap = crowd.filter((_, index) => index !== 11);
assert.equal(designPageOpeningHasMoveRoom(moving, withGap), true,
  "Removing the opening at 11.5 m leaves the 0.44 m of centres between 11.28 m and 11.72 m.");
assert.equal(designPageOpeningHasMoveRoom(moving, [...withGap, crowdAt(10.5 + 1.56 + 0.0005)]), false,
  "A sliver of centres narrower than the interaction tolerance is not room to move.");
assert.equal(designPageOpeningHasMoveRoom(moving, withGap.map((other) => ({
  ...other, host: { ...other.host, physicalWallId: "floor:1:other" },
}))), true, "Openings on another physical wall never take this wall's room.");
const longRoom: HousePlanRoom2D = { id: "hall", name: "Hall", roomType: "living", shape: "rectangle", x: 0, z: 0, w: 30, d: 4 };
const northWindows: RoomOpening2D[] = Array.from({ length: 22 }, (_, index) => ({
  id: `north-${index}`, roomId: longRoom.id, kind: "window", wall: "north",
  offsetMm: metersToMm(-13.65 + index * 1.3), widthMm: 600,
}));
const projectionStartedAt = performance.now();
const crowdedProjection = mapPlanOpeningsToRoomRenderer(northWindows, [longRoom]);
const projectionMs = performance.now() - projectionStartedAt;
assert.deepEqual(crowdedProjection.map((projected) => projected.movableOnHost), northWindows.map(() => true),
  "Each window 1.3 m from its neighbours keeps 1.04 m of valid centres around it.");
assert.ok(projectionMs < 150,
  `Projecting 22 windows on one wall must not stall a render (took ${projectionMs.toFixed(1)} ms).`);

console.log("window opening drag bounds and mutation routing passed");
