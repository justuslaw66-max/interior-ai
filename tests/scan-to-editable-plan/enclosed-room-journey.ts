import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { StoredDesign } from "../../lib/room-persistence";
import { compileFloorPlanDocumentV2 } from "../../lib/floor-plan-compiler-v2";

export async function exerciseEnclosedRoom(page: Page, saved: () => Promise<StoredDesign>, testInfo: TestInfo) {
  const document = async () => (await saved()).floorPlan!.canonicalDocument!;
  const before = await document(), panel = page.getByTestId("imported-wall-editor");
  const existing = new Set(before.floors[0].walls.map(({ id }) => id));
  await panel.locator("summary", { hasText: "Add a wall" }).click();
  const points = [[1000, 1000, 2500, 1000], [2500, 1000, 2500, 4000], [2500, 4000, 1000, 4000], [1000, 4000, 1000, 1200]];
  for (const [index, values] of points.entries()) {
    for (const [axis, label] of ["Start X (mm)", "Start Z (mm)", "End X (mm)", "End Z (mm)"].entries()) {
      await panel.getByLabel(label, { exact: true }).fill(String(values[axis]));
    }
    await panel.getByRole("button", { name: "Add proposed wall", exact: true }).click();
    await expect.poll(async () => (await document()).floors[0].walls.length).toBe(existing.size + index + 1);
    expect((await document()).floors[0].rooms).toHaveLength(1);
  }
  const openLoop = await document(), lastWall = openLoop.floors[0].walls.at(-1)!;
  await panel.getByLabel("Wall", { exact: true }).selectOption(lastWall.id);
  await panel.locator("summary", { hasText: "Join an endpoint" }).click();
  await panel.getByLabel("Join target X (mm)").fill("1000");
  await panel.getByLabel("Join target Z (mm)").fill("1000");
  await panel.getByLabel("New room name after join").fill("Enclosed office");
  await panel.getByRole("button", { name: "Join proposed endpoint", exact: true }).click();
  await expect.poll(async () => (await document()).floors[0].rooms.length).toBe(2);
  const enclosed = await document(), floor = enclosed.floors[0], compiled = compileFloorPlanDocumentV2(enclosed);
  const room = floor.rooms.find(({ name }) => name === "Enclosed office")!;
  expect(compiled.floors[0].rooms.find(({ id }) => id === room.id)!.areaSquareMm).toBe(4_500_000);
  expect(compiled.floors[0].rooms.reduce((sum, room) => sum + room.areaSquareMm, 0)).toBe(9260 * 6000);
  expect(floor.rooms.find(({ id }) => id === "living")!.wallLoops.filter(({ kind }) => kind === "hole")).toHaveLength(1);
  expect(floor.walls.filter(({ id }) => !existing.has(id)).every(({ adjacentRoomIds }) => adjacentRoomIds.length === 2)).toBe(true);
  expect((await saved()).rooms!.find(({ id }) => id === "living")!.planHoles).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath("enclosed-room-2d.png") });
  await page.getByTestId("editor-view-3d").click();
  await page.screenshot({ path: testInfo.outputPath("enclosed-room-3d.png") });
  expect(await document()).toEqual(enclosed);
  await page.getByTestId("editor-view-2d").click();
  await panel.locator("summary", { hasText: "Remove selected wall" }).click();
  await panel.getByLabel("Keep name and finishes from").selectOption("living");
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Remove proposed wall", exact: true }).click();
  await expect.poll(async () => (await document()).floors[0].rooms.length).toBe(1);
  expect((await document()).floors[0].rooms[0].wallLoops).toHaveLength(1);
  expect(compileFloorPlanDocumentV2(await document()).floors[0].rooms[0].areaSquareMm).toBe(9260 * 6000);
  const undo = page.getByRole("button", { name: /^Undo/ });
  await undo.click(); await expect.poll(document).toEqual(enclosed);
  await undo.click(); await expect.poll(document).toEqual(openLoop);
  for (let index = 0; index < 4; index += 1) await undo.click();
  await expect.poll(document).toEqual(before);
  const addSummary = panel.locator("summary", { hasText: "Add a wall" });
  if (await addSummary.evaluate((element) => element.parentElement?.hasAttribute("open"))) await addSummary.click();
  await writeFile(testInfo.outputPath("enclosed-room-evidence.json"), JSON.stringify({ enclosed, checks: ["four open sides stay partial", "explicit join creates inner room and surrounding hole", "exact room/floor areas", "legacy hole projection", "3D mode keeps document", "removal rejoins surrounding space", "complete undo"] }, null, 2));
}
