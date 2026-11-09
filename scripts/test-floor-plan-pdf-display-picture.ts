import assert from "node:assert/strict";
import { MAX_DISPLAY_PIXELS, pdfDisplayScale, storePdfDisplayPicture } from "@/lib/floor-plan-imports/pdf-display-picture";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import { parseRenderedPages } from "@/lib/floor-plan-imports/validation";

// The review's sharper picture of a PDF page (9 Nov 2026): J's vector PDF looked blurry as "Original" at the review's
// zoom, because the review showed the import's 144 dpi reading picture. A 432 dpi picture is kept beside it, in the
// same frame, for people to look at only.

const A4 = { width: 595.28, height: 841.89 }; // points

function testScale() {
  assert.equal(pdfDisplayScale(A4, 2), 6, "an A4 page is drawn at 432 dpi");
  const a3 = { width: 841.89, height: 1190.55 };
  const scale = pdfDisplayScale(a3, 2);
  assert.ok(scale !== null && scale < 6 && a3.width * scale * a3.height * scale <= MAX_DISPLAY_PIXELS + 1, "an A3 sheet is drawn smaller, within the pixel cap");
  const a1 = { width: 1683.78, height: 2383.94 }; // its reading picture is already near the 16 MP cap
  assert.equal(pdfDisplayScale(a1, 2 * Math.sqrt(16_000_000 / (a1.width * 2 * a1.height * 2))), null, "no second picture when it wouldn't be much sharper");
}

async function testStore() {
  const rendered: Array<{ scale: number; width: number; height: number }> = [];
  let stored: { fileName: string; mimeType: string; jobId: string } | null = null;
  let scale = 1;
  const page = {
    getViewport: (options: { scale: number }) => { scale = options.scale; return { width: A4.width * scale, height: A4.height * scale }; },
    render: (options: { canvas: unknown }) => {
      const canvas = options.canvas as { width: number; height: number };
      rendered.push({ scale, width: canvas.width, height: canvas.height });
      return { promise: Promise.resolve() };
    },
  };
  const createCanvas = (width: number, height: number) => ({ width, height, getContext: () => ({}), toBuffer: () => new Uint8Array([137, 80]) });
  const context = { jobId: "job-1", store: { putDerivative: async (input: { fileName: string; mimeType: string; jobId: string }) => {
    stored = input; return "asset-display";
  } } } as unknown as FloorPlanAdapterContext;
  const key = await storePdfDisplayPicture(page, 2, 3, createCanvas, context);
  assert.equal(key, "asset-display");
  assert.deepEqual(rendered, [{ scale: 6, width: 3572, height: 5052 }], "drawn once, at 432 dpi");
  assert.deepEqual(stored, { jobId: "job-1", fileName: "page-3-display.png", mimeType: "image/png", bytes: new Uint8Array([137, 80]) });
  assert.equal(await storePdfDisplayPicture(page, 5, 1, createCanvas, context), undefined, "nothing kept when the reading picture is already sharp");
}

function testSchema() {
  const [page] = parseRenderedPages([{ pageNumber: 1, widthPx: 1190, heightPx: 1684, assetKey: "a", displayAssetKey: "b" }]);
  assert.equal(page.displayAssetKey, "b", "the display picture's key is kept with the page");
  assert.equal(parseRenderedPages([{ pageNumber: 1, widthPx: 1190, heightPx: 1684, assetKey: "a" }])[0].displayAssetKey, undefined,
    "and pages without one still read");
}

void (async () => {
  testScale();
  await testStore();
  testSchema();
  console.log("floor-plan pdf display picture: ok");
})();
