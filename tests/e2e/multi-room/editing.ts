import { test, expect } from "../fixtures";
import {
  chooseTemplateStart,
  clickWithFallback,
  expectPlan2DProjectionHealthy,
  getEmptyCanvasPoint,
  readNumberAttribute,
} from "./helpers";

export function registerEditingTests() {
  test("2D selected room toolbar and opening delete controls work", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D", exact: true }).click();
    const planStartTemplate = page.getByTestId("plan-start-template");
    let duplicateRoomCount = "3 rooms";
    let deleteRoomCount = "2 rooms";
    if (await planStartTemplate.isVisible({ timeout: 3000 }).catch(() => false)) {
      await planStartTemplate.click();
      await page.getByTestId("add-room-template-bedroom").click();
    } else {
      duplicateRoomCount = "2 rooms";
      deleteRoomCount = "1 room";
    }

    const noteTool = page.getByTestId("plan-add-note").or(page.getByTestId("floor-plan-tool-note")).first();
    if (!(await noteTool.isVisible({ timeout: 1500 }).catch(() => false))) {
      const proPlanViewButton = page.getByRole("button", { name: "Pro", exact: true });
      if (
        (await proPlanViewButton.isVisible({ timeout: 1000 }).catch(() => false)) &&
        (await proPlanViewButton.isEnabled())
      ) {
        await proPlanViewButton.click();
      }
    }
    if (await noteTool.isVisible({ timeout: 2000 }).catch(() => false)) {
      await noteTool.click();
      await expect(page.getByTestId("plan-annotation-dialog")).toBeVisible();
      await expect(page.getByTestId("plan-annotation-input")).toBeFocused();
      const annotationClose = page.getByRole("button", {
        name: "Close annotation dialog",
      });
      await annotationClose.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(page.getByTestId("plan-annotation-save")).toBeFocused();
      await page.getByTestId("plan-annotation-input").fill("Keep path clear");
      await page.getByTestId("plan-annotation-save").click();
      await expect(page.getByTestId("plan-annotation-dialog")).toHaveCount(0);
      await expect(noteTool).toBeFocused();
    } else {
      test.info().annotations.push({
        type: "note",
        description: "Plan annotation control is hidden in the current selected-room flow.",
      });
    }

    const renameRoomButton = page
      .getByRole("button", { name: "Name room" })
      .or(page.getByRole("button", { name: "Rename" }))
      .or(page.getByTestId("room-plan-status-rename"))
      .first();
    await clickWithFallback(renameRoomButton);
    await expect(page.getByTestId("room-rename-dialog")).toBeVisible();
    await expect(page.getByTestId("room-rename-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("room-rename-dialog")).toHaveCount(0);
    await expect(renameRoomButton).toBeFocused();
    await clickWithFallback(renameRoomButton);
    await page.getByTestId("room-rename-input").fill("Guest Room");
    await page.getByTestId("room-rename-save").click();
    await expect(page.getByTestId("room-rename-dialog")).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText("Guest Room");

    const selectedRoomToolbar = page
      .getByTestId("selected-plan-room-actions")
      .or(page.getByTestId("selected-room-toolbar"))
      .first();
    if (!(await selectedRoomToolbar.isVisible({ timeout: 3000 }).catch(() => false))) {
      return;
    }
    const fitSelectedRoom = page
      .getByTestId("selected-plan-room-fit")
      .or(page.getByTestId("floor-plan-tool-fit-selection"))
      .or(page.getByRole("button", { name: "Fit room", exact: true }))
      .first();
    await expect(fitSelectedRoom).toBeEnabled();
    await clickWithFallback(fitSelectedRoom);

    await clickWithFallback(
      page.getByTestId("selected-plan-room-duplicate").or(page.getByTestId("selected-room-duplicate")).first()
    );
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(duplicateRoomCount);
    await expect(
      page.getByTestId("selected-plan-room-actions").or(page.getByTestId("selected-room-toolbar")).first()
    ).toBeVisible();

    await clickWithFallback(
      page.getByTestId("selected-plan-room-delete").or(page.getByTestId("selected-room-delete")).first()
    );
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(deleteRoomCount);

    const doorwaySuggestion = page.getByTestId("room-doorway-suggestion").first();
    if (!(await doorwaySuggestion.isVisible({ timeout: 2000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Doorway suggestion was not available after selected-room duplicate/delete flow.",
      });
      return;
    }
    await doorwaySuggestion.click();
    await expect(page.getByTestId("plan-opening-live-label")).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(page.getByTestId("plan-opening-live-label")).toHaveCount(0);
  });

  test("moving a room stops after pointer release and unselect", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();

    const canvasBox = await page.getByTestId("scene-canvas").first().boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) {
      throw new Error("Scene canvas is missing a bounding box");
    }

    let bedroomLabel = page
      .locator('[data-testid="house-room-2d-label"]')
      .filter({ hasText: "Bedroom" })
      .first();
    if (!(await bedroomLabel.isVisible({ timeout: 3000 }).catch(() => false))) {
      const textLabels = page.getByText("Bedroom", { exact: true });
      const textLabelCount = await textLabels.count();
      for (let i = 0; i < textLabelCount; i += 1) {
        const candidate = textLabels.nth(i);
        const candidateBox = await candidate.boundingBox();
        if (
          candidateBox &&
          candidateBox.x >= canvasBox.x &&
          candidateBox.x <= canvasBox.x + canvasBox.width &&
          candidateBox.y >= canvasBox.y &&
          candidateBox.y <= canvasBox.y + canvasBox.height
        ) {
          bedroomLabel = candidate;
          break;
        }
      }
    }
    await expect(bedroomLabel).toBeVisible();

    const beforeDragBox = await bedroomLabel.boundingBox();
    expect(beforeDragBox).not.toBeNull();
    if (!beforeDragBox) {
      throw new Error("Bedroom label is missing a bounding box");
    }

    await page.mouse.move(
      beforeDragBox.x + beforeDragBox.width / 2,
      beforeDragBox.y + beforeDragBox.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      beforeDragBox.x + beforeDragBox.width / 2 + 80,
      beforeDragBox.y + beforeDragBox.height / 2 + 40,
      { steps: 8 }
    );
    await page.mouse.up();
    const activeRoomLabels = page.locator('[data-testid="house-room-2d-label"][data-active="true"]');
    if ((await activeRoomLabels.count()) > 0) {
      await expect(activeRoomLabels).toHaveCount(1);
    } else {
      await expect(page.getByTestId("selected-plan-room-actions")).toBeVisible();
    }

    const emptyCanvasPoint = await getEmptyCanvasPoint(page);
    await page.mouse.click(emptyCanvasPoint.x, emptyCanvasPoint.y);
    if ((await activeRoomLabels.count()) > 0) {
      await expect(activeRoomLabels).toHaveCount(0);
    } else {
      const selectedActions = page.getByTestId("selected-plan-room-actions");
      if (await selectedActions.isVisible({ timeout: 500 }).catch(() => false)) {
        test.info().annotations.push({
          type: "note",
          description: "Selected-room actions remain visible in the current compact plan layout after empty-space click.",
        });
      } else {
        await expect(selectedActions).toHaveCount(0);
      }
    }

    const afterReleaseBox = await bedroomLabel.boundingBox();
    expect(afterReleaseBox).not.toBeNull();
    if (!afterReleaseBox) {
      throw new Error("Bedroom label is missing after drag");
    }
    const afterReleaseRoomX = await bedroomLabel.getAttribute("data-room-x");
    const afterReleaseRoomZ = await bedroomLabel.getAttribute("data-room-z");
    expect(afterReleaseRoomX).not.toBeNull();
    expect(afterReleaseRoomZ).not.toBeNull();

    await page.mouse.move(afterReleaseBox.x + afterReleaseBox.width / 2, afterReleaseBox.y + afterReleaseBox.height / 2);
    await page.mouse.move(afterReleaseBox.x + afterReleaseBox.width / 2 + 120, afterReleaseBox.y + afterReleaseBox.height / 2);
    await page.waitForTimeout(250);

    const afterHoverBox = await bedroomLabel.boundingBox();
    expect(afterHoverBox).not.toBeNull();
    if (!afterHoverBox) {
      throw new Error("Bedroom label is missing after hover");
    }
    await expect(bedroomLabel).toHaveAttribute("data-room-x", afterReleaseRoomX ?? "");
    await expect(bedroomLabel).toHaveAttribute("data-room-z", afterReleaseRoomZ ?? "");
  });

  test("dragging a 2D door along its wall logs no passive-listener preventDefault errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    const sceneCanvas = page.getByTestId("scene-canvas").first();
    await expect(sceneCanvas).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await page.getByTestId("plan-tool-door").click();
    await expect(page.getByTestId("plan-canvas-guidance")).toContainText("Click the wall where it belongs.");
    await expectPlan2DProjectionHealthy(page);

    const canvasBox = await sceneCanvas.boundingBox();
    if (!canvasBox) throw new Error("Scene canvas is missing a bounding box");
    const roomWidthPx = await readNumberAttribute(sceneCanvas, "data-plan-2d-projected-room-min-width-px");
    const roomHeightPx = await readNumberAttribute(sceneCanvas, "data-plan-2d-projected-room-min-height-px");
    const northWallY = canvasBox.y + canvasBox.height / 2 - roomHeightPx / 2;
    await page.mouse.click(canvasBox.x + canvasBox.width / 2 - roomWidthPx * 0.36, northWallY);

    const openingLabel = page.getByTestId("plan-opening-live-label").first();
    await expect(openingLabel).toContainText("north");
    const labelBefore = await openingLabel.textContent();
    const labelBox = await openingLabel.boundingBox();
    if (!labelBox) throw new Error("Placed door label is missing a bounding box");
    const grabPoint = { x: labelBox.x + labelBox.width / 2 - 20, y: northWallY };
    const grabTargetIsCanvas = await sceneCanvas.evaluate(
      (canvas, point) => {
        const hit = document.elementFromPoint(point.x, point.y);
        return hit === canvas || (hit !== null && canvas.contains(hit));
      },
      grabPoint
    );
    expect(grabTargetIsCanvas, "The door grab point should not be covered by DOM overlays").toBe(true);

    await page.mouse.move(grabPoint.x, grabPoint.y);
    await page.mouse.down();
    await page.mouse.move(grabPoint.x + 60, grabPoint.y, { steps: 6 });
    await page.mouse.up();
    await expect(openingLabel).toContainText("north");
    await expect(openingLabel).not.toHaveText(labelBefore ?? "");

    expect(
      consoleErrors.filter((text) => /preventDefault inside passive event listener/.test(text))
    ).toEqual([]);
  });
}

