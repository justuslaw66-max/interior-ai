import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { FloorPlanDocumentV2 } from "../../lib/floor-plan-document-v2";
import { calibratedScaleFixture } from "../../scripts/fixtures/scan-to-editable-plan/scale-review";
import { collectScaleMeasurementIssues } from "../../lib/floor-plan-imports/scale-measurement-readiness";
import FloorPlanSourceReviewCanvas from "../../components/editor/floor-plan-import-review/FloorPlanSourceReviewCanvas";
import FloorPlanScaleReviewPanel from "../../components/editor/floor-plan-import-review/FloorPlanScaleReviewPanel";

const initial = calibratedScaleFixture();
initial.floors[0].dimensions = [];
const page = { pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "authored-page" };
const key = "scan-plan:scale-review-fixture";
function Harness() {
  const [document, setDocument] = useState<FloorPlanDocumentV2>(() => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(initial)));
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]), [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const change = (next: FloorPlanDocumentV2) => { setDocument(next); localStorage.setItem(key, JSON.stringify(next)); };
  return <main style={{ width: 1000, margin: "0 auto" }}>
    <h1>Scale review component verification</h1><p>Authored source with production review components; local persistence only.</p>
    <FloorPlanSourceReviewCanvas document={document} floorId="apartment" sourceId="authored-source" jobId="authored-component"
      adapterId="pdf-raster-hybrid" pages={[page]} pageNumber={1} onPageNumberChange={() => undefined}
      focusedEntityIds={[]} pickingScale={picking} scalePoints={points}
      onSourcePoint={(point) => setPoints((current) => current.length >= 2 ? [point] : [...current, point])} onDocumentChange={change} />
    <FloorPlanScaleReviewPanel document={document} floorId="apartment" sourceId="authored-source" page={page}
      calibration={document.floors[0].calibrations[0]} pickingScale={picking} scalePoints={points}
      onPickingScaleChange={setPicking} onScalePointsChange={setPoints} onChange={change} onError={setError} openByDefault dark={false} disabled={false} />
    {error && <p role="alert">{error}</p>}
    <output data-testid="fixture-document">{JSON.stringify(document)}</output>
    <output data-testid="fixture-readiness">{JSON.stringify(collectScaleMeasurementIssues(document))}</output>
  </main>;
}
const host = document.createElement("div"); document.body.append(host); createRoot(host).render(<Harness />);
