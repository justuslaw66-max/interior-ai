import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { curvedApartment } from "./fixtures/scan-to-editable-plan/curved-apartment";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { applyConfirmedConsumerWallEditV2 } from "@/lib/floor-plan-consumer-wall-edit";
import { applyFloorPlanTopologyMutationV2, type FloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { normalizeZones } from "@/lib/design-page-zone-layout";
import { HistoryManager } from "@/lib/historyManager";
import { buildFloorPlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg } from "@/lib/floor-plan-vector-export";
import { vectorExportFontBytes, vectorPdfPageContent } from "./fixtures/scan-to-editable-plan/pdf-vector-inspection";

const context = { actorId: "independent-review-fixture", mutationId: "remediation", nextRevisionId: "remediated", mutatedAt: "2026-09-15T00:00:00Z" };

function zones() {
  for (const splitZone of [false, true]) {
    const source = canonicalFloorPlanToDesignSnapshot(authoredApartment()).snapshot;
    const living = source.rooms.find(({ id }) => id === "living")!;
    living.items = [
      { instanceId: "left-chair", productId: "authored-chair", variantId: "default", position: [-1, 0, 0] },
      { instanceId: "right-chair", productId: "authored-chair", variantId: "default", position: [1, 0, 0] },
    ];
    living.zones = [{ id: "manual-seating", type: "seating", source: "manual", itemIds: splitZone ? ["left-chair", "right-chair"] : ["left-chair"], anchor: [-1, 0, 0] }];
    const before = JSON.stringify(source);
    let current = source;
    const history = new HistoryManager(() => current, (snapshot) => { current = snapshot; });
    const operation: Extract<FloorPlanTopologyMutationV2, { kind: "add_wall" }> = { kind: "add_wall", floorId: "apartment", wallId: "zone-partition", startVertexId: "zone-top", endVertexId: "zone-bottom", thicknessMm: 100,
      vertices: [{ id: "zone-top", xMm: 2000, zMm: 0 }, { id: "zone-bottom", xMm: 2000, zMm: 6000 }], newRoomId: "zone-child", newRoomName: "Child" };
    history.executeCommand({ id: "remodel-zone-room", description: "Divide furnished room", input: operation,
      execute: (operation) => { current = applyConfirmedConsumerWallEditV2({ snapshot: current, sourceEditConfirmed: true, context, operation }).snapshot; } });
    const result = current;
    assert.equal(history.undo(), "Divide furnished room"); assert.deepEqual(current, source);
    assert.equal(history.redo(), "Divide furnished room"); assert.deepEqual(current, result);
    for (const snapshot of [result, storedToSnapshot(JSON.parse(JSON.stringify(snapshotToStored(result))))]) {
      const allZones = snapshot.rooms.flatMap((room) => {
        for (const zone of room.zones) assert(zone.itemIds.every((id) => room.items.some((item) => item.instanceId === id)), "Zones must follow member destinations");
        assert.equal(normalizeZones(room.zones, room.items).length, room.zones.length, "Existing normalization must not discard rehosted zones");
        return room.zones;
      });
      assert.deepEqual(allZones.flatMap(({ itemIds }) => itemIds).sort(), living.zones[0].itemIds.toSorted());
      assert.equal(allZones.length, splitZone ? 2 : 1);
      assert.equal(new Set(allZones.map(({ id }) => id)).size, allZones.length);
      assert(allZones.some(({ id }) => id === "manual-seating"));
      if (splitZone) assert(snapshot.floorPlan?.proposal?.reviewIssues.some((issue) => /zone.*split/i.test(issue)));
      else {
        const target = snapshot.rooms.find((room) => room.zones.length)!;
        assert.equal(target.zones[0].anchor![0] + target.planPosition!.x, 1, "Intact zone anchor retains its world position");
      }
    }
    assert.equal(JSON.stringify(source), before, "The undo baseline remains unchanged");
    assert.deepEqual(result.floorPlan?.proposal?.originalDocument, source.floorPlan?.canonicalDocument);
  }
}

function curves() {
  const document = curvedApartment(), floor = document.floors[0];
  compileFloorPlanDocumentV2(document);
  const before = JSON.stringify(document);
  const operations: FloorPlanTopologyMutationV2[] = [
    { kind: "add_wall", floorId: floor.id, wallId: "crossing", startVertexId: "cross-start", endVertexId: "cross-end", thicknessMm: 100,
      vertices: [{ id: "cross-start", xMm: 5500, zMm: 3000 }, { id: "cross-end", xMm: 8500, zMm: 3000 }] },
    { kind: "join_wall_endpoint", floorId: floor.id, wallId: "loose", endpoint: "end", to: { xMm: 9260, zMm: 6000 } },
  ];
  for (const operation of operations) {
    assert.throws(() => applyFloorPlanTopologyMutationV2(document, operation, context), /Curved boundaries are retained/);
    assert.equal(JSON.stringify(document), before, "Rejected drafts must preserve arcs, loose walls and the source");
  }
}

async function dimensions() {
  const resources = { fontBytes: await vectorExportFontBytes() };
  const cases = [
    { axis: "horizontal", to: [9260, 6000], length: 9260, end: [9260, -650] },
    { axis: "horizontal", to: [9260, -6000], length: 9260, end: [9260, -350] },
    { axis: "vertical", to: [9260, 6000], length: 6000, end: [350, 6000] },
    { axis: "aligned", to: [3000, 4000], length: 5000, end: [3520, 3610] },
  ] as const;
  for (const fixture of cases) {
    const document = authoredApartment(), floor = document.floors[0];
    const witness = floor.vertices.find(({ xMm, zMm }) => xMm === fixture.to[0] && zMm === fixture.to[1]) ??
      { id: "witness", xMm: fixture.to[0], zMm: fixture.to[1], provenance: floor.vertices[0].provenance };
    if (!floor.vertices.includes(witness)) floor.vertices.push(witness);
    floor.dimensions = [{ ...floor.dimensions[0], toVertexId: witness.id, axis: fixture.axis, measuredMm: fixture.length }];
    const before = JSON.stringify(document);
    const drawing = buildFloorPlanVectorDrawing(document, { floorId: floor.id, dimensions: true, labels: false, fixtures: false });
    const extension = drawing.primitives.find(({ id }) => id === "overall-width:extension-b")!;
    assert.equal(extension.kind, "path"); if (extension.kind !== "path") throw new Error("Expected witness path");
    assert.deepEqual(extension.points, [{ xMm: fixture.to[0], zMm: fixture.to[1] }, { xMm: fixture.end[0], zMm: fixture.end[1] }]);
    const options = { paper: "A3", orientation: "landscape", scale: 100 } as const;
    const svg = await exportFloorPlanVectorSvg(drawing, options, resources);
    assert(svg.includes(`id="overall-width:extension-b" d="M ${fixture.to.join(" ")} L ${fixture.end.join(" ")}"`));
    const pdf = await PDFDocument.load(await exportFloorPlanVectorPdf(drawing, options, resources));
    assert(vectorPdfPageContent(pdf).includes(`${fixture.to.join(" ")} m\n${fixture.end.join(" ")} l`), "PDF witness must start at the original endpoint and reach past the dimension line");
    assert.equal(JSON.stringify(document), before);
  }
}

async function main() {
  const choice = process.argv[2];
  if (!choice || choice === "zones") zones();
  if (!choice || choice === "curves") curves();
  if (!choice || choice === "dimensions") await dimensions();
  console.log(`PASS: independent final-review regressions (${choice ?? "zones, curves, dimensions"})`);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
