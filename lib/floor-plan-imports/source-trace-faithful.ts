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

/** Lettering in the trace: an item lying within one of stage 1's text boxes (half the box's height round it). */
function inLettering(points: readonly { x: number; y: number }[], boxes: RegisteredVectorizerDrawing["textBoxes"]) {
  if (!boxes.length || !points.length) return false;
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bottom = Math.max(...ys);
  return boxes.some((box) => {
    const pad = (box.bottom - box.top) / 2;
    return left >= box.left - pad && right <= box.right + pad && top >= box.top - pad && bottom <= box.bottom + pad;
  });
}

/** The faithful drawing's items as trace paths, in drawing order (`groupId` faithful-<kind>-<n>; an item within a
 * text box is faithful-letter-<kind>-<n>, so the plan drawn from the model can leave the traced lettering out). */
export function faithfulDrawingPaths(drawing: RegisteredVectorizerDrawing): TracePath[] {
  return drawing.items.map((item, index) => ({
    points: item.points.map((point) => ({ x: point.x, y: point.y })),
    commands: [...item.commands],
    fill: item.fill,
    strokeWidthPx: item.fill ? 1 : Math.min(100, Math.max(0.05, item.strokeWidthPx)),
    groupId: `faithful-${inLettering(item.points, drawing.textBoxes) ? "letter-" : ""}${item.kind}-${index + 1}`,
    ...(item.tone === undefined ? {} : { tone: Math.round(Math.min(255, Math.max(0, item.tone))) }),
  }));
}
