import { observeRenderedScene } from "./rendered-scene-observer";
import { exerciseOpening3D } from "./opening-3d-journey";
import { exerciseEnclosedRoom } from "./enclosed-room-journey";
import { exerciseWallJoins } from "./wall-join-journey";
import { exerciseOpeningGestures } from "./opening-gesture-journey";
import { exerciseWallGestures } from "./wall-gesture-journey";
import { test, expect, type Page } from "@playwright/test";
import { authoredApartment } from "../../scripts/fixtures/scan-to-editable-plan/apartment";
import { canonicalFloorPlanToDesignSnapshot } from "../../lib/floor-plan-legacy-adapters";
import { snapshotToStored, type StoredDesign } from "../../lib/room-persistence";
import { compileCanonicalFloorPlanRenderModel } from "../../lib/floor-plan-render-model";
import { readFile, writeFile } from "node:fs/promises";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { physicalDimensionLineMm } from "../../scripts/fixtures/scan-to-editable-plan/pdf-physical-scale";
import { buildFloorPlanVectorDrawing } from "../../lib/floor-plan-vector-drawing";
import { exportFloorPlanVectorSvg } from "../../lib/floor-plan-vector-export";
import { vectorExportFontBytes, vectorPdfPageContent } from "../../scripts/fixtures/scan-to-editable-plan/pdf-vector-inspection";

const storageKey = "interior-ai:v1:livingroom-design";
async function saved(page: Page): Promise<StoredDesign> {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "null"), storageKey);
}
async function roomCount(page: Page, count: number) {
  await expect.poll(async () => (await saved(page))?.floorPlan?.canonicalDocument?.floors[0].rooms.length).toBe(count);
}

test("Consumer shared-wall merge, attached partition, opening edit, undo/redo, 3D and reload", async ({ page }, testInfo) => {
  await observeRenderedScene(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (entry) => { if (entry.type() === "error" && /same key|Each child in a list/.test(entry.text())) errors.push(entry.text()); });
  const snapshot = canonicalFloorPlanToDesignSnapshot(authoredApartment()).snapshot;
  snapshot.rooms.find(({ id }) => id === "bedroom")!.layoutVersions = [{ id: "source-layout", name: "Desk layout", source: "manual", timestamp: 1,
    items: [{ instanceId: "saved-desk", productId: "authored-desk", variantId: "default", position: [0, 0, -0.5] }], zones: [], summary: { itemCount: 1, zoneCount: 0 } }];
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
  const mergedGeometry = (await saved(page)).floorPlan?.canonicalDocument;
  await panel.locator("summary", { hasText: "Recover a room layout" }).click();
  await panel.getByRole("button", { name: "Recover saved layout", exact: true }).click();
  const layoutCount = async () => (await saved(page)).rooms?.find(({ id }) => id === "living")?.layoutVersions?.length;
  await expect.poll(layoutCount).toBe(1);
  expect((await saved(page)).floorPlan?.canonicalDocument).toEqual(mergedGeometry);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(layoutCount).toBe(0);
  await roomCount(page, 1);
  await page.getByRole("button", { name: /^Redo/ }).click();
  await expect.poll(layoutCount).toBe(1);
  await exerciseEnclosedRoom(page, () => saved(page), testInfo);
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
  const existingWalls = (await saved(page)).floorPlan!.canonicalDocument!.floors[0].walls.map(({ id }) => id);
  for (const [label, value] of [["Start X (mm)", "6000"], ["Start Z (mm)", "1000"], ["End X (mm)", "7500"], ["End Z (mm)", "2500"]]) {
    await panel.getByLabel(label, { exact: true }).fill(value);
  }
  await panel.getByRole("button", { name: "Add proposed wall", exact: true }).click();
  await expect.poll(async () => (await saved(page)).floorPlan?.canonicalDocument?.floors[0].walls.length).toBe(10);
  const diagonalId = (await saved(page)).floorPlan!.canonicalDocument!.floors[0].walls.find(({ id }) => !existingWalls.includes(id))!.id;
  await panel.getByLabel("Wall", { exact: true }).selectOption(diagonalId);
  await exerciseWallJoins(page, diagonalId, () => saved(page), testInfo);
  await panel.locator("summary", { hasText: "Wall length and height" }).click();
  await panel.getByLabel("Requested length (mm)", { exact: true }).fill("2500");
  await panel.getByRole("button", { name: "Apply wall length", exact: true }).click();
  await panel.getByLabel("Move X (mm)", { exact: true }).fill("100");
  await panel.getByLabel("Move Z (mm)", { exact: true }).fill("200");
  await panel.getByRole("button", { name: "Move wall", exact: true }).click();
  await panel.getByLabel("Wall height (mm)", { exact: true }).fill("1100");
  await panel.getByLabel("Wall base above floor (mm)", { exact: true }).fill("200");
  // macOS WebKit uses Option-Tab for button navigation (same path as the command-bar suite).
  await panel.getByLabel("Wall base above floor (mm)", { exact: true }).press(testInfo.project.name === "webkit" ? "Alt+Tab" : "Tab");
  await expect(panel.getByRole("button", { name: "Apply wall height", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel.getByRole("button", { name: "Apply wall height", exact: true })).toBeFocused();
  await expect.poll(async () => (await saved(page)).floorPlan?.canonicalDocument?.floors[0].walls.find(({ id }) => id === diagonalId)?.heightMm).toBe(1100);
  await exerciseWallGestures(page, diagonalId, () => saved(page), testInfo);
  await panel.locator("summary", { hasText: "Doors and windows" }).click();
  await panel.getByRole("combobox", { name: "Type", exact: true }).selectOption("window");
  await panel.getByRole("combobox", { name: "Operation", exact: true }).selectOption("fixed");
  for (const [label, value] of [["Position from wall start (mm)", "501"], ["Width (mm)", "601"], ["Height (mm)", "500"], ["Sill (mm)", "500"]]) {
    await panel.getByLabel(label, { exact: true }).fill(value);
  }
  await panel.getByRole("combobox", { name: "Hinge", exact: true }).selectOption("none");
  await panel.getByRole("combobox", { name: "Swing side", exact: true }).selectOption("none");
  await panel.getByRole("button", { name: "Add opening", exact: true }).click();
  await expect.poll(async () => (await saved(page)).floorPlan?.canonicalDocument?.floors[0].openings.length).toBe(2);
  await exerciseOpeningGestures(page, diagonalId, () => saved(page), testInfo);
  await exerciseOpening3D(page, diagonalId, () => saved(page), testInfo);
  const accepted = (await saved(page)).floorPlan?.canonicalDocument;
  expect(accepted).toBeTruthy();
  const geometry = compileCanonicalFloorPlanRenderModel(accepted!);
  const diagonal = geometry.floors[0].walls.find(({ id }) => id === diagonalId)!;
  expect(diagonal.centerlineSegments[0].start).toMatchObject({ xMm: 6100, zMm: 1200 });
  expect(diagonal.centerlineSegments[0].end).toMatchObject({ xMm: 7868, zMm: 2968 });
  expect(Math.min(...diagonal.solids.map((solid) => solid.bottomMm))).toBe(200);
  expect(Math.max(...diagonal.solids.map((solid) => solid.topMm))).toBe(1300);
  await writeFile(testInfo.outputPath("consumer-proposed.json"), JSON.stringify(accepted, null, 2));
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
  const content = vectorPdfPageContent(pdf);
  expect(physicalDimensionLineMm(content, 9260)).toBeCloseTo(92.6, 2);
  const svgDownload = page.waitForEvent("download");
  await panel.getByRole("button", { name: "SVG", exact: true }).click();
  const svgPath = testInfo.outputPath("consumer-proposed.svg");
  await (await svgDownload).saveAs(svgPath);
  const expectedDrawing = buildFloorPlanVectorDrawing(accepted!, { floorId: "apartment", dimensions: true, labels: true, fixtures: true });
  expect(await readFile(svgPath, "utf8")).toBe(await exportFloorPlanVectorSvg(expectedDrawing, { paper: "A4", orientation: "landscape", scale: 100 }, { fontBytes: await vectorExportFontBytes() }));
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
  expect((await saved(page)).rooms?.find(({ id }) => id === "living")?.layoutVersions?.[0].id).toBe("recovered:bedroom:source-layout");
  expect(errors).toEqual([]);
});
