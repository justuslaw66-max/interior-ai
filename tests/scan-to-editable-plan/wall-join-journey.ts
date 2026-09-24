import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { StoredDesign } from "../../lib/room-persistence";
import { compileFloorPlanDocumentV2 } from "../../lib/floor-plan-compiler-v2";

export async function exerciseWallJoins(page: Page, wallId: string, saved: () => Promise<StoredDesign>, testInfo: TestInfo) {
  const document = async () => (await saved()).floorPlan!.canonicalDocument!;
  const before = await document(), panel = page.getByTestId("imported-wall-editor");
  const wallCount = before.floors[0].walls.length;
  await panel.locator("summary", { hasText: "Join an endpoint" }).click();
  await panel.getByLabel("Endpoint to join").selectOption("start");
  await panel.getByLabel("Join target X (mm)").fill("3000");
  await panel.getByLabel("Join target Z (mm)").fill("1000");
  await panel.getByRole("button", { name: "Join proposed endpoint", exact: true }).click();
  await expect.poll(async () => (await document()).floors[0].walls.length).toBe(wallCount + 1);
  const attached = await document(), attachedFloor = attached.floors[0];
  const attachedWall = attachedFloor.walls.find(({ id }) => id === wallId)!;
  const start = attachedFloor.vertices.find(({ id }) => id === attachedWall.path.startVertexId)!;
  expect(start).toMatchObject({ xMm: 3000, zMm: 1000 });
  expect(attachedFloor.walls.filter((wall) => [wall.path.startVertexId, wall.path.endVertexId].includes(start.id))).toHaveLength(3);
  expect(attachedFloor.rooms).toHaveLength(2);
  await panel.getByLabel("Endpoint to join").selectOption("end");
  await panel.getByLabel("Join target X (mm)").fill("9260");
  await panel.getByLabel("Join target Z (mm)").fill("2500");
  await panel.getByLabel("New room name after join").fill("Joined studio");
  await panel.getByRole("button", { name: "Join proposed endpoint", exact: true }).click();
  await expect.poll(async () => (await document()).floors[0].rooms.length).toBe(3);
  const divided = await document();
  expect(divided.floors[0].rooms.some(({ name }) => name === "Joined studio")).toBe(true);
  expect(divided.floors[0].walls.find(({ id }) => id === wallId)!.adjacentRoomIds).toHaveLength(2);
  const compiled = compileFloorPlanDocumentV2(divided);
  expect(compiled.floors[0].rooms.reduce((sum, room) => sum + room.areaSquareMm, 0)).toBe(9260 * 6000);
  await page.screenshot({ path: testInfo.outputPath("wall-joined-room.png") });
  const undo = page.getByRole("button", { name: /^Undo/ });
  await undo.click(); await expect.poll(document).toEqual(attached);
  await undo.click(); await expect.poll(document).toEqual(before);
  await writeFile(testInfo.outputPath("wall-join-evidence.json"), JSON.stringify({ joined: divided, originalGeometryHash: compileFloorPlanDocumentV2(before).geometryHash,
    checks: ["shared T-junction identity", "target split", "partial join preserves room count", "second join divides room", "floor area preserved", "undo restores whole transactions"] }, null, 2));
}
