import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { StoredDesign } from "../../lib/room-persistence";
import { storedToSnapshot } from "../../lib/room-persistence";
import { compileCanonicalFloorPlanRenderModel } from "../../lib/floor-plan-render-model";
import { findCanonicalPlacementWall } from "../../lib/floor-plan-placement-boundaries";

export async function exerciseFurnitureWalls(page: Page, saved: () => Promise<StoredDesign>, testInfo: TestInfo) {
  const before = await saved(), beforeDocument = before.floorPlan!.canonicalDocument!;
  const initialRoom = before.rooms!.find((room) => room.items.length)!;
  const itemId = initialRoom.items[0].instanceId;
  const item = async () => (await saved()).rooms!.flatMap((room) => room.items).find(({ instanceId }) => instanceId === itemId)!;
  const workspace = async (name: "plan" | "furnish") => {
    await page.getByTestId("editor-command-workspace").click();
    await page.getByTestId(`editor-workflow-${name}`).click();
  };
  const selectFurniture = async () => {
    const select = page.getByRole("button", { name: "Select Madison Sofa in 2D plan", exact: true });
    if (await select.getAttribute("aria-pressed") !== "true") await select.click();
    const controls = page.getByTestId("selected-item-advanced-controls-toggle");
    if (await controls.getAttribute("aria-expanded") !== "true") await controls.click();
  };
  const moveToWorldX = async (x: number) => {
    const room = (await saved()).rooms!.find((room) => room.items.some(({ instanceId }) => instanceId === itemId))!;
    const field = page.getByTestId("selected-item-position-x");
    await expect(field.locator("..")).toContainText("cm");
    await field.fill(String((x - (room.planPosition?.x ?? 0)) * 100));
    await field.press("Enter");
  };
  const wallAtItem = async () => {
    const snapshot = storedToSnapshot(await saved()), room = snapshot.rooms.find((room) => room.items.some(({ instanceId }) => instanceId === itemId))!;
    const current = room.items.find(({ instanceId }) => instanceId === itemId)!;
    const model = compileCanonicalFloorPlanRenderModel(snapshot.floorPlan!.canonicalDocument!);
    await writeFile(testInfo.outputPath("furniture-collision-diagnostic.json"), JSON.stringify({ snapshot, room, item: current, model }, null, 2));
    return findCanonicalPlacementWall(model, room,
      current.position, current.rotationY ?? 0, current.productSnapshot!.dimensionsMm);
  };
  await selectFurniture();
  await moveToWorldX(4);
  await expect.poll(async () => (await item()).position[0] + (initialRoom.planPosition?.x ?? 0)).toBe(4);
  expect(await wallAtItem()).toBeNull();
  const acrossRemovedWall = await item();
  const centreZmm = Math.round((acrossRemovedWall.position[2] + (initialRoom.planPosition?.z ?? 0)) * 1000);
  expect((await saved()).floorPlan!.canonicalDocument).toEqual(beforeDocument);
  await workspace("plan");
  const panel = page.getByTestId("imported-wall-editor"), add = panel.locator("summary", { hasText: "Add a wall" });
  if (!await add.evaluate((node) => (node.parentElement as HTMLDetailsElement).open)) await add.click();
  for (const [label, value] of [["Start X (mm)", "4000"], ["Start Z (mm)", String(centreZmm - 500)], ["End X (mm)", "4000"], ["End Z (mm)", String(centreZmm + 500)]]) {
    await panel.getByLabel(label, { exact: true }).fill(value);
  }
  await panel.getByRole("button", { name: "Add proposed wall", exact: true }).click();
  await expect.poll(async () => (await saved()).floorPlan!.canonicalDocument!.floors[0].walls.length).toBe(beforeDocument.floors[0].walls.length + 1);
  const addedDocument = (await saved()).floorPlan!.canonicalDocument!;
  const wall = addedDocument.floors[0].walls.find(({ id }) => !beforeDocument.floors[0].walls.some((prior) => prior.id === id))!;
  expect(await item()).toEqual(acrossRemovedWall);
  expect(await wallAtItem()).toBe(wall.id);
  await expect(panel).toContainText(`Placement ${itemId} intersects proposed wall ${wall.id}`);
  await workspace("furnish");
  await selectFurniture();
  await moveToWorldX(6);
  await expect.poll(async () => (await item()).position[0] + (initialRoom.planPosition?.x ?? 0)).toBe(6);
  expect(await wallAtItem()).toBeNull();
  const recovered = await item();
  await moveToWorldX(4);
  expect(await item()).toEqual(recovered);
  expect((await saved()).floorPlan!.canonicalDocument).toEqual(addedDocument);
  await workspace("plan");
  await expect(panel).not.toContainText(`Placement ${itemId} intersects proposed wall ${wall.id}`);
  await workspace("furnish");
  await writeFile(testInfo.outputPath("furniture-wall-evidence.json"), JSON.stringify({ itemId, beforeDocument, addedDocument, acrossRemovedWall, recovered,
    checks: ["removed wall has no collision barrier", "added partial wall preserves item world position", "visible collision review", "move furniture clear", "blocked movement into new wall"] }, null, 2));
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(item).toEqual(acrossRemovedWall);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(async () => (await saved()).floorPlan!.canonicalDocument).toEqual(beforeDocument);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(async () => (await item()).position).toEqual(initialRoom.items[0].position);
}
