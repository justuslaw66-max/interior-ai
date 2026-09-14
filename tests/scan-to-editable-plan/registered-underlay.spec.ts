import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { authoredRegisteredUnderlayDocument, authoredSourcePoint } from "../../scripts/fixtures/scan-to-editable-plan/registered-underlay";
import { authoredReferenceImage } from "../../scripts/test-scan-plan-vector-underlay";
import { registeredImportUnderlay } from "../../lib/floor-plan-imports/registered-underlay";
import { canonicalFloorPlanToDesignSnapshot } from "../../lib/floor-plan-legacy-adapters";
import { snapshotToStored } from "../../lib/room-persistence";
import { vectorPdfPageContent } from "../../scripts/fixtures/scan-to-editable-plan/pdf-vector-inspection";
import { physicalDimensionLineMm } from "../../scripts/fixtures/scan-to-editable-plan/pdf-physical-scale";
import { observeRenderedScene } from "./rendered-scene-observer";
import { renderedUnderlay } from "./rendered-underlay-observer";

test("Registered source origin, skew and reflection match the actual Consumer image mesh and exports", async ({ page }, info) => {
  await observeRenderedScene(page);
  const document = authoredRegisteredUnderlayDocument(), jobId = "fixture-registration";
  const png = await sharp(await authoredReferenceImage()).resize(1000, 800, { fit: "fill" }).png().toBuffer();
  const underlay = registeredImportUnderlay({ document, jobId,
    sourceAsset: { id: "authored-source", sha256: "a".repeat(64), fileName: "private-registered.png", mimeType: "image/png" },
    renderedPages: [{ pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "affine-image" }] })!;
  underlay.visible = true;
  const initial = snapshotToStored(canonicalFloorPlanToDesignSnapshot(document, { underlay }).snapshot), key = "interior-ai:v1:livingroom-design";
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route(`**${underlay.assetUrl}`, (route) => route.fulfill({ contentType: "image/png", body: png }));
  await page.route(`**/api/floor-plan-imports/${jobId}`, (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ job: {
    id: jobId, sourceDeletionRequestedAt: null, sourceAsset: { sha256: "a".repeat(64), contentDeletedAt: null },
  } }) }));
  await page.addInitScript(({ initial, key }) => {
    if (window !== window.top) return;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  }, { initial, key });
  await page.goto("/design");
  await page.getByRole("button", { name: "Yes, it matches", exact: true }).click();
  await page.getByTestId("editor-view-2d").click();
  const checkMesh = async () => {
    await expect.poll(async () => (await renderedUnderlay(page, underlay.assetUrl))?.length).toBe(4);
    const vertices = (await renderedUnderlay(page, underlay.assetUrl))!;
    for (const { u, v, world } of vertices) {
      const expected = authoredSourcePoint(u * 1000, (1 - v) * 800);
      expect(Math.hypot(world[0] - expected.xMm / 1000, world[2] - expected.zMm / 1000)).toBeLessThan(0.000005);
    }
    return vertices;
  };
  const first = await checkMesh();
  await page.screenshot({ path: info.outputPath("registered-underlay-editor.png") });
  const panel = page.getByTestId("imported-wall-editor");
  await panel.locator("summary", { hasText: "Compare and export vector plan" }).click();
  await panel.getByRole("checkbox", { name: "Reference underlay", exact: true }).check();
  const pdfDownload = page.waitForEvent("download"); await panel.getByRole("button", { name: "PDF", exact: true }).click();
  const pdfPath = info.outputPath("registered-underlay.pdf"); await (await pdfDownload).saveAs(pdfPath);
  const content = vectorPdfPageContent(await PDFDocument.load(await readFile(pdfPath)));
  expect(content.match(/\bDo\b/g)).toHaveLength(1); expect(physicalDimensionLineMm(content, 9260)).toBeCloseTo(92.6, 2);
  const svgDownload = page.waitForEvent("download"); await panel.getByRole("button", { name: "SVG", exact: true }).click();
  const svgPath = info.outputPath("registered-underlay.svg"); await (await svgDownload).saveAs(svgPath);
  expect(await readFile(svgPath, "utf8")).toContain(`matrix(1 0 ${underlay.skewX} -1 0 0)`);
  await page.reload(); await page.getByTestId("editor-view-2d").click();
  const reloaded = await checkMesh();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  expect(saved.floorPlan.underlay.skewX).toBe(underlay.skewX); expect(saved.floorPlan.underlay.flipY).toBe(true);
  expect(saved.floorPlan.canonicalDocument).toEqual(document);
  await writeFile(info.outputPath("registered-mesh-evidence.json"), JSON.stringify({ underlay, first, reloaded }, null, 2));
  expect(errors).toEqual([]);
});
