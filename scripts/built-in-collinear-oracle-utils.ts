import type { CabinetHostSpace } from "../features/cabinetry/types";
import { toRun, type LineFrame, type P, type Run, type Stretch } from "./built-in-faces-oracle-utils";

/**
 * Pieces all but collinear, for the built-in oracles (scripts/test-built-in-faces-oracle.ts, test-built-in-imported-oracle.ts):
 * J's delegate, 1 Nov 2026, "Treat collinear pieces as one host". Consecutive outline edges within COLLINEAR_DEGREES of each
 * other whose faces meet are one host: straight, its back on or in front of every piece's face (so no wall stands in front of
 * it), from the first face's start to the last one's end. Restated here from the decision, not read from
 * lib/room-built-in-host-faces.ts.
 */

export const COLLINEAR_DEGREES = 0.05;
export const COLLINEAR_SIN = Math.sin((COLLINEAR_DEGREES * Math.PI) / 180);
const COLLINEAR_COS = Math.cos((COLLINEAR_DEGREES * Math.PI) / 180);
/** Faces meet where one ends within 0.05 mm of the next one's line (across) and runs on to the next one's start (0.5 mm, along). */
const MEET_ACROSS = 0.00005, MEET_ALONG = 0.0005;

/** An edge's face as an oracle finds it: its edge's direction and normal, its face line and stretches (in groups, along it). */
export type EdgeFace = { dx: number; dz: number; nx: number; nz: number; line: LineFrame; groups: Stretch[][] };
type End = { point: P; slack: number };
/** Edges whose faces are one host, and their face stretches' ends. */
export type CollinearChain = { edges: number[]; ends: End[] };
/** A chain's host, where its face starts and ends (on its line), and how far behind its line the faces stand at most. */
export type ChainHost = { space: CabinetHostSpace; from: P; to: P; bow: number };

const endsOf = (face: EdgeFace): End[] => face.groups.flat().flatMap((stretch) =>
  [{ point: face.line.at(stretch.from, 0), slack: stretch.slackFrom }, { point: face.line.at(stretch.to, 0), slack: stretch.slackTo }]);

function joinsNext(faces: ReadonlyArray<EdgeFace | null>, index: number): boolean {
  const face = faces[index], next = faces[(index + 1) % faces.length];
  if (faces.length < 2 || !face?.groups.length || !next?.groups.length || face.dx * next.dx + face.dz * next.dz < COLLINEAR_COS) return false;
  const last = face.groups.flat().reduce((most, stretch) => (stretch.to > most.to ? stretch : most));
  const first = next.groups.flat().reduce((least, stretch) => (stretch.from < least.from ? stretch : least));
  const [end, start] = [face.line.at(last.to, 0), next.line.at(first.from, 0)];
  return Math.abs(next.line.frame(end)[1]) <= MEET_ACROSS && Math.abs(face.line.frame(start)[1]) <= MEET_ACROSS && face.line.frame(start)[0] - last.to <= MEET_ALONG;
}

/** The chains of edges whose faces are one host, but for those on one line (a straight wall drawn in pieces: one face already). */
export function collinearChains(faces: ReadonlyArray<EdgeFace | null>): CollinearChain[] {
  const count = faces.length, joined = faces.map((_, index) => joinsNext(faces, index));
  if (!joined.some(Boolean) || joined.every(Boolean)) return [];
  const first = joined.findIndex((_, index) => !joined[(index - 1 + count) % count]), chains: CollinearChain[] = [];
  for (let done = 0; done < count;) {
    const edges = [(first + done) % count];
    while (joined[edges[edges.length - 1]]) edges.push((edges[edges.length - 1] + 1) % count);
    done += edges.length;
    const ends = edges.flatMap((edge) => endsOf(faces[edge] as EdgeFace)), line = (faces[edges[0]] as EdgeFace).line;
    if (edges.length > 1 && ends.some(({ point }) => Math.abs(line.frame(point)[1]) > 0.000001)) chains.push({ edges, ends });
  }
  return chains;
}

/**
 * The chain's host among `spaces`: along every piece (within COLLINEAR_DEGREES), square to its own line, every face stretch's
 * ends on or behind its line by at most its length over COLLINEAR_DEGREES and one of them on it, and starting and ending where
 * the first and last stretches do (±0.5 mm and their slack). Null when none is.
 */
export function chainHost(chain: CollinearChain, faces: ReadonlyArray<EdgeFace | null>, spaces: readonly CabinetHostSpace[]): ChainHost | null {
  const inward = faces[chain.edges[0]] as EdgeFace;
  for (const space of spaces) {
    const segment = space.wallSegment;
    if (!segment) continue;
    const from = { x: segment.startXmm / 1000, z: segment.startZmm / 1000 }, to = { x: segment.endXmm / 1000, z: segment.endZmm / 1000 };
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    if (!(length > 0)) continue;
    const [ux, uz] = [(to.x - from.x) / length, (to.z - from.z) / length], side = -uz * inward.nx + ux * inward.nz >= 0 ? 1 : -1;
    const [nx, nz] = [-uz * side, ux * side], normal = Math.hypot(segment.inwardNormalX, segment.inwardNormalZ) || 1;
    if (!chain.edges.every((edge) => ux * (faces[edge] as EdgeFace).dx + uz * (faces[edge] as EdgeFace).dz >= COLLINEAR_COS)) continue;
    if (Math.abs(segment.inwardNormalX * ux + segment.inwardNormalZ * uz) / normal > 1e-9) continue;
    const at = chain.ends.map(({ point, slack }) => ({ along: (point.x - from.x) * ux + (point.z - from.z) * uz, across: (point.x - from.x) * nx + (point.z - from.z) * nz, slack }));
    const bow = -Math.min(...at.map(({ across }) => across));
    if (bow > length * COLLINEAR_SIN || Math.max(...at.map(({ across }) => across)) > 0.00001 || Math.max(...at.map(({ across }) => across)) < -0.00001) continue;
    const start = at.reduce((least, end) => (end.along < least.along ? end : least)), end = at.reduce((most, entry) => (entry.along > most.along ? entry : most));
    const on = (along: number) => ({ x: from.x + ux * along, z: from.z + uz * along });
    if (Math.abs(start.along) <= 0.0005 + start.slack && Math.abs(end.along - length) <= 0.0005 + end.slack) return { space, from: on(start.along), to: on(end.along), bow };
  }
  return null;
}

/** Does a run on a chain's host reach past where its face ends, between `from` and `to` along it (faceBreaks, for a chain)? */
export function chainFaceBreaks(host: ChainHost, run: Run, back: number, from: number, to: number): boolean {
  const [start, end] = [toRun(run, back, host.from)[0], toRun(run, back, host.to)[0]].sort((a, b) => a - b);
  return Math.min(from, to) < start - 0.00002 || Math.max(from, to) > end + 0.00002;
}
