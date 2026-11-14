import { pointInPolygon, type RegisteredPageEvidence } from "./deterministic-evidence";
import { roomCentreLines, standaloneWalls, type OwnWallEdge } from "./pdf-own-walls-edges";
import { doorFinder, isShutDoor, openAirPoints, type DoorFinder, type Drawn } from "./pdf-own-walls-doors";
import { PDF_OWN_WALL_LIMITS, buildWallGrid, gridIndex, wallLinesAndFills, type WallGrid } from "./pdf-own-walls-grid";
import { markBays } from "./pdf-own-walls-bays";
import { markDashedGlass } from "./pdf-own-walls-glass";
import { dropCorridorOpenings, dropUnnamedShutDoors, widenSetBackOpenings } from "./pdf-own-walls-openings";
import { dropWallFittings } from "./pdf-own-walls-racks";
import { closeGaps, dropPocketOpenings, openInWall, wallMass, type WallMass } from "./pdf-own-walls-mass";
import { PDF_OWN_ROOM_LIMITS, floorOutline, roomCells, roomFaces, roomFloor } from "./pdf-own-walls-rooms";
import type { FloorPlanVectorizerEvidence } from "./vectorizer-evidence-schema";

/**
 * Walls from the drawing itself (13 Nov 2026; J: "the main problem is in 3d view the small notches or imperfection
 * will show up"). A vector PDF holds its walls exactly - structural walls as solid fills, every other wall and window
 * as a closed strip between two lines - yet the import read them from a picture of the page and only nudged the result
 * onto the PDF's lines. Here the walls, the openings between them and the rooms they enclose are taken from the PDF's
 * own geometry and written as the reader's evidence (rooms as wall centre-line outlines, every edge with its
 * thickness), so the rest of the import is unchanged. The reader still supplies what is lettered: the scale, the room
 * names, and what kind of door it saw in a gap. Off unless FLOOR_PLAN_PDF_OWN_WALLS=1; with it off, or on a page it
 * cannot use, the evidence is returned as it came.
 */
export const pdfOwnWallsEnabled = (environment: Record<string, string | undefined> = process.env) => environment.FLOOR_PLAN_PDF_OWN_WALLS === "1";

/**
 * Whether a page's walls and rooms were taken from its own drawing. The import's repairs of walls read from a picture
 * of the page (the snap to the PDF's lines, the topology clean-up) leave such walls as they are: they are exact.
 */
export const hasPdfOwnWalls = (page: RegisteredPageEvidence) => typeof page.vectorizer?.diagnostics.pdfOwnWalls === "string";

/** The page needs this many of the PDF's own line segments to be read this way (a picture page has none). */
const MIN_NATIVE_SEGMENTS = 50;

type Evidence = FloorPlanVectorizerEvidence;

export type PdfOwnWallsModel = {
  grid: WallGrid;
  mass: WallMass;
  rooms: { label: number; edges: OwnWallEdge[] }[];
  /** Rooms whose outline could not be put on wall centre-lines. */
  unbuiltRooms: number;
  standalone: OwnWallEdge[];
  drawn: (Drawn | null)[];
  /** How many of the page's lines were left out as dimension lines. */
  dimensionLines: number;
};

/** The pieces of floor the reader's lettering names as open to the air. */
function openAirPieces(evidence: Evidence, grid: WallGrid, labels: Int32Array, sx: number, sy: number) {
  const pieces = new Set<number>();
  for (const { x, y } of openAirPoints(evidence, sx, sy)) {
    const i = Math.min(grid.nx - 1, Math.max(0, gridIndex(grid.xs, x) - (grid.xs[gridIndex(grid.xs, x)] > x ? 1 : 0)));
    const j = Math.min(grid.ny - 1, Math.max(0, gridIndex(grid.ys, y) - (grid.ys[gridIndex(grid.ys, y)] > y ? 1 : 0)));
    if (labels[j * grid.nx + i] >= 0) pieces.add(labels[j * grid.nx + i]);
  }
  return pieces;
}

/** Doors drawn shut that cut off a piece of floor with no name in it (a shower's screen) are taken back. */
function takeBackScreens(grid: WallGrid, mass: WallMass, doors: DoorFinder, evidence: Evidence, sx: number, sy: number) {
  const names = evidence.semantics.roomLabels.map((label) => ({ x: label.centerXRatio * evidence.page.widthPx * sx, y: label.centerYRatio * evidence.page.heightPx * sy }));
  for (const gap of dropUnnamedShutDoors(grid, mass, (gap) => isShutDoor(doors.at(gap)), names)) doors.release(gap);
}

/** The grid, wall mass, openings, rooms and standing-alone walls of a page, or null where it cannot be read this way. */
export function pdfOwnWallsModel(page: RegisteredPageEvidence, evidence: Evidence): PdfOwnWallsModel | null {
  const millimetresPerPixel = evidence.scale.basis === "explicit_dimension" ? evidence.scale.millimetresPerPixel : null;
  const native = page.vectorSegments.filter((segment) => segment.evidenceKind !== "raster_linework").length;
  if (!millimetresPerPixel || native < MIN_NATIVE_SEGMENTS) return null;
  const sx = page.widthPx / evidence.page.widthPx, sy = page.heightPx / evidence.page.heightPx;
  const spans = evidence.semantics.dimensionLabels.flatMap((label) => (label.spanSourcePx ? [label.spanSourcePx.map(([x, y]) => [x * sx, y * sy]) as [[number, number], [number, number]]] : []));
  const drawing = wallLinesAndFills(page, millimetresPerPixel, spans);
  const region = evidence.semantics.planRegion?.bbox;
  const planArea = region ? { left: region.leftRatio * page.widthPx, right: region.rightRatio * page.widthPx, top: region.topRatio * page.heightPx, bottom: region.bottomRatio * page.heightPx } : null;
  // The grid, its wall mass and the openings between the mass. A door standing between two walls that face each
  // other deeper than a wall needs grid lines of its own: the first pass says where, the second has them.
  const built = (cuts: { xs: number[]; ys: number[] }) => {
    const grid = buildWallGrid(drawing.lines, drawing.fills, page.widthPx, page.heightPx, PDF_OWN_WALL_LIMITS.joinMm / millimetresPerPixel, cuts);
    const mass = wallMass(grid, millimetresPerPixel, planArea, drawing.penPx), doors = doorFinder(evidence, grid, drawing, millimetresPerPixel, sx, sy);
    const needed = closeGaps(grid, mass, millimetresPerPixel, { drawn: (gap) => doors.at(gap) !== null, deep: (gap) => doors.deep(gap) });
    return { grid, mass, doors, needed };
  };
  let pass: { grid: WallGrid; mass: WallMass; doors: DoorFinder; needed: { xs: number[]; ys: number[] } } = built({ xs: [], ys: [] });
  if (pass.needed.xs.length || pass.needed.ys.length) pass = built(pass.needed);
  const { grid, mass, doors } = pass;
  // A line across a shower or a bath (its screen) is no door shut: taken back before the pockets are judged.
  takeBackScreens(grid, mass, doors, evidence, sx, sy);
  // Openings that only cut off a pocket are taken back, before and after the doors drawn inside the walls are found
  // (a swing such an opening had used may be one of those).
  const minRoomPx2 = (PDF_OWN_ROOM_LIMITS.minRoomM2 * 1e6) / millimetresPerPixel ** 2;
  for (const gap of dropPocketOpenings(grid, mass, minRoomPx2)) doors.release(gap);
  for (const leaf of doors.inWalls(mass)) openInWall(grid, mass, leaf.part, leaf.kind === "casement");
  dropPocketOpenings(grid, mass, minRoomPx2);
  widenSetBackOpenings(grid, mass, millimetresPerPixel);
  for (const gap of dropCorridorOpenings(grid, mass, (gap) => doors.at(gap) === null)) doors.release(gap);
  dropWallFittings(grid, mass, millimetresPerPixel);
  markDashedGlass(grid, mass, drawing.lines, millimetresPerPixel);
  markBays(grid, mass, doors.unused(), millimetresPerPixel);
  const cells = roomCells(grid, mass, millimetresPerPixel), maxWallPx = PDF_OWN_WALL_LIMITS.maxWallMm / millimetresPerPixel;
  // A window may look out onto a ledge, a balcony or a yard: floor lettered as open to the air is not indoors.
  const openAir = openAirPieces(evidence, grid, cells.labels, sx, sy);
  for (let index = 0; index < cells.indoors.length; index += 1) if (openAir.has(cells.labels[index])) cells.indoors[index] = 0;
  const rooms: PdfOwnWallsModel["rooms"] = [];
  let unbuiltRooms = 0;
  for (const label of cells.rooms) {
    const floor = roomFloor(grid, mass, cells.labels, label, maxWallPx);
    const edges = roomCentreLines(grid, mass, roomFaces(grid, mass, { own: floor, indoors: cells.indoors, openRoom: openAir.has(label) }, floorOutline(grid, floor), millimetresPerPixel), millimetresPerPixel);
    if (edges && edges.length >= 4) rooms.push({ label, edges });
    else unbuiltRooms += 1;
  }
  const standalone = standaloneWalls(grid, mass, rooms.map((room) => room.edges), millimetresPerPixel);
  return { grid, mass, rooms, unbuiltRooms, standalone, drawn: mass.closures.map((gap) => doors.at(gap)), dimensionLines: drawing.dimensionLines.length };
}

/** An edge as the evidence carries it, in the evidence's own pixels. */
function evidenceEdge(edge: OwnWallEdge, id: string, model: PdfOwnWallsModel, millimetresPerPixel: number, sx: number, sy: number): Evidence["wallEdges"][number] {
  const level = edge.start[1] === edge.end[1], widthPx = Math.hypot(edge.end[0] - edge.start[0], edge.end[1] - edge.start[1]);
  const drawn = edge.kind === "opening" ? model.drawn[edge.closure] : null;
  const opening = edge.kind === "wall" ? null : {
    handing: "unknown" as const, hingeSourcePx: null, swingTowardSourcePx: null,
    ...(edge.kind === "window" ? { kind: "window" as const, operation: "fixed" as const, confidence: 0.8 } : drawn?.opening ?? { kind: "open_passage" as const, operation: "open" as const, confidence: 0.6 }),
    widthMm: Math.max(1, Math.round(widthPx * millimetresPerPixel)),
    note: edge.kind === "window" ? "window lines drawn in the PDF's wall" : drawn?.note ?? "a gap in one straight wall of the PDF",
  };
  return {
    id, kind: opening ? "supported_opening_span" : "wall_centerline",
    sourcePx: [[edge.start[0] / sx, edge.start[1] / sy], [edge.end[0] / sx, edge.end[1] / sy]],
    thicknessPx: edge.thicknessPx / (level ? sy : sx), opening,
  };
}

/** The reader's room names lying inside an outline, in reading order of confidence. */
function namesInside(evidence: Evidence, points: { x: number; y: number }[]) {
  return evidence.semantics.roomLabels
    .filter((label) => label.confidence >= 0.45 && pointInPolygon({ x: label.centerXRatio * evidence.page.widthPx, y: label.centerYRatio * evidence.page.heightPx }, points));
}

/**
 * The evidence with its rooms and wall edges taken from the PDF page's own geometry; unchanged where the page is not
 * read this way (no scale from printed dimensions, no native linework, or no room found in the drawing).
 */
export function withPdfOwnWalls(page: RegisteredPageEvidence, evidence: Evidence): Evidence {
  const model = pdfOwnWallsModel(page, evidence), millimetresPerPixel = evidence.scale.millimetresPerPixel;
  if (!model || !millimetresPerPixel || model.rooms.length === 0) return evidence;
  const sx = page.widthPx / evidence.page.widthPx, sy = page.heightPx / evidence.page.heightPx;
  const wallEdges: Evidence["wallEdges"] = [];
  const edgeIds = (edges: OwnWallEdge[]) => edges.map((edge) => {
    const id = `p${wallEdges.length + 1}`;
    wallEdges.push(evidenceEdge(edge, id, model, millimetresPerPixel, sx, sy));
    return id;
  });
  const rooms: Evidence["rooms"] = model.rooms.map((room, index) => {
    const sourcePoints = room.edges.map((edge) => ({ x: edge.start[0] / sx, y: edge.start[1] / sy }));
    const names = namesInside(evidence, sourcePoints);
    return { key: `pdf-room-${index + 1}`, label: names.map((name) => name.label).join(" / "), roomType: names[0]?.roomType ?? "other", confidence: 0.9,
      sourcePoints, edgeIds: edgeIds(room.edges) };
  });
  edgeIds(model.standalone);
  const summary = `rooms ${rooms.length}; not built ${model.unbuiltRooms}; openings ${model.mass.closures.length}; walls standing alone ${model.standalone.length}; the reader had ${evidence.rooms.length} rooms`;
  return { ...evidence, wallEdges, rooms, diagnostics: { ...evidence.diagnostics, pdfOwnWalls: summary },
    semantics: { ...evidence.semantics, notes: [...evidence.semantics.notes, `Walls and rooms taken from the PDF's own drawing: ${summary}`].slice(0, 30) } };
}
