import type { SourcePointPx } from "./deterministic-evidence";
import type { TraceCommand } from "./source-trace-fit";
import type { FloorPlanVectorizerEvidence } from "./vectorizer-evidence-schema";

/**
 * The vectorizer's own drawing of the page: every wall it found (solid masses and outlined walls, whether or not
 * they close a room), doors, windows, fixtures, dimension lines and other lines, as clean vector shapes in
 * rendered-page pixels. Lettering is not redrawn: only where it is (`textBoxes`), so the clean traced drawing keeps
 * the source's own letters, traced from the picture.
 */
export type VectorizerDrawingItem = {
  kind: string;
  fill: boolean;
  strokeWidthPx: number;
  /** The grey it is drawn in (0 black - 255 white); only the faithful trace gives one. */
  tone?: number;
  /** As a `TracePath`: `points[0]` is the start, then L and M take one point each, C three, Z none. */
  commands: TraceCommand[];
  points: SourcePointPx[];
};
export type VectorizerTextBox = { left: number; top: number; right: number; bottom: number };
export type RegisteredVectorizerDrawing = {
  version: string;
  items: VectorizerDrawingItem[];
  textBoxes: VectorizerTextBox[];
};

type EvidenceDrawing = NonNullable<FloorPlanVectorizerEvidence["drawing"]>;

/** The faithful trace of a clean page (faithful_drawing.py): drawn as it is, not reworked against the picture. */
export const FAITHFUL_DRAWING_PREFIX = "faithful-trace";
export const isFaithfulDrawing = (drawing: { version: string } | undefined | null) =>
  Boolean(drawing?.version.startsWith(FAITHFUL_DRAWING_PREFIX));

const POINTS_PER_COMMAND: Record<TraceCommand, number> = { M: 1, L: 1, C: 3, Z: 0 };

/** Points a command list takes, the start included. */
export function drawingPointCount(commands: readonly TraceCommand[]) {
  return commands.reduce((total, command) => total + POINTS_PER_COMMAND[command], 1);
}

/** The drawing in rendered-page pixels. An item whose points do not match its commands is left out. */
export function registeredVectorizerDrawing(drawing: EvidenceDrawing, sx: number, sy: number): RegisteredVectorizerDrawing {
  const lengthScale = Math.sqrt(sx * sy);
  return {
    version: drawing.version,
    items: drawing.items
      .filter((item) => drawingPointCount(item.commands) === item.points.length)
      .map((item) => ({
        kind: item.kind,
        fill: item.fill,
        strokeWidthPx: item.strokeWidthPx * lengthScale,
        ...(item.tone === undefined ? {} : { tone: item.tone }),
        commands: item.commands,
        points: item.points.map(([x, y]) => ({ x: x * sx, y: y * sy })),
      })),
    textBoxes: drawing.textBoxes.map(([left, top, right, bottom]) => ({
      left: left * sx,
      top: top * sy,
      right: right * sx,
      bottom: bottom * sy,
    })),
  };
}
