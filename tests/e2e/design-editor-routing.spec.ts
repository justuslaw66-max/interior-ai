import type { Page, Request } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import { legacyApiToSnapshot } from "../../lib/room-persistence";
import type { DesignSnapshot } from "../../lib/room-types";
import {
  addAuthCookies,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
  getBetaPrismaClient,
} from "./beta-seed";
import { getE2EBaseUrl } from "./release-environment";

const baseURL = getE2EBaseUrl();

function observeDesignMutations(page: Page) {
  const created: string[] = [];
  const updated: Array<{ pathname: string; payload: unknown }> = [];
  page.on("request", (request: Request) => {
    const pathname = new URL(request.url()).pathname;
    if (request.method() === "POST" && pathname === "/api/designs") {
      created.push(pathname);
    }
    if (request.method() === "PUT" && /^\/api\/designs\/[^/]+$/.test(pathname)) {
      let payload: unknown = null;
      try {
        payload = request.postDataJSON();
      } catch {
        payload = null;
      }
      updated.push({ pathname, payload });
    }
  });
  return { created, updated };
}

function fixtureStructure(snapshot: DesignSnapshot) {
  return {
    activeRoomId: snapshot.activeRoomId,
    openings: snapshot.floorPlan?.openings,
    rooms: snapshot.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      roomType: room.roomType,
      floorLevel: room.floorLevel,
      floorLabel: room.floorLabel,
      geometry: room.geometry,
      planPosition: room.planPosition,
      planShape: room.planShape,
      surfaceFinishes: room.surfaceFinishes,
      surfaceOpacity: room.surfaceOpacity,
      ceilingVisible: room.ceilingVisible,
      items: room.items.map((item) => ({
        instanceId: item.instanceId,
        productId: item.productId,
        variantId: item.variantId,
        position: item.position,
        rotationY: item.rotationY,
        includeInCheckout: item.includeInCheckout,
      })),
      zones: room.zones.map((zone) => ({
        id: zone.id,
        type: zone.type,
        itemIds: zone.itemIds,
        source: zone.source,
      })),
      savedViews: room.savedViews,
    })),
  };
}

function expectUpdateRetainsFixtureContent(
  payload: unknown,
  expected: DesignSnapshot
) {
  const snapshot = (payload as {
    snapshot?: DesignSnapshot;
  } | null)?.snapshot;
  expect(snapshot).toBeDefined();
  expect(fixtureStructure(snapshot as DesignSnapshot)).toEqual(
    fixtureStructure(expected)
  );
}

async function openMyDesigns(page: Page) {
  await page.getByTestId("editor-command-overflow").click();
  await page.getByTestId("editor-command-overflow-load").click();
  await expect(page.getByTestId("load-designs-modal")).toBeVisible();
}

async function settleCloudConflictIfItAppears(page: Page, designId: string) {
  const dialog = page.getByTestId("cloud-save-conflict-dialog");
  await dialog.waitFor({ state: "visible", timeout: 12_000 }).catch(() => undefined);
  if (!(await dialog.isVisible().catch(() => false))) return;
  await page.getByTestId("cloud-conflict-reload").click();
  await expect(dialog).toBeHidden({ timeout: 30_000 });
  await expectLoadedDesign(page, designId);
}

async function readStableFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /^[a-f0-9]{8}$/, {
    timeout: 30_000,
  });
  let previous = "";
  let stableSamples = 0;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const current = (await marker.getAttribute("data-fingerprint")) ?? "";
    if (current === previous) {
      stableSamples += 1;
      if (stableSamples >= 8) return current;
    } else {
      previous = current;
      stableSamples = 0;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Editor snapshot fingerprint did not stabilize");
}

async function expectLoadedDesign(page: Page, designId: string) {
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute(
    "data-design-id",
    designId,
    { timeout: 30_000 }
  );
  await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
    "3 rooms",
    { timeout: 30_000 }
  );
  return readStableFingerprint(page);
}

async function getPersistedFingerprint(page: Page, designId: string) {
  return fingerprintDesignSnapshot(await getPersistedSnapshot(page, designId));
}

async function getPersistedSnapshot(page: Page, designId: string) {
  const response = await page.request.get(`/api/designs/${encodeURIComponent(designId)}`);
  expect(response.status()).toBe(200);
  return legacyApiToSnapshot(await response.json());
}

function expectCanonicalUrl(page: Page, designId: string) {
  const url = new URL(page.url());
  expect(url.pathname).toBe("/design");
  expect(url.searchParams.get("designId")).toBe(designId);
  return url;
}

test.describe("canonical saved-design routing", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("dashboard navigation, history, refresh, save, and reload keep one persisted design", async ({
    page,
  }) => {
    test.setTimeout(210_000);
    const seed = await createBetaSeedDesign();
    const mutations = observeDesignMutations(page);
    try {
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "Open", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/design");
      expect([...expectCanonicalUrl(page, seed.designId).searchParams.entries()]).toEqual([
        ["designId", seed.designId],
      ]);

      const initialFingerprint = await expectLoadedDesign(page, seed.designId);
      const persistedAfterLoad = await getPersistedSnapshot(page, seed.designId);
      expect(initialFingerprint).toBe(fingerprintDesignSnapshot(persistedAfterLoad));
      expect(fixtureStructure(persistedAfterLoad)).toEqual(
        fixtureStructure(seed.snapshot)
      );
      await page.waitForTimeout(1_200);
      expect(mutations.created).toEqual([]);
      for (const update of mutations.updated) {
        expect(update.pathname).toBe(`/api/designs/${seed.designId}`);
        expectUpdateRetainsFixtureContent(update.payload, seed.snapshot);
      }
      const updatesBeforeEdit = mutations.updated.length;

      await page.goBack({ waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.goForward({ waitUntil: "domcontentloaded" });
      expectCanonicalUrl(page, seed.designId);
      await expectLoadedDesign(page, seed.designId);

      const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
      await widthInput.fill("5700");
      await widthInput.press("Enter");
      await expect(page.getByTestId("save-status")).toHaveAttribute(
        "data-status",
        "saved",
        { timeout: 30_000 }
      );
      const savedFingerprint = await readStableFingerprint(page);
      await expect
        .poll(() => getPersistedFingerprint(page, seed.designId), {
          timeout: 60_000,
        })
        .toBe(savedFingerprint);
      expect(mutations.created).toEqual([]);
      expect(mutations.updated.length).toBeGreaterThan(updatesBeforeEdit);
      expect(new Set(mutations.updated.map((update) => update.pathname))).toEqual(
        new Set([`/api/designs/${seed.designId}`])
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      expectCanonicalUrl(page, seed.designId);
      await expectLoadedDesign(page, seed.designId);
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        savedFingerprint,
        { timeout: 60_000 }
      );
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("legacy bookmark preserves only supported context and a URL cannot grant Pro", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    try {
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      const importId = "job/id ?&";
      await page.goto(
        `/design/${encodeURIComponent(seed.designId)}?mode=designer&view=2d&workspace=furnish&floorPlanImport=${encodeURIComponent(importId)}&next=${encodeURIComponent("https://evil.example")}&utm_source=ignored`,
        { waitUntil: "domcontentloaded" }
      );
      await page.waitForURL((url) => url.pathname === "/design");
      const url = expectCanonicalUrl(page, seed.designId);
      expect([...url.searchParams.entries()]).toEqual([
        ["designId", seed.designId],
        ["mode", "designer"],
        ["view", "2d"],
        ["workspace", "furnish"],
        ["floorPlanImport", importId],
      ]);
      await expectLoadedDesign(page, seed.designId);
      await expect(page.getByTestId("pro-mode-indicator")).toHaveCount(0);

      await getBetaPrismaClient().user.update({
        where: { id: seed.userId },
        data: { plan: "pro" },
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectLoadedDesign(page, seed.designId);
      await expect(page.getByTestId("pro-mode-indicator")).toBeVisible({
        timeout: 30_000,
      });
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("My Designs navigation, history, and refresh keep the selected design identity", async ({
    page,
  }) => {
    test.setTimeout(210_000);
    const email = `route-history-${Date.now()}@example.com`;
    const first = await createBetaSeedDesign({ email });
    const second = await createBetaSeedDesign({ email });
    const firstSnapshot = structuredClone(first.snapshot);
    const secondSnapshot = structuredClone(second.snapshot);
    for (const snapshot of [firstSnapshot, secondSnapshot]) {
      snapshot.rooms = snapshot.rooms.map((room) => ({
        ...room,
        items: [],
        zones: [],
        layoutVersions: [],
      }));
    }
    firstSnapshot.title = "Canonical route A";
    secondSnapshot.title = "Canonical route B";
    secondSnapshot.rooms[0].geometry.width = 6.35;
    try {
      await Promise.all([
        getBetaPrismaClient().design.update({
          where: { id: first.designId },
          data: {
            title: firstSnapshot.title,
            items: [],
            zones: [],
            snapshot: firstSnapshot as never,
          },
        }),
        getBetaPrismaClient().design.update({
          where: { id: second.designId },
          data: {
            title: secondSnapshot.title,
            roomWidth: secondSnapshot.rooms[0].geometry.width,
            items: [],
            zones: [],
            snapshot: secondSnapshot as never,
          },
        }),
      ]);
      await addAuthCookies(page.context(), baseURL, first.sessionToken);
      await page.goto(`/design?designId=${encodeURIComponent(first.designId)}`, {
        waitUntil: "domcontentloaded",
      });
      await expectLoadedDesign(page, first.designId);
      await settleCloudConflictIfItAppears(page, first.designId);
      const firstFingerprint = await readStableFingerprint(page);
      const seededSecondFingerprint = fingerprintDesignSnapshot(secondSnapshot);
      expect(firstFingerprint).not.toBe(seededSecondFingerprint);

      await openMyDesigns(page);
      await page.getByTestId(`load-design-${second.designId}`).click();
      await page.waitForURL(
        (url) => url.searchParams.get("designId") === second.designId
      );
      const secondFingerprint = await expectLoadedDesign(page, second.designId);
      expect(secondFingerprint).toBe(
        await getPersistedFingerprint(page, second.designId)
      );
      expect(secondFingerprint).not.toBe(firstFingerprint);

      await page.goBack({ waitUntil: "domcontentloaded" });
      expectCanonicalUrl(page, first.designId);
      await expectLoadedDesign(page, first.designId);
      await page.goForward({ waitUntil: "domcontentloaded" });
      expectCanonicalUrl(page, second.designId);
      await expectLoadedDesign(page, second.designId);
      await page.reload({ waitUntil: "domcontentloaded" });
      expectCanonicalUrl(page, second.designId);
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        secondFingerprint,
        { timeout: 60_000 }
      );
    } finally {
      await cleanupBetaSeed(first.userId);
    }
  });

  test("duplicate failure stays put and success opens the returned copy ID", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const seed = await createBetaSeedDesign();
    const duplicatePath = `/api/designs/${seed.designId}/duplicate`;
    try {
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      const sessionReady = page.waitForResponse(
        (response) => new URL(response.url()).pathname === "/api/auth/session"
      );
      await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
      const sessionPayload = (await (await sessionReady).json()) as {
        user?: { id?: unknown };
      };
      expect(sessionPayload.user?.id).toBe(seed.userId);
      await page.route(`**${duplicatePath}`, async (route) => {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary duplicate failure" }),
        });
      });
      const failedResponse = page.waitForResponse(
        (response) => new URL(response.url()).pathname === duplicatePath
      );
      await page.getByRole("button", { name: "Duplicate", exact: true }).click();
      expect((await failedResponse).status()).toBe(503);
      await expect(
        page.locator('span[role="alert"]', {
          hasText: "Temporary duplicate failure",
        })
      ).toHaveText("Temporary duplicate failure");
      await expect(page).toHaveURL(/\/dashboard$/);
      await page.unroute(`**${duplicatePath}`);

      const duplicateResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === duplicatePath &&
          response.request().method() === "POST"
      );
      await page.getByRole("button", { name: "Duplicate", exact: true }).click();
      const response = await duplicateResponse;
      expect(response.status()).toBe(200);
      const body = (await response.json()) as { id?: unknown };
      expect(typeof body.id).toBe("string");
      const duplicateId = body.id as string;
      expect(duplicateId).not.toBe(seed.designId);

      await page.waitForURL((url) => url.pathname === "/design");
      expectCanonicalUrl(page, duplicateId);
      const duplicateFingerprint = await expectLoadedDesign(page, duplicateId);
      expect(duplicateFingerprint).toBe(
        await getPersistedFingerprint(page, duplicateId)
      );
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("checkout continuation loads its owned design and missing context selects none", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    try {
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      await page.goto(
        `/checkout/success?order_id=route-e2e&designId=${encodeURIComponent(seed.designId)}`,
        { waitUntil: "domcontentloaded" }
      );
      await page.getByRole("link", { name: "Back to this design" }).click();
      await page.waitForURL((url) => url.pathname === "/design");
      expectCanonicalUrl(page, seed.designId);
      await expectLoadedDesign(page, seed.designId);

      await page.goto("/checkout/success?order_id=route-e2e-missing", {
        waitUntil: "domcontentloaded",
      });
      await expect(
        page.getByRole("link", { name: "Back to this design" })
      ).toHaveCount(0);
      expect(new URL(page.url()).searchParams.has("designId")).toBe(false);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("a denied ID cannot retain another loaded design under the denied URL", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const owner = await createBetaSeedDesign();
    const other = await createBetaSeedDesign();
    const mutations = observeDesignMutations(page);
    try {
      await addAuthCookies(page.context(), baseURL, owner.sessionToken);
      await page.goto(
        `/design?designId=${encodeURIComponent(owner.designId)}&mode=designer&view=2d&workspace=furnish`,
        { waitUntil: "domcontentloaded" }
      );
      const ownerFingerprint = await expectLoadedDesign(page, owner.designId);
      await page.waitForTimeout(1_200);
      mutations.created.length = 0;
      mutations.updated.length = 0;
      const deniedResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === `/api/designs/${other.designId}`
      );
      await page.evaluate((designId) => {
        window.history.pushState(
          null,
          "",
          `/design?designId=${encodeURIComponent(designId)}&mode=designer&view=2d&workspace=furnish`
        );
      }, other.designId);
      expect((await deniedResponse).status()).toBe(404);
      await page.waitForURL(
        (url) => url.searchParams.get("designId") === owner.designId
      );
      const restoredUrl = expectCanonicalUrl(page, owner.designId);
      expect(restoredUrl.searchParams.get("mode")).toBe("designer");
      expect(restoredUrl.searchParams.get("view")).toBe("2d");
      expect(restoredUrl.searchParams.get("workspace")).toBe("furnish");
      await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute(
        "data-design-id",
        owner.designId,
        { timeout: 30_000 }
      );
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        ownerFingerprint,
        { timeout: 30_000 }
      );
      await page.waitForTimeout(1_200);
      expect(mutations.created).toEqual([]);
      expect(
        mutations.updated.some(
          (update) => update.pathname === `/api/designs/${other.designId}`
        )
      ).toBe(false);
    } finally {
      await cleanupBetaSeed(owner.userId);
      await cleanupBetaSeed(other.userId);
    }
  });
});
