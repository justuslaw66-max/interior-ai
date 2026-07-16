import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "./fixtures";
import { legacyApiToSnapshot } from "../../lib/room-persistence";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import {
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
} from "./beta-seed";

async function getSharedDesignFingerprint(
  request: APIRequestContext,
  designId: string,
  shareToken: string,
) {
  const response = await request.get(
    `/api/designs/${designId}?shareToken=${shareToken}`,
  );
  expect(response.status()).toBe(200);
  return fingerprintDesignSnapshot(legacyApiToSnapshot(await response.json()));
}

test.describe("4. Share Link Read-Only", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("shared design cannot expose editor mutations or change its snapshot", async ({
    page,
    request,
  }) => {
    test.setTimeout(120_000);
    const seed = await createBetaSeedDesign();
    try {
      const expectedFingerprint = fingerprintDesignSnapshot(seed.snapshot);
      expect(
        await getSharedDesignFingerprint(request, seed.designId, seed.shareToken),
      ).toBe(expectedFingerprint);

      const response = await page.goto(`/share/${seed.shareToken}`, {
        waitUntil: "domcontentloaded",
      });
      expect(response?.status()).toBe(200);
      const viewer = page.getByTestId("share-viewer");
      await expect(viewer).toBeVisible({ timeout: 30_000 });
      await expect(viewer).toHaveAttribute("data-ready", "true", {
        timeout: 30_000,
      });
      await expect(page.getByText(/No editing in share view/i)).toBeVisible();
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        expectedFingerprint,
      );
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-item-count",
        "9",
      );

      await expect(page.getByTestId("save-design")).toHaveCount(0);
      await expect(page.getByTestId("command-undo")).toHaveCount(0);
      await expect(page.getByTestId("selected-item-panel")).toHaveCount(0);
      await expect(page.getByTestId("create-share")).toHaveCount(0);

      await page.keyboard.press("Delete");
      await page.keyboard.press("Meta+Z");
      await viewer.locator("canvas").click({ position: { x: 80, y: 80 } });
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        expectedFingerprint,
      );
      expect(
        await getSharedDesignFingerprint(request, seed.designId, seed.shareToken),
      ).toBe(expectedFingerprint);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("shared design exposes and activates every saved presentation view", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seed = await createBetaSeedDesign();
    try {
      await page.goto(`/share/${seed.shareToken}`, {
        waitUntil: "domcontentloaded",
      });
      const viewer = page.getByTestId("share-viewer");
      await expect(viewer).toHaveAttribute("data-ready", "true", {
        timeout: 30_000,
      });
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-saved-view-count",
        "3",
      );
      const presentationViews = page.getByTestId("share-presentation-views");
      await expect(presentationViews).toContainText("Client Preview");
      await expect(presentationViews).toContainText("Dining Plan");
      await expect(presentationViews).toContainText("Bedroom Preview");

      const clientPreview = viewer.getByRole("button", {
        name: "Client Preview",
        exact: true,
      });
      await clientPreview.click();
      await expect(clientPreview).toHaveAttribute("aria-pressed", "true");

      await viewer.getByRole("button", { name: "Dining Room", exact: true }).click();
      const diningPlan = viewer.getByRole("button", {
        name: "Dining Plan",
        exact: true,
      });
      await expect(diningPlan).toBeVisible();
      await diningPlan.click();
      await expect(diningPlan).toHaveAttribute("aria-pressed", "true");

      await viewer.getByRole("button", { name: "Bedroom", exact: true }).click();
      const bedroomPreview = viewer.getByRole("button", {
        name: "Bedroom Preview",
        exact: true,
      });
      await expect(bedroomPreview).toBeVisible();
      await bedroomPreview.click();
      await expect(bedroomPreview).toHaveAttribute("aria-pressed", "true");
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});
