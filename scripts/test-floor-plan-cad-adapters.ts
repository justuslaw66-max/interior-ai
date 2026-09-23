import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileCandidateFloorPlanDocumentV2, hasExpectedFloorPlanSignature, normalizeFloorPlanMimeType } from "@/lib/floor-plan-imports/validation";
import { createDefaultFloorPlanSourceAdapterRegistry } from "@/lib/floor-plan-imports/default-services";
import { DxfFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/dxf-source-adapter";
import { IfcFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/ifc-source-adapter";
import {
  DwgFloorPlanSourceAdapter,
  type DwgConversionProvider,
} from "@/lib/floor-plan-imports/dwg-source-adapter";
import { parseAsciiDxf } from "@/lib/floor-plan-imports/dxf-parser";
import { parseIfcStep } from "@/lib/floor-plan-imports/ifc-parser";
import { CAD_SOURCE_LIMITS, CadSourceLimitError } from "@/lib/floor-plan-imports/cad-types";
import type {
  FloorPlanAdapterContext,
  FloorPlanSourceAdapter,
  FloorPlanSourceStore,
  StoredFloorPlanSource,
} from "@/lib/floor-plan-imports/source-adapter";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  computeFloorPlanPublicationChecks,
  hasAuthoritativeCadCoordinateEvidence,
  stampFloorPlanApproval,
} from "@/lib/floor-plan-imports/publication";
import type { FloorPlanSourceObservationManifest } from "@/lib/floor-plan-imports/source-observation-manifest";

const fixtureDirectory = path.join(process.cwd(), "scripts/fixtures/floor-plan-cad");
const dxfBytes = new Uint8Array(fs.readFileSync(path.join(fixtureDirectory, "room-mm.dxf")));
const ifcBytes = new Uint8Array(fs.readFileSync(path.join(fixtureDirectory, "room-mm.ifc")));
const sourceHash = "a".repeat(64);

function source(
  id: string,
  fileName: string,
  mimeType: string,
  bytes: Uint8Array
): StoredFloorPlanSource {
  return { id, fileName, mimeType, bytes, byteLength: bytes.byteLength, sha256: sourceHash };
}

const derivatives = new Map<string, { mimeType: string; bytes: Uint8Array }>();
const store: FloorPlanSourceStore = {
  async putSource(input) {
    return source("stored", input.fileName, input.mimeType, input.bytes);
  },
  async readSource() {
    return null;
  },
  async putDerivative(input) {
    const id = `derivative-${derivatives.size + 1}`;
    derivatives.set(id, { mimeType: input.mimeType, bytes: input.bytes });
    return id;
  },
};

const context: FloorPlanAdapterContext = {
  jobId: "cad-test-job",
  store,
  privacy: {
    trainingBenchmarkOptIn: false,
    trainingBenchmarkOptInAt: null,
    trainingBenchmarkConsentVersion: null,
    trainingBenchmarkRevokedAt: null,
    sourceRetentionExpiresAt: new Date("2030-01-01T00:00:00.000Z"),
    sourceDeletionRequestedAt: null,
  },
};

async function runAdapter(adapter: FloorPlanSourceAdapter, input: StoredFloorPlanSource) {
  const pages = await adapter.render(input, context);
  assert.equal(pages.length, 1);
  assert.equal(derivatives.get(pages[0].assetKey)?.mimeType, "image/png");
  assert.deepEqual(
    [...(derivatives.get(pages[0].assetKey)?.bytes.subarray(0, 8) ?? [])],
    [137, 80, 78, 71, 13, 10, 26, 10],
    "CAD review derivatives should be real deterministic PNG previews"
  );
  const extracted = await adapter.extract(input, pages, context);
  const scaled = await adapter.solveScale(extracted, context);
  const built = await adapter.buildTopology(scaled, context);
  const validated = await adapter.validate(built, context);
  const { document } = compileCandidateFloorPlanDocumentV2(validated.candidate);
  return { document, validated, pages };
}

async function main() {
  const dxf = parseAsciiDxf(dxfBytes);
  assert.equal(dxf.format, "dxf");
  assert.deepEqual(dxf.units, {
    name: "millimetre",
    millimetresPerUnit: 1,
    basis: "source_declared",
    sourceEntityId: "$INSUNITS",
  });
  assert.equal(dxf.paths.length, 1);
  assert.equal(dxf.paths[0].role, "wall");
  assert.deepEqual(dxf.paths[0].points[2], { x: 4000, y: 3000 });
  assert.equal(dxf.texts[0].text, "Living Room");

  const dxfResult = await runAdapter(
    new DxfFloorPlanSourceAdapter(),
    source("dxf-source", "room-mm.dxf", "application/dxf", dxfBytes)
  );
  assert.equal(dxfResult.document.floors[0].walls.length, 4);
  assert.equal(
    dxfResult.document.floors[0].annotations.length,
    0,
    "Unreviewed CAD text must remain private evidence instead of becoming a public annotation"
  );
  assert.equal(
    (dxfResult.validated.sourceManifest as { cad: { texts: Array<{ text: string }> } }).cad
      .texts[0].text,
    "Living Room"
  );
  assert.equal(
    dxfResult.document.floors[0].walls[0].provenance.evidence[0].basis,
    "cad"
  );
  assert.equal(dxfResult.document.verification.tier, "needs_review");
  assert.ok(
    dxfResult.validated.reviewIssues.some(
      (issue) => issue.code === "cad_room_opening_topology_unconfirmed" && issue.severity === "critical"
    )
  );

  const ifc = parseIfcStep(ifcBytes);
  assert.equal(ifc.format, "ifc");
  assert.equal(ifc.units.millimetresPerUnit, 1);
  assert.equal(ifc.paths.length, 1);
  assert.deepEqual(ifc.paths[0].points[0], { x: 1000, y: 2000 });
  assert.equal(ifc.texts[0].text, "Living Room");
  assert.deepEqual(ifc.texts[0].point, { x: 1000, y: 2000 });

  const ifcResult = await runAdapter(
    new IfcFloorPlanSourceAdapter(),
    source("ifc-source", "room-mm.ifc", "application/ifc", ifcBytes)
  );
  assert.equal(ifcResult.document.floors[0].walls.length, 4);
  assert.deepEqual(
    [
      ifcResult.document.floors[0].vertices[0].xMm,
      ifcResult.document.floors[0].vertices[0].zMm,
    ],
    [0, 0],
    "IFC world placement should be retained in evidence but normalized for canonical editing"
  );

  assert.equal(normalizeFloorPlanMimeType("home.dxf", "application/octet-stream"), "application/dxf");
  assert.equal(normalizeFloorPlanMimeType("home.ifc", ""), "application/ifc");
  assert.equal(normalizeFloorPlanMimeType("home.dwg", ""), "application/dwg");
  assert.equal(hasExpectedFloorPlanSignature(dxfBytes, "application/dxf"), true);
  assert.equal(hasExpectedFloorPlanSignature(ifcBytes, "application/ifc"), true);
  assert.equal(
    hasExpectedFloorPlanSignature(new TextEncoder().encode("AC1032payload"), "application/dwg"),
    true
  );
  assert.equal(
    hasExpectedFloorPlanSignature(new TextEncoder().encode("AutoCAD Binary DXF"), "application/dxf"),
    false
  );

  const registry = createDefaultFloorPlanSourceAdapterRegistry();
  assert.equal(
    registry.resolve(source("route-dxf", "plan.dxf", "application/octet-stream", dxfBytes)).id,
    "ascii-dxf-deterministic"
  );
  assert.equal(
    registry.resolve(source("route-ifc", "plan.ifc", "application/octet-stream", ifcBytes)).id,
    "ifc-step-deterministic"
  );
  assert.equal(
    registry.resolve(source("route-dwg", "plan.dwg", "application/octet-stream", new Uint8Array(8))).id,
    "dwg-conversion-unavailable"
  );

  const unavailableDwg = await runAdapter(
    new DwgFloorPlanSourceAdapter(),
    source("dwg-source", "plan.dwg", "application/dwg", new TextEncoder().encode("AC1032payload"))
  );
  assert.equal(unavailableDwg.document.floors[0].walls.length, 0);
  assert.ok(
    unavailableDwg.validated.reviewIssues.some(
      (issue) => issue.code === "cad_source_unreadable" && /conversion provider/i.test(issue.message)
    ),
    "DWG without an injected provider must fail closed into review"
  );

  let conversionCalls = 0;
  const provider: DwgConversionProvider = {
    id: "fixture-converter",
    version: "2.4.1",
    async convert() {
      conversionCalls += 1;
      return {
        format: "dxf",
        fileName: "converted.dxf",
        mimeType: "application/dxf",
        bytes: dxfBytes,
      };
    },
  };
  const convertedDwg = await runAdapter(
    new DwgFloorPlanSourceAdapter(provider),
    source("converted-dwg-source", "plan.dwg", "application/dwg", new TextEncoder().encode("AC1032payload"))
  );
  assert.equal(conversionCalls, 1, "render and extraction should share one bounded conversion result");
  assert.equal(convertedDwg.document.floors[0].walls.length, 4);
  const conversion = (convertedDwg.validated.sourceManifest as { cad: { conversion?: unknown } }).cad.conversion;
  assert.deepEqual(conversion, {
    providerId: "fixture-converter",
    providerVersion: "2.4.1",
    sourceFormat: "dwg",
    outputFormat: "dxf",
  });

  const crossingDxf = new TextEncoder().encode(
    "0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n" +
      "0\nSECTION\n2\nENTITIES\n" +
      "0\nLINE\n8\nA-WALL\n10\n0\n20\n0\n11\n1000\n21\n1000\n" +
      "0\nLINE\n8\nA-WALL\n10\n0\n20\n1000\n11\n1000\n21\n0\n" +
      "0\nENDSEC\n0\nEOF\n"
  );
  const crossing = await runAdapter(
    new DxfFloorPlanSourceAdapter(),
    source("crossing-dxf", "crossing.dxf", "application/dxf", crossingDxf)
  );
  assert.equal(
    crossing.document.floors[0].walls.length,
    0,
    "invalid crossing CAD paths must be demoted instead of persisting a broken candidate"
  );
  assert.ok(
    crossing.validated.reviewIssues.some(
      (issue) => issue.code === "cad_canonical_geometry_invalid" && issue.severity === "critical"
    )
  );

  const entity = "0\nPOINT\n8\nNOT-A-WALL\n10\n0\n20\n0\n";
  const oversizedEntitySource = new TextEncoder().encode(
    `0\nSECTION\n2\nENTITIES\n${entity.repeat(CAD_SOURCE_LIMITS.maxEntities + 1)}0\nENDSEC\n0\nEOF\n`
  );
  assert.throws(
    () => parseAsciiDxf(oversizedEntitySource),
    (cause: unknown) => cause instanceof CadSourceLimitError && /entity-count/.test(cause.message),
    "CAD entity limits must stop parsing before unbounded topology work"
  );

  const canonical = dxfResult.document as FloorPlanDocumentV2;
  assert.equal(canonical.sources[0].kind, "cad");
  assert.equal(canonical.floors[0].calibrations[0].rmsErrorPx, 0);
  assert.ok(
    canonical.floors[0].walls.every((wall) =>
      wall.provenance.evidence.some(
        (evidence) =>
          evidence.basis === "cad" &&
          evidence.calibrationId === "cad-preview-registration-1" &&
          evidence.sourceAnchors?.map((anchor) => anchor.role).join(",") ===
            "start,end"
      )
    ),
    "Promoted CAD walls must retain exact registered preview anchors"
  );

  const reviewedCad = structuredClone(canonical);
  const reviewedFloor = reviewedCad.floors[0];
  const roomProvenance = structuredClone(reviewedFloor.walls[0].provenance);
  roomProvenance.evidence = roomProvenance.evidence.map((evidence) => ({
    sourceId: evidence.sourceId,
    basis: evidence.basis,
    confidence: evidence.confidence,
    extractorVersion: evidence.extractorVersion,
  }));
  reviewedFloor.rooms = [{
    id: "cad-room-1",
    name: "Living Room",
    roomType: "living",
    wallLoops: [{
      kind: "outer",
      walls: reviewedFloor.walls.map((wall) => ({
        wallId: wall.id,
        direction: "forward" as const,
      })),
    }],
    provenance: roomProvenance,
  }];
  reviewedFloor.walls = reviewedFloor.walls.map((wall) => ({
    ...wall,
    adjacentRoomIds: ["cad-room-1"],
  }));
  const hostEvidence = reviewedFloor.walls[0].provenance.evidence[0];
  const wallStart = hostEvidence.sourceAnchors?.find((anchor) => anchor.role === "start");
  const wallEnd = hostEvidence.sourceAnchors?.find((anchor) => anchor.role === "end");
  assert.ok(wallStart && wallEnd && hostEvidence.cropPx);
  const interpolate = (ratio: number) => ({
    x: wallStart.sourcePx.x + (wallEnd.sourcePx.x - wallStart.sourcePx.x) * ratio,
    y: wallStart.sourcePx.y + (wallEnd.sourcePx.y - wallStart.sourcePx.y) * ratio,
  });
  reviewedFloor.openings = [{
    id: "cad-entry-door",
    wallId: reviewedFloor.walls[0].id,
    kind: "door",
    operation: "swing",
    offsetMm: 1000,
    widthMm: 1000,
    heightMm: 2100,
    sillHeightMm: 0,
    hinge: "unknown",
    handing: "unknown",
    provenance: {
      ...roomProvenance,
      evidence: [{
        ...hostEvidence,
        sourceAnchors: [
          { role: "start", sourcePx: interpolate(0.25) },
          { role: "end", sourcePx: interpolate(0.5) },
        ],
      }],
    },
  }];
  const approvedCad = stampFloorPlanApproval({
    document: reviewedCad,
    tier: "source_verified",
    reviewerId: "admin@example.com",
    reviewedAt: "2030-01-01T00:00:00.000Z",
    note: "Compared against the authoritative declared-unit CAD source.",
  });
  const preview = dxfResult.pages[0];
  const observedEntityAnchors = (
    entity: FloorPlanDocumentV2["floors"][number]["walls"][number] |
      FloorPlanDocumentV2["floors"][number]["openings"][number]
  ) => {
    const anchors = entity.provenance.evidence
      .find((entry) => entry.sourceId === "dxf-source")
      ?.sourceAnchors;
    assert.ok(anchors);
    return anchors.map((anchor) => ({
      role: anchor.role,
      xPx: anchor.sourcePx.x,
      yPx: anchor.sourcePx.y,
    }));
  };
  const cadObservationManifest: FloorPlanSourceObservationManifest = {
    schemaVersion: 1,
    source: { assetId: "dxf-source", sha256: sourceHash, mimeType: "application/dxf" },
    candidateVersion: 1,
    recordedByReviewerId: "admin@example.com",
    recordedAt: "2030-01-01T00:00:00.000Z",
    rightsEvidence: {
      status: "permission_confirmed",
      basis: "The CAD owner gave written permission to publish derived floor-plan geometry.",
      evidenceReference: "cad-owner-permission-1",
      permitsDerivedFloorPlanPublication: true,
      sourceAssetRedistributionAllowed: false,
      expiresAt: null,
    },
    reviewerNotes: "Declared millimetre CAD reviewed against its deterministic preview.",
    observations: approvedCad.floors.flatMap((floor) => [
      ...floor.walls.map((entity) => ({
        id: `observation-${entity.id}`, kind: "wall" as const, floorId: floor.id,
        canonicalEntityId: entity.id, pageNumber: 1,
        cropPx: { xPx: 0, yPx: 0, widthPx: preview.widthPx, heightPx: preview.heightPx },
        anchorsPx: observedEntityAnchors(entity),
      })),
      ...floor.openings.map((entity) => ({
        id: `observation-${entity.id}`, kind: "opening" as const, floorId: floor.id,
        canonicalEntityId: entity.id, pageNumber: 1,
        cropPx: { xPx: 0, yPx: 0, widthPx: preview.widthPx, heightPx: preview.heightPx },
        anchorsPx: observedEntityAnchors(entity),
      })),
      ...floor.structures.map((entity) => ({
        id: `observation-${entity.id}`, kind: "structure" as const, floorId: floor.id,
        canonicalEntityId: entity.id, pageNumber: 1,
        cropPx: { xPx: 0, yPx: 0, widthPx: preview.widthPx, heightPx: preview.heightPx },
        anchorsPx: [{ role: "center" as const, xPx: 1, yPx: 1 }],
      })),
      ...floor.rooms.map((entity) => ({
        id: `observation-${entity.id}`, kind: "label" as const, floorId: floor.id,
        canonicalEntityId: entity.id, pageNumber: 1, observedText: entity.name,
        cropPx: { xPx: 0, yPx: 0, widthPx: preview.widthPx, heightPx: preview.heightPx },
        anchorsPx: [{ role: "label" as const, xPx: 1, yPx: 1 }],
      })),
    ]),
  };
  const cadPublication = computeFloorPlanPublicationChecks({
    document: approvedCad,
    observationManifest: cadObservationManifest,
    sourceAssetId: "dxf-source",
    sourceSha256: sourceHash,
    sourceMimeType: "application/dxf",
    renderedPages: dxfResult.pages,
  });
  assert.equal(cadPublication.checks.dimensionsExact, true);
  assert.equal(cadPublication.dimensionEvidenceMode, "authoritative_cad_units");
  assert.equal(cadPublication.checks.sourceOverlayAnchorsWithinOnePixel, true);
  assert.equal(cadPublication.checks.sourceEvidenceWithinBounds, true);
  const noDimensionPdf = structuredClone(approvedCad);
  noDimensionPdf.sources[0] = {
    ...noDimensionPdf.sources[0],
    kind: "pdf",
    mimeType: "application/pdf",
  };
  assert.equal(
    hasAuthoritativeCadCoordinateEvidence({
      document: noDimensionPdf,
      sourceAssetId: "dxf-source",
    }),
    false,
    "An empty PDF dimension inventory must not borrow the CAD-only exception"
  );

  const consumerAssetRoute = fs.readFileSync(
    path.join(
      process.cwd(),
      "app/api/floor-plan-imports/[id]/assets/[assetId]/route.ts"
    ),
    "utf8"
  );
  assert.match(consumerAssetRoute, /job:\s*\{\s*userId:\s*session\.user\.id\s*\}/);
  assert.match(consumerAssetRoute, /id:\s*assetId,[\s\S]*?jobId:\s*id/);
  assert.match(
    consumerAssetRoute,
    /CONSUMER_PREVIEW_MIME_TYPES\.has\(authorizedAsset\.mimeType\)/
  );
  assert.match(
    consumerAssetRoute,
    /new PrismaFloorPlanSourceStore\(\)\.readDerivative\(assetId\)/,
    "authorized previews must use the private store's byte-length and SHA-256 verified read"
  );
  assert.ok(
    consumerAssetRoute.indexOf("floorPlanDerivedAsset.findFirst") <
      consumerAssetRoute.indexOf(".readDerivative(assetId)"),
    "the owning user and job must be authorized before private object storage is read"
  );
  assert.doesNotMatch(consumerAssetRoute, /externalUrl/);
  assert.doesNotMatch(consumerAssetRoute, /\bfetch\s*\(/);
  assert.doesNotMatch(
    consumerAssetRoute,
    /NextResponse\.redirect/,
    "consumer CAD previews must never expose object storage URLs"
  );

  const assistant = [
    "components/editor/FloorPlanImportAssistant.tsx",
    "components/editor/floor-plan-import-review/FloorPlanSourceReviewCanvas.tsx",
  ]
    .map((relative) =>
      fs.readFileSync(path.join(process.cwd(), relative), "utf8")
    )
    .join("\n");
  assert.match(assistant, /Deterministic CAD linework preview/);
  assert.match(
    assistant,
    /\/api\/floor-plan-imports\/\$\{encodeURIComponent\(jobId\)\}\/assets/
  );
  assert.match(assistant, /\/\$\{encodeURIComponent\(page\.assetKey\)\}/);

  const worker = fs.readFileSync(
    path.join(process.cwd(), "lib/floor-plan-imports/worker.ts"),
    "utf8"
  );
  assert.match(worker, /adapters\?: FloorPlanSourceAdapterRegistry/);
  assert.match(worker, /adapters: input\.adapters \?\? createDefaultFloorPlanSourceAdapterRegistry\(\)/);
  assert.match(worker, /adapters: input\.adapters/);
  console.log("Floor-plan CAD adapter checks passed.");
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
