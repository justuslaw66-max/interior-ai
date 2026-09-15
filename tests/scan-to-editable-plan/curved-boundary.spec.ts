import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { curvedApartment } from "../../scripts/fixtures/scan-to-editable-plan/curved-apartment";
import { canonicalFloorPlanToDesignSnapshot } from "../../lib/floor-plan-legacy-adapters";
import { snapshotToStored } from "../../lib/room-persistence";

test("Consumer partition addition and joining visibly preserve unsupported curved boundaries", async ({ page }, info) => {
  const key = "interior-ai:v1:livingroom-design";
  const initial = snapshotToStored(canonicalFloorPlanToDesignSnapshot(curvedApartment()).snapshot);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(({ key, initial }) => {
    if (window !== window.top) return;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  }, { key, initial });
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).floorPlan, key);
  await page.goto("/design");
  await page.getByRole("button", { name: "Yes, it matches", exact: true }).click();
  await page.getByTestId("editor-view-2d").click();
  const panel = page.getByTestId("imported-wall-editor");
  await panel.getByTestId("request-edit-imported-walls").click();
  await panel.getByTestId("confirm-edit-local-floor-plan").click();
  const before = await saved();
  await panel.locator("summary", { hasText: "Add a wall" }).click();
  for (const [label, value] of [["Start X (mm)", "5500"], ["Start Z (mm)", "3000"], ["End X (mm)", "8500"], ["End Z (mm)", "3000"]]) {
    await panel.getByLabel(label, { exact: true }).fill(value);
  }
  await panel.getByRole("button", { name: "Add proposed wall", exact: true }).click();
  await expect(page.getByText(/Curved boundaries are retained/).first()).toBeVisible();
  expect(await saved()).toEqual(before);
  await panel.getByLabel("Wall", { exact: true }).selectOption("loose");
  await panel.locator("summary", { hasText: "Join an endpoint" }).click();
  await panel.getByLabel("Join target X (mm)").fill("9260");
  await panel.getByLabel("Join target Z (mm)").fill("6000");
  await panel.getByRole("button", { name: "Join proposed endpoint", exact: true }).click();
  await expect(page.getByText(/Curved boundaries are retained/).first()).toBeVisible();
  expect(await saved()).toEqual(before);
  await page.screenshot({ path: info.outputPath("curved-boundary-rejection.png") });
  await page.reload();
  expect(await saved()).toEqual(before); expect(errors).toEqual([]);
  await writeFile(info.outputPath("curved-boundary-evidence.json"), JSON.stringify({ before, after: await saved(), checks: ["explicit unsupported-curve feedback", "rejected addition", "rejected join", "no source/proposed mutation", "saved reload"] }, null, 2));
});
