import { expect, type Page } from "@playwright/test";

export async function confirmPlanTemplateReplacementIfNeeded(page: Page) {
  const replaceDialog = page.getByRole("dialog", { name: "Start a new plan?" });
  const appeared = await replaceDialog
    .waitFor({ state: "visible", timeout: 3_000 })
    .then(
      () => true,
      () => false,
    );

  if (!appeared) return;

  await page.getByTestId("new-plan-replace-current").click();
  await expect(replaceDialog).toBeHidden();
}
