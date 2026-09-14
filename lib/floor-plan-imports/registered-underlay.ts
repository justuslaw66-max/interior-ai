import type { FloorPlanDocumentV2, FloorPlanSourceCalibrationV2 } from "../floor-plan-document-v2";
import type { FloorPlanUnderlay } from "../floor-plan-types";
import { projectReviewSourcePointToPlan } from "../floor-plan-source-point-projection";
import { parseRenderedPages } from "./validation";

/** Decompose the existing canonical affine registration into image placement. */
function registeredPlacement(calibration: FloorPlanSourceCalibrationV2) {
  const origin = projectReviewSourcePointToPlan(calibration, { x: 0, y: 0 });
  const right = projectReviewSourcePointToPlan(calibration, { x: calibration.imageWidthPx, y: 0 });
  const bottom = projectReviewSourcePointToPlan(calibration, { x: 0, y: calibration.imageHeightPx });
  const center = projectReviewSourcePointToPlan(calibration, { x: calibration.imageWidthPx / 2, y: calibration.imageHeightPx / 2 });
  if (!origin || !right || !bottom || !center) throw new Error("Re-register the source page before attaching its reference image.");
  const ux = right.xMm - origin.xMm, uz = right.zMm - origin.zMm;
  const vx = bottom.xMm - origin.xMm, vz = bottom.zMm - origin.zMm;
  const widthMm = Math.hypot(ux, uz), perpendicular = (ux * vz - uz * vx) / widthMm;
  const depthMm = Math.abs(perpendicular), skewX = (ux * vx + uz * vz) / (widthMm * depthMm);
  if (![widthMm, depthMm, skewX].every(Number.isFinite) || widthMm <= 0 || depthMm <= 0) throw new Error("The source registration has no usable image area.");
  return { position: { x: center.xMm / 1000, z: center.zMm / 1000 }, widthMeters: widthMm / 1000, depthMeters: depthMm / 1000,
    rotationDeg: -Math.atan2(uz, ux) * 180 / Math.PI,
    // Omit numerical zero so ordinary unskewed registrations retain legacy shape.
    ...(Math.abs(skewX) > 32 * Number.EPSILON ? { skewX } : {}), ...(perpendicular < 0 ? { flipY: true } : {}) };
}

export function registeredImportUnderlay(input: {
  document: FloorPlanDocumentV2; jobId: string; renderedPages: unknown;
  sourceAsset: { id: string; sha256: string; fileName: string; mimeType: string };
}): FloorPlanUnderlay | null {
  const floor = input.document.floors[0];
  const calibration = floor?.calibrations.find(({ sourceId }) => sourceId === input.sourceAsset.id);
  if (!input.renderedPages || (Array.isArray(input.renderedPages) && !input.renderedPages.length)) return null;
  const pages = parseRenderedPages(input.renderedPages);
  const page = pages.find(({ pageNumber }) => pageNumber === calibration?.pageNumber);
  if (!floor || !calibration || !page) return null;
  if (page.widthPx !== calibration.imageWidthPx || page.heightPx !== calibration.imageHeightPx) {
    throw new Error("The source preview dimensions changed. Reload and check the registered page before creating a design.");
  }
  const [first, second] = calibration.controlPoints;
  const referenceLengthMeters = Math.hypot(second.planMm.xMm - first.planMm.xMm, second.planMm.zMm - first.planMm.zMm) / 1000;
  const sourceLengthPx = Math.hypot(second.sourcePx.x - first.sourcePx.x, second.sourcePx.y - first.sourcePx.y);
  return { id: `import-underlay-${input.jobId}`, floorId: floor.id, name: input.sourceAsset.fileName,
    assetUrl: `/api/floor-plan-imports/${encodeURIComponent(input.jobId)}/assets/${encodeURIComponent(page.assetKey)}`,
    mimeType: "image/png", sourceMimeType: input.sourceAsset.mimeType, sourceAssetSha256: input.sourceAsset.sha256,
    sourceJobId: input.jobId, renderedPage: page.pageNumber, pageCount: pages.length, widthPx: page.widthPx, heightPx: page.heightPx,
    ...registeredPlacement(calibration), opacity: 0.45, visible: false, locked: true,
    calibration: { pixelsPerMeter: sourceLengthPx / referenceLengthMeters, referenceLengthMeters,
      referencePointsPx: [{ ...first.sourcePx }, { ...second.sourcePx }] } };
}
