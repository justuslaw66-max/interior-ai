/**
 * A page's own straight strokes, joined into paths for the review's reference artwork (9 Nov 2026).
 *
 * A vector PDF draws its plan, dimensions, lettering and title block as thousands of short straight segments. Kept one
 * annotation per segment, each carrying its own copy of the page, note and provenance, HDB Blk 670's page came to
 * 6,255 marks and 3.9 MB of the candidate, which put the import over the 5 MB cap on a candidate. Joined here, strokes
 * that touch end to end become one path ("M x y L x y L x y …"), and strokes that touch at a branch or not at all start
 * a new subpath ("M") within the path of their connected group. The picture is the same line for line: every segment is
 * drawn once, between its own two ends, and none is moved, dropped or added.
 */

type Point = { x: number; y: number };
export type SourceStroke = { start: Point; end: Point };
/** As a source drawing's path: the first point is where it starts, then one command per further point. */
export type SourceStrokePath = { points: Point[]; pathCommands: Array<"M" | "L"> };

/** The most commands one path may hold (the source drawing's own limit, `sourceDrawingGeometryError`). */
export const SOURCE_STROKE_PATH_MAX_COMMANDS = 4000;

/** Strokes join only at an end they share exactly, so every segment keeps its own two ends to the last digit. */
const pointKey = (point: Point) => `${point.x},${point.y}`;

function connectedGroups(strokes: SourceStroke[], keys: Array<[string, string]>) {
  const parent = new Map<string, string>();
  const find = (key: string): string => {
    let root = key;
    while (parent.get(root) !== root) root = parent.get(root) ?? root;
    for (let at = key; at !== root;) { const next = parent.get(at) ?? root; parent.set(at, root); at = next; }
    return root;
  };
  for (const [a, b] of keys) {
    if (!parent.has(a)) parent.set(a, a);
    if (!parent.has(b)) parent.set(b, b);
    parent.set(find(a), find(b));
  }
  const groups = new Map<string, number[]>();
  strokes.forEach((_, index) => {
    const root = find(keys[index][0]);
    const group = groups.get(root);
    if (group) group.push(index); else groups.set(root, [index]);
  });
  return [...groups.values()];
}

/** One group's strokes as walks: each starts at a loose end where one is left, so a chain is a single subpath. */
function walks(group: number[], strokes: SourceStroke[], keys: Array<[string, string]>) {
  const ends = new Map<string, number[]>();
  for (const index of group) for (const key of keys[index]) {
    const list = ends.get(key);
    if (list) list.push(index); else ends.set(key, [index]);
  }
  const used = new Set<number>();
  const unusedAt = (key: string) => (ends.get(key) ?? []).filter((index) => !used.has(index));
  const result: Array<Point[]> = [];
  while (used.size < group.length) {
    const open = group.filter((index) => !used.has(index));
    const loose = open.flatMap((index) => keys[index]).find((key) => unusedAt(key).length % 2 === 1);
    let key = loose ?? keys[open[0]][0];
    const first = open.find((index) => keys[index][0] === key) ?? open.find((index) => keys[index][1] === key) ?? open[0];
    let point = keys[first][0] === key ? strokes[first].start : strokes[first].end;
    const walk = [point];
    for (let next = unusedAt(key)[0]; next !== undefined; next = unusedAt(key)[0]) {
      used.add(next);
      const forward = keys[next][0] === key;
      point = forward ? strokes[next].end : strokes[next].start;
      key = forward ? keys[next][1] : keys[next][0];
      walk.push(point);
    }
    result.push(walk);
  }
  return result;
}

/** The strokes as paths, one per connected group (split where a group passes the command limit), in source order. */
export function sourceStrokePaths(strokes: SourceStroke[], maxCommands = SOURCE_STROKE_PATH_MAX_COMMANDS): SourceStrokePath[] {
  const keys = strokes.map((stroke): [string, string] => [pointKey(stroke.start), pointKey(stroke.end)]);
  const paths: SourceStrokePath[] = [];
  for (const group of connectedGroups(strokes, keys)) {
    let path: SourceStrokePath = { points: [], pathCommands: [] };
    for (const walk of walks(group, strokes, keys)) {
      walk.forEach((point, index) => {
        if (path.pathCommands.length >= maxCommands) {
          paths.push(path);
          path = { points: index > 0 ? [walk[index - 1]] : [], pathCommands: [] };
        }
        if (path.points.length) path.pathCommands.push(index === 0 ? "M" : "L");
        path.points.push(point);
      });
    }
    if (path.points.length) paths.push(path);
  }
  return paths;
}
