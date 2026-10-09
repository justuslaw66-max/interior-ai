import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";

import { noRaycast } from "@/components/scene/stableSceneProps";
import { openingGestureBindings } from "@/components/editor/renderers/canonical-floor-plan/openingGestureBindings";
import { memoizeByObject } from "@/components/editor/renderers/memoizeByObject";
import { sameLinePoints } from "@/components/editor/renderers/sameLinePoints";
import { stableExtrudeOptions } from "@/components/editor/renderers/stableExtrudeOptions";
import { createLeastRecentlyUsedCache } from "@/lib/least-recently-used-cache";

// React Three Fiber rebuilds a geometry when an `args` entry changes identity, so
// extrude options must be the same object for the same depth.
assert.equal(stableExtrudeOptions(2.6, 1), stableExtrudeOptions(2.6, 1));
assert.deepEqual(stableExtrudeOptions(2.6, 1), {
  depth: 2.6,
  bevelEnabled: false,
  steps: 1,
});
assert.deepEqual(stableExtrudeOptions(0.12), { depth: 0.12, bevelEnabled: false });
assert.notEqual(stableExtrudeOptions(0.12), stableExtrudeOptions(0.12, 1));
assert.notEqual(stableExtrudeOptions(0.12), stableExtrudeOptions(0.13));

// The cache is bounded: filling it past its size starts a fresh set of objects,
// which still compare equal by value.
const first = stableExtrudeOptions(1000);
for (let index = 0; index < 600; index += 1) stableExtrudeOptions(2000 + index);
assert.deepEqual(stableExtrudeOptions(1000), first);

// No 3D structure renderer may hand a geometry an object or a freshly built
// shape inline: each re-render (a hover, a camera cutaway change) would rebuild it.
const root = process.cwd();
const rendererRoot = join(root, "components/editor/renderers");
const sourceFiles = (path: string): string[] =>
  statSync(path).isDirectory()
    ? readdirSync(path).flatMap((name) => sourceFiles(join(path, name)))
    : /\.tsx$/.test(path) ? [path] : [];
const structureRenderers = [
  "CanonicalFloorPlanStructure.tsx",
  "HousePlanRenderer3D.tsx",
  "RoomRenderer2D.tsx",
  "house-plan-3d",
  "canonical-floor-plan",
].flatMap((entry) => sourceFiles(join(rendererRoot, entry)));
// Calls that return the same object for the same input (see below for the 2D room shapes).
const stableBuilders = /(?<!stableExtrudeOptions|buildRoomShapeGeometry|buildInnerFloorShapeGeometry)\(/;
const offenders: string[] = [];
for (const path of structureRenderers) {
  const source = readFileSync(path, "utf8").replace(/\s+/g, " ");
  for (const match of source.matchAll(/<(extrude|shape)Geometry args=\{\[([^\]]*)\]\}/g)) {
    if (/\{\s*depth/.test(match[2]) || stableBuilders.test(match[2])) {
      offenders.push(`${relative(root, path)}: ${match[0].slice(0, 90)}`);
    }
  }
}
assert.deepEqual(
  offenders,
  [],
  "Extrude and shape geometries should get memoized shapes and stableExtrudeOptions, not inline objects."
);

// The 2D plan's room shapes are kept per room object, so a hover or a selection
// keeps every room's ShapeGeometry.
const roomRenderer2D = readFileSync(join(rendererRoot, "RoomRenderer2D.tsx"), "utf8").replace(/\s+/g, " ");
for (const builder of ["buildRoomShapeGeometry", "buildInnerFloorShapeGeometry"]) {
  assert.match(
    roomRenderer2D,
    new RegExp(`const ${builder} = memoizeByObject\\(\\(room: HouseRoom2D\\) => buildRoomPlanShape\\(`),
    `${builder} should return one shape per room object.`
  );
}
const builds: string[] = [];
const shapeOf = memoizeByObject((room: { id: string }) => {
  builds.push(room.id);
  return { shapeFor: room.id };
});
const kitchen = { id: "kitchen" };
assert.equal(shapeOf(kitchen), shapeOf(kitchen), "The same room object gets the same shape.");
assert.notEqual(shapeOf({ id: "kitchen" }), shapeOf(kitchen), "An edited room (a new object) gets a new shape.");
assert.deepEqual(builds, ["kitchen", "kitchen"]);

// drei's Line rebuilds its geometry when `points` changes identity, so the canonical
// 2D opening symbols build their line points once per opening.
const canonicalStructure = readFileSync(join(rendererRoot, "CanonicalFloorPlanStructure.tsx"), "utf8").replace(/\s+/g, " ");
assert.match(
  canonicalStructure,
  /const symbols = useMemo\(\(\) => canonicalOpening2DSymbolLines\(opening, hostSegments\), \[hostSegments, opening\]\);[\s\S]*?points=\{symbol\.linePoints\}/,
  "2D opening symbols should keep their Line points across re-renders."
);
assert.doesNotMatch(canonicalStructure, /points=\{sourcePoints\.map\(/);

// The other 2D lines are built inline, so the 2D renderer and the plan-quality hints draw
// through StableLine, which keeps the points array while its values stay the same.
const planQualityHints = readFileSync(join(root, "components/editor/design-page/PlanQualityHintOverlay.tsx"), "utf8");
for (const [name, source] of [["RoomRenderer2D", roomRenderer2D], ["PlanQualityHintOverlay", planQualityHints]]) {
  assert.match(source, /import \{ StableLine as Line \} from "[^"]*\/StableLine";/, `${name} should draw its lines through StableLine.`);
}
const stableLine = readFileSync(join(rendererRoot, "StableLine.tsx"), "utf8");
assert.match(stableLine, /if \(!unchanged\) setPoints\(props\.points\);[\s\S]*?points=\{unchanged \? points : props\.points\}/);
assert.ok(sameLinePoints([[0, 0, 0], [1, 0, 2]], [[0, 0, 0], [1, 0, 2]]), "Equal tuples are the same points.");
assert.ok(sameLinePoints([{ x: 1, y: 2, z: 3 }, 4], [{ x: 1, y: 2, z: 3 }, 4]), "Equal vectors and numbers are the same.");
assert.ok(sameLinePoints([{ x: 1, y: 2 }], [{ x: 1, y: 2, z: 0 }]), "A Vector2 is a Vector3 at z = 0.");
assert.ok(!sameLinePoints([[0, 0, 0], [1, 0, 2]], [[0, 0, 0], [1, 0, 2.001]]), "A moved point is a change.");
assert.ok(!sameLinePoints([[0, 0, 0]], [[0, 0, 0], [1, 0, 2]]), "An added point is a change.");
assert.ok(!sameLinePoints([{ x: 1, y: 2 }], [[1, 2]]), "A vector replaced by a tuple is a change.");

// A click on the 2D plan changes the selection, not the walls, openings or room fills. Those
// parts are memoized and get stable handlers, so only the ones whose look changed re-render.
const wallSegments2D = readFileSync(join(rendererRoot, "canonical-floor-plan/CanonicalWallSegments2D.tsx"), "utf8");
assert.match(wallSegments2D, /const CanonicalWall2D = memo\(function CanonicalWall2D\(/);
assert.match(wallSegments2D, /const pick = useLatestCallback\([\s\S]*?onPick=\{pick\}/);
assert.match(canonicalStructure, /const CanonicalOpening2DSymbol = memo\(function CanonicalOpening2DSymbol\(/);
assert.match(canonicalStructure, /const wallEditing = useStableWallGestureControls\(latestWallEditing\);/);
assert.match(canonicalStructure, /useStableCanonicalPlan2DHandlers\(latestHandlers\);/);
assert.match(roomRenderer2D, /const HouseRoomFloorFill2D = memo\(function HouseRoomFloorFill2D\(/);
assert.match(planQualityHints, /export const PlanQualityHintOverlay = memo\(function PlanQualityHintOverlay\(/);
// The room fills' handlers come through the structure layer as stable stand-ins.
const structureLayer = readFileSync(join(root, "components/editor/design-page/DesignSceneStructureLayer.tsx"), "utf8");
assert.match(structureLayer, /const selectSurfaceTarget = useLatestCallback\(actions\.rooms\.selectSurfaceTarget\);/);
assert.equal(structureLayer.match(/onSelectSurfaceTarget=\{selectSurfaceTarget\}/g)?.length, 2, "Both plan renderers get the stable handler.");
const latestCallback = readFileSync(join(rendererRoot, "useLatestCallback.ts"), "utf8");
assert.match(latestCallback, /useInsertionEffect\(\(\) => \{\s*latest\.current = callback;\s*\}\);/);
assert.match(latestCallback, /useCallback\(\(\.\.\.args: Args\) => latest\.current\?\.\(\.\.\.args\) as Result, \[\]\);\s*return callback \? stable : undefined;/);
// Proposed opening edits: one handler per controls object and floor, committing as before.
const commits: unknown[] = [];
const controls = {
  enabled: true, selectedWallId: null, select: () => {}, setDragging: () => {},
  commit: (operation: unknown, revisionId: string) => commits.push([operation, revisionId]) > 0,
};
const onEdit = openingGestureBindings(controls, "f1", "line", undefined, undefined).onEdit;
assert.equal(openingGestureBindings(controls, "f1", "line", undefined, undefined).onEdit, onEdit);
assert.notEqual(openingGestureBindings(controls, "f2", "line", undefined, undefined).onEdit, onEdit);
assert.notEqual(openingGestureBindings({ ...controls }, "f1", "line", undefined, undefined).onEdit, onEdit);
onEdit?.("o1", { offsetMm: 120, widthMm: 900, expectedRevisionId: "r1" } as never, "resize");
onEdit?.("o1", { offsetMm: 80, widthMm: 900, expectedRevisionId: "r2" } as never, "move");
assert.deepEqual(commits, [
  [{ kind: "update_opening", floorId: "f1", openingId: "o1", changes: { offsetMm: 120, widthMm: 900 } }, "r1"],
  [{ kind: "update_opening", floorId: "f1", openingId: "o1", changes: { offsetMm: 80 } }, "r2"],
]);

// Wall bodies build their shapes with the bands, and keep them per cut-away set.
const wallBands = readFileSync(
  join(rendererRoot, "canonical-floor-plan/useCanonicalWallBands.ts"),
  "utf8"
).replace(/\s+/g, " ");
assert.match(
  wallBands,
  /cache\.get\(\[\.\.\.excludedWallIds\]\.sort\(\)\.join\("\|"\), \(\) => buildCanonicalWallUnionBands\(floor, \{ excludedWallIds \}\)\.map\(\(band\) => \(\{ \.\.\.band, shapes: planarUnionShapes\(band\.polygons\), \}\)\) \)/,
  "Canonical wall bodies should keep each band's shapes with the band, per cut-away set."
);
assert.match(
  wallBands,
  /const bandsByFloor = new WeakMap</,
  "Each floor model keeps its own bands, so an edited plan never reuses old bands."
);

// The cache keeps the most recently used entries.
const cache = createLeastRecentlyUsedCache<{ key: string }>(2);
const built: string[] = [];
const value = (key: string) => cache.get(key, () => {
  built.push(key);
  return { key };
});
const a = value("a");
value("b");
assert.equal(value("a"), a, "A cached key returns the same object.");
value("c");
assert.equal(cache.size, 2);
value("a");
value("b");
assert.deepEqual(built, ["a", "b", "c", "b"], "Adding c evicts b, the least recently used.");
assert.ok(cache.has("a") && !cache.has("c"), "has() reports what is cached.");
value("d");
assert.ok(!cache.has("a"), "has() does not make an entry recent: a was older than b, so d evicts it.");

// R3F re-applies a host prop whose identity changed and then draws a frame. The furnished 3D
// scene (house structure, openings, lights, items) passes the same values on every render, so a
// page re-render that changes nothing in it (an onboarding step, a panel) doesn't redraw it.
assert.equal(noRaycast(), null, "noRaycast picks nothing.");
const threeHosts = new Set(["mesh", "group", "line", "lineSegments", "points", "instancedMesh", "primitive",
  "object3D", "sprite", "pointLight", "spotLight", "directionalLight", "rectAreaLight", "hemisphereLight",
  "ambientLight", "Line"]);
const builtInline = (expression: ts.Expression | undefined): boolean => {
  if (!expression) return false;
  if (ts.isConditionalExpression(expression)) return builtInline(expression.whenTrue) || builtInline(expression.whenFalse);
  if (ts.isParenthesizedExpression(expression)) return builtInline(expression.expression);
  return ts.isArrowFunction(expression) || ts.isFunctionExpression(expression) || ts.isObjectLiteralExpression(expression);
};
const inlineHostProps = (path: string, text = readFileSync(path, "utf8")): string[] => {
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && threeHosts.has(node.tagName.getText(file))) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !/^(raycast|userData|on[A-Z]\w*)$/.test(attribute.name.getText(file))) continue;
        const value = attribute.initializer;
        if (value && ts.isJsxExpression(value) && builtInline(value.expression)) {
          const line = file.getLineAndCharacterOfPosition(attribute.getStart()).line + 1;
          found.push(`${relative(root, path)}:${line} <${node.tagName.getText(file)} ${attribute.name.getText(file)}>`);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};
assert.deepEqual(
  inlineHostProps(join(root, "probe.tsx"), [
    "<group userData={{ id }}>",
    "  <mesh raycast={() => null} onClick={interactive ? (event) => select(event) : undefined} onPointerOver={hover} />",
    "  <div onClick={() => close()} />",
    "</group>",
  ].join("\n")),
  ["probe.tsx:1 <group userData>", "probe.tsx:2 <mesh raycast>", "probe.tsx:2 <mesh onClick>"],
  "The scan finds inline values on three hosts only, including one side of a conditional."
);
const furnishedSceneFiles = [
  "components/editor/renderers/HousePlanRenderer3D.tsx",
  "components/editor/renderers/GeneratedWindowFrame3D.tsx",
  "components/editor/renderers/house-plan-3d",
  "components/editor/design-page/DesignSceneCanvas.tsx",
  "components/editor/design-page/SceneItemsLayer.tsx",
  "components/editor/design-page/lighting",
  "components/scene/CeilingShadowOccluder.tsx",
  "components/scene/FurnitureItem.tsx",
  "components/scene/SceneItemGroup.tsx",
].flatMap((entry) => sourceFiles(join(root, entry)));
assert.ok(furnishedSceneFiles.length >= 20, "Precondition: the furnished scene's renderers are all scanned.");
assert.deepEqual(
  furnishedSceneFiles.flatMap((path) => inlineHostProps(path)),
  [],
  "Furnished-scene meshes, groups, lines and lights should get raycast, userData and handlers that keep their identity (noRaycast, useMemo, useLatestCallback), not ones built inline."
);
const wholeHomeBindings = readFileSync(join(root, "components/editor/design-page/useWholeHomeRendererBindings.ts"), "utf8");
assert.match(wholeHomeBindings, /const topologyOpenings = useMemo\(\(\) => mapPlanOpeningsToRoomRenderer\(sceneOpenings, rooms\), \[rooms, sceneOpenings\]\);/,
  "The 3D openings are rebuilt only when the plan's openings or rooms change: new openings rebuild the legacy floor slabs and wall bands.");
for (const handler of ["onSelectOpening", "onMoveOpening", "onResizeOpening", "onOpeningDragStateChange", "canonicalWallEditing"]) {
  assert.ok(structureLayer.includes(`${handler}={wholeHome.${handler}}`), `The house renderer gets the stable ${handler}.`);
}

console.log("Stable geometry args tests passed.");
