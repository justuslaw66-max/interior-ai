import type { SourceVectorPath, SourceVectorSegment } from "./deterministic-evidence";
import { pdfPathsPlanArea } from "./pdf-own-plan-area";

/**
 * How much of a PDF page's own drawing the evidence keeps (14 Nov 2026). A page holds at most `paths` paths and
 * `segments` straight pieces (and as many curves). The page is read up to ten times that. A sheet over the limits
 * (Thomson Reserve's A1 brochure page: the approved plan, the show-unit plan with its furniture, tables, a key plan)
 * keeps the paths of the plan the import reads: the paths that reach into its area, chosen from the sheet's solid fills
 * as the traced drawing chooses it (pdf-own-plan-area.ts). Before, the page kept the first 8,000 paths in drawing
 * order: Thomson draws the show-unit plan first, so the approved plan, its walls and its dimension lines were lost.
 */
export const PDF_PAGE_PATH_LIMITS = Object.freeze({ paths: 8_000, segments: 20_000, readPaths: 80_000, readSegments: 200_000 });

type Box = [number, number, number, number];

const reaches = (bbox: SourceVectorPath["bbox"], [left, top, right, bottom]: Box) =>
  bbox.left <= right && bbox.right >= left && bbox.top <= bottom && bbox.bottom >= top;

/** The page's paths and segments, kept within the limits; unchanged where they already are. */
export function pathsWithinLimits(paths: SourceVectorPath[], segments: SourceVectorSegment[], widthPx: number, heightPx: number) {
  const { paths: maxPaths, segments: maxSegments } = PDF_PAGE_PATH_LIMITS;
  if (paths.length <= maxPaths && segments.length <= maxSegments) return { paths, segments, planArea: null };
  const planArea = pdfPathsPlanArea(paths, widthPx, heightPx);
  const kept: SourceVectorPath[] = [], keptIds = new Set<string>();
  let segmentCount = 0, curveCount = 0;
  for (const path of planArea ? paths.filter((path) => reaches(path.bbox, planArea)) : paths) {
    const curves = path.curves?.length ?? 0;
    if (kept.length >= maxPaths || segmentCount + path.segmentIds.length > maxSegments || curveCount + curves > maxSegments) break;
    kept.push(path);
    for (const id of path.segmentIds) keptIds.add(id);
    segmentCount += path.segmentIds.length;
    curveCount += curves;
  }
  return { paths: kept, segments: segments.filter((segment) => keptIds.has(segment.id)), planArea };
}
