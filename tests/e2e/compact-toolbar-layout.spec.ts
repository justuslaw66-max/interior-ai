import { expect, test, type Locator, type Page } from "@playwright/test";

const CLOSED_CONTROL_TEST_IDS = [
  "editor-design-sidebar-toggle",
  "command-undo",
  "command-redo",
  "editor-view-toggle",
  "editor-design-steps",
  "save-status",
  "save-design",
  "editor-command-overflow",
  // Both tests run as guests, whose account corner is Sign in.
  "editor-command-sign-in",
] as const;

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
    .toBe(36);

  const barBounds = await commandBar.boundingBox();
  expect(barBounds).not.toBeNull();
  const expectedCenterY = barBounds!.y + barBounds!.height / 2;

  for (const testId of CLOSED_CONTROL_TEST_IDS) {
    const control = page.getByTestId(testId);
    await expect(control, `${testId} should remain visible`).toBeVisible();
    const bounds = await control.boundingBox();
    expect(bounds, `${testId} should have measurable bounds`).not.toBeNull();
    expect(bounds!.height, `${testId} should be approximately 30px high`).toBeGreaterThanOrEqual(29);
    expect(bounds!.height, `${testId} should be approximately 30px high`).toBeLessThanOrEqual(31);
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
    await expect(page.getByTestId("room-plan-status")).toBeVisible();
    await expect(page.getByTestId("room-plan-status")).toHaveCSS("height", "30px");
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
    await page.keyboard.press("Escape");
    // Free guests get Get Pro beside Sign in, at the bar's 30px height.
    await expect(page.getByTestId("editor-command-get-pro")).toHaveCSS("height", "30px");

    await page.setViewportSize({ width: 900, height: 800 });
    await expectCompactToolbarGeometry(page);
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
    await expect(page.getByTestId("editor-command-bar")).toHaveClass(
      /bg-white\/95/,
    );

    await page.screenshot({
      path: testInfo.outputPath("compact-toolbar-pro-wide.png"),
      animations: "disabled",
    });
  });
});
