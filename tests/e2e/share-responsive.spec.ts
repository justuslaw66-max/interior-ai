import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  buildBetaDesignSnapshot,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
  getBetaPrismaClient,
} from "./beta-seed";

type ShareLayoutMode = "mobile" | "tablet" | "desktop";

async function expectFiniteAttribute(locator: Locator, name: string) {
  const value = Number(await locator.getAttribute(name));
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThan(0);
}

async function expectShareReady(
  page: Page,
  expected: { mode: ShareLayoutMode; roomId: string }
) {
  const root = page.getByTestId("public-share-root");
  await expect(root).toHaveAttribute("data-layout-status", "ready");
  await expect(root).toHaveAttribute("data-layout-mode", expected.mode);
  await expect(root).toHaveAttribute("data-selected-room-id", expected.roomId);
  await expectFiniteAttribute(root, "data-layout-generation");
  await expectFiniteAttribute(root, "data-surface-width");
  await expectFiniteAttribute(root, "data-surface-height");
  return root;
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    )
    .toBeLessThanOrEqual(1);
}

async function expectUniqueResponsiveIdentities(page: Page) {
  const duplicates = await page.locator(
    [
      '[data-testid^="public-share-"]',
      '[data-testid^="share-room-action-"]',
      '[data-testid^="share-saved-view-action-"]',
      '[data-testid="share-preview-surface"]',
      '[data-testid="share-room-list"]',
      '[data-testid="share-room-list-mobile"]',
      '[data-testid="share-room-list-table"]',
      '[data-testid="share-room-navigation"]',
      '[data-testid="share-saved-view-navigation"]',
    ].join(",")
  ).evaluateAll((nodes) => {
    const identities = nodes
      .map((node) => node.getAttribute("data-testid"))
      .filter((identity): identity is string => Boolean(identity));
    return identities.filter((identity, index) => identities.indexOf(identity) !== index);
  });
  expect(duplicates).toEqual([]);
  const duplicateIds = await page.getByTestId("public-share-root").locator("[id]").evaluateAll(
    (nodes) => {
      const ids = nodes.map((node) => node.id).filter(Boolean);
      return ids.filter((identity, index) => ids.indexOf(identity) !== index);
    }
  );
  expect(duplicateIds).toEqual([]);
}

async function expectTouchTargets(page: Page) {
  const geometryIssues = await page
    .locator(
      [
        '[data-testid="share-page-actions"] :is(button,a)',
        '[data-testid="share-client-handoff-summary"] a',
        '[data-testid="share-room-navigation"] button',
        '[data-testid="share-saved-view-navigation"] button',
        '[data-testid="share-footer-actions"] :is(button,a)',
      ].join(",")
    )
    .filter({ visible: true })
    .evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const rect = node.getBoundingClientRect();
        const roomNavigation = node.closest('[data-testid="share-room-navigation"]');
        const clipped = !roomNavigation && (rect.left < -1 || rect.right > window.innerWidth + 1);
        return rect.width < 44 || rect.height < 44 || clipped
          ? [{
              label: node.getAttribute("data-testid") ?? node.textContent?.trim(),
              width: rect.width,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              clipped,
            }]
          : [];
      })
    );
  expect(geometryIssues).toEqual([]);
}

test.describe("ARCH-RC53-55 responsive public share", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("single-room desktop and mobile share has a deterministic fallback and projection", async ({
    page,
  }) => {
    const snapshot = buildBetaDesignSnapshot();
    snapshot.rooms = [snapshot.rooms[0]];
    snapshot.activeRoomId = "removed-public-room";
    const seed = await createBetaSeedDesign({ snapshot });

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
      const desktopRoot = await expectShareReady(page, {
        mode: "desktop",
        roomId: "room_living",
      });
      const fingerprint = await desktopRoot.getAttribute("data-projection-fingerprint");
      const safeAreaStyle = await desktopRoot.getAttribute("style");
      for (const inset of ["top", "right", "bottom", "left"]) {
        expect(safeAreaStyle).toContain(`safe-area-inset-${inset}`);
      }
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        fingerprint ?? ""
      );
      await expect(page.getByTestId("share-room-list-table")).toBeVisible();
      await expect(page.getByTestId("share-room-list-mobile")).toHaveCount(0);
      await expect(page.getByTestId("share-room-action-beta-living")).toHaveCount(0);
      await expect(page.getByTestId("share-saved-view-action-view-living-client")).toBeVisible();

      const desktopGeneration = Number(
        await desktopRoot.getAttribute("data-layout-generation")
      );
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileRoot = await expectShareReady(page, {
        mode: "mobile",
        roomId: "room_living",
      });
      await expect(page.getByTestId("share-room-list-mobile")).toBeVisible();
      await expect(page.getByTestId("share-room-list-table")).toHaveCount(0);
      expect(Number(await mobileRoot.getAttribute("data-layout-generation"))).not.toBe(
        desktopGeneration
      );
      expect(await mobileRoot.getAttribute("data-projection-fingerprint")).toBe(fingerprint);
      await expectNoPageOverflow(page);
      await expectTouchTargets(page);
      await expectUniqueResponsiveIdentities(page);
    } finally {
      await cleanupBetaSeed(seed);
    }
  });

  test("multi-room selection, saved view, focus, and identity survive both resize directions", async ({
    page,
  }) => {
    const seed = await createBetaSeedDesign();
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
      const root = await expectShareReady(page, {
        mode: "desktop",
        roomId: "beta-living",
      });
      await expect(page.getByTestId("share-room-navigation")).toHaveAttribute(
        "aria-label",
        "Shared rooms"
      );
      await expect(page.getByTestId("share-room-list-table")).toContainText("Living Room");
      await expect(page.getByTestId("share-room-list-table")).toContainText("Dining Room");
      await expect(page.getByTestId("share-room-list-table")).toContainText("Bedroom");

      const diningRoom = page.getByTestId("share-room-action-beta-dining");
      await diningRoom.click();
      await expectShareReady(page, { mode: "desktop", roomId: "beta-dining" });
      await expect(diningRoom).toHaveAttribute("aria-pressed", "true");
      const diningView = page.getByTestId("share-saved-view-action-view-dining-plan");
      await diningView.click();
      await expect(diningView).toHaveAttribute("aria-pressed", "true");
      await diningView.focus();
      await expect(diningView).toBeFocused();
      const desktopGeneration = Number(await root.getAttribute("data-layout-generation"));

      await page.setViewportSize({ width: 390, height: 844 });
      const mobileRoot = await expectShareReady(page, {
        mode: "mobile",
        roomId: "beta-dining",
      });
      await expect(diningView).toHaveAttribute("aria-pressed", "true");
      await expect(diningView).toBeFocused();
      await expect(page.getByTestId("share-room-list-mobile")).toContainText("Living Room");
      await expect(page.getByTestId("share-room-list-mobile")).toContainText("Dining Room");
      await expect(page.getByTestId("share-room-list-mobile")).toContainText("Bedroom");
      await expect(page.getByTestId("share-room-navigation").getByRole("button")).toHaveCount(3);
      expect(await mobileRoot.getAttribute("data-projection-fingerprint")).toBe(
        await root.getAttribute("data-projection-fingerprint")
      );
      expect(Number(await mobileRoot.getAttribute("data-layout-generation"))).not.toBe(
        desktopGeneration
      );

      const livingRoom = page.getByTestId("share-room-action-beta-living");
      const authoredFocusOrder = page.locator(
        [
          '[data-testid="share-copy-link"]',
          '[data-testid="share-room-action-beta-living"]',
          '[data-testid="share-saved-view-action-view-dining-plan"]',
        ].join(",")
      );
      expect(
        await authoredFocusOrder.evaluateAll((nodes) => ({
          identities: nodes.map((node) => node.getAttribute("data-testid")),
          tabIndexes: nodes.map((node) => (node as HTMLElement).tabIndex),
        }))
      ).toEqual({
        identities: [
          "share-copy-link",
          "share-room-action-beta-living",
          "share-saved-view-action-view-dining-plan",
        ],
        tabIndexes: [0, 0, 0],
      });
      for (const control of await authoredFocusOrder.all()) {
        await control.focus();
        await expect(control).toBeFocused();
      }
      await livingRoom.focus();
      await page.keyboard.press("ArrowRight");
      await expect(diningRoom).toBeFocused();
      expect(
        await diningRoom.evaluate((node) => {
          const style = getComputedStyle(node);
          return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
        })
      ).toBe(true);

      const mobileGeneration = Number(await mobileRoot.getAttribute("data-layout-generation"));
      await page.setViewportSize({ width: 1280, height: 800 });
      const resizedRoot = await expectShareReady(page, {
        mode: "desktop",
        roomId: "beta-dining",
      });
      await expect(diningRoom).toBeFocused();
      expect(Number(await resizedRoot.getAttribute("data-layout-generation"))).not.toBe(
        mobileGeneration
      );
      await expectNoPageOverflow(page);
      await expectUniqueResponsiveIdentities(page);
    } finally {
      await cleanupBetaSeed(seed);
    }
  });

  test("tablet and mobile-landscape layouts remain ready without overflow", async ({ page }) => {
    const seed = await createBetaSeedDesign();
    try {
      for (const viewport of [
        { width: 768, height: 1024, mode: "tablet" as const },
        { width: 667, height: 375, mode: "mobile" as const },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
        await expectShareReady(page, { mode: viewport.mode, roomId: "beta-living" });
        await expectNoPageOverflow(page);
        await expectTouchTargets(page);
      }
    } finally {
      await cleanupBetaSeed(seed);
    }
  });

  test("history, reload, invalid, and revoked states are distinct and deterministic", async ({
    page,
  }) => {
    const seed = await createBetaSeedDesign();
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
      await expectShareReady(page, { mode: "mobile", roomId: "beta-living" });
      await page.getByTestId("share-room-action-beta-dining").click();
      await expectShareReady(page, { mode: "mobile", roomId: "beta-dining" });
      await page.getByTestId("share-shopping-list").click();
      await page.goBack();
      await expectShareReady(page, { mode: "mobile", roomId: "beta-dining" });
      await page.goForward();
      await expectShareReady(page, { mode: "mobile", roomId: "beta-dining" });

      await page.reload({ waitUntil: "domcontentloaded" });
      await expectShareReady(page, { mode: "mobile", roomId: "beta-living" });
      await expect(page.getByTestId("save-design")).toHaveCount(0);
      await expect(page.getByTestId("command-undo")).toHaveCount(0);
      await expect(page.getByTestId("create-share")).toHaveCount(0);

      await getBetaPrismaClient().design.update({
        where: { id: seed.designId },
        data: { shareEnabled: false },
      });
      await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("public-share-invalid")).toBeVisible();
      await expect(page.getByTestId("public-share-root")).toHaveCount(0);

      await page.goto("/share/not-a-valid-public-token", { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("public-share-invalid")).toBeVisible();
    } finally {
      await cleanupBetaSeed(seed);
    }
  });
});
