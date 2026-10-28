import assert from "node:assert/strict";
import { tracedPlanDocument, withPublicIds } from "./fixtures/scan-to-editable-plan/traced-plan";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { packFloorPlanCandidate } from "@/lib/floor-plan-imports/candidate-storage";
import {
  packDesignFloorPlanForStorage,
  STORE_DESIGN_SOURCE_DRAWING_PACKED,
  unpackDesignFloorPlan,
} from "@/lib/design-floor-plan-storage";
import { assertSharedDesignSnapshotPublic } from "@/lib/shared-design-projection-schema";
import { sanitizeStoredDesign, snapshotToStored, storedToSnapshot, type StoredDesign } from "@/lib/room-persistence";
import { projectSharedStoredDesign } from "@/lib/shared-design-snapshot";
import { normalizeLoadedCloudDesign } from "@/lib/design-page-persistence-projection";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";
import { DESIGN_DOCUMENT_LIMITS } from "@/lib/design-document-contract";
import type { DesignSnapshot } from "@/lib/room-types";

type Json = Record<string, unknown>;
const bytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const isPacked = (document: unknown) =>
  (document as { floors: Json[] }).floors.some((floor) => floor.sourceDrawingPack !== undefined);

/** A design made from a traced plan, with an open proposal that keeps the plan as it was. */
function tracedDesign(marks = 40, publicIds = false): DesignSnapshot {
  const document = publicIds ? withPublicIds(tracedPlanDocument(marks)) : tracedPlanDocument(marks);
  const { snapshot } = canonicalFloorPlanToDesignSnapshot(document, { title: "Traced flat" });
  return {
    ...snapshot,
    floorPlan: {
      ...snapshot.floorPlan,
      proposal: { originalDocument: structuredClone(document), roomRecovery: [], reviewIssues: [] },
    },
  };
}

/** The design as a build that predates packed plans wrote it. */
function plainStored(snapshot: DesignSnapshot): StoredDesign {
  const stored = snapshotToStored(snapshot);
  return { ...stored, floorPlan: unpackDesignFloorPlan(stored.floorPlan) };
}

/** The design as a build that stores packed plans wrote it. */
function packedStored(snapshot: DesignSnapshot): StoredDesign {
  const stored = snapshotToStored(snapshot);
  const floorPlan = stored.floorPlan!;
  const proposal = floorPlan.proposal!;
  type PlanDocument = typeof proposal.originalDocument;
  return {
    ...stored,
    floorPlan: {
      ...floorPlan,
      canonicalDocument: packFloorPlanCandidate(floorPlan.canonicalDocument) as PlanDocument,
      proposal: { ...proposal, originalDocument: packFloorPlanCandidate(proposal.originalDocument) as PlanDocument },
    },
  };
}

function testConversions() {
  const snapshot = tracedDesign();
  const canonical = JSON.stringify(snapshot.floorPlan?.canonicalDocument);
  const original = JSON.stringify(snapshot.floorPlan?.proposal?.originalDocument);
  const packed = packedStored(snapshot);
  assert.ok(isPacked(packed.floorPlan!.canonicalDocument) && isPacked(packed.floorPlan!.proposal!.originalDocument));
  assert.ok(bytes(packed) < bytes(plainStored(snapshot)));

  // Reading gives the unpacked plan, whichever form it was stored in; the editor's fingerprint doesn't change.
  for (const stored of [plainStored(snapshot), packed]) {
    const read = storedToSnapshot(JSON.parse(JSON.stringify(stored)) as StoredDesign);
    assert.equal(JSON.stringify(read.floorPlan?.canonicalDocument), canonical);
    assert.equal(JSON.stringify(read.floorPlan?.proposal?.originalDocument), original);
    assert.equal(fingerprintDesignSnapshot(read), fingerprintDesignSnapshot(storedToSnapshot(snapshotToStored(snapshot))));
  }

  // Writing gives the form the switch says, for both documents.
  const written = snapshotToStored(storedToSnapshot(packed));
  assert.equal(isPacked(written.floorPlan!.canonicalDocument), STORE_DESIGN_SOURCE_DRAWING_PACKED);
  assert.equal(isPacked(written.floorPlan!.proposal!.originalDocument), STORE_DESIGN_SOURCE_DRAWING_PACKED);
  assert.equal(JSON.stringify(packDesignFloorPlanForStorage(unpackDesignFloorPlan(packed.floorPlan))),
    JSON.stringify(written.floorPlan));

  // Either setting of the switch, for both documents.
  const plan = storedToSnapshot(packed).floorPlan;
  const asPacked = packDesignFloorPlanForStorage(plan, true);
  assert.ok(isPacked(asPacked!.canonicalDocument) && isPacked(asPacked!.proposal!.originalDocument));
  assert.equal(JSON.stringify(unpackDesignFloorPlan(asPacked)), JSON.stringify(plan));
  assert.equal(JSON.stringify(packDesignFloorPlanForStorage(asPacked, false)), JSON.stringify(plan));

  // A floor plan without documents, or no floor plan, passes through as it is.
  const bare = { annotations: [], openings: [] };
  assert.equal(unpackDesignFloorPlan(bare), bare);
  assert.equal(packDesignFloorPlanForStorage(bare), bare);
  assert.equal(unpackDesignFloorPlan(undefined), undefined);
}

function testServerBoundaries() {
  const snapshot = tracedDesign();
  const packed = packedStored(snapshot);
  const canonical = JSON.stringify(snapshot.floorPlan?.canonicalDocument);

  // Saving checks the plan and stores it in the switch's form.
  const sanitized = sanitizeStoredDesign(packed);
  assert.ok(sanitized, "A design with a packed plan is a valid design.");
  assert.equal(isPacked(sanitized.floorPlan!.canonicalDocument), STORE_DESIGN_SOURCE_DRAWING_PACKED);
  assert.equal(JSON.stringify(storedToSnapshot(sanitized).floorPlan?.canonicalDocument), canonical);
  assert.equal(JSON.stringify(sanitizeStoredDesign(sanitized)), JSON.stringify(sanitized));

  // A malformed pack, in either document, makes the design invalid rather than stored unreadable.
  type Broken = { floorPlan: { canonicalDocument: { floors: Json[] }; proposal: { originalDocument: { floors: Json[] } } } };
  const broken = JSON.parse(JSON.stringify(packed)) as Broken;
  (broken.floorPlan.canonicalDocument.floors[0].sourceDrawingPack as Json).format = "source-drawing-pack-v0";
  assert.equal(sanitizeStoredDesign(broken), null);
  const brokenProposal = JSON.parse(JSON.stringify(packed)) as Broken;
  (brokenProposal.floorPlan.proposal.originalDocument.floors[0].sourceDrawingPack as Json).format = "v0";
  assert.equal(sanitizeStoredDesign(brokenProposal), null);

  // Reading one is not an error: the editor gets the plan as stored (without its source drawing), keeps working, and
  // the server refuses to save it.
  const read = storedToSnapshot(broken as unknown as StoredDesign);
  assert.ok(isPacked(read.floorPlan!.canonicalDocument));
  assert.doesNotThrow(() => snapshotToStored(read));
  assert.equal(sanitizeStoredDesign(snapshotToStored(read)), null);

  // A crafted pack can't make a save expand without bound: two documents sharing one long text of control
  // characters (each six characters of JSON) are refused quickly, against one budget for the design.
  const expanding = JSON.parse(JSON.stringify(packed)) as Broken;
  for (const document of [expanding.floorPlan.canonicalDocument, expanding.floorPlan.proposal.originalDocument]) {
    const pack = document.floors[0].sourceDrawingPack as Json;
    pack.texts = ["\u0001".repeat(16_000)];
    pack.marks = Array.from({ length: 1_000 }, (_, index) => [0, `mark-${index}`, 0, [0, 0, 1, 1]]);
    pack.runs = [[0, 1_000]];
    document.floors[0].annotations = [];
  }
  assert.ok(bytes(expanding) < 400 * 1024);
  const started = Date.now();
  assert.equal(sanitizeStoredDesign(expanding), null);
  assert.ok(Date.now() - started < 2_000, "Refused without building the expansion.");

  // The 4 MiB design limit is on the stored form: a traced plan past it unpacked fits once designs store it packed.
  const large = tracedDesign(7_000);
  assert.ok(bytes(plainStored(large)) > DESIGN_DOCUMENT_LIMITS.maxSerializedBytes, `${bytes(plainStored(large))} bytes`);
  assert.ok(bytes(packedStored(large)) < DESIGN_DOCUMENT_LIMITS.maxSerializedBytes / 4, `${bytes(packedStored(large))} bytes packed`);
  assert.equal(sanitizeStoredDesign(packedStored(large)) !== null, STORE_DESIGN_SOURCE_DRAWING_PACKED);
  // Read by a build that stores plans unpacked (after a rollback), that design opens as stored, not as an error.
  assert.equal(isPacked(storedToSnapshot(packedStored(large)).floorPlan!.canonicalDocument), !STORE_DESIGN_SOURCE_DRAWING_PACKED);

  // A share shows the same public plan from either form, and no source drawing.
  const shareable = tracedDesign(40, true);
  const fromPlain = projectSharedStoredDesign(plainStored(shareable));
  const fromPacked = projectSharedStoredDesign(packedStored(shareable));
  assert.ok(fromPlain?.floorPlan?.canonicalDocument && fromPacked);
  assert.equal(JSON.stringify(fromPacked), JSON.stringify(fromPlain));
  assert.ok(!JSON.stringify(fromPacked).includes("sourceDrawingPack"));
  assert.ok(!JSON.stringify(fromPacked).includes("source_drawing"));
  // And a share check refuses a pack wherever one would slip into a public snapshot.
  const leaked = JSON.parse(JSON.stringify(fromPacked)) as { floorPlan: { canonicalDocument: { floors: Json[] } } };
  leaked.floorPlan.canonicalDocument.floors[0].sourceDrawingPack = { format: "source-drawing-pack-v1" };
  assert.throws(() => assertSharedDesignSnapshotPublic(leaked));
  // A plan the share can't project (here, ids that aren't opaque) fails the same way from either form.
  const outcome = (stored: StoredDesign) => {
    try {
      return JSON.stringify(projectSharedStoredDesign(stored));
    } catch (cause) {
      return `throws ${cause instanceof Error ? cause.name : "?"}`;
    }
  };
  assert.equal(outcome(packed), outcome(plainStored(snapshot)));
}

function testEditorLoad() {
  const snapshot = tracedDesign();
  const packed = packedStored(snapshot);
  const loaded = normalizeLoadedCloudDesign({
    id: "design-1", title: "Traced flat", roomWidth: 4, roomDepth: 5, items: [], updatedAt: "2026-10-28T00:00:00.000Z",
    snapshot: JSON.parse(JSON.stringify(packed)),
  });
  assert.equal(JSON.stringify(loaded.snapshot.floorPlan?.canonicalDocument),
    JSON.stringify(storedToSnapshot(snapshotToStored(snapshot)).floorPlan?.canonicalDocument));
  assert.equal(isPacked(loaded.stored.floorPlan!.canonicalDocument), STORE_DESIGN_SOURCE_DRAWING_PACKED);
}

testConversions();
testServerBoundaries();
testEditorLoad();
console.log(
  "Design floor-plan storage: designs read packed plans as unpacked, store them as the switch says, check them on save, and share the same public plan."
);
