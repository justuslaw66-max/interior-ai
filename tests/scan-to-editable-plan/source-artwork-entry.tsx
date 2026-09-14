import { useState } from "react";
import { createRoot } from "react-dom/client";
import FloorPlanSourceReviewCanvas from "../../components/editor/floor-plan-import-review/FloorPlanSourceReviewCanvas";
import { authoredApartment } from "../../scripts/fixtures/scan-to-editable-plan/apartment";
import { registerEmptyPlanScaleCalibration } from "../../lib/floor-plan-import-review-geometry";
import type { FloorPlanDocumentV2 } from "../../lib/floor-plan-document-v2";

const initial = authoredApartment();
const floor = initial.floors[0];
const provenance = floor.walls[0].provenance;
floor.vertices = []; floor.walls = []; floor.rooms = []; floor.openings = []; floor.dimensions = [];
const source = { kind: "source_drawing" as const, sourceId: "authored-source", pageNumber: 1, widthPx: 800, heightPx: 600 };
floor.annotations = [
  { id: "stroke", kind: "note", text: "Unclassified stroke", scope: "reference", provenance,
    geometry: { ...source, command: "line", points: [{ x: 80, y: 80 }, { x: 420, y: 80 }] } },
  { id: "curve", kind: "note", text: "Unclassified curve", scope: "reference", provenance,
    geometry: { ...source, command: "cubic", points: [{ x: 100, y: 200 }, { x: 100, y: 270 }, { x: 180, y: 270 }, { x: 180, y: 200 }] } },
  { id: "text", kind: "label", text: "Uncertain room text", scope: "reference", provenance,
    geometry: { ...source, command: "text", points: [{ x: 300, y: 250 }] } },
];
const key = "scan-plan:source-artwork-component-fixture";

function Harness() {
  const [document, setDocument] = useState<FloorPlanDocumentV2>(() => JSON.parse(localStorage.getItem(key) ?? JSON.stringify(initial)));
  const change = (next: FloorPlanDocumentV2) => { setDocument(next); localStorage.setItem(key, JSON.stringify(next)); };
  return <main style={{ width: 800, margin: "0 auto" }}>
    <h1>Source artwork component verification</h1>
    <p>Authored fixture using the production review component. No import service or cloud persistence is exercised.</p>
    <FloorPlanSourceReviewCanvas document={document} floorId="apartment" sourceId="authored-source" jobId="authored-component"
      adapterId="pdf-raster-hybrid" pages={[{ pageNumber: 1, widthPx: 800, heightPx: 600, assetKey: "blank-page" }]}
      pageNumber={1} onPageNumberChange={() => undefined} focusedEntityIds={[]} pickingScale={false} scalePoints={[]}
      onSourcePoint={() => undefined} onDocumentChange={change} />
    <button disabled={document.floors[0].calibrations.length > 0} onClick={() => change(registerEmptyPlanScaleCalibration({
      document, floorId: "apartment", sourceId: "authored-source", pageNumber: 1, pageWidthPx: 800, pageHeightPx: 600,
      first: { x: 80, y: 80 }, second: { x: 420, y: 80 }, printedMm: 3400,
    }))}>Apply fixture calibration</button>
    <output data-testid="fixture-document">{JSON.stringify(document)}</output>
  </main>;
}

const host = document.createElement("div");
document.body.append(host);
createRoot(host).render(<Harness />);
