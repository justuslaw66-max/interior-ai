import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  compileFloorPlanDocumentV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2, FloorPlanVertexV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import type {
  RegisteredPageEvidence,
  SemanticOpeningSymbol,
} from "@/lib/floor-plan-imports/deterministic-evidence";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import { applyVectorizerEvidence } from "@/lib/floor-plan-imports/vectorizer-pass";
import { alignVectorizerFaces, vectorizerThicknessMm } from "@/lib/floor-plan-imports/vectorizer-face-millimetres";
import { addVectorizerStandaloneWalls } from "@/lib/floor-plan-imports/vectorizer-standalone-walls";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { closedSpacesProduced, isFloorPlanVoidRoom, voidRoomCrossDashes, voidRoomCrossSegments } from "@/lib/floor-plan-void-rooms";
import {
  PythonFloorPlanVectorizerProvider,
  floorPlanVectorizerRuntimeConfiguration,
  mergeVectorizerDimensionSpans,
  parseFloorPlanVectorizerEvidence,
  registerVectorizerEvidence,
  swingAgainstWall,
} from "@/lib/floor-plan-imports/vectorizer-evidence";

/**
 * Vectorizer evidence → accepted scale → registered rooms → canonical
 * document, through the adapter's own stages and the canonical validator.
 * Fixtures are real exporter output for four drawing styles; no Python runs.
 */

const fixtureDirectory = path.join(__dirname, "fixtures", "floor-plan-vectorizer");
const context = { jobId: "vectorizer-evidence-test" } as unknown as FloorPlanAdapterContext;

// The provider is off unless explicitly enabled, and its timeout is bounded.
assert.equal(floorPlanVectorizerRuntimeConfiguration({}).enabled, false);
assert.equal(floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_ENABLED: "true" }).enabled, false);
assert.equal(floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_ENABLED: "1" }).enabled, true);
assert.equal(
  floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_TIMEOUT_MS: "5" }).timeoutMs,
  10_000
);
assert.equal(floorPlanVectorizerRuntimeConfiguration({}).exportFloorMs, 60_000);
assert.equal(
  floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_EXPORT_FLOOR_MS: "999999" }).exportFloorMs,
  300_000
);

// Hinge end and handing follow the direction of the hosting wall.
const hinged = { hingeSourcePx: { x: 0, y: 0 }, swingTowardSourcePx: { x: 0, y: 5 } };
assert.deepEqual(swingAgainstWall({ x: 0, y: 0 }, { x: 10, y: 0 }, hinged), { hinge: "start", handing: "left" });
assert.deepEqual(swingAgainstWall({ x: 10, y: 0 }, { x: 0, y: 0 }, hinged), { hinge: "end", handing: "right" });
assert.deepEqual(swingAgainstWall({ x: 0, y: 0 }, { x: 10, y: 0 }, {}), { hinge: "unknown", handing: "unknown" });
assert.deepEqual(swingAgainstWall({ x: 0, y: 0 }, { x: 10, y: 0 }, { double: true }), { hinge: "none", handing: "double" });

// Evidence that is not the exporter's shape is refused at the process boundary.
assert.throws(() => parseFloorPlanVectorizerEvidence({ kind: "something_else" }));

// The vectorizer's own clean drawing (exporter 0.28.1+) passes the schema and is registered to the rendered page, for
// the clean traced drawing; a drawing whose commands are not the app's path commands is refused.
{
  const raw = JSON.parse(readFileSync(path.join(fixtureDirectory, "room4.evidence.json"), "utf8"));
  const drawing = { version: "stage1-svg-1", textBoxes: [[10, 10, 30, 20]], items: [
    { kind: "wall", fill: true, strokeWidthPx: 0, commands: ["L", "L", "Z"], points: [[0, 0], [10, 0], [10, 10]] },
    { kind: "line", fill: false, strokeWidthPx: 1.5, commands: ["L"], points: [[0, 0]] },
  ] };
  const evidence = parseFloorPlanVectorizerEvidence({ ...raw, drawing });
  const page = { pageNumber: 1, widthPx: evidence.page.widthPx, heightPx: evidence.page.heightPx, vectorSegments: [],
    vectorPaths: [], text: [], semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] } } as RegisteredPageEvidence;
  registerVectorizerEvidence(page, evidence, Buffer.from(JSON.stringify({ ...raw, drawing })));
  assert.deepEqual(page.vectorizer?.drawing?.items.map((item) => item.kind), ["wall"], "A drawing item with too few points is left out");
  assert.deepEqual(page.vectorizer?.drawing?.items[0].points[2], { x: 10, y: 10 });
  assert.deepEqual(page.vectorizer?.drawing?.textBoxes[0], { left: 10, top: 10, right: 30, bottom: 20 });
  const bad = { ...drawing, items: [{ ...drawing.items[0], commands: ["Q"] }] };
  assert.throws(() => parseFloorPlanVectorizerEvidence({ ...raw, drawing: bad }));
  assert.equal(parseFloorPlanVectorizerEvidence(raw).drawing, undefined, "Evidence before 0.28.1 has no drawing");
}

async function importFixture(name: string, guessedOpenings: SemanticOpeningSymbol[] = [], linework: "walls" | "walls+bar" = "walls") {
  const bytes = readFileSync(path.join(fixtureDirectory, `${name}.evidence.json`));
  const evidence = parseFloorPlanVectorizerEvidence(JSON.parse(bytes.toString("utf8")));
  const page: RegisteredPageEvidence = {
    pageNumber: 1,
    widthPx: evidence.page.widthPx,
    heightPx: evidence.page.heightPx,
    // Stand-in for the adapter's own raster linework (the scale solver refuses a page without any): the wall sides,
    // plus the drawn scale bar where the fixture has one (the raster pass traces that line like any other).
    vectorSegments: [
      ...evidence.wallEdges.map((edge) => edge.sourcePx),
      ...(linework === "walls+bar"
        ? evidence.semantics.dimensionLabels.flatMap((label) => /m$/.test(label.rawText ?? "") && label.spanSourcePx ? [label.spanSourcePx] : [])
        : []),
    ].map((span, index) => ({
      id: `raster-${index + 1}`,
      pageNumber: 1,
      start: { x: span[0][0], y: span[0][1] },
      end: { x: span[1][0], y: span[1][1] },
      strokeWidthPx: 1,
      evidenceKind: "raster_linework" as const,
    })),
    vectorPaths: [],
    text: [],
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
  };
  page.semantics = registerVectorizerEvidence(page, evidence, bytes);
  page.semantics.openingSymbols.push(...guessedOpenings);
  assert.equal(page.semantics.roomLabels.every((label) => label.confidence <= 0.85), true);
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: null });
  const extracted = {
    candidate: {
      kind: "floor_plan_deterministic_evidence_v1",
      source: { id: `source-${name}`, fileName: `${name}.png`, mimeType: "image/png", sha256: "0".repeat(64) },
      pages: [page],
      scale: null,
      scales: [],
    } as unknown as Record<string, unknown>,
    sourceManifest: null,
    reviewIssues: [],
  };
  const solved = await adapter.solveScale(extracted);
  const built = await adapter.buildTopology(solved, context);
  const validated = await adapter.validate(built);
  return {
    evidence,
    page,
    metrics: solved.metrics,
    scale: (solved.candidate as { scale: { millimetresPerPixel: number; dimensionCount: number } | null }).scale,
    document: validated.candidate as unknown as FloorPlanDocumentV2,
    issues: validated.reviewIssues,
  };
}

/** The vectorizer pass over one page with a provider that cannot run; returns its diagnostics after checking the page kept its evidence. */
async function failSoftPass(config: ConstructorParameters<typeof PythonFloorPlanVectorizerProvider>[0]) {
  const page: RegisteredPageEvidence = {
    pageNumber: 1,
    widthPx: 10,
    heightPx: 10,
    vectorSegments: [],
    vectorPaths: [],
    text: [],
    semantics: { roomLabels: [{ label: "KITCHEN", roomType: "kitchen", centerXRatio: 0.5, centerYRatio: 0.5, confidence: 0.6 }], dimensionLabels: [], openingSymbols: [], notes: [] },
  };
  const roomLabelsBefore = JSON.stringify(page.semantics.roomLabels);
  const store = { readDerivative: async () => ({ id: "d", fileName: "page.png", mimeType: "image/png", byteLength: 1, sha256: "0".repeat(64), bytes: new Uint8Array([1]) }) };
  const diagnostics = await applyVectorizerEvidence({
    pages: [page],
    renderedPages: [{ pageNumber: 1, widthPx: 10, heightPx: 10, assetKey: "d" }],
    context: { ...context, store: store as unknown as FloorPlanAdapterContext["store"] },
    provider: new PythonFloorPlanVectorizerProvider(config),
    pageLimit: 1,
    rankPages: (pages) => pages,
    mergeSemantics: () => assert.fail("nothing to merge when the provider failed"),
  });
  assert.equal(JSON.stringify(page.semantics.roomLabels), roomLabelsBefore, "the other sources' evidence is kept");
  assert.match(page.semantics.notes.at(-1) ?? "", /^Local vectorizer unavailable: /);
  const result = diagnostics.get(1);
  assert.ok(result);
  return result;
}

/** Standalone walls on a 1000 mm square room (1 mm per px): kept clear of the compiler's crossing rule. */
function testStandaloneWalls() {
  const vertices: FloorPlanVertexV2[] = [];
  const provenance = () => ({ sourceId: "s", pageNumber: 1, confidence: 0.7, basis: "raster_traced", note: "" }) as never;
  const getVertex = (x: number, y: number) => {
    const found = vertices.find((vertex) => vertex.xMm === Math.round(x) && vertex.zMm === Math.round(y));
    if (found) return found;
    const vertex = { id: `v${vertices.length + 1}`, xMm: Math.round(x), zMm: Math.round(y), provenance: provenance() };
    vertices.push(vertex);
    return vertex;
  };
  const corners: Array<[number, number]> = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
  const walls: FloorPlanWallV2[] = corners.map((corner, index) => ({
    id: `w${index + 1}`,
    path: { kind: "line", startVertexId: getVertex(...corner).id, endVertexId: getVertex(...corners[(index + 1) % 4]).id },
    thicknessMm: 100, classification: "exterior", adjacentRoomIds: ["room-1"], provenance: provenance(),
  }));
  const edge = (id: string, from: [number, number], to: [number, number]) =>
    ({ id, kind: "wall_centerline" as const, sourcePx: [from, to] as [[number, number], [number, number]], thicknessPx: 120, opening: null });
  const page = {
    pageNumber: 1, widthPx: 2000, heightPx: 2000, vectorSegments: [], vectorPaths: [], text: [],
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
    vectorizer: {
      exporterVersion: "app-evidence-0.28.0", imageSha256: "0", scaleHint: {} as never, dimensionSpans: [], diagnostics: {},
      rooms: [{ key: "r1", label: "STUDY", roomType: "study" as const, confidence: 0.9,
        sourcePoints: corners.map(([x, y]) => ({ x, y })), edgeIds: ["e1", "e2", "e3", "e4"] }],
      wallEdges: [
        ...corners.map((corner, index) => edge(`e${index + 1}`, corner, corners[(index + 1) % 4])),
        edge("e5", [300, 400], [700, 400]),        // inside the room, clear of every wall: interior
        edge("e6", [1000, 0], [1000, -200]),       // a column past a corner, on from the corner's own vertex: exterior
        edge("e7", [500, -100], [500, 100]),       // across a room wall without a shared end: left out
        edge("e8", [200, 0], [600, 0]),            // along a room wall: left out
      ],
    },
  } as unknown as RegisteredPageEvidence;
  const rooms = [{ registrationKind: "vectorizer_wall_topology" }] as never;
  const added = addVectorizerStandaloneWalls({ page, rooms, millimetresPerPixel: 1, vertices, walls, getVertex, provenance });
  assert.equal(added, 2, "the inside wall and the column; the crossing and the overlapping edge are left out");
  const [inside, column] = walls.slice(4);
  assert.deepEqual([inside.classification, inside.adjacentRoomIds, inside.thicknessMm], ["interior", [], 120]);
  assert.equal(column.classification, "exterior");
  const deterministic = [{ registrationKind: "assembled_wall_topology" }] as never;
  assert.equal(addVectorizerStandaloneWalls({ page, rooms: deterministic, millimetresPerPixel: 1, vertices, walls, getVertex, provenance }), 0,
    "nothing on a page whose rooms the deterministic topology built");
}

/** s056's column as J's Mac traced it (22.9977 mm per px): faces and ends the drawing has on one line stay on it after the
 * app rounds vertices to whole millimetres and thicknesses to 5 mm; a piece that runs into a wall keeps its overlap. */
function testStandaloneWallsLineUp() {
  const mm = 22.9977;
  const vertices: FloorPlanVertexV2[] = [];
  const provenance = () => ({ sourceId: "s", pageNumber: 1, confidence: 0.7, basis: "raster_traced", note: "" }) as never;
  const getVertex = (x: number, y: number) => {
    const at = { xMm: Math.round(x * mm), zMm: Math.round(y * mm) };
    const found = vertices.find((vertex) => vertex.xMm === at.xMm && vertex.zMm === at.zMm);
    if (found) return found;
    const vertex = { id: `v${vertices.length + 1}`, ...at, provenance: provenance() };
    vertices.push(vertex);
    return vertex;
  };
  const corners: Array<[number, number]> = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const walls: FloorPlanWallV2[] = corners.map((corner, index) => ({
    id: `w${index + 1}`,
    path: { kind: "line", startVertexId: getVertex(...corner).id, endVertexId: getVertex(...corners[(index + 1) % 4]).id },
    thicknessMm: 100, classification: "exterior", adjacentRoomIds: ["room-1"], provenance: provenance(),
  }));
  const edge = (id: string, from: [number, number], to: [number, number], thicknessPx: number) =>
    ({ id, kind: "wall_centerline" as const, sourcePx: [from, to] as [[number, number], [number, number]], thicknessPx, opening: null });
  const page = {
    pageNumber: 1, widthPx: 800, heightPx: 400, vectorSegments: [], vectorPaths: [], text: [],
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
    vectorizer: {
      exporterVersion: "app-evidence-0.28.0", imageSha256: "0", scaleHint: {} as never, dimensionSpans: [], diagnostics: {},
      rooms: [{ key: "r1", label: "STORE", roomType: "store" as const, confidence: 0.9,
        sourcePoints: corners.map(([x, y]) => ({ x, y })), edgeIds: ["e1", "e2", "e3", "e4"] }],
      wallEdges: [
        ...corners.map((corner, index) => edge(`e${index + 1}`, corner, corners[(index + 1) % 4], 4)),
        edge("e82", [523, 195.5], [523, 222.5], 10),
        edge("e83", [520, 188], [520, 221.5], 4),          // its left face is e82's: 11914 mm as rounded, 11913 lined up
        edge("e92", [525, 188], [525, 196], 4),
        edge("e93", [523, 187.99673], [523, 195.5], 2.5),  // its top end 4323 mm as rounded, e83's and e92's 4324
        edge("e94", [560, 210], [12141 / mm, 210], 3),     // runs 2 mm into e82 past its near face: stays there
      ],
    },
  } as unknown as RegisteredPageEvidence;
  const rooms = [{ registrationKind: "vectorizer_wall_topology" }] as never;
  assert.equal(addVectorizerStandaloneWalls({ page, rooms, millimetresPerPixel: mm, vertices, walls, getVertex, provenance }), 5);
  const vertex = (id: string) => {
    const found = vertices.find((candidate) => candidate.id === id);
    assert.ok(found, `vertex ${id}`);
    return found;
  };
  const ends = (wall: FloorPlanWallV2) => {
    assert.ok(wall.path.kind === "line", `${wall.id} is a line wall`);
    return [vertex(wall.path.startVertexId), vertex(wall.path.endVertexId)];
  };
  const [e82, e83, e92, e93, e94] = walls.slice(4);
  assert.equal(ends(e83)[0].xMm - e83.thicknessMm / 2, ends(e82)[0].xMm - e82.thicknessMm / 2, "one left face for the column");
  assert.deepEqual([ends(e93)[0].zMm, ends(e92)[0].zMm], [ends(e83)[0].zMm, ends(e83)[0].zMm], "one top face for the column");
  assert.equal(ends(e94)[1].xMm, 12141, "an end inside a wall is not pulled onto its near face (the two would only touch)");
}

/**
 * Faces first (round 37): a wall and a thinner window flush with its outer face, joined by a jog, keep that face on
 * one whole millimetre; centre-lines and thicknesses are whole millimetres, and the window's odd thickness gives way
 * on the face no neighbour shares.
 */
function testFaceMillimetres() {
  const mm = 23.0004;
  const edge = (id: string, from: [number, number], to: [number, number], thicknessPx: number) =>
    ({ id, kind: "wall_centerline" as const, sourcePx: [from, to] as [[number, number], [number, number]], thicknessPx, opening: null });
  const points = [{ x: 100, y: 0 }, { x: 100, y: 50 }, { x: 101.85, y: 50 }, { x: 101.85, y: 90 }];
  const aligned = alignVectorizerFaces({
    wallEdges: [
      edge("e1", [100, 0], [100, 50], 10),             // faces 95 and 105 px
      edge("e3", [100, 50], [101.85, 50], 1.85),       // the jog
      edge("e2", [101.85, 50], [101.85, 90], 6.3),     // faces 98.7 and 105 px: flush with e1 outside
      edge("e4", [101.85, 90], [100, 0], 3),           // slanted: left as measured
    ],
    rooms: [{ key: "r1", label: "", roomType: "other", confidence: 0.9, sourcePoints: points, edgeIds: ["e1", "e3", "e2", "e4"] }],
  } as unknown as Parameters<typeof alignVectorizerFaces>[0], mm);
  const plumb = (id: string) => {
    const found = aligned.wallEdges.find((candidate) => candidate.id === id);
    assert.ok(found, id);
    const centre = found.sourcePx[0][0] * mm;
    const thickness = found.thicknessPx * mm;
    for (const value of [centre, thickness]) assert.ok(Math.abs(value - Math.round(value)) < 1e-6, `${id}: whole millimetres`);
    return { low: centre - thickness / 2, high: centre + thickness / 2, thickness };
  };
  const wall = plumb("e1");
  const window_ = plumb("e2");
  assert.ok(Math.abs(wall.high - window_.high) < 1e-6, "one outer face for the wall and the window, to the millimetre");
  assert.ok(Math.abs(window_.thickness - 6.3 * mm) <= 1.5, "the window keeps its drawn thickness within a millimetre and a half");
  assert.equal(Math.round(window_.thickness) % 2, 0, "an even thickness: the centre-line on a whole millimetre");
  assert.deepEqual(aligned.wallEdges.find((candidate) => candidate.id === "e4")?.sourcePx, [[101.85, 90], [100, 0]]);
  const [, corner] = aligned.rooms[0].sourcePoints;
  assert.ok(Math.abs(corner.x * mm - (wall.low + wall.high) / 2) < 1e-6, "the room's corner on the wall's new centre-line");
  // A level or plumb wall keeps its whole-millimetre thickness; a slanted one keeps 5 mm steps (nothing lines its
  // faces up, and a millimetre's change there only moved the corners of p03's photographed copy).
  assert.equal(vectorizerThicknessMm([[0, 0], [0, 10]], 113 / mm, mm), 113);
  assert.equal(vectorizerThicknessMm([[0, 0], [3, 10]], 113 / mm, mm), 115);
}

async function main() {
  const summary: string[] = [];
  testStandaloneWalls();
  testStandaloneWallsLineUp();
  testFaceMillimetres();
  for (const name of ["room4", "h1", "d12", "exec"]) {
    const { evidence, page, scale, document, issues } = await importFixture(name);
    assert.ok(scale, `${name}: the adapter's cross-checked solver accepts a scale from the vectorizer spans`);
    assert.ok(
      Math.abs(scale.millimetresPerPixel / (evidence.scale.millimetresPerPixel ?? 1) - 1) <= 0.01,
      `${name}: accepted scale ${scale.millimetresPerPixel} agrees with the vectorizer's ${evidence.scale.millimetresPerPixel}`
    );
    assert.ok(scale.dimensionCount >= 2);
    assert.equal(
      page.dimensionSpanEvidence?.observations.every((entry) => entry.status === "source_supported"),
      true
    );
    // Numbers the vectorizer read but could not pair with two stops arrive as unpaired labels with a search hint at
    // the printed length; without the raster tick finder (not run here) they neither support nor veto the scale.
    const unpaired = page.semantics.dimensionLabels.filter((label) => label.unpaired);
    assert.equal(unpaired.length, evidence.semantics.dimensionLabels.filter((label) => !label.spanSourcePx).length);
    assert.ok(unpaired.every((label) => label.extensionStart && label.extensionEnd && label.confidence < 0.85));
    assert.ok(scale.dimensionCount <= evidence.semantics.dimensionLabels.length - unpaired.length, `${name}: the paired spans alone carry the scale`);
    const floor = document.floors[0];
    assert.equal(floor.rooms.length, evidence.rooms.length, `${name}: every vectorizer room becomes a canonical room`);
    const validation = validateFloorPlanDocumentV2(document);
    const errors = validation.filter((issue) => issue.severity === "error");
    if (process.env.FLOOR_PLAN_VECTORIZER_TEST_REPORT === "1") {
      const byCode = new Map<string, number>();
      for (const issue of errors) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
      console.log(name, "rooms", floor.rooms.length, "walls", floor.walls.length, JSON.stringify([...byCode]));
      for (const issue of errors.slice(0, 60)) console.log("   ", issue.code, issue.path, issue.message);
      continue;
    }
    assert.deepEqual(errors, [], `${name}: canonical validation reports no errors`);
    const scene = compileFloorPlanDocumentV2(document);
    assert.equal(scene.floors[0].rooms.length, floor.rooms.length);
    // Measured, not assumed: walls carry more than one thickness, swings carry a hinge end and a hand.
    assert.ok(new Set(floor.walls.map((wall) => wall.thicknessMm)).size >= 2, `${name}: measured wall thickness`);
    const swings = floor.openings.filter((opening) => opening.kind === "door" && opening.operation === "swing");
    assert.ok(swings.length >= 2, `${name}: swing doors`);
    assert.equal(
      swings.every((opening) =>
        opening.handing === "double"
          ? opening.hinge === "none"
          : (opening.hinge === "start" || opening.hinge === "end") &&
            (opening.handing === "left" || opening.handing === "right")
      ),
      true,
      `${name}: every single swing carries its hinge end and hand`
    );
    assert.ok(floor.openings.some((opening) => opening.kind === "window"));
    assert.ok(floor.walls.some((wall) => wall.adjacentRoomIds.length === 2), `${name}: rooms share walls`);
    // Wall edges no room uses (exporter 0.28.0+: columns standing out, walls with one room on both sides) are walls of
    // their own, and the document above still validated with them.
    const roomEdges = new Set(evidence.rooms.flatMap((room) => room.edgeIds));
    const standalone = evidence.wallEdges.filter((edge) => !roomEdges.has(edge.id) && !edge.opening).length;
    const placed = floor.walls.filter((wall) => wall.adjacentRoomIds.length === 0).length;
    assert.ok(placed <= standalone && (standalone === 0 || placed > 0), `${name}: ${placed} of ${standalone} standalone walls placed`);
    assert.ok(issues.some((issue) => issue.code === "rooms_confirmation"));
    assert.equal(document.verification.tier, "needs_review");
    summary.push(
      `${name}: ${floor.rooms.length} rooms, ${floor.walls.length} walls (${floor.walls.filter((wall) => wall.adjacentRoomIds.length === 2).length} shared), ` +
        `${floor.openings.length} openings, ${floor.dimensions.length} dimensions, scale ${scale.millimetresPerPixel.toFixed(3)} mm/px from ${scale.dimensionCount} spans, ` +
        `${validation.length} validation notes`
    );
  }

  // A page with no written dimensions but a graphic scale bar: the bar's labelled stops arrive as printed dimensions,
  // so the scale is accepted exactly like a dimensioned plan and the rooms are promoted.
  const bar = await importFixture("c23", [], "walls+bar");
  assert.equal(bar.evidence.scale.basis, "explicit_dimension");
  assert.equal(bar.evidence.semantics.dimensionLabels.length, 4, "0-1, 1-3, 3-6 and 0-6 m from the bar");
  assert.ok(bar.scale, "c23: the scale bar's spans are accepted as a scale");
  assert.ok(Math.abs(bar.scale.millimetresPerPixel / (bar.evidence.scale.millimetresPerPixel ?? 1) - 1) <= 0.01);
  assert.ok(bar.document.floors[0].rooms.length >= 8, `c23: rooms promoted (${bar.document.floors[0].rooms.length})`);
  assert.deepEqual(validateFloorPlanDocumentV2(bar.document).filter((issue) => issue.severity === "error"), []);
  summary.push(`c23: scale ${bar.scale.millimetresPerPixel.toFixed(2)} mm/px accepted from the graphic scale bar, ${bar.document.floors[0].rooms.length} rooms promoted`);

  // A vision guess ("window" behind the sofa, no jamb or frame pixels) on a wall the vectorizer measured as solid
  // stays an editable suggestion; it never cuts the wall.
  const measured = await importFixture("d12");
  const guessed = await importFixture("d12", [
    {
      kind: "window",
      operation: "fixed",
      centerXRatio: 2475 / 2774,
      centerYRatio: 650 / 1786,
      spanStart: { xRatio: 2475 / 2774, yRatio: 520 / 1786 },
      spanEnd: { xRatio: 2475 / 2774, yRatio: 780 / 1786 },
      confidence: 0.6,
      evidenceKind: "vision",
    },
  ]);
  assert.equal(guessed.document.floors[0].openings.length, measured.document.floors[0].openings.length);
  assert.ok(
    guessed.document.floors[0].annotations.some(
      (annotation) =>
        annotation.configurationId === "source-opening-suggestion" && annotation.geometry.kind === "wall_span"
    ),
    "the guess is kept as a suggestion on its wall"
  );
  summary.push("d12: a vision-only window guess on a measured wall becomes a suggestion, not an opening");

  // A plan without printed dimensions: the estimated scale is never a confirmed scale, but it carries the geometry so
  // the reviewer sees the rooms at once - marked assumed, with the scale issue still blocking until a width is confirmed.
  const estimated = await importFixture("c22");
  assert.equal(estimated.evidence.scale.basis, "estimated_door_leaf");
  assert.equal(mergeVectorizerDimensionSpans(estimated.page), 0);
  assert.ok(estimated.scale, "c22: the estimate stands in for the scale");
  assert.equal((estimated.scale as { basis?: string }).basis, "assumed_opening_width");
  assert.equal(estimated.scale.dimensionCount, 0);
  assert.ok(estimated.document.floors[0].rooms.length >= 8, `c22: rooms placed at the estimated scale (${estimated.document.floors[0].rooms.length})`);
  const calibration = estimated.document.floors[0].calibrations[0];
  assert.equal(calibration?.primaryMeasurement?.basis, "assumed_opening_width", "the calibration says its width was assumed");
  assert.equal(calibration?.primaryMeasurement?.confirmedLengthMm, 970, "the first door opening at the width its offer shows");
  assert.equal((estimated.metrics as { scaleSolved?: boolean } | undefined)?.scaleSolved, false, "an assumed scale does not count as solved");
  const unresolved = estimated.issues.find((issue) => issue.code === "scale_unresolved" && issue.severity === "critical");
  assert.ok(unresolved);
  // ...and the reviewer is told what the estimate rests on and gets the door openings to confirm it against.
  assert.match(unresolved.message, /estimates about 11\.3 mm per pixel from 4 door swings/);
  assert.match(unresolved.message, /placed at that estimated scale/);
  const marks = estimated.document.floors[0].annotations.filter(
    (annotation) => annotation.configurationId === "source-scale-estimate"
  );
  assert.equal(marks.length, 5, "one reference mark per door opening the estimate offers");
  assert.ok(marks.every((mark) => mark.scope === "reference" && mark.geometry.kind === "source_drawing"));
  assert.match(marks[0].text, /about 970 mm if the estimated scale holds/);

  // A box drawn with a dashed cross is a void (a duct): the exporter marks it as a shaft. It keeps its walls at their
  // drawn thickness but is never named, listed, measured, floored or furnished.
  const shafts = estimated.evidence.rooms.filter((room) => room.shaft);
  assert.equal(shafts.length, 3, "c22: three voids, one beside COMMON, one beside MASTER BATH, one between KITCHEN and WC");
  const voids = estimated.document.floors[0].rooms.filter((room) => isFloorPlanVoidRoom(room));
  assert.equal(voids.length, shafts.length, "every shaft becomes a void room");
  assert.ok(voids.every((room) => room.name === "" && room.roomType === "void"), "voids are unnamed and typed void");
  assert.ok(
    voids.every((room) => estimated.document.floors[0].walls.some((wall) => wall.adjacentRoomIds.includes(room.id))),
    "a void keeps the walls round it"
  );
  assert.ok(
    !validateFloorPlanDocumentV2(estimated.document).some((issue) => issue.code === "MISSING_ROOM_NAME"),
    "an unnamed void is not a missing room name"
  );
  const inventory = estimated.issues.find((issue) => issue.code === "rooms_confirmation");
  assert.match(inventory?.message ?? "", /and 3 voids drawn with a dashed cross, left unnamed/);
  const editable = canonicalFloorPlanToDesignSnapshot(estimated.document);
  assert.equal(
    editable.snapshot.rooms.length,
    estimated.document.floors[0].rooms.length - voids.length,
    "the editor gets every room but the voids"
  );
  assert.ok(editable.snapshot.rooms.every((room) => !voids.some((v) => v.id === room.id)));
  // ...and its dashed cross runs corner to corner of its box: two diagonals for a four-cornered void, and for an L the
  // lines between its farthest corners, kept inside it. Given the walls' half thickness, the box is the clear inside.
  const square = [{ xMm: 0, zMm: 0 }, { xMm: 1000, zMm: 0 }, { xMm: 1000, zMm: 800 }, { xMm: 0, zMm: 800 }];
  assert.deepEqual(voidRoomCrossSegments(square), [[square[0], square[2]], [square[1], square[3]]]);
  const inset = voidRoomCrossSegments(square, [50, 50, 50, 50]);
  assert.equal(inset.length, 2);
  assert.deepEqual(inset[0][0], { xMm: 50, zMm: 50 });
  assert.deepEqual(inset[0][1], { xMm: 950, zMm: 750 });
  const ell = [{ xMm: 0, zMm: 0 }, { xMm: 1000, zMm: 0 }, { xMm: 1000, zMm: 400 }, { xMm: 400, zMm: 400 }, { xMm: 400, zMm: 1000 }, { xMm: 0, zMm: 1000 }];
  const ellCross = voidRoomCrossSegments(ell);
  assert.ok(ellCross.length >= 2, "an L-shaped void still gets its cross");
  assert.ok(
    ellCross.every(([a, b]) => [a, b, { xMm: (a.xMm + b.xMm) / 2, zMm: (a.zMm + b.zMm) / 2 }].every((p) => p.xMm <= 1000 && p.zMm <= 1000 && !(p.xMm > 400.5 && p.zMm > 400.5))),
    "an L's cross stays inside the L"
  );
  // walls thicker than the void is wide would turn it inside out: the cross falls back to the centre-lines
  assert.equal(voidRoomCrossSegments(square, [600, 600, 600, 600]).length, 2);
  // The plan drawing (SVG and PDF export) draws each void's cross in dashes, and a room none; the inventory counts the
  // voids apart from the closed spaces.
  const loop = (id: string) => [{ kind: "outer", walls: square.map((start, i) => ({ wallId: `${id}-w${i}`, start })) }];
  const dashes = voidRoomCrossDashes({
    rooms: [{ id: "duct", roomType: "void", wallLoops: loop("duct") }, { id: "store", roomType: "other", wallLoops: loop("store") }],
    walls: [0, 1, 2, 3].map((i) => ({ id: `duct-w${i}`, thicknessMm: 100 })),
  });
  assert.ok(dashes.length > 2 && dashes.every(({ id }) => id.startsWith("duct:void-cross:")), "a void's cross in dashes, none for a room");
  assert.equal(closedSpacesProduced([{ roomType: "other" }, { roomType: "void" }]), "1 closed spaces were produced (and 1 void drawn with a dashed cross, left unnamed)");
  summary.push(
    `c22: no printed dimension; ${estimated.document.floors[0].rooms.length} rooms placed at the vectorizer's estimated scale, marked assumed; scale_unresolved stays critical, 5 door openings are offered to confirm the width`
  );
  summary.push(`c22: ${voids.length} voids kept for their walls, unnamed, typed void, left out of the editor's rooms; the dashed cross runs corner to corner inside them`);

  // The process boundary, with stand-in programs (the real ones need OpenCV and Tesseract): two programs run in a
  // private temporary folder, the evidence file is parsed, the folder is removed, a slow program is killed.
  if (spawnSync("python3", ["--version"]).status === 0) {
    const directory = mkdtempSync(path.join(tmpdir(), "vectorizer-standin-"));
    try {
      const fixture = path.join(fixtureDirectory, "room4.evidence.json");
      writeFileSync(
        path.join(directory, "floorplan_vectorize.py"),
        "import sys, os\nassert os.path.getsize(sys.argv[1]) > 0\nopen(sys.argv[2] + '.json', 'w').write('{}')\n"
      );
      writeFileSync(
        path.join(directory, "app_evidence.py"),
        `import sys, shutil\nshutil.copyfile(${JSON.stringify(fixture)}, sys.argv[2])\n`
      );
      const config = { ...floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_ENABLED: "1" }), directory };
      const before = readdirSync(tmpdir()).filter((entry) => entry.startsWith("vectorizer-run-")).length;
      const evidence = await new PythonFloorPlanVectorizerProvider(config).analyzePage(
        { pageNumber: 1, widthPx: 828, heightPx: 957, mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
        { timeoutMs: 30_000 }
      );
      assert.equal(evidence.rooms.length > 0, true);
      assert.equal(
        readdirSync(tmpdir()).filter((entry) => entry.startsWith("vectorizer-run-")).length,
        before,
        "the private page copy is removed"
      );
      writeFileSync(path.join(directory, "floorplan_vectorize.py"), "import time\ntime.sleep(30)\n");
      await assert.rejects(
        new PythonFloorPlanVectorizerProvider(config).analyzePage(
          { pageNumber: 1, widthPx: 1, heightPx: 1, mimeType: "image/png", bytes: new Uint8Array([1]) },
          { timeoutMs: 400 }
        ),
        /exceeded 400 ms/
      );
      // The exporter keeps its floor when the tracer used the page's whole budget: a 400 ms page budget, a tracer
      // that takes most of it and an exporter that needs a second still return the evidence.
      writeFileSync(
        path.join(directory, "floorplan_vectorize.py"),
        "import sys, time\ntime.sleep(0.3)\nopen(sys.argv[2] + '.json', 'w').write('{}')\n"
      );
      writeFileSync(
        path.join(directory, "app_evidence.py"),
        `import sys, shutil, time\ntime.sleep(1)\nshutil.copyfile(${JSON.stringify(fixture)}, sys.argv[2])\n`
      );
      const floored = await new PythonFloorPlanVectorizerProvider({ ...config, exportFloorMs: 10_000 }).analyzePage(
        { pageNumber: 1, widthPx: 828, heightPx: 957, mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
        { timeoutMs: 400 }
      );
      assert.equal(floored.rooms.length > 0, true, "the exporter ran within its own floor");
      writeFileSync(
        path.join(directory, "app_evidence.py"),
        `import sys, shutil\nshutil.copyfile(${JSON.stringify(fixture)}, sys.argv[2])\n`
      );
      summary.push("provider: stand-in programs run, evidence parsed, temporary folder removed, slow program killed, exporter floor kept");

      // Without the runtime the import goes on: a missing interpreter, or a program that stops with a message
      // (no OpenCV, no tesseract), leaves the page exactly as the other sources made it and records why.
      writeFileSync(path.join(directory, "floorplan_vectorize.py"), "import sys\nsys.exit('the tesseract program is not on PATH')\n");
      const missing = await failSoftPass({ ...config, pythonPath: path.join(directory, "no-such-python3") });
      assert.equal(missing.status, "failed");
      assert.match(missing.error ?? "", /ENOENT/);
      const stopped = await failSoftPass(config);
      assert.equal(stopped.status, "failed");
      assert.match(stopped.error ?? "", /exited with 1: the tesseract program is not on PATH/);
      summary.push("provider: a missing interpreter or a stopped program fails soft - page unchanged, reason noted");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  for (const line of summary) console.log(line);
  console.log("floor-plan vectorizer evidence: ok");
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
