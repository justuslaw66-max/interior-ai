import { expect, test } from "./fixtures";

test.describe("Design sidebar", () => {
  test("left-edge hover reveals the collapsed sidebar without flickering", async ({
    page,
  }) => {
    await page.goto("/design?mode=designer");
    await page.waitForLoadState("domcontentloaded");

    const topToggle = page.getByTestId("editor-design-sidebar-toggle");
    await expect(topToggle).toBeVisible({ timeout: 20_000 });
    const blockingDialog = page.locator(".fixed.inset-0.z-50:visible").last();
    if (await blockingDialog.isVisible().catch(() => false)) {
      const dismissButton = blockingDialog
        .getByRole("button", {
          name: /^(Close|Maybe later|Not now|No thanks|Skip|Got it)$/i,
        })
        .last();
      if (await dismissButton.isVisible().catch(() => false)) {
        await dismissButton.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(blockingDialog).toBeHidden();
    }
    if ((await topToggle.getAttribute("data-state")) !== "collapsed") {
      await topToggle.click();
    }

    const edgeReveal = page.getByTestId("design-controls-edge-reveal");
    await expect(edgeReveal).toBeVisible();
    await edgeReveal.hover();

    const sidebar = page.getByTestId("design-controls-panel");
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toHaveAttribute("data-temporary-reveal", "true");

    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox).not.toBeNull();
    expect(sidebarBox?.x).toBeLessThanOrEqual(1);

    await page.waitForTimeout(700);
    await expect(sidebar).toBeVisible();

    await page.mouse.move(700, 300);
    await expect(sidebar).toHaveCount(0, { timeout: 2_000 });
    await expect(edgeReveal).toBeVisible();
  });
});
