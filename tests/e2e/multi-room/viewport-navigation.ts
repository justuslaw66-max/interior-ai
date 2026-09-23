import { test, expect } from "../fixtures";
import {
  chooseTemplateStart,
  clickWithFallback,
  expectPlan2DProjectionHealthy,
  getActiveRoomBodyProbe,
  readNumberAttribute,
} from "./helpers";

export function registerViewportNavigationTests() {
  test("keeps 2D projected room geometry from collapsing after fit and view toggles", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();

    await page.getByRole("button", { name: "2D Plan" }).click();
    await expectPlan2DProjectionHealthy(page);

    await clickWithFallback(page.getByTestId("room-plan-status-fit-view"));
    await expectPlan2DProjectionHealthy(page);

    const sceneCanvasBox = await page.getByTestId("scene-canvas").first().boundingBox();
    expect(sceneCanvasBox).not.toBeNull();
    if (!sceneCanvasBox) throw new Error("Scene canvas was not measurable");

    await page.mouse.move(
      sceneCanvasBox.x + sceneCanvasBox.width / 2,
      sceneCanvasBox.y + sceneCanvasBox.height / 2
    );
    await page.mouse.wheel(0, -360);
    await expectPlan2DProjectionHealthy(page);

    await page.getByRole("button", { name: "3D" }).click();
    await page.getByRole("button", { name: "2D Plan" }).click();
    await expectPlan2DProjectionHealthy(page);
  });

  test("pans and zooms from room body while moving rooms only from the move handle", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await page.evaluate(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "2D Plan" }).click();
    await expectPlan2DProjectionHealthy(page);

    const roomLabel = await getActiveRoomBodyProbe(page);
    const labelBox = await roomLabel.boundingBox();
    expect(labelBox).not.toBeNull();
    if (!labelBox) throw new Error("Active room label was not measurable");

    const roomXBeforeMoveHandle = await readNumberAttribute(roomLabel, "data-room-x");
    const roomZBeforeMoveHandle = await readNumberAttribute(roomLabel, "data-room-z");
    await expect(page.getByTestId("selected-room-move")).toBeVisible();
    const moveHandle = page.getByTestId("selected-room-move");
    const moveHandleBox = await moveHandle.boundingBox();
    expect(moveHandleBox).not.toBeNull();
    if (!moveHandleBox) throw new Error("Selected room move handle was not measurable");

    await page.mouse.move(
      moveHandleBox.x + moveHandleBox.width / 2,
      moveHandleBox.y + moveHandleBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      moveHandleBox.x + moveHandleBox.width / 2 + 16,
      moveHandleBox.y + moveHandleBox.height / 2 + 8,
      { steps: 4 }
    );
    const roomDragHud = page.getByTestId("room-drag-hud");
    await expect(roomDragHud).toBeVisible();
    await expect(roomDragHud).not.toHaveAttribute("data-drag-state", "blocked");
    await page.mouse.up();

    await expect
      .poll(async () => {
        const nextX = await readNumberAttribute(roomLabel, "data-room-x");
        const nextZ = await readNumberAttribute(roomLabel, "data-room-z");
        return Math.hypot(nextX - roomXBeforeMoveHandle, nextZ - roomZBeforeMoveHandle);
      })
      .toBeGreaterThan(0.1);
    await expect(page.getByTestId("room-drag-hud")).toHaveCount(0);

    const roomXBeforeBodyDrag = await readNumberAttribute(roomLabel, "data-room-x");
    const roomZBeforeBodyDrag = await readNumberAttribute(roomLabel, "data-room-z");
    const labelBoxBeforeBodyDrag = await roomLabel.boundingBox();
    expect(labelBoxBeforeBodyDrag).not.toBeNull();
    if (!labelBoxBeforeBodyDrag) throw new Error("Active room label was not measurable before body drag");
    const debug = page.getByTestId("qa-design-layout-debug");
    const targetXBeforeBodyDrag = await readNumberAttribute(debug, "data-plan-2d-camera-target-x");
    const targetZBeforeBodyDrag = await readNumberAttribute(debug, "data-plan-2d-camera-target-z");

    await page.mouse.move(
      labelBoxBeforeBodyDrag.x + labelBoxBeforeBodyDrag.width / 2,
      labelBoxBeforeBodyDrag.y + labelBoxBeforeBodyDrag.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      labelBoxBeforeBodyDrag.x + labelBoxBeforeBodyDrag.width / 2 + 90,
      labelBoxBeforeBodyDrag.y + labelBoxBeforeBodyDrag.height / 2 + 60,
      { steps: 8 }
    );
    await page.mouse.up();

    await expect.poll(() => readNumberAttribute(roomLabel, "data-room-x")).toBeCloseTo(roomXBeforeBodyDrag, 2);
    await expect.poll(() => readNumberAttribute(roomLabel, "data-room-z")).toBeCloseTo(roomZBeforeBodyDrag, 2);
    await expect
      .poll(async () => {
        const nextX = await readNumberAttribute(debug, "data-plan-2d-camera-target-x");
        const nextZ = await readNumberAttribute(debug, "data-plan-2d-camera-target-z");
        return Math.hypot(nextX - targetXBeforeBodyDrag, nextZ - targetZBeforeBodyDrag);
      })
      .toBeGreaterThan(0.1);

    const labelBoxAfterPan = await roomLabel.boundingBox();
    expect(labelBoxAfterPan).not.toBeNull();
    if (!labelBoxAfterPan) throw new Error("Active room label was not measurable after pan");

    const zoomBeforeWheel = await readNumberAttribute(debug, "data-plan-zoom");
    await page.mouse.move(
      labelBoxAfterPan.x + labelBoxAfterPan.width / 2,
      labelBoxAfterPan.y + labelBoxAfterPan.height / 2
    );
    await page.mouse.wheel(0, -360);
    await expect.poll(() => readNumberAttribute(debug, "data-plan-zoom")).toBeGreaterThan(zoomBeforeWheel);
    await expect.poll(() => readNumberAttribute(roomLabel, "data-room-x")).toBeCloseTo(roomXBeforeBodyDrag, 2);
    await expect.poll(() => readNumberAttribute(roomLabel, "data-room-z")).toBeCloseTo(roomZBeforeBodyDrag, 2);
  });

}

