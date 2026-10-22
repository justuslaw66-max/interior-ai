import type { TracePath } from "./source-trace-fit";
import type { RegisteredVectorizerDrawing } from "./vectorizer-drawing";

/**
 * The faithful trace of a clean page (services/floorplan-vectorizer/faithful_drawing.py, J 22 Oct: "get the app to
 * produce these blurry lines as clean sharp vectors"): what is drawn, copied as clean vectors - solid fills as
 * polygons, every line, arc and dot at its own width and grey, lettering and small marks by their outline. Nothing is
 * read as a room, a door or a wall, and nothing is moved against the picture afterwards: the trace already lies on
 * its ink. Its paths keep their grey (`tone`).
 */
export const FAITHFUL_TRACE_VERSION = "faithful-trace-v1";

/** The faithful drawing's items as trace paths, in drawing order (`groupId` faithful-<kind>-<n>). */
export function faithfulDrawingPaths(drawing: RegisteredVectorizerDrawing): TracePath[] {
  return drawing.items.map((item, index) => ({
    points: item.points.map((point) => ({ x: point.x, y: point.y })),
    commands: [...item.commands],
    fill: item.fill,
    strokeWidthPx: item.fill ? 1 : Math.min(100, Math.max(0.05, item.strokeWidthPx)),
    groupId: `faithful-${item.kind}-${index + 1}`,
    ...(item.tone === undefined ? {} : { tone: Math.round(Math.min(255, Math.max(0, item.tone))) }),
  }));
}
