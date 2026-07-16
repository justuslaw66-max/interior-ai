import { type Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  openCatalogPreview,
  waitForCatalogReady,
} from "./variant-test-utils";

const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";
const ONBOARDING_STORAGE_KEY = "onboarded";
const MADISON_2S_ID = "sofa-real-castlery-madison-2s";

type PersistedOnboardingState = {
  version: number | null;
  activeRoomId: string;
  itemIds: string[];
  productIds: string[];
  seatingZones: Array<{
    id: string;
    itemIds: string[];
  }>;
  completed: boolean;
};

async function readPersistedOnboardingState(
  page: Page,
): Promise<PersistedOnboardingState | null> {
  return page.evaluate(
    ({ designStorageKey, onboardingStorageKey }) => {
      const raw = window.localStorage.getItem(designStorageKey);
      if (!raw) return null;

      try {
        const stored = JSON.parse(raw) as {
          version?: number;
          activeRoomId?: string;
          rooms?: Array<{
            id?: string;
            items?: Array<{
              instanceId?: string;
              productId?: string;
            }>;
            zones?: Array<{
              id?: string;
              type?: string;
              source?: string;
              itemIds?: string[];
            }>;
          }>;
        };
        const activeRoom = stored.rooms?.find(
          (room) => room.id === stored.activeRoomId,
        );
        if (!activeRoom || !stored.activeRoomId) return null;

        const items = activeRoom.items ?? [];
        return {
          version: stored.version ?? null,
          activeRoomId: stored.activeRoomId,
          itemIds: items
            .map((item) => item.instanceId ?? "")
            .filter(Boolean)
            .sort(),
          productIds: items
            .map((item) => item.productId ?? "")
            .filter(Boolean)
            .sort(),
          seatingZones: (activeRoom.zones ?? [])
            .filter(
              (zone) => zone.type === "seating" && zone.source === "manual",
            )
            .map((zone) => ({
              id: zone.id ?? "",
              itemIds: [...(zone.itemIds ?? [])].sort(),
            }))
            .sort((left, right) => left.id.localeCompare(right.id)),
          completed:
            window.localStorage.getItem(onboardingStorageKey) === "1",
        };
      } catch {
        return null;
      }
    },
    {
      designStorageKey: DESIGN_STORAGE_KEY,
      onboardingStorageKey: ONBOARDING_STORAGE_KEY,
    },
  );
}

async function expectCompletedOnboardingState(page: Page) {
  await expect
    .poll(
      async () => {
        const state = await readPersistedOnboardingState(page);
        return state
          ? {
              version: state.version,
              itemCount: state.itemIds.length,
              productIds: state.productIds,
              seatingZoneCount: state.seatingZones.length,
              seatingZoneMatchesItems:
                state.seatingZones.length === 1 &&
                JSON.stringify(state.seatingZones[0].itemIds) ===
                  JSON.stringify(state.itemIds),
              completed: state.completed,
            }
          : null;
      },
      { timeout: 30_000 },
    )
    .toEqual({
      version: 3,
      itemCount: 1,
      productIds: [MADISON_2S_ID],
      seatingZoneCount: 1,
      seatingZoneMatchesItems: true,
      completed: true,
    });

  const state = await readPersistedOnboardingState(page);
  if (!state) throw new Error("Completed onboarding state was not persisted");
  return state;
}

test.describe("1. Onboarding Activation Flow", () => {
  test("sofa placement persists its seating zone and completed onboarding across reload", async ({
    page,
  }) => {
    test.setTimeout(180_000);

    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ plan: "free", source: "playwright" }),
      });
    });
    await page.addInitScript(() => {
      const sentinel = "__e2e_onboarding_storage_cleared";
      if (window.localStorage.getItem(sentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(sentinel, "1");
      window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    });

    const planReady = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === "/api/me" &&
        candidate.status() === 200,
      { timeout: 120_000 },
    );
    const response = await page.goto("/design", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    await planReady;
    const initialOnboardingState = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ONBOARDING_STORAGE_KEY,
    );
    expect(initialOnboardingState).toBeNull();

    const opened = await openCatalogPreview(page, MADISON_2S_ID, "Madison", [
      /^Sofa \(/,
    ]);
    expect(opened, "The Madison onboarding fixture must be available").toBe(
      true,
    );
    await expect(page.getByTestId("catalog-item-drawer")).toContainText(
      "Madison Sofa",
    );
    await addCatalogDrawerItemToRoom(page);

    const persistedBeforeReload = await expectCompletedOnboardingState(page);
    const zoneState = page.getByTestId("qa-editor-zone-state");
    await expect(zoneState).toHaveAttribute(
      "data-active-room-id",
      persistedBeforeReload.activeRoomId,
    );
    await expect(zoneState).toHaveAttribute("data-manual-zone-count", "1");
    await expect(zoneState).toHaveAttribute(
      "data-manual-zone-items",
      persistedBeforeReload.itemIds.join(","),
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(zoneState).toHaveAttribute(
      "data-active-room-id",
      persistedBeforeReload.activeRoomId,
      { timeout: 60_000 },
    );
    await expect(zoneState).toHaveAttribute(
      "data-manual-zone-count",
      "1",
      { timeout: 60_000 },
    );
    await expect(zoneState).toHaveAttribute(
      "data-manual-zone-items",
      persistedBeforeReload.itemIds.join(","),
      { timeout: 60_000 },
    );
    await expect
      .poll(() => readPersistedOnboardingState(page), { timeout: 30_000 })
      .toEqual(persistedBeforeReload);

    const catalogReady = await waitForCatalogReady(page);
    expect(catalogReady, "The catalog must be available after reload").toBe(
      true,
    );
    await expect(page.getByTestId("furnish-shopping-preview")).toContainText(
      "Madison Sofa",
    );
    await expect(page.getByTestId("sofa-nudge")).toBeHidden();
    const completedOnboardingState = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      ONBOARDING_STORAGE_KEY,
    );
    expect(completedOnboardingState).toBe("1");
  });
});
