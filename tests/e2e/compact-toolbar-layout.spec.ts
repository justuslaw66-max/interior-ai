import { expect, test, type Locator, type Page } from "@playwright/test";

// The 56px bar (UX 4c, the approved TopBar mockup): its controls are 36px and its steps a 44px
// segmented control in the centre. Undo, Redo and 2D/3D sit in the canvas toolbar, checked below.
const BAR_CONTROL_TEST_IDS = [
  "editor-design-sidebar-toggle",
  "save-design",
  "editor-command-overflow",
  // Both tests run as guests, whose account corner is Sign in.
  "editor-command-sign-in",
] as const;
const BAR_HEIGHT = 56;

async function mockProPlan(page: Page) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "pro", source: "playwright" }),
    });
  });
}

async function expectCompactToolbarGeometry(page: Page) {
  const commandBar = page.getByTestId("editor-command-bar");
  await expect(commandBar).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(async () => (await commandBar.boundingBox())?.height)
    .toBe(BAR_HEIGHT);

  const barBounds = await commandBar.boundingBox();
  expect(barBounds).not.toBeNull();
  const expectedCenterY = barBounds!.y + barBounds!.height / 2;

  for (const [testId, height] of [
    ...BAR_CONTROL_TEST_IDS.map((testId) => [testId, 36] as const),
    ["editor-design-steps", 44] as const,
  ]) {
    const control = page.getByTestId(testId);
    await expect(control, `${testId} should remain visible`).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds, `${testId} should have measurable bounds`).not.toBeNull();
    expect(Math.round(bounds!.height), `${testId} should be ${height}px high`).toBe(height);
    expect(
      Math.abs(bounds!.y + bounds!.height / 2 - expectedCenterY),
      `${testId} should stay vertically centered`,
    ).toBeLessThanOrEqual(1);
    const clipped = await control.evaluate(
      (element) =>
        element.scrollHeight > element.clientHeight + 1 ||
        element.scrollWidth > element.clientWidth + 1,
    );
    expect(clipped, `${testId} should not clip its label or icon`).toBe(false);
  }

  // The save status is a line under the design's name, inside the bar.
  const status = page.getByTestId("save-status");
  await expect(status).toBeVisible();
  const statusBounds = await status.boundingBox();
  expect(statusBounds!.y).toBeGreaterThanOrEqual(barBounds!.y);
  expect(statusBounds!.y + statusBounds!.height).toBeLessThanOrEqual(barBounds!.y + barBounds!.height);

  // The steps sit in the middle of the bar, give or take what a crowded side takes from its half.
  const steps = await page.getByTestId("editor-design-steps").boundingBox();
  const stepsCentre = steps!.x + steps!.width / 2;
  expect(Math.abs(stepsCentre - (barBounds!.x + barBounds!.width / 2))).toBeLessThanOrEqual(barBounds!.width / 4);
}

// The canvas toolbar: under the bar, clear of the step panel, 36px buttons and 32px view segments.
async function expectCanvasToolbarGeometry(page: Page) {
  const bar = await page.getByTestId("editor-command-bar").boundingBox();
  const toolbar = page.getByTestId("canvas-view-toolbar");
  await expect(toolbar).toBeVisible();
  const box = await toolbar.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(bar!.y + bar!.height + 8);
  for (const testId of ["canvas-fit-view", "command-undo", "command-redo"]) {
    await expect(toolbar.getByTestId(testId)).toHaveCSS("height", "36px");
  }
  await expect(toolbar.getByTestId("editor-view-2d")).toHaveCSS("height", "32px");
  const panel = page.getByTestId("design-controls-panel");
  if (await panel.isVisible()) {
    const panelBox = await panel.boundingBox();
    expect(box!.x, "The toolbar should clear the step panel").toBeGreaterThanOrEqual(panelBox!.x + panelBox!.width);
  }
  const viewport = page.viewportSize()!;
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
}

async function chooseStep(page: Page, testId: string) {
  const step = page.getByTestId(testId);
  await expect(step).toBeVisible();
  await step.click();
  await expect(step).toHaveAttribute("data-active", "true");
  await expect(step).toHaveAttribute("aria-current", "step");
}

// Suggest a layout opens from inside the Furnish step, which stays current.
async function openSuggestLayout(page: Page) {
  await chooseStep(page, "editor-workflow-furnish");
  await page.getByTestId("editor-workflow-ai").click();
  await expect(page.getByTestId("furnish-step-back-to-products")).toBeVisible();
  await expect(page.getByTestId("editor-workflow-furnish")).toHaveAttribute("aria-current", "step");
}

async function expectMenuRowsStayComfortable(menu: Locator) {
  await expect(menu).toBeVisible();
  const rowHeights = await menu.locator(":scope > button:visible").evaluateAll((buttons) =>
    buttons.map((button) => button.getBoundingClientRect().height),
  );
  expect(rowHeights.length).toBeGreaterThan(0);
  for (const height of rowHeights) {
    expect(height).toBeGreaterThanOrEqual(36);
  }
}

test.describe("compact top toolbar", () => {
  test("keeps consumer workspaces and overlays aligned at wide and compact desktop widths", async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });

    await expectCompactToolbarGeometry(page);
    await expectCanvasToolbarGeometry(page);
    // Room info left the bar (UX 4c): More shows it at every width.
    await expect(page.getByTestId("room-plan-status")).toBeHidden();
    // Wide screens show each step's number and name.
    await expect(page.getByTestId("editor-workflow-furnish").getByText("2", { exact: true })).toBeVisible();
    await expect(page.getByTestId("editor-workflow-furnish").getByText("Furnish", { exact: true })).toBeVisible();

    await chooseStep(page, "editor-workflow-furnish");
    await openSuggestLayout(page);
    await chooseStep(page, "editor-workflow-plan");

    const sidebarToggle = page.getByTestId("editor-design-sidebar-toggle");
    await sidebarToggle.click();
    await expect(sidebarToggle).toHaveAttribute("data-state", "collapsed");
    await expect(page.getByTestId("design-controls-edge-reveal")).toBeVisible();
    await page.keyboard.press("Control+b");
    await expect(sidebarToggle).toHaveAttribute("data-state", "expanded");
    await expect(page.getByTestId("design-controls-panel")).toBeVisible();

    await page.getByTestId("editor-command-overflow").click();
    await expectMenuRowsStayComfortable(
      page.getByTestId("editor-command-overflow-menu"),
    );
    await expect(page.getByTestId("editor-command-overflow-room-context")).toBeVisible();
    await page.keyboard.press("Escape");
    // Free guests get Get Pro beside Sign in, at the bar's 36px height.
    await expect(page.getByTestId("editor-command-get-pro")).toHaveCSS("height", "36px");
    // The bar leads with Interior AI, then the design's name with its status under it.
    await expect(page.getByTestId("editor-command-home")).toHaveText("Interior AI");
    await expect(page.getByTestId("editor-design-title")).toHaveCSS("height", "24px");

    await page.setViewportSize({ width: 900, height: 800 });
    await expectCompactToolbarGeometry(page);
    await expectCanvasToolbarGeometry(page);
    // Compact desktops keep the step names and drop the numbers.
    await expect(page.getByTestId("editor-workflow-furnish").getByText("2", { exact: true })).toBeHidden();
    await expect(page.getByTestId("editor-workflow-furnish").getByText("Furnish", { exact: true })).toBeVisible();
    await expect(page.getByTestId("room-plan-status")).toBeHidden();
    await chooseStep(page, "editor-workflow-furnish");
    await openSuggestLayout(page);
    await chooseStep(page, "editor-workflow-plan");

    await page.screenshot({
      path: testInfo.outputPath("compact-toolbar-consumer-900px.png"),
      animations: "disabled",
    });
  });

  test("preserves the compact geometry and light Pro treatment", async ({
    page,
  }, testInfo) => {
    await mockProPlan(page);
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto("/design?mode=designer", { waitUntil: "domcontentloaded" });

    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible({
      timeout: 30_000,
    });
    await expectCompactToolbarGeometry(page);
    await expectCanvasToolbarGeometry(page);
    await expect(page.getByTestId("editor-command-bar")).toHaveClass(
      /bg-white\/95/,
    );

    await page.screenshot({
      path: testInfo.outputPath("compact-toolbar-pro-wide.png"),
      animations: "disabled",
    });
  });
});
