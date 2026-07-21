import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  openCatalogPreview,
  waitForCatalogReady,
} from "./variant-test-utils";

const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";
const SEATING_ZONE_AUTO_DISABLED_KEY = "seating_zone_auto_disabled";
const CAMMY_ARMCHAIR_ID = "armchair-real-castlery-cammy-armchair";
const AVERY_ARMCHAIR_ID =
  "armchair-real-castlery-avery-performance-armchair";
const AVERY_VARIANT_ID = "white_quartz";

type StoredZoneState = {
  activeRoomId: string;
  activeRoomName: string;
  itemIds: string[];
  manualZones: Array<{
    id: string;
    type: string;
    itemIds: string[];
  }>;
  inactiveRoomIds: string[];
  inactiveManualZoneCount: number;
};

async function clickWithDomFallback(locator: Locator) {
  await locator.click({ timeout: 5_000 }).catch(async () => {
    await locator.evaluate((element) => {
      (element as HTMLElement).click();
    });
  });
}

async function activateWithKeyboard(locator: Locator) {
  await locator.focus();
  await expect(locator).toBeFocused();
  await locator.press("Enter");
}

async function chooseTemplateStart(page: Page) {
  const betaTemplate = page.locator('[data-testid="beta-start-template"]:visible').first();
  if (await betaTemplate.isVisible().catch(() => false)) {
    await expect(betaTemplate).toBeEnabled({ timeout: 30_000 });
    await clickWithDomFallback(betaTemplate);
    return;
  }

  const planTab = page.getByTestId("editor-workflow-plan");
  if (await planTab.isVisible().catch(() => false)) {
    await clickWithDomFallback(planTab);
  }

  const manualPlanChoice = page.getByTestId(
    "plan-guided-actions-choice-manual"
  );
  if (await manualPlanChoice.isVisible().catch(() => false)) {
    await clickWithDomFallback(manualPlanChoice);
  }

  const planStartTemplate = page.locator('[data-testid="plan-start-template"]:visible').first();
  await expect(planStartTemplate).toBeVisible({ timeout: 30_000 });
  await expect(planStartTemplate).toBeEnabled({ timeout: 30_000 });
  await clickWithDomFallback(planStartTemplate);
}

async function readStoredZoneState(page: Page): Promise<StoredZoneState | null> {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;

    try {
      const stored = JSON.parse(raw) as {
        version?: number;
        activeRoomId?: string;
        rooms?: Array<{
          id?: string;
          name?: string;
          items?: Array<{ instanceId?: string }>;
          zones?: Array<{
            id?: string;
            type?: string;
            source?: string;
            itemIds?: string[];
          }>;
        }>;
      };
      if (stored.version !== 3 || !stored.activeRoomId || !stored.rooms) {
        return null;
      }

      const activeRoom = stored.rooms.find(
        (room) => room.id === stored.activeRoomId
      );
      if (!activeRoom) return null;

      return {
        activeRoomId: stored.activeRoomId,
        activeRoomName: activeRoom.name ?? "",
        itemIds: (activeRoom.items ?? [])
          .map((item) => item.instanceId ?? "")
          .filter(Boolean)
          .sort(),
        manualZones: (activeRoom.zones ?? [])
          .filter((zone) => zone.source === "manual")
          .map((zone) => ({
            id: zone.id ?? "",
            type: zone.type ?? "",
            itemIds: [...(zone.itemIds ?? [])].sort(),
          })),
        inactiveRoomIds: stored.rooms
          .filter((room) => room.id !== stored.activeRoomId)
          .map((room) => room.id ?? "")
          .filter(Boolean)
          .sort(),
        inactiveManualZoneCount: stored.rooms
          .filter((room) => room.id !== stored.activeRoomId)
          .flatMap((room) => room.zones ?? [])
          .filter((zone) => zone.source === "manual").length,
      };
    } catch {
      return null;
    }
  }, DESIGN_STORAGE_KEY);
}

async function waitForStoredZoneState(page: Page, manualZoneCount: number) {
  await expect
    .poll(
      async () => {
        const state = await readStoredZoneState(page);
        const manualZone = state?.manualZones[0] ?? null;
        return state
          ? {
              activeRoomName: state.activeRoomName,
              itemCount: state.itemIds.length,
              manualZoneCount: state.manualZones.length,
              manualZoneType: manualZone?.type ?? "",
              zoneMatchesItems:
                manualZone === null ||
                JSON.stringify(manualZone.itemIds) ===
                  JSON.stringify(state.itemIds),
              inactiveRoomIds: state.inactiveRoomIds,
              inactiveManualZoneCount: state.inactiveManualZoneCount,
            }
          : null;
      },
      { timeout: 20_000 }
    )
    .toEqual({
      activeRoomName: "Bedroom",
      itemCount: 2,
      manualZoneCount,
      manualZoneType: manualZoneCount === 1 ? "seating" : "",
      zoneMatchesItems: true,
      inactiveRoomIds: ["room_living"],
      inactiveManualZoneCount: 0,
    });

  const state = await readStoredZoneState(page);
  expect(state).not.toBeNull();
  return state!;
}

async function expectRenderedZoneState(
  page: Page,
  storedState: StoredZoneState,
  manualZoneCount: number
) {
  const marker = page.getByTestId("qa-editor-zone-state");
  const manualZoneItems = storedState.manualZones
    .map((zone) => [...zone.itemIds].sort().join(","))
    .sort()
    .join("|");

  await expect(marker).toHaveAttribute(
    "data-active-room-id",
    storedState.activeRoomId,
    { timeout: 30_000 }
  );
  await expect(marker).toHaveAttribute(
    "data-manual-zone-count",
    String(manualZoneCount)
  );
  await expect(marker).toHaveAttribute(
    "data-manual-zone-items",
    manualZoneItems
  );
}

async function buildStoredFixtureForLocalHydration(page: Page) {
  return page.evaluate(({ storageKey, productId, variantId }) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) throw new Error("Expected a local design backup");

    const stored = JSON.parse(raw) as {
      designId?: string | null;
      activeRoomId?: string;
      rooms?: Array<{
        id?: string;
        items?: Array<{
          productId?: string;
          variantId?: string;
          purchaseOptionId?: string;
          productSnapshot?: unknown;
        }>;
      }>;
    };
    stored.designId = null;
    const activeRoom = stored.rooms?.find(
      (room) => room.id === stored.activeRoomId
    );
    for (const item of activeRoom?.items ?? []) {
      item.productId = productId;
      item.variantId = variantId;
      delete item.purchaseOptionId;
      delete item.productSnapshot;
    }
    return JSON.stringify(stored);
  }, {
    storageKey: DESIGN_STORAGE_KEY,
    productId: AVERY_ARMCHAIR_ID,
    variantId: AVERY_VARIANT_ID,
  });
}

async function createManualZoneInBedroom(page: Page) {
  await chooseTemplateStart(page);
  const addBedroom = page.getByTestId("add-room-template-bedroom");
  await expect(addBedroom).toBeVisible({ timeout: 30_000 });
  await addBedroom.click();

  const catalogReady = await waitForCatalogReady(page);
  expect(catalogReady, "The live catalog must be ready for the zone fixture").toBe(
    true
  );
  const opened = await openCatalogPreview(
    page,
    CAMMY_ARMCHAIR_ID,
    "Cammy"
  );
  expect(opened, "The Cammy armchair fixture must be available").toBe(true);

  const drawer = page.getByTestId("catalog-item-drawer");
  await expect(drawer.getByText("Cammy Armchair", { exact: true })).toBeVisible();
  await expect(drawer).toContainText("Castlery • Arm Chair");
  await drawer.getByRole("button", { name: /Set of 2/ }).click();

  const addToRoom = page.getByTestId("catalog-detail-add-to-room");
  await expect(addToRoom).toContainText("Add set of 2 to Bedroom");
  await addToRoom.click();

  const confirmPlacement = page.getByTestId("catalog-placement-confirm");
  await expect(confirmPlacement).toBeVisible({ timeout: 10_000 });
  await confirmPlacement.click();
  await expect(page.getByText("Group (2)", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await activateWithKeyboard(
    page.getByRole("button", { name: "Create zone", exact: true })
  );
  await expect(page.getByTestId("selected-zone-label")).toHaveText("Seating area");
  await expect(page.getByRole("button", { name: "Ungroup", exact: true })).toBeVisible();
}

test.describe("22. Active-room zone persistence", () => {
  test("manual create and ungroup persist only in the active room", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    await page.addInitScript(() => {
      const sentinel = "__e2e_zone_persistence_storage_cleared";
      if (window.localStorage.getItem(sentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(sentinel, "1");
    });

    const response = await page.goto("/design", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });

    await createManualZoneInBedroom(page);
    const createdState = await waitForStoredZoneState(page, 1);
    await expectRenderedZoneState(page, createdState, 1);

    const browser = page.context().browser();
    if (!browser) throw new Error("Expected a browser-backed Playwright page");
    const baseURL = new URL(page.url()).origin;
    const createdHydrationFixture = await buildStoredFixtureForLocalHydration(
      page
    );
    const createdHydrationContext = await browser.newContext({ baseURL });
    await createdHydrationContext.addInitScript(
      ({ storageKey, fixture }) => {
        window.localStorage.setItem(storageKey, fixture);
      },
      {
        storageKey: DESIGN_STORAGE_KEY,
        fixture: createdHydrationFixture,
      }
    );
    const hydratedPage = await createdHydrationContext.newPage();
    await hydratedPage.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(hydratedPage.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    const hydratedState = await waitForStoredZoneState(hydratedPage, 1);
    expect(hydratedState.itemIds).toEqual(createdState.itemIds);
    expect(hydratedState.manualZones).toEqual(createdState.manualZones);
    await expectRenderedZoneState(hydratedPage, hydratedState, 1);
    await createdHydrationContext.close();

    await activateWithKeyboard(
      page.getByRole("button", { name: "Ungroup", exact: true })
    );
    const ungroupedState = await waitForStoredZoneState(page, 0);
    expect(ungroupedState.activeRoomId).toBe(createdState.activeRoomId);
    expect(ungroupedState.itemIds).toEqual(createdState.itemIds);
    await expectRenderedZoneState(page, ungroupedState, 0);
    await expect
      .poll(() =>
        page.evaluate(
          (storageKey) => window.localStorage.getItem(storageKey),
          SEATING_ZONE_AUTO_DISABLED_KEY
        )
      )
      .toBe("1");

    const ungroupedHydrationFixture =
      await buildStoredFixtureForLocalHydration(page);
    const ungroupedHydrationContext = await browser.newContext({ baseURL });
    await ungroupedHydrationContext.addInitScript(
      ({ storageKey, fixture, seatingPreferenceKey }) => {
        window.localStorage.setItem(storageKey, fixture);
        window.localStorage.setItem(seatingPreferenceKey, "1");
      },
      {
        storageKey: DESIGN_STORAGE_KEY,
        fixture: ungroupedHydrationFixture,
        seatingPreferenceKey: SEATING_ZONE_AUTO_DISABLED_KEY,
      }
    );
    const reloadedPage = await ungroupedHydrationContext.newPage();
    await reloadedPage.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(reloadedPage.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    const reloadedState = await waitForStoredZoneState(reloadedPage, 0);
    await expectRenderedZoneState(reloadedPage, reloadedState, 0);

    await reloadedPage.reload({ waitUntil: "domcontentloaded" });
    await expect(reloadedPage.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    const rehydratedState = await waitForStoredZoneState(reloadedPage, 0);
    await expectRenderedZoneState(reloadedPage, rehydratedState, 0);
    expect(
      await reloadedPage.evaluate(
        (storageKey) => window.localStorage.getItem(storageKey),
        SEATING_ZONE_AUTO_DISABLED_KEY
      )
    ).toBe("1");
    await ungroupedHydrationContext.close();
  });
});
