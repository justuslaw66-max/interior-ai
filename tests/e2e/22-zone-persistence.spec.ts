import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  confirmCatalogPlacementIfVisible,
  openCatalogPreview,
  selectEditorWorkspace,
  waitForCatalogReady,
} from "./variant-test-utils";

const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";
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

async function chooseTemplateStart(page: Page) {
  const betaTemplate = page.locator('[data-testid="beta-start-template"]:visible').first();
  if (await betaTemplate.isVisible().catch(() => false)) {
    await expect(betaTemplate).toBeEnabled({ timeout: 30_000 });
    await clickWithDomFallback(betaTemplate);
    return;
  }

  const planTab = page.getByTestId("editor-workflow-plan").first();
  if ((await planTab.getAttribute("data-active")) !== "true") {
    await selectEditorWorkspace(page, "editor-workflow-plan");
  }

  // Tips off, as the first-visit "Manual editing" choice used to leave it (UX audit ED6).
  const tipsSwitch = page.getByTestId("plan-guided-actions-toggle");
  if (
    (await tipsSwitch.isVisible().catch(() => false)) &&
    (await tipsSwitch.getAttribute("data-enabled")) === "true"
  ) {
    await clickWithDomFallback(tipsSwitch);
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

async function buildStoredFixtureForLocalHydration(page: Page, withSeatingZone = false) {
  return page.evaluate(({ storageKey, productId, variantId, withSeatingZone }) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) throw new Error("Expected a local design backup");

    const stored = JSON.parse(raw) as {
      designId?: string | null;
      activeRoomId?: string;
      rooms?: Array<{
        id?: string;
        items?: Array<{
          instanceId?: string;
          productId?: string;
          variantId?: string;
          purchaseOptionId?: string;
          productSnapshot?: unknown;
        }>;
        zones?: Array<{ id: string; type: string; source: string; itemIds: string[] }>;
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
    // A seating zone a Pro user made over the set, as saved.
    if (activeRoom && withSeatingZone) {
      const itemIds = (activeRoom.items ?? []).map((item) => item.instanceId ?? "").filter(Boolean);
      activeRoom.zones = [
        ...(activeRoom.zones ?? []).filter((zone) => zone.source !== "manual"),
        { id: "zone-e2e-seating", type: "seating", source: "manual", itemIds },
      ];
    }
    return JSON.stringify(stored);
  }, {
    storageKey: DESIGN_STORAGE_KEY,
    productId: AVERY_ARMCHAIR_ID,
    variantId: AVERY_VARIANT_ID,
    withSeatingZone,
  });
}

async function placeArmchairSetInBedroom(page: Page) {
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
  // Consumers' Add places the set at once, with Undo (FU4); a preview only when no spot is open.
  expect(await confirmCatalogPlacementIfVisible(page)).toBe(true);
  await expect(page.getByText("Group (2)", { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  // Consumers align a group but make no zones (UX 4g, FU6): zone type and Create zone are Pro's.
  await expect(page.getByRole("button", { name: "Align X centre", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create zone", exact: true })).toHaveCount(0);
}

async function openStoredDesign(page: Page, fixture: string) {
  const browser = page.context().browser();
  if (!browser) throw new Error("Expected a browser-backed Playwright page");
  const context = await browser.newContext({ baseURL: new URL(page.url()).origin });
  await context.addInitScript(
    ({ storageKey, stored }) => {
      window.localStorage.setItem(storageKey, stored);
    },
    { storageKey: DESIGN_STORAGE_KEY, stored: fixture }
  );
  const opened = await context.newPage();
  await opened.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(opened.getByTestId("scene-canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  return { context, opened };
}

test.describe("22. Active-room zone persistence", () => {
  // The first sofa no longer makes a seating zone and zones are Pro's (UX 4g, FU6). A saved zone
  // still loads, only in its room, and reloads unchanged; consumers get no zone toolbar.
  test("a saved seating zone hydrates only in the active room", async ({
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

    await placeArmchairSetInBedroom(page);
    const placedState = await waitForStoredZoneState(page, 0);
    await expectRenderedZoneState(page, placedState, 0);

    const zoned = await openStoredDesign(page, await buildStoredFixtureForLocalHydration(page, true));
    const hydratedState = await waitForStoredZoneState(zoned.opened, 1);
    expect(hydratedState.manualZones.map((zone) => zone.id)).toEqual(["zone-e2e-seating"]);
    await expectRenderedZoneState(zoned.opened, hydratedState, 1);
    await expect(zoned.opened.getByTestId("selected-zone-label")).toHaveCount(0);

    await zoned.opened.reload({ waitUntil: "domcontentloaded" });
    await expect(zoned.opened.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    const reloadedState = await waitForStoredZoneState(zoned.opened, 1);
    expect(reloadedState.manualZones).toEqual(hydratedState.manualZones);
    await expectRenderedZoneState(zoned.opened, reloadedState, 1);
    await zoned.context.close();

    const plain = await openStoredDesign(page, await buildStoredFixtureForLocalHydration(page));
    const plainState = await waitForStoredZoneState(plain.opened, 0);
    await expectRenderedZoneState(plain.opened, plainState, 0);
    await plain.context.close();
  });
});
