import { test, expect, type Page } from "@playwright/test";
import { authoredApartment } from "../../scripts/fixtures/scan-to-editable-plan/apartment";
import { canonicalFloorPlanToDesignSnapshot } from "../../lib/floor-plan-legacy-adapters";
import { snapshotToStored, type StoredDesign } from "../../lib/room-persistence";
import { compileCanonicalFloorPlanRenderModel } from "../../lib/floor-plan-render-model";
import { readFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { physicalDimensionLineMm } from "../../scripts/fixtures/scan-to-editable-plan/pdf-physical-scale";
import { buildFloorPlanVectorDrawing } from "../../lib/floor-plan-vector-drawing";
import { exportFloorPlanVectorSvg } from "../../lib/floor-plan-vector-export";

const storageKey = "interior-ai:v1:livingroom-design";
async function saved(page: Page): Promise<StoredDesign> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), storageKey);
}
async function roomCount(page: Page, count: number) {
  await expect.poll(async () => (await saved(page))?.floorPlan?.canonicalDocument?.floors[0].rooms.length).toBe(count);
}

test("Consumer shared-wall merge, attached partition, opening edit, undo/redo, 3D and reload", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const snapshot = canonicalFloorPlanToDesignSnapshot(authoredApartment()).snapshot;
  await page.addInitScript(({ key, initial }) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, initial);
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  }, { key: storageKey, initial: JSON.stringify(snapshotToStored(snapshot)) });
  await page.goto("/design");
  await page.getByRole("button", { name: "Yes, it matches", exact: true }).click();
  await page.getByTestId("editor-view-2d").click();
  const panel = page.getByTestId("imported-wall-editor");
  await panel.getByTestId("request-edit-imported-walls").click();
  await panel.getByTestId("confirm-edit-local-floor-plan").click();
  await panel.getByLabel("Wall", { exact: true }).selectOption("shared");
  await panel.locator("summary", { hasText: "Remove selected wall" }).click();
  await panel.getByLabel("Keep name and finishes from").selectOption("living");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Remove proposed wall", exact: true }).click();
  await roomCount(page, 1);
  expect((await saved(page)).floorPlan?.canonicalDocument?.floors[0].openings.map(({ id }) => id)).toEqual(["window"]);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await roomCount(page, 2);
  expect((await saved(page)).floorPlan?.canonicalDocument?.floors[0].openings.map(({ id }) => id)).toEqual(["door", "window"]);
  await page.getByRole("button", { name: /^Redo/ }).click();
  await roomCount(page, 1);
  await panel.locator("summary", { hasText: "Add a wall" }).click();
  for (const [label, value] of [["Start X (mm)", "3000"], ["Start Z (mm)", "0"], ["End X (mm)", "3000"], ["End Z (mm)", "6000"]]) {
    await panel.getByLabel(label, { exact: true }).fill(value);
  }
  await panel.getByLabel("New room name if divided").fill("Study");
  await panel.getByRole("button", { name: "Add proposed wall", exact: true }).click();
  await roomCount(page, 2);
  expect((await saved(page)).floorPlan?.canonicalDocument?.floors[0].walls).toHaveLength(9);
  await panel.getByLabel("Wall", { exact: true }).selectOption("north-east");
  await panel.locator("summary", { hasText: "Doors and windows" }).click();
  await panel.getByLabel("Width (mm)", { exact: true }).fill("1700");
  await panel.getByRole("button", { name: "Apply opening changes", exact: true }).click();
  await expect.poll(async () => (await saved(page)).floorPlan?.canonicalDocument?.floors[0].openings[0].widthMm).toBe(1700);
  const accepted = (await saved(page)).floorPlan?.canonicalDocument;
  expect(accepted).toBeTruthy();
  const geometry = compileCanonicalFloorPlanRenderModel(accepted!);
  await expect(page.getByText("Window needs wall repair", { exact: true })).toHaveCount(0);
  await panel.locator("summary", { hasText: "Compare and export vector plan" }).click();
  const pdfDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "PDF", exact: true }).click();
  const pdfPath = testInfo.outputPath("consumer-proposed.pdf");
  await (await pdfDownload).saveAs(pdfPath);
  const pdf = await PDFDocument.load(await readFile(pdfPath));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPage(0).getWidth() / (72 / 25.4)).toBeCloseTo(297, 8);
  const streams = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFRawStream ? [object] : []);
  expect(streams.some((stream) => stream.dict.get(PDFName.of("Subtype"))?.toString() === "/Image")).toBe(false);
  const content = streams.map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString()).join("\n");
  expect(physicalDimensionLineMm(content, 9260)).toBeCloseTo(92.6, 2);
  const svgDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "SVG", exact: true }).click();
  const svgPath = testInfo.outputPath("consumer-proposed.svg");
  await (await svgDownload).saveAs(svgPath);
  const expectedDrawing = buildFloorPlanVectorDrawing(accepted!, { floorId: "apartment", dimensions: true, labels: true, fixtures: true });
  expect(await readFile(svgPath, "utf8")).toBe(exportFloorPlanVectorSvg(expectedDrawing, { paper: "A4", orientation: "landscape", scale: 100 }));
  await page.screenshot({ path: testInfo.outputPath("proposed-2d.png") });
  await page.getByTestId("editor-view-3d").click();
  await expect(page.locator("canvas").first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("proposed-3d.png") });
  expect((await saved(page)).floorPlan?.canonicalDocument).toEqual(accepted);
  await page.reload();
  await expect(page.getByTestId("editor-view-2d")).toBeVisible();
  const restored = (await saved(page)).floorPlan?.canonicalDocument;
  expect(restored).toEqual(accepted);
  expect(compileCanonicalFloorPlanRenderModel(restored!).geometryHash).toEqual(geometry.geometryHash);
  expect((await saved(page)).floorPlan?.proposal?.originalDocument.revisionId).toBe("authored-reference");
  expect(errors).toEqual([]);
});
