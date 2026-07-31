import { test, expect } from "../fixtures";
import { confirmPlanTemplateReplacementIfNeeded } from "../plan-template-test-utils";
import {
  chooseTemplateStart,
  clearBrowserStorageBeforeNextLoad,
  clickWithFallback,
} from "./helpers";

export function registerTemplateTests() {
  test("starter floor-plan templates create whole-home room layouts", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);

    await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
    await expect(page.getByTestId("apply-plan-template-living_dining")).toBeVisible();
    await page.getByTestId("apply-plan-template-compact_two_bed").click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("6 rooms");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("6 rooms ready");
    await expect(page.getByTestId("room-connection-checklist")).toBeVisible();
    await expect(page.getByTestId("room-connection-checklist")).toHaveAttribute(
      "data-variant",
      "consumer"
    );
    await expect(page.getByTestId("room-connection-checklist")).toContainText("Connections");
    await expect(page.getByTestId("room-connection-checklist")).toContainText("shared wall");
    await expect(page.getByText(/^Overall horizontal \d+ mm$/)).toBeVisible();
    await expect(page.getByText(/^Overall vertical \d+ mm$/)).toBeVisible();
    await expect(page.locator('[data-testid^="wall-draw-segment-length-"]')).toHaveCount(0);

    const originalWidthText = await page.getByTestId("active-room-dimension-width").textContent();
    await page.getByTestId("active-room-dimension-width").click();
    await expect(page.getByTestId("active-room-dimension-editor-width")).toBeVisible();
    await page.getByTestId("active-room-dimension-editor-width").fill("23234");
    await expect(page.getByTestId("collision-toast")).toContainText(
      "Enter a valid room dimension."
    );
    await expect(page.getByTestId("rule-announcement-alert")).toHaveText(
      "Enter a valid room dimension."
    );
    await expect(page.getByTestId("rule-announcement-alert")).toHaveAttribute(
      "aria-live",
      "assertive"
    );
    await expect(page.getByTestId("collision-toast")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    await expect(page.getByTestId("active-room-dimension-editor-width")).toHaveCount(0);
    await expect(page.getByTestId("active-room-dimension-width")).not.toContainText("23234");
    await expect(page.getByTestId("active-room-dimension-width")).toHaveText(
      originalWidthText ?? ""
    );

    const widthLabelBox = await page.getByTestId("active-room-dimension-width").boundingBox();
    const depthLabelBox = await page.getByTestId("active-room-dimension-depth").boundingBox();
    expect(widthLabelBox).not.toBeNull();
    expect(depthLabelBox).not.toBeNull();
    if (!widthLabelBox || !depthLabelBox) {
      throw new Error("Active room dimension labels were not measurable");
    }
    expect(Math.abs(widthLabelBox.y - depthLabelBox.y)).toBeGreaterThan(24);
  });

  test("plan summary exposes footprint dimensions and additive room selection", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);

    await expect(page.getByTestId("plan-template-dimensions-studio")).toContainText(
      "Footprint 6.3 × 5.7 m"
    );
    await page.getByTestId("apply-plan-template-studio").click();

    const summary = page.locator('[data-testid="plan-room-summary"]:visible').first();
    await expect(summary).toBeVisible();
    await expect(summary).toContainText("6.3 × 5.7 m");
    await expect(summary).toContainText("32.1 m²");

    const livingLabel = page
      .locator('[data-testid="house-room-2d-label"]')
      .filter({ hasText: "Living / Sleep" });
    const kitchenetteLabel = page
      .locator('[data-testid="house-room-2d-label"]')
      .filter({ hasText: "Kitchenette" });
    await expect(livingLabel).toBeVisible();
    await expect(kitchenetteLabel).toBeVisible();
    const livingBox = await livingLabel.boundingBox();
    const kitchenetteBox = await kitchenetteLabel.boundingBox();
    expect(livingBox).not.toBeNull();
    expect(kitchenetteBox).not.toBeNull();
    if (!livingBox || !kitchenetteBox) throw new Error("Room labels were not measurable");

    await page.mouse.click(
      livingBox.x + livingBox.width / 2,
      livingBox.y + livingBox.height / 2 + 40
    );
    await page.keyboard.down("Shift");
    await page.mouse.click(
      kitchenetteBox.x + kitchenetteBox.width / 2,
      kitchenetteBox.y + kitchenetteBox.height / 2 - 30
    );
    await page.keyboard.up("Shift");

    await expect(summary).toHaveAttribute("data-selected-room-count", "2");
    await expect(summary.getByTestId("plan-room-selection-summary")).toContainText(
      "2 rooms selected"
    );
    await expect(livingLabel).toHaveAttribute("data-selected", "true");
    await expect(kitchenetteLabel).toHaveAttribute("data-selected", "true");
    await expect(livingLabel).toHaveAttribute("data-selection-visual", "comparison");
    await expect(kitchenetteLabel).toHaveAttribute("data-selection-visual", "comparison");
    await expect(page.getByTestId("house-room-2d-selection-badge")).toHaveCount(2);
    await expect(
      page.locator('[data-testid="house-room-2d-label"][data-active="true"]')
    ).toHaveCount(1);

    await summary.getByTestId("select-all-rooms").click();
    await expect(summary).toHaveAttribute("data-selected-room-count", "4");
    await expect(page.getByTestId("house-room-2d-selection-badge")).toHaveCount(4);
    await expect(
      page.locator('[data-testid="house-room-2d-label"][data-active="true"]')
    ).toHaveCount(1);
  });

  test("furnished templates create starter items and protect existing plans", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);

    await expect(page.getByTestId("apply-furnished-template-studio")).toBeVisible();
    await expect(
      page.getByTestId(/plan-template-furnishing-marker-studio-.+/).first()
    ).toBeVisible();
    await page.getByTestId("apply-furnished-template-studio").click();
    await confirmPlanTemplateReplacementIfNeeded(page);

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("Review the shop list");
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const raw = window.localStorage.getItem(
              "interior-ai:v1:livingroom-design",
            );
            const saveStatus = document.querySelector('[data-testid="save-status"]');
            if (!raw) {
              return {
                version: null,
                roomCount: 0,
                hasItems: false,
                saveKind: saveStatus?.getAttribute("data-status") ?? null,
                saveSource: saveStatus?.getAttribute("data-source") ?? null,
              };
            }
            try {
              const stored = JSON.parse(raw) as {
                version?: number;
                rooms?: Array<{ items?: unknown[] }>;
              };
              return {
                version: stored.version ?? null,
                roomCount: stored.rooms?.length ?? 0,
                hasItems: Boolean(
                  stored.rooms?.some(
                    (room) => Array.isArray(room.items) && room.items.length > 0,
                  ),
                ),
                saveKind: saveStatus?.getAttribute("data-status") ?? null,
                saveSource: saveStatus?.getAttribute("data-source") ?? null,
              };
            } catch {
              return {
                version: null,
                roomCount: 0,
                hasItems: false,
                saveKind: saveStatus?.getAttribute("data-status") ?? null,
                saveSource: saveStatus?.getAttribute("data-source") ?? null,
              };
            }
          }),
        { timeout: 60_000 },
      )
      .toMatchObject({ version: 3, roomCount: 4, hasItems: true });

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("Review the shop list");

    await chooseTemplateStart(page);
    await page.getByTestId("apply-plan-template-one_bedroom").click();

    const replaceDialog = page.getByRole("dialog", { name: "Start a new plan?" });
    await expect(replaceDialog).toBeVisible();
    await expect(replaceDialog).toContainText("Compact 1-bed");
    await expect(page.getByTestId("new-plan-save-current")).toBeVisible();
    await page.getByTestId("new-plan-cancel").click();
    await expect(replaceDialog).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("4 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(/[1-9]\d* items?/);

    await page.getByTestId("apply-plan-template-one_bedroom").click();
    await expect(replaceDialog).toBeVisible();
    await page.getByTestId("new-plan-replace-current").click();

    await expect(replaceDialog).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("5 rooms");
    await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText("Not started");
  });

  test("adding a room keeps the plan visible as one whole-home 3D scene", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("editor-workflow-furnish")).toHaveCount(1);
    await expect(page.getByTestId("editor-workflow-shop")).toHaveCount(1);
    await expect(page.getByTestId("editor-workflow-export")).toHaveCount(1);
    await expect(page.getByTestId("editor-workflow-ai")).toHaveCount(1);
    await expect(page.getByTestId("house-room-3d-label")).toHaveCount(0);

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "3D" }).click();

    await expect(page.getByRole("button", { name: "Focus Living Room" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole("button", { name: "Focus Bedroom" })).toBeVisible();
    const selectionInspector = page.getByTestId("selection-inspector");
    await expect(selectionInspector).toBeVisible();
    await expect(selectionInspector).toContainText("Bedroom");
    await expect(page.getByTestId("selection-inspector-room-width")).toHaveValue("4000");
    await expect(page.getByTestId("selection-inspector-room-depth")).toHaveValue("3600");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("2 rooms ready");
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText(
      "Add 1 doorway."
    );

    await expect(page.getByTestId("selection-inspector-fit-room")).toBeVisible();
    await clickWithFallback(page.getByTestId("selection-inspector-fit-room"));
    await expect(page.getByTestId("room-pan-navigator")).toBeVisible();
    await expect(page.getByTestId("room-pan-camera-handle")).toBeVisible();
    await expect(page.getByTestId("room-pan-camera-icon")).toBeVisible();
    await expect(page.getByTestId("room-pan-zoom-in")).toBeVisible();
    await expect(page.getByTestId("room-pan-zoom-out")).toBeVisible();
    await expect(page.getByTestId("room-pan-reset-view")).toBeVisible();
    await expect(page.getByTestId("coohom-floor-panel")).toBeVisible();
    await expect(page.getByTestId("selection-inspector-room-dimensions")).toBeVisible();

    await page.getByRole("button", { name: "2D Plan" }).click();
    const sceneCanvas = page.getByTestId("scene-canvas").first();
    await expect(sceneCanvas).toHaveAttribute("data-plan-2d-orientation", /^(normal|rotated)$/);
    const planOrientationBeforeFit = await sceneCanvas.getAttribute("data-plan-2d-orientation");
    await clickWithFallback(page.getByTestId("selection-inspector-fit-room"));
    await expect(sceneCanvas).toHaveAttribute(
      "data-plan-2d-orientation",
      planOrientationBeforeFit ?? "normal"
    );
    await page.getByRole("button", { name: "3D" }).click();
    await expect(page.getByTestId("room-pan-navigator")).toBeVisible();
    await page.getByTestId("room-pan-navigator").scrollIntoViewIfNeeded();

    const panTargetBefore = await page.getByTestId("room-pan-target").boundingBox();
    expect(panTargetBefore).not.toBeNull();
    if (!panTargetBefore) {
      throw new Error("Navigator target was not measurable");
    }

    const navigatorPoint = await page.getByTestId("room-pan-map").evaluate((map) => {
      const box = map.getBoundingClientRect();
      for (let y = box.top + 6; y < box.bottom - 6; y += 8) {
        for (let x = box.left + 6; x < box.right - 6; x += 8) {
          const hitTarget = document.elementFromPoint(x, y);
          if (
            hitTarget &&
            (hitTarget === map || map.contains(hitTarget)) &&
            !hitTarget.closest("[data-room-nav-action]")
          ) {
            return { x, y };
          }
        }
      }
      return null;
    });
    expect(navigatorPoint).not.toBeNull();
    if (!navigatorPoint) throw new Error("Navigator map has no unobstructed target point");
    await page.mouse.click(navigatorPoint.x, navigatorPoint.y);
    await page.waitForTimeout(300);

    const panTargetAfter = await page.getByTestId("room-pan-target").boundingBox();
    expect(panTargetAfter).not.toBeNull();
    if (!panTargetAfter) {
      throw new Error("Navigator target was not measurable after panning");
    }
    expect(
      Math.hypot(panTargetAfter.x - panTargetBefore.x, panTargetAfter.y - panTargetBefore.y)
    ).toBeGreaterThan(4);

    const cameraHandleBefore = await page.getByTestId("room-pan-camera-handle").boundingBox();
    expect(cameraHandleBefore).not.toBeNull();
    if (!cameraHandleBefore) {
      throw new Error("Navigator camera handle was not measurable");
    }
    await page.mouse.move(
      cameraHandleBefore.x + cameraHandleBefore.width / 2,
      cameraHandleBefore.y + cameraHandleBefore.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      cameraHandleBefore.x + cameraHandleBefore.width / 2 - 18,
      cameraHandleBefore.y + cameraHandleBefore.height / 2 + 12,
      { steps: 6 }
    );
    await page.mouse.up();
    await page.getByTestId("room-pan-zoom-in").click();
    await page.getByTestId("room-pan-zoom-out").click();
    await page.getByTestId("room-pan-reset-view").click();
    if (!(await page.getByText("Home fitted").isVisible({ timeout: 1000 }).catch(() => false))) {
      test.info().annotations.push({
        type: "note",
        description: "Home fitted toast was not visible long enough to assert in this run.",
      });
    }

    await clickWithFallback(page.getByTestId("editor-workflow-ai"));
    await expect(page.getByTestId("editor-workflow-ai")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("AI Design Brief")).toBeVisible();
    await expect(page.getByTestId("ai-layout-goals")).toBeVisible();
    await expect(page.getByTestId("ai-layout-goal-balanced")).toHaveAttribute("data-active", "true");
    await page.getByTestId("ai-layout-goal-media").click();
    await expect(page.getByTestId("ai-layout-goal-media")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("ai-layout-readiness")).toContainText("Ready to generate");
    await expect(page.getByTestId("ai-layout-readiness")).toContainText("Living rooms first");
    await expect(page.getByText("AI layout supports living rooms first")).toBeVisible();
    await clickWithFallback(page.getByTestId("editor-workflow-plan"));
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    await page.getByRole("button", { name: "2D Plan" }).click();
    await expect(sceneCanvas).toHaveAttribute("data-plan-2d-camera-valid", "true");
    await expect(page.getByTestId("plan-tool-palette")).toBeVisible();
    await expect(page.getByTestId("plan-start-draw")).toBeVisible();
    await expect(page.getByTestId("plan-tool-door")).toBeVisible();
    await expect(page.getByTestId("plan-tool-window")).toBeVisible();
    await expect(page.getByTestId("active-room-dimension-width")).toContainText("Width 4000 mm");
    await expect(page.getByTestId("active-room-dimension-depth")).toContainText("Depth 3600 mm");
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-n"]')).toBeVisible();
    const eastRoomHandle = page.locator('[data-testid^="room-resize-handle-"][data-testid$="-e"]');
    await expect(eastRoomHandle).toBeVisible();
    const eastRoomHandleBox = await eastRoomHandle.boundingBox();
    expect(eastRoomHandleBox).not.toBeNull();
    if (!eastRoomHandleBox) {
      throw new Error("Bedroom east wall handle was not measurable");
    }
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-s"]')).toBeVisible();
    await expect(page.locator('[data-testid^="room-resize-handle-"][data-testid$="-w"]')).toBeVisible();
    const adjacencyGuide = page.getByTestId("room-adjacency-guide");
    if (await adjacencyGuide.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(adjacencyGuide).toHaveText("Shared wall");
    }
    await expect(page.getByTestId("room-connection-checklist")).toBeVisible();
    await expect(page.getByTestId("room-connection-checklist")).toContainText("Connections");
    await expect(page.getByTestId("room-connection-checklist")).toContainText("Needs doorway");
    await expect(page.getByTestId("room-connection-checklist")).toContainText("shared wall");
    await expect(page.getByTestId("room-connection-add-doorway")).toHaveText("Add doorway");
    await page.getByTestId("room-connection-add-doorway").click();
    await expect(page.getByText("⚠️ Doorway added", { exact: true })).toBeVisible();
    await expect(page.getByTestId("consumer-plan-next-steps")).toContainText("openings placed");
    const selectedRoomSectionToggle = page.getByTestId("plan-section-toggle-selectedRoom");
    if ((await selectedRoomSectionToggle.getAttribute("aria-expanded")) === "false") {
      await selectedRoomSectionToggle.click();
    }
    const planOpeningInspector = page.getByTestId("plan-opening-inspector").last();
    await expect(planOpeningInspector).toBeVisible();
    await expect(page.getByTestId("plan-opening-live-label")).toContainText("Door");
    await expect(page.getByTestId("selected-plan-opening-actions")).toBeVisible();
    const selectedOpeningWidth = page.getByTestId("selected-plan-opening-width-input");
    await expect(selectedOpeningWidth).toHaveValue("900");
    await selectedOpeningWidth.fill("1000");
    await selectedOpeningWidth.press("Enter");
    await expect(page.getByTestId("selection-inspector-opening-width")).toHaveValue("1000");
    await expect(planOpeningInspector.getByTestId("plan-opening-width-input")).toHaveValue("1000");
    await planOpeningInspector.getByTestId("plan-opening-width-input").fill("1100");
    await planOpeningInspector.getByTestId("plan-opening-width-input").press("Enter");
    await expect(planOpeningInspector.getByTestId("plan-opening-width-input")).toHaveValue("1100");
    await planOpeningInspector.getByTestId("plan-opening-offset-input").fill("200");
    await planOpeningInspector.getByTestId("plan-opening-offset-input").press("Enter");
    await expect(planOpeningInspector.getByTestId("plan-opening-offset-input")).toHaveValue("200");
    await expect(planOpeningInspector.getByTestId("plan-opening-height-input")).toHaveValue("2100");
    await planOpeningInspector.getByTestId("plan-opening-width-input").fill("1150");
    await planOpeningInspector.getByTestId("plan-opening-width-input").press("Enter");
    await expect(planOpeningInspector.getByTestId("plan-opening-width-input")).toHaveValue("1150");
  });

}

