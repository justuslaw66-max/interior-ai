import { expect, test, type Locator, type Page } from "@playwright/test";

const CLOSED_CONTROL_TEST_IDS = [
  "editor-design-sidebar-toggle",
  "command-undo",
  "command-redo",
  "editor-view-toggle",
  "editor-command-workspace",
  "editor-command-new-plan",
  "save-status",
  "save-design",
  "editor-command-overflow",
  "editor-command-account",
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

async function openWorkspaceMenu(page: Page) {
  const trigger = page.getByTestId("editor-command-workspace");
  await expect
    .poll(
      async () => {
        if ((await trigger.getAttribute("aria-expanded")) !== "true") {
          await trigger.evaluate((button) => (button as HTMLButtonElement).click());
        }
        return trigger.getAttribute("aria-expanded");
      },
      { timeout: 30_000 },
    )
    .toBe("true");
  await expect(page.getByTestId("editor-command-workspace-menu")).toBeVisible();
}

async function chooseWorkspace(page: Page, testId: string, label: string) {
  const option = page.getByTestId(testId);
  await expect(async () => {
    await openWorkspaceMenu(page);
    await expect(option).toBeVisible();
    const bounds = await option.boundingBox();
    expect(
      bounds?.height,
      `${label} menu row should retain comfortable sizing`,
    ).toBeGreaterThanOrEqual(36);
    await option.evaluate((button) => (button as HTMLButtonElement).click());
    await expect(option).toHaveAttribute("data-active", "true", {
      timeout: 5_000,
    });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("editor-command-workspace")).toContainText(label);
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
    await expect(page.getByTestId("editor-command-workspace").getByText("Workspace", {
      exact: true,
    })).toBeVisible();

    await openWorkspaceMenu(page);
    await expectMenuRowsStayComfortable(
      page.getByTestId("editor-command-workspace-menu"),
    );
    await page.keyboard.press("Escape");

    await chooseWorkspace(page, "editor-workflow-furnish", "Furnish");
    await chooseWorkspace(page, "editor-workflow-ai", "AI Design");
    await chooseWorkspace(page, "editor-workflow-plan", "Plan");

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
    await page.getByTestId("editor-command-account").click();
    await expectMenuRowsStayComfortable(
      page.getByTestId("editor-command-account-menu"),
    );
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 900, height: 800 });
    await expectCompactToolbarGeometry(page);
    await expect(page.getByTestId("editor-command-workspace").getByText("Workspace", {
      exact: true,
    })).toBeHidden();
    await expect(page.getByTestId("room-plan-status")).toBeHidden();
    await chooseWorkspace(page, "editor-workflow-furnish", "Furnish");
    await chooseWorkspace(page, "editor-workflow-ai", "AI Design");
    await chooseWorkspace(page, "editor-workflow-plan", "Plan");

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
