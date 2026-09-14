import assert from "node:assert/strict";
import { calibratedScaleFixture, scaleMeasurement } from "./fixtures/scan-to-editable-plan/scale-review";
import type { FloorPlanSourceMeasurementV2 } from "@/lib/floor-plan-document-v2";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { changeReviewMeasurement } from "@/lib/floor-plan-review-measurements";
import { evaluateSourceMeasurement } from "@/lib/floor-plan-scale-measurements";
import { collectFloorPlanImportReadinessIssues, reconcileFloorPlanImportReadinessIssues } from "@/lib/floor-plan-imports/readiness";
import { applyFloorPlanAddressTransformV2, canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { applyConsumerFloorPlanCorrection } from "@/lib/floor-plan-imports/review";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { applyScaleReviewMeasurement } from "@/components/editor/floor-plan-import-review/applyScaleReviewMeasurement";
import { isFloorPlanMvpBlockingIssue } from "@/lib/floor-plan-imports/types";


function testMeasurements() {
  const source = calibratedScaleFixture(), original = JSON.stringify(source);
  const change = (measurement: FloorPlanSourceMeasurementV2) => changeReviewMeasurement({ document: source, floorId: "apartment", calibrationId: "scale", measurement });
  const checked = change(scaleMeasurement());
  assert.deepEqual(checked.floors[0].walls, source.floors[0].walls);
  assert.deepEqual(checked.floors[0].vertices, source.floors[0].vertices);
  assert.equal(JSON.stringify(source), original);
  const exact = evaluateSourceMeasurement(checked.floors[0].calibrations[0], scaleMeasurement());
  assert.ok(Math.abs(exact.lengthMm - 4000) <= 16 * Number.EPSILON * 4000);
  assert.ok(Math.abs(exact.residualMm) <= 16 * Number.EPSILON * 4000);
  assert.ok(Math.abs(exact.residualPx) <= 16 * Number.EPSILON * 400);
  assert.deepEqual([exact.tolerancePx, exact.independent, exact.agrees], [2, true, true]);
  assert.ok(!collectFloorPlanImportReadinessIssues({ document: checked, sourceManifest: null }).some(isFloorPlanMvpBlockingIssue));
  for (const [length, quality, agrees] of [[3979, "clean", false], [3980, "clean", true], [3970, "scan", true], [3969, "scan", false]] as const) {
    const document = change(scaleMeasurement({ confirmedLengthMm: length, sourceQuality: quality }));
    const result = evaluateSourceMeasurement(document.floors[0].calibrations[0], document.floors[0].calibrations[0].independentMeasurements![0]);
    assert.equal(result.agrees, agrees, `Frozen ${quality} pixel tolerance must not drift.`);
  }
  const conflict = change(scaleMeasurement({ confirmedLengthMm: 4500 }));
  assert.ok(Math.abs(conflict.floors[0].calibrations[0].independentMeasurements![0].residualAtConfirmation!.pixels + 50) < 16 * Number.EPSILON * 400);
  conflict.floors[0].calibrations[0].independentMeasurements![0].residualAtConfirmation = { millimetres: 0, pixels: 0 };
  compileFloorPlanDocumentV2(conflict); // Retain an honest, resumable review draft.
  const issues = collectFloorPlanImportReadinessIssues({ document: conflict, sourceManifest: null });
  assert.equal(issues.filter(isFloorPlanMvpBlockingIssue).length, 1);
  assert.ok(reconcileFloorPlanImportReadinessIssues({ document: conflict, sourceManifest: null,
    reviewIssues: issues.map((issue) => ({ ...issue, resolved: true })) }).some(isFloorPlanMvpBlockingIssue));
  const reviewed = applyConsumerFloorPlanCorrection({ current: source, next: JSON.parse(JSON.stringify(conflict)),
    currentIssues: [], submittedIssues: [], sourceId: "authored-source", sourceSha256: "a".repeat(64), userId: "reviewer", note: "Independent dimension check" }).document;
  assert.deepEqual(reviewed.floors[0].calibrations, conflict.floors[0].calibrations);
  assert.equal(reviewed.verification.tier, "needs_review");
  const stored = snapshotToStored(canonicalFloorPlanToDesignSnapshot(checked).snapshot);
  assert.deepEqual(storedToSnapshot(stored).floorPlan!.canonicalDocument!.floors[0].calibrations, checked.floors[0].calibrations);
  for (const transform of ["rotate_90", "rotate_180", "mirror_x", "mirror_z"] as const) {
    const rotated = applyFloorPlanAddressTransformV2(checked, transform);
    assert.deepEqual(rotated.floors[0].calibrations[0].independentMeasurements, checked.floors[0].calibrations[0].independentMeasurements);
    assert.ok(evaluateSourceMeasurement(rotated.floors[0].calibrations[0], scaleMeasurement()).agrees);
  }
  const rescaleInput: Parameters<typeof applyScaleReviewMeasurement>[0] = { document: checked, floorId: "apartment", sourceId: "authored-source", calibration: checked.floors[0].calibrations[0],
    page: { pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "authored" }, scalePoints: [{ x: 0, y: 0 }, { x: 1000, y: 0 }],
    printedMm: 11000, firstVertexId: "", secondVertexId: "", inputUnit: "ft-in", sourceQuality: "clean" };
  assert.throws(() => applyScaleReviewMeasurement(rescaleInput), /9260/, "Existing exact authored dimensions continue to constrain scale changes.");
  const withoutExactDimension = structuredClone(checked);
  withoutExactDimension.floors[0].dimensions = [];
  const fractionalAnchor = applyScaleReviewMeasurement({ ...rescaleInput, document: withoutExactDimension, printedMm: 4000,
    scalePoints: [{ x: 200.35, y: 100.25 }, { x: 600.35, y: 100.25 }] });
  assert.ok(fractionalAnchor.floors[0].vertices.every(({ xMm, zMm }) => Number.isSafeInteger(xMm) && Number.isSafeInteger(zMm)));
  const rescaled = applyScaleReviewMeasurement({ ...rescaleInput, document: withoutExactDimension });
  assert.deepEqual(rescaled.floors[0].calibrations[0].independentMeasurements, checked.floors[0].calibrations[0].independentMeasurements);
  assert.ok(collectFloorPlanImportReadinessIssues({ document: rescaled, sourceManifest: null }).some(isFloorPlanMvpBlockingIssue));
  assert.equal(rescaled.floors[0].calibrations[0].primaryMeasurement?.inputUnit, "ft-in");
  assert.equal(rescaled.floors[0].calibrations[0].primaryMeasurement?.confirmedLengthMm, 11000);
  const correctedScale = applyScaleReviewMeasurement({ ...rescaleInput, document: rescaled,
    calibration: rescaled.floors[0].calibrations[0], printedMm: 12000 });
  assert.equal(correctedScale.floors[0].calibrations[0].primaryMeasurement?.confirmedLengthMm, 12000);
  assert.equal(correctedScale.floors[0].dimensions.length, 1, "Correcting the primary measurement replaces its previous dimension atomically.");
  const repaired = changeReviewMeasurement({ document: conflict, floorId: "apartment", calibrationId: "scale", measurement: scaleMeasurement() });
  assert.equal(repaired.floors[0].calibrations[0].independentMeasurements!.length, 1);
  assert.ok(!collectFloorPlanImportReadinessIssues({ document: repaired, sourceManifest: null }).some(isFloorPlanMvpBlockingIssue));
  assert.throws(() => change(scaleMeasurement({ firstPx: { x: 1000, y: 0 }, secondPx: { x: 0, y: 0 }, confirmedLengthMm: 10000 })), /different dimension/);
  for (const measurement of [scaleMeasurement({ confirmedLengthMm: 0 }), scaleMeasurement({ confirmedLengthMm: 100.5 }), scaleMeasurement({ firstPx: { x: -1, y: 0 } }),
    scaleMeasurement({ secondPx: { x: 200, y: 101 } }), scaleMeasurement({ confirmedAt: "invalid" })]) assert.throws(() => change(measurement));
  const malformed = structuredClone(checked);
  Object.assign(malformed.floors[0].calibrations[0].independentMeasurements![0], { inputUnit: "yards" });
  assert.throws(() => compileFloorPlanDocumentV2(malformed), /validation/i);
  malformed.floors[0].calibrations[0].independentMeasurements = Array.from({ length: 9 }, (_, index) => scaleMeasurement({ id: `check-${index}` }));
  assert.throws(() => compileFloorPlanDocumentV2(malformed), /validation/i);
}

if (require.main === module) {
  testMeasurements();
  console.log("PASS: independent scale checks, frozen clean/scan tolerances, conflict drafts, server correction, persistence, orientation and recalibration; no geometry warp.");
}
