import { test, expect } from "../fixtures";
import {
  createSampleFloorPlanPdf,
} from "./helpers";

export function registerUploadTests() {
  test("floor plan upload exposes pdf pages and calibration controls", async ({ page }) => {
    const underlayRenderWarnings: string[] = [];
    page.on("console", (message) => {
      const text = message.text();
      if (
        text.includes("Cannot update a component") &&
        text.includes("LoadingOverlay") &&
        text.includes("ImagePlanUnderlay")
      ) {
        underlayRenderWarnings.push(text);
      }
    });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();
    await page
      .getByTestId("plan-tool-section-importFloorPlan")
      .getByRole("button", { name: "Import floor plan", exact: true })
      .click();
    await page.getByTestId("plan-tool-import-2d").click();
    await expect(page.getByTestId("floor-plan-upload-empty-state")).toBeVisible();
    await page.getByTestId("floor-plan-upload-input").setInputFiles({
      name: "sample-floor-plan.pdf",
      mimeType: "application/pdf",
      buffer: await createSampleFloorPlanPdf(),
    });
    await expect(page.getByTestId("floor-plan-file-name")).toHaveText("sample-floor-plan.pdf");
    await expect(page.getByTestId("floor-plan-pdf-status")).toHaveText("PDF page 1 of 2 rendered for tracing.");
    await expect(page.getByTestId("floor-plan-pdf-page-select")).toHaveValue("1");
    await page.getByTestId("floor-plan-pdf-page-select").selectOption("2");
    await expect(page.getByTestId("floor-plan-pdf-status")).toHaveText(
      "PDF page 2 of 2 rendered for tracing.",
      { timeout: 20000 }
    );
    await expect(page.getByTestId("floor-plan-pdf-page-select")).toHaveValue("2");

    await page.getByTestId("floor-plan-calibration-toggle").click();
    await expect(page.getByText("Set plan scale")).toBeVisible();
    await expect(page.getByText("0/2 points")).toBeVisible();
    expect(underlayRenderWarnings).toEqual([]);
  });
}
