import assert from "node:assert/strict";
import sharp from "sharp";
import { recognizeLocalOcrOrientations, sourceTextEvidenceFromLocalOcr } from "@/lib/floor-plan-imports/local-ocr-rotation";
import { createCanvas } from "@napi-rs/canvas";
import {
  TesseractFloorPlanLocalOcrProvider,
  type FloorPlanLocalOcrProvider,
} from "@/lib/floor-plan-imports/local-ocr";
import {
  PdfRasterFloorPlanSourceAdapter,
} from "@/lib/floor-plan-imports/pdf-raster-adapter";
import type {
  FloorPlanSourceStore,
  StoredFloorPlanSource,
} from "@/lib/floor-plan-imports/source-adapter";

function testImage() {
  const canvas = createCanvas(800, 240);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "black";
  context.font = "64px sans-serif";
  context.fillText("BEDROOM", 40, 130);
  context.fillText("4200", 500, 130);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

function blankImage() {
  const canvas = createCanvas(160, 80);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return new Uint8Array(canvas.toBuffer("image/png"));
}

function source(bytes: Uint8Array): StoredFloorPlanSource {
  return {
    id: "ocr-source",
    fileName: "private-home.png",
    mimeType: "image/png",
    byteLength: bytes.byteLength,
    sha256: "a".repeat(64),
    bytes,
  };
}

function storeFor(bytes: Uint8Array): FloorPlanSourceStore {
  return {
    async putSource() {
      return source(bytes);
    },
    async readSource() {
      return source(bytes);
    },
    async putDerivative() {
      return "ocr-derivative";
    },
    async readDerivative(id) {
      return {
        id,
        fileName: "page.png",
        mimeType: "image/png",
        byteLength: bytes.byteLength,
        sha256: "b".repeat(64),
        bytes,
      };
    },
  };
}

function context(bytes: Uint8Array) {
  return {
    jobId: "local-ocr-test",
    store: storeFor(bytes),
    privacy: {
      trainingBenchmarkOptIn: false,
      trainingBenchmarkOptInAt: null,
      trainingBenchmarkConsentVersion: null,
      trainingBenchmarkRevokedAt: null,
      sourceRetentionExpiresAt: new Date("2030-01-31T00:00:00.000Z"),
      sourceDeletionRequestedAt: null,
    },
  };
}

async function testPackagedRuntime(rotated = false) {
  const bytes = rotated ? new Uint8Array(await sharp(Buffer.from(testImage())).rotate(90).png().toBuffer()) : testImage();
  const widthPx = rotated ? 240 : 800, heightPx = rotated ? 800 : 240;
  const provider = new TesseractFloorPlanLocalOcrProvider();
  const result = await provider.recognizePage(
    {
      pageNumber: 1,
      widthPx, heightPx,
      mimeType: "image/png",
      bytes,
    },
    {
      timeoutMs: 10_000,
      maxCandidates: 100,
      minSourceConfidence: 45,
    }
  );
  assert.equal(result.providerId, "tesseract-local-eng-v7");
  assert.ok(result.candidates.some((candidate) => /bedroom/i.test(candidate.text)));
  assert.ok(result.candidates.some((candidate) => /4200/.test(candidate.text)));
  if (rotated) {
    const number = result.candidates.find((candidate) => candidate.text === "4200")!;
    assert.ok(number, "The packaged local OCR must read a rotated printed number");
    assert.equal(number.rotationDegrees, 90);
    assert.ok(number.bbox.top > 400 && number.bbox.left > 60 && number.bbox.right < 210,
      "The number must be located at its actual vertical source pixels, not at the rotated worker coordinates");
  }
  assert.ok(
    result.candidates.every(
      (candidate) =>
        candidate.bbox.left >= 0 &&
        candidate.bbox.top >= 0 &&
        candidate.bbox.right <= widthPx &&
        candidate.bbox.bottom <= heightPx
    )
  );
}

async function testAdapterUsesConservativePrior() {
  const bytes = blankImage();
  const provider: FloorPlanLocalOcrProvider = {
    id: "fixture-local-ocr",
    async recognizePage() {
      return {
        providerId: "fixture-local-ocr",
        candidates: [
          {
            text: "BEDROOM",
            confidence: 99,
            bbox: { left: 30, top: 20, right: 100, bottom: 40 },
          },
          {
            text: "4200",
            confidence: 99,
            bbox: { left: 50, top: 50, right: 90, bottom: 65 },
          },
        ],
        elapsedMs: 4,
        truncated: false,
      };
    },
  };
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: provider });
  const rendered = [{ pageNumber: 1, widthPx: 160, heightPx: 80, assetKey: "page-1" }];
  const extracted = await adapter.extract(source(bytes), rendered, context(bytes));
  const envelope = extracted.candidate as {
    pages: Array<{
      text: Array<{ evidenceKind?: string }>;
      semantics: {
        roomLabels: Array<{ confidence: number; evidenceKind?: string }>;
        dimensionLabels: Array<{ confidence: number; evidenceKind?: string }>;
      };
    }>;
  };
  assert.ok(envelope.pages[0].text.every((item) => item.evidenceKind === "ocr"));
  assert.deepEqual(
    envelope.pages[0].semantics.roomLabels.map((label) => [
      label.confidence,
      label.evidenceKind,
    ]),
    [[0.72, "ocr"]],
    "OCR self-confidence must be replaced with the platform-owned conservative prior."
  );
  assert.deepEqual(
    envelope.pages[0].semantics.dimensionLabels.map((label) => [
      label.confidence,
      label.evidenceKind,
    ]),
    [[0.72, "ocr"]]
  );
  assert.equal(extracted.metrics?.externalVisionEnabled, false);
  const manifest = extracted.sourceManifest as {
    pages: Array<{ localOcr: { providerId: string; status: string } }>;
  };
  assert.deepEqual(manifest.pages[0].localOcr, {
    providerId: "fixture-local-ocr",
    elapsedMs: 4,
    truncated: false,
    attempted: true,
    candidateCount: 2,
    status: "completed",
  });
}

async function testPageBudgetAndTimeoutFallback() {
  const bytes = blankImage();
  let calls = 0;
  const provider: FloorPlanLocalOcrProvider = {
    id: "counting-local-ocr",
    async recognizePage(page) {
      calls += 1;
      if (page.pageNumber === 1) throw new Error("LOCAL_OCR_TIMEOUT");
      return {
        providerId: "counting-local-ocr",
        candidates: [],
        elapsedMs: 1,
        truncated: false,
      };
    },
  };
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: provider });
  const rendered = Array.from({ length: 9 }, (_, index) => ({
    pageNumber: index + 1,
    widthPx: 160,
    heightPx: 80,
    assetKey: `page-${index + 1}`,
  }));
  const extracted = await adapter.extract(source(bytes), rendered, context(bytes));
  assert.equal(calls, 8, "Local OCR must obey the bounded eight-page budget.");
  const manifest = extracted.sourceManifest as {
    pages: Array<{ localOcr: { attempted: boolean; status: string } }>;
  };
  assert.equal(manifest.pages[0].localOcr.status, "timed_out");
  assert.equal(manifest.pages[8].localOcr.attempted, false);
  const envelope = extracted.candidate as {
    pages: Array<{ semantics: { notes: string[] } }>;
  };
  assert.ok(
    envelope.pages[0].semantics.notes.some((note) =>
      note.includes("Confirm labels and dimensions manually")
    ),
    "A timeout must fall back to manual review instead of failing or inventing semantics."
  );
}

function testPositionedConversion() {
  const text = sourceTextEvidenceFromLocalOcr(3, {
    providerId: "fixture",
    candidates: [{
      text: "Kitchen",
      confidence: 55,
      bbox: { left: 10, top: 20, right: 70, bottom: 50 },
    }],
    elapsedMs: 1,
    truncated: false,
  });
  assert.deepEqual(text[0], {
    id: "p3-ocr1",
    pageNumber: 3,
    text: "Kitchen",
    center: { x: 40, y: 35 },
    widthPx: 60,
    heightPx: 30,
    evidenceKind: "ocr",
  });
}

async function testConflictingRotatedReadings() {
  let call = 0;
  const result = await recognizeLocalOcrOrientations({ pageNumber: 1, widthPx: 160, heightPx: 80,
    mimeType: "image/png", bytes: blankImage() }, 100, async () => {
    call++;
    return { truncated: false, candidates: call === 1 ? [] : call === 2
      ? [{ text: "0562", confidence: 80, bbox: { left: 10, top: 20, right: 50, bottom: 30 } }]
      : [{ text: "2950", confidence: 90, bbox: { left: 30, top: 130, right: 70, bottom: 140 } }] };
  });
  assert.equal(call, 3);
  assert.deepEqual(result.candidates.map((candidate) => candidate.bbox), [
    { left: 20, top: 30, right: 30, bottom: 70 }, { left: 20, top: 30, right: 30, bottom: 70 },
  ]);
  assert.ok(result.candidates.every((candidate) => candidate.reviewRequired));
  const bytes = blankImage();
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: {
    id: "conflicting-readings-test", recognizePage: async () => ({ ...result, providerId: "fixture", elapsedMs: 0 }),
  } });
  const extracted = await adapter.extract(source(bytes), [{ pageNumber: 1, widthPx: 160, heightPx: 80, assetKey: "page-1" }], context(bytes));
  assert.equal(extracted.metrics?.dimensionObservationCount, 0, "Conflicting guesses cannot supply automatic dimensions");
  const built = await adapter.buildTopology(await adapter.solveScale(extracted, context(bytes)), context(bytes));
  assert.ok(built.reviewIssues.some((issue) => issue.code === "source_text_conflict" && (issue.entityIds?.length ?? 0) === 2));
}

async function main() {
  await testPackagedRuntime();
  await testPackagedRuntime(true);
  await testConflictingRotatedReadings();
  testPositionedConversion();
  await testAdapterUsesConservativePrior();
  await testPageBudgetAndTimeoutFallback();
  console.log("Floor-plan local OCR tests passed.");
}

void main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
