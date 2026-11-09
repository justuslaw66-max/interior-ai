import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import { legacyApiToSnapshot } from "../../lib/room-persistence";
import type { PersistedPlanOpening } from "../../lib/room-types";
import {
  addAuthCookies,
  buildBetaDesignSnapshot,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
} from "./beta-seed";
import { selectEditorWorkspace } from "./variant-test-utils";
import {
  allowKnownChromiumDesignRuntimeEvents,
  installBrowserRuntimePolicy,
  type BrowserRuntimePolicy,
} from "./browser-runtime-policy";

const CLOUD_AUTOSAVE_DELAY_MS = 900;
const CLOUD_READY_TIMEOUT_MS = 30_000;
const runtimePolicies = new WeakMap<Page, BrowserRuntimePolicy>();

test.beforeEach(async ({ page }, testInfo) => {
  const policy = installBrowserRuntimePolicy(
    page,
    testInfo.titlePath.join(" > "),
  );
  allowKnownChromiumDesignRuntimeEvents(policy);
  runtimePolicies.set(page, policy);
});

test.afterEach(async ({ page }, testInfo) => {
  const policy = runtimePolicies.get(page);
  policy?.assertSatisfied();
  const acceptedCancellations = policy?.getAcceptedNavigationCancellations() ?? [];
  if (acceptedCancellations.length > 0) {
    await testInfo.attach("accepted-navigation-cancellations", {
      body: Buffer.from(JSON.stringify(acceptedCancellations, null, 2)),
      contentType: "application/json",
    });
  }
});

function allowExpectedHttpFailure(input: {
  page: Page;
  method: string;
  pathname: string;
  status: number;
  reason: string;
}) {
  const policy = runtimePolicies.get(input.page);
  policy?.allowHttpFailure({
    method: input.method,
    url: new URL(input.pathname, input.page.url()).href,
    status: input.status,
    minCount: 1,
    maxCount: 1,
    reason: input.reason,
  });
  const descriptions: Record<number, string> = {
    401: "Unauthorized",
    409: "Conflict",
    503: "Service Unavailable",
  };
  const description = descriptions[input.status];
  if (description) policy?.allowConsoleMessage({
    type: "error",
    text: `Failed to load resource: the server responded with a status of ${input.status} (${description})`,
    minCount: 0,
    maxCount: 1,
    reason: `Chromium reports the exact expected ${input.status} response in its console`,
  });
}

async function readStableFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/, {
    timeout: 30_000,
  });
  let previous = "";
  let stableSamples = 0;
  // Local backup hydration can precede the authenticated cloud snapshot by
  // more than 500 ms. Require two seconds of quiescence before comparing.
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

async function expectPersistedFingerprint(
  page: Page,
  designId: string,
  expectedFingerprint: string,
) {
  await expect
    .poll(
      async () => {
        const response = await page.request.get(`/api/designs/${designId}`);
        if (response.status() !== 200) return `http-${response.status()}`;
        return fingerprintDesignSnapshot(
          legacyApiToSnapshot(await response.json()),
        );
      },
      { timeout: 60_000 },
    )
    .toBe(expectedFingerprint);
}

async function expectCloudDesignReady(
  page: Page,
  designId: string,
  revision?: string,
) {
  const marker = page.getByTestId("qa-editor-cloud-design");
  await expect(
    marker,
    `Cloud design ${designId} did not become authoritative.`,
  ).toHaveAttribute("data-design-id", designId, {
    timeout: CLOUD_READY_TIMEOUT_MS,
  });
  await expect(marker).toHaveAttribute(
    "data-cloud-revision",
    revision ?? /^\d{4}-\d{2}-\d{2}T/,
    { timeout: CLOUD_READY_TIMEOUT_MS },
  );
  await expect(marker).toHaveAttribute(
    "data-cloud-baseline-status",
    "acknowledged",
    { timeout: CLOUD_READY_TIMEOUT_MS },
  );
  await expect(page.getByTestId("save-status")).toHaveAttribute(
    "data-status",
    "saved",
    { timeout: CLOUD_READY_TIMEOUT_MS },
  );
  await expect(page.getByTestId("save-status")).toHaveAttribute(
    "data-source",
    "cloud",
    { timeout: CLOUD_READY_TIMEOUT_MS },
  );
}

async function expectWriteCountStableAcrossAutosaveWindows(
  readCount: () => number,
  expectedCount: number,
) {
  const observationEndsAt = Date.now() + CLOUD_AUTOSAVE_DELAY_MS * 2 + 100;
  await expect
    .poll(
      () => ({
        complete: Date.now() >= observationEndsAt,
        count: readCount(),
      }),
      {
        intervals: [100],
        timeout: CLOUD_AUTOSAVE_DELAY_MS * 2 + 1_000,
      },
    )
    .toEqual({ complete: true, count: expectedCount });
}

async function openMyDesigns(page: Page) {
  const accountButton = page.getByTestId("editor-command-account");
  const accountMenu = page.getByTestId("editor-command-account-menu");
  await expect(async () => {
    if (!(await accountMenu.isVisible())) {
      await accountButton.click();
    }
    await expect(accountMenu).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("editor-command-sign-out")).toBeVisible({
    timeout: 30_000,
  });
  await accountButton.click();

  await page.getByTestId("editor-command-overflow").click();
  const loadDesigns = page.getByTestId("editor-command-overflow-load");
  await expect(loadDesigns).toBeVisible();
  await loadDesigns.click();
}

// My designs is its own page (MD1): its cards open a design in the editor, which restores its
// saved design and products first, then loads the one asked for.
async function openDesignFromMyDesigns(page: Page, designId: string) {
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await page.getByTestId(`my-design-open-${designId}`).click();
  await expect(page).toHaveURL(new RegExp(`[?&]designId=${designId}(?:&|$)`), { timeout: 30_000 });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute("data-design-id", designId, {
    timeout: 30_000,
  });
}

async function loadSeedDesign(
  page: Page,
  seed: Awaited<ReturnType<typeof createBetaSeedDesign>>,
) {
  await page.addInitScript(() => {
    window.localStorage.setItem("plan_measurement_unit", "mm");
  });
  const initialResponse = await page.goto("/design", {
    waitUntil: "domcontentloaded",
  });
  expect(initialResponse?.status()).toBe(200);
  await addAuthCookies(page.context(), new URL(page.url()).origin, seed.sessionToken);
  const navigation = runtimePolicies.get(page)?.beginNavigationCancellation({
    reason: "reload the completed anonymous bootstrap document with the auth cookie",
    // The dev document can still be loading layout, main-app, and design-page
    // scripts when this immediate authentication reload replaces it.
    maxCancellations: 3,
  });
  try {
    const authenticatedResponse = await page.reload({
      waitUntil: "domcontentloaded",
    });
    expect(authenticatedResponse?.status()).toBe(200);
    const sceneCanvas = page.getByTestId("scene-canvas").first();
    await expect(sceneCanvas).toBeVisible({ timeout: 30_000 });
    await expect(sceneCanvas).toHaveAttribute("data-client-hydrated", "true", {
      timeout: 30_000,
    });
    navigation?.completeReplacementReady();
  } catch (cause) {
    navigation?.failReplacement(
      cause instanceof Error ? cause.message : String(cause),
    );
    throw cause;
  }
  await openMyDesigns(page);
  await openDesignFromMyDesigns(page, seed.designId);
  await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
    "3 rooms",
  );
}

async function openFurnishPanel(page: Page) {
  await selectEditorWorkspace(page, "editor-workflow-furnish");
  await expect(page.getByTestId("furnish-room-target-select")).toBeVisible();
}

// Saved views are on the 3D view's Views button (UX audit SX4, phase 4e).
async function openSavedViews(page: Page) {
  const toolbar = page.getByTestId("canvas-view-toolbar");
  await toolbar.getByTestId("editor-view-3d").click();
  await expect(toolbar.getByTestId("editor-view-3d")).toHaveAttribute("aria-pressed", "true");
  await toolbar.getByTestId("canvas-saved-views").click();
  await expect(page.getByTestId("canvas-saved-views-panel")).toBeVisible();
  await expect(page.getByTestId("camera-view-name-input")).toBeVisible();
}

async function closeSavedViews(page: Page) {
  const views = page.getByTestId("canvas-saved-views");
  await views.click();
  await expect(page.getByTestId("canvas-saved-views-panel")).toHaveCount(0);
  await expect(views).toHaveAttribute("aria-expanded", "false");
}

async function expectLoadedDesignRemainsStable(
  page: Page,
  designId: string,
  fingerprint: string,
) {
  for (let sample = 0; sample < 8; sample += 1) {
    await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute(
      "data-design-id",
      designId,
    );
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      fingerprint,
    );
    await expect(page.getByTestId("save-status")).toHaveAttribute(
      "data-status",
      "saved",
    );
    await expect(page.getByTestId("save-status")).toHaveAttribute(
      "data-source",
      "cloud",
    );
    await page.waitForTimeout(125);
  }
}

test.describe("3. Save + Reload Persistence", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("window dimensions and field evidence survive undo, redo, cloud save, and reload", async ({ page }) => {
    test.setTimeout(180_000);
    const snapshot = buildBetaDesignSnapshot();
    const opening: PersistedPlanOpening = {
      id: "opening-dining-window", roomId: "beta-dining", kind: "window",
      wall: "east", offsetMm: 650, widthMm: 1400, heightMm: 1200, bottomMm: 900,
      evidence: { height: "source_documented", sillHeight: "site_measured" },
    };
    snapshot.activeRoomId = "beta-dining";
    snapshot.floorPlan = {
      ...snapshot.floorPlan,
      openings: snapshot.floorPlan?.openings?.map((entry) =>
        entry.id === opening.id ? opening : entry),
    };
    const initialOpenings = snapshot.floorPlan.openings;
    expect(initialOpenings?.filter((entry) => entry.id === opening.id)).toHaveLength(1);
    const edited: PersistedPlanOpening = {
      ...opening, widthMm: 1600,
      evidence: { ...opening.evidence, width: "user_confirmed" },
    };
    const editedOpenings = initialOpenings?.map((entry) =>
      entry.id === opening.id ? edited : entry);
    const seed = await createBetaSeedDesign({ snapshot });
    const successfulWrites: unknown[] = [];
    page.on("response", (response) => {
      if (response.status() === 200 && response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/designs/${seed.designId}`) {
        successfulWrites.push(response.request().postDataJSON()?.snapshot?.floorPlan?.openings);
      }
    });
    const storedOpenings = (): Promise<unknown> => page.evaluate(() => {
      const raw = localStorage.getItem("interior-ai:v1:livingroom-design");
      return raw ? JSON.parse(raw).floorPlan?.openings ?? null : null;
    });
    const selectWindow = async () => {
      await page.getByTestId("editor-view-2d").click();
      await page.locator(`[data-testid="plan-opening-kind-label"][data-opening-id="${opening.id}"]`).click();
      await expect(page.getByTestId("selection-inspector-opening-dimensions")).toBeVisible();
    };
    const expectInspector = async (width: string, evidence: string) => {
      await expect(page.getByTestId("selection-inspector-opening-kind")).toHaveValue("window");
      const widthInput = page.getByTestId("selection-inspector-opening-width");
      await expect(widthInput).toHaveValue(width);
      await expect(widthInput).toHaveAttribute("data-model-value-mm", width);
      await expect(widthInput).toBeEnabled();
      for (const [field, value] of [["height", "1200"], ["bottom", "900"]]) {
        const input = page.getByTestId(`selection-inspector-opening-${field}`);
        await expect(input).toHaveValue(value);
        await expect(input).toHaveAttribute("data-model-value-mm", value);
        await expect(input).toBeDisabled();
      }
      await expect(page.getByTestId("selection-inspector-opening-width-evidence-badge")).toHaveText(evidence);
      await expect(page.getByTestId("selection-inspector-opening-height-evidence-badge")).toHaveText("Source documented");
      await expect(page.getByTestId("selection-inspector-opening-sill-evidence-badge")).toHaveText("Site measured");
    };
    const expectCloudOpenings = async (expected: typeof initialOpenings) => {
      const response = await page.request.get(`/api/designs/${seed.designId}`);
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.id).toBe(seed.designId);
      expect(body.snapshot.floorPlan.openings).toEqual(expected);
    };
    try {
      await loadSeedDesign(page, seed);
      await expectCloudDesignReady(page, seed.designId);
      await expectCloudOpenings(initialOpenings);
      await selectWindow();
      await expectInspector("1400", "Estimated");
      await expect.poll(storedOpenings).toEqual(initialOpenings);
      const baseline = await readStableFingerprint(page);

      const width = page.getByTestId("selection-inspector-opening-width");
      await width.fill("1600");
      await width.press("Enter");
      await expect.poll(storedOpenings).toEqual(editedOpenings);
      await expectInspector("1600", "User confirmed");
      const editedFingerprint = await readStableFingerprint(page);
      expect(editedFingerprint).not.toBe(baseline);
      await page.getByTestId("command-undo").click();
      await expect.poll(storedOpenings).toEqual(initialOpenings);
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute("data-fingerprint", baseline);
      await expectInspector("1400", "Estimated");
      await page.getByTestId("command-redo").click();
      await expect.poll(storedOpenings).toEqual(editedOpenings);
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute("data-fingerprint", editedFingerprint);
      await expectInspector("1600", "User confirmed");

      // A design in the account saves itself, so the bar has no Save (Decision E): autosave sends it.
      await expect(page.getByTestId("save-design")).toHaveCount(0);
      await expectCloudDesignReady(page, seed.designId);
      await expect.poll(() => successfulWrites, { timeout: 30_000 }).toContainEqual(editedOpenings);
      await expectPersistedFingerprint(page, seed.designId, editedFingerprint);
      await expectCloudOpenings(editedOpenings);
      const [reloadResponse] = await Promise.all([
        page.waitForResponse((response) =>
          response.request().method() === "GET" &&
          new URL(response.url()).pathname === `/api/designs/${seed.designId}` &&
          !new URL(response.url()).searchParams.has("shareToken")),
        page.reload({ waitUntil: "domcontentloaded" }),
      ]);
      expect(reloadResponse.status()).toBe(200);
      const reloaded = await reloadResponse.json();
      expect(reloaded.id).toBe(seed.designId);
      expect(reloaded.snapshot.floorPlan.openings).toEqual(editedOpenings);
      await expectCloudDesignReady(page, seed.designId);
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute("data-fingerprint", editedFingerprint);
      await selectWindow();
      await expectInspector("1600", "User confirmed");
      await expect.poll(storedOpenings).toEqual(editedOpenings);
      await expectCloudOpenings(editedOpenings);
    } finally {
      await cleanupBetaSeed(seed);
    }
  });

  test("cloud save preserves items, zones, and named views after reload", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const seed = await createBetaSeedDesign();
    let designCreateRequests = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        new URL(request.url()).pathname === "/api/designs"
      ) {
        designCreateRequests += 1;
      }
    });
    try {
      await loadSeedDesign(page, seed);
      const loadedFingerprint = await readStableFingerprint(page);
      expect(loadedFingerprint).toMatch(/^[a-f0-9]{8}$/);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-zone-count",
        "1",
      );

      await openFurnishPanel(page);
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(4);

      await openSavedViews(page);
      await expect(page.getByTestId("saved-camera-view-list")).toContainText(
        "Client Preview",
      );
      await page.getByTestId("camera-view-name-input").fill("Persistence E2E View");
      await page.getByTestId("save-named-camera-view").click();
      await expect(page.getByTestId("saved-camera-view-list")).toContainText(
        "Persistence E2E View",
      );
      await closeSavedViews(page);

      // No Save on a design in the account (Decision E): autosave sends the view.
      await expect(page.getByTestId("save-design")).toHaveCount(0);
      const saveStatus = page.getByTestId("save-status");
      await expect(saveStatus).toHaveAttribute("data-status", "saved", {
        timeout: 30_000,
      });
      await expect(saveStatus).toHaveAttribute("data-source", "cloud");
      await expect(saveStatus).toHaveAttribute("aria-label", /^Saved\. Saved to your account /);
      expect(designCreateRequests).toBe(0);
      const savedFingerprint = await readStableFingerprint(page);
      expect(savedFingerprint).not.toBe(fingerprintDesignSnapshot(seed.snapshot));
      await expectPersistedFingerprint(page, seed.designId, savedFingerprint);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect
        .poll(() =>
          page.evaluate(
            ({ key, designId }) => {
              const raw = window.localStorage.getItem(key);
              return raw ? JSON.parse(raw)?.designId === designId : false;
            },
            {
              key: "interior-ai:v1:livingroom-design",
              designId: seed.designId,
            },
          ),
        )
        .toBe(true);
      await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute(
        "data-design-id",
        seed.designId,
        {
          timeout: 30_000,
        },
      );
      const reloadedFingerprint = await readStableFingerprint(page);
      expect(reloadedFingerprint).toMatch(/^[a-f0-9]{8}$/);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-zone-count",
        "1",
      );
      await openFurnishPanel(page);
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(4);
      await openSavedViews(page);
      await expect(page.getByTestId("saved-camera-view-list")).toContainText(
        "Persistence E2E View",
      );
      await closeSavedViews(page);
      await expect(page.getByTestId("save-design")).toHaveCount(0);
      await expect(saveStatus).toHaveAttribute("data-status", "saved", {
        timeout: 30_000,
      });
      expect(designCreateRequests).toBe(0);
      const fingerprintBeforeSecondReload = await readStableFingerprint(page);
      await expectPersistedFingerprint(
        page,
        seed.designId,
        fingerprintBeforeSecondReload,
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 30_000,
      });
      await expectCloudDesignReady(page, seed.designId);
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        fingerprintBeforeSecondReload,
        { timeout: 60_000 },
      );
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("cloud save failure stays visible and recovers through retry", async ({ page }) => {
    test.setTimeout(120_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      allowExpectedHttpFailure({
        page, method: "PUT", pathname: `/api/designs/${seed.designId}`,
        status: 503, reason: "exercise visible cloud-save retry recovery",
      });
      let rejectedWrite = false;
      const designRoute = `**/api/designs/${seed.designId}`;
      await page.route(designRoute, async (route) => {
        if (route.request().method() === "PUT") {
          rejectedWrite = true;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            headers: { "x-operation-id": "phase7-save-failure" },
            body: JSON.stringify({
              error: "Cloud save is temporarily unavailable.",
              code: "INTERNAL_ERROR",
              operationId: "phase7-save-failure",
            }),
          });
          return;
        }
        await route.continue();
      });

      const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
      await widthInput.fill("5900");
      await widthInput.press("Enter");
      await expect(widthInput).toHaveValue("5900");

      const saveStatus = page.getByTestId("save-status");
      await expect(saveStatus).toHaveAttribute("data-status", "failed", {
        timeout: 30_000,
      });
      await expect(saveStatus).toHaveAttribute("aria-label", /^Not saved\. /);
      await expect(page.getByTestId("save-status-retry")).toBeVisible();
      expect(rejectedWrite).toBe(true);

      await page.unroute(designRoute);
      await page.getByTestId("save-status-retry").click();
      await expect(saveStatus).toHaveAttribute("data-status", "saved", {
        timeout: 30_000,
      });
      await expect(saveStatus).toHaveAttribute("aria-label", /^Saved\. Saved to your account /);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  // Leaving for My designs waits for a design-A write already on its way, then saves A's latest
  // edits; design B, opened from My designs, then loads and stays as it is.
  for (const staleResult of ["success", "failure"] as const) {
    test(`a design-A write ending in ${staleResult} settles before My designs opens design B`, async ({
      page,
    }) => {
      test.setTimeout(150_000);
      const email = `arch-rc53-${staleResult}-${Date.now()}@example.com`;
      const seedA = await createBetaSeedDesign({ email });
      try {
        const seedB = await createBetaSeedDesign({ email });
        await loadSeedDesign(page, seedA);
        if (staleResult === "failure") {
          allowExpectedHttpFailure({
            page, method: "PUT", pathname: `/api/designs/${seedA.designId}`,
            status: 503, reason: "prove a stale failed write is inert",
          });
        }

        let captureWrite!: (route: Route) => void;
        const heldWrite = new Promise<Route>((resolve) => {
          captureWrite = resolve;
        });
        let writeCaptured = false;
        const designARoute = `**/api/designs/${seedA.designId}`;
        await page.route(designARoute, async (route) => {
          if (route.request().method() === "PUT" && !writeCaptured) {
            writeCaptured = true;
            captureWrite(route);
            return;
          }
          await route.continue();
        });

        const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
        await widthInput.fill("5900");
        await widthInput.press("Enter");
        const delayedWrite = await heldWrite;

        await openMyDesigns(page);
        // The editor stays open, saving, while the earlier write is on its way.
        await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saving");
        await expect(page).toHaveURL(/\/design\?/);
        const responseObserved = page.waitForResponse((response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/designs/${seedA.designId}`
        );
        if (staleResult === "success") {
          await delayedWrite.continue();
        } else {
          await delayedWrite.fulfill({
            status: 503,
            contentType: "application/json",
            headers: { "x-operation-id": "arch-rc53-stale-failure" },
            body: JSON.stringify({
              error: "An earlier write failed while leaving for My designs.",
              code: "INTERNAL_ERROR",
              operationId: "arch-rc53-stale-failure",
            }),
          });
        }
        await responseObserved;
        await openDesignFromMyDesigns(page, seedB.designId);
        const savedA = await page.request.get(`/api/designs/${encodeURIComponent(seedA.designId)}`);
        expect(savedA.status()).toBe(200);
        expect(legacyApiToSnapshot(await savedA.json()).rooms[0]?.geometry.width,
          "Design A's latest edit was saved before the editor closed.").toBe(5.9);
        await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute(
          "data-design-id",
          seedB.designId,
          { timeout: 30_000 },
        );
        const fingerprintB = await readStableFingerprint(page);
        await expect(
          page.getByRole("spinbutton", { name: "Width mm" }).first(),
        ).toHaveValue("5800");
        await expectLoadedDesignRemainsStable(page, seedB.designId, fingerprintB);
        await expect(
          page.getByRole("spinbutton", { name: "Width mm" }).first(),
        ).toHaveValue("5800");
        await page.unroute(designARoute);
      } finally {
        await cleanupBetaSeed(seedA.userId);
      }
    });
  }

  test("cloud conflict pauses autosave and preserves local work as a new copy", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      await expectCloudDesignReady(page, seed.designId);
      allowExpectedHttpFailure({
        page, method: "PUT", pathname: `/api/designs/${seed.designId}`,
        status: 409, reason: "create the single recovery-copy conflict",
      });
      const originalResponse = await page.request.get(
        `/api/designs/${encodeURIComponent(seed.designId)}`,
      );
      expect(originalResponse.status()).toBe(200);
      const originalSnapshot = legacyApiToSnapshot(await originalResponse.json());
      const originalFingerprint = fingerprintDesignSnapshot(originalSnapshot);
      let rejectedWrites = 0;
      await page.route(`**/api/designs/${seed.designId}`, async (route) => {
        if (route.request().method() === "PUT") {
          rejectedWrites += 1;
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              error: "This design changed in another session.",
              code: "CONFLICT",
            }),
          });
          return;
        }
        await route.continue();
      });

      const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
      await widthInput.fill("5900");
      await widthInput.press("Enter");
      const localFingerprint = await readStableFingerprint(page);

      const dialog = page.getByTestId("cloud-save-conflict-dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId("cloud-conflict-save-copy")).toBeFocused();
      const saveStatus = page.getByTestId("save-status");
      await expect(saveStatus).toHaveAttribute("data-status", "conflict");
      await expect(saveStatus).toHaveAttribute(
        "data-last-successful-save-at",
        /\d{4}-\d{2}-\d{2}T/
      );

      const writesAtConflict = rejectedWrites;
      await expectWriteCountStableAcrossAutosaveWindows(
        () => rejectedWrites,
        writesAtConflict,
      );

      const copyCreated = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname === "/api/designs",
      );
      await page.getByTestId("cloud-conflict-save-copy").click();
      const copyResponse = await copyCreated;
      expect(copyResponse.status()).toBe(201);
      const copyIdentity = await copyResponse.json() as {
        id: string;
        updatedAt: string;
      };
      expect(copyIdentity.id).not.toBe(seed.designId);
      const copyRequestSnapshot = legacyApiToSnapshot(
        copyResponse.request().postDataJSON(),
      );
      expect(copyRequestSnapshot.rooms).toHaveLength(3);
      expect(fingerprintDesignSnapshot(copyRequestSnapshot)).toBe(localFingerprint);
      await expect(dialog).toBeHidden({ timeout: 30_000 });
      await expect
        .poll(() =>
          page.evaluate(() => new URL(window.location.href).searchParams.get("designId")),
        )
        .toBe(copyIdentity.id);
      await expectCloudDesignReady(page, copyIdentity.id, copyIdentity.updatedAt);
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        localFingerprint
      );

      const storedCopyResponse = await page.request.get(
        `/api/designs/${encodeURIComponent(copyIdentity.id)}`,
      );
      expect(storedCopyResponse.status()).toBe(200);
      const storedCopyBody = await storedCopyResponse.json();
      expect(storedCopyBody.updatedAt).toBe(copyIdentity.updatedAt);
      const storedCopySnapshot = legacyApiToSnapshot(storedCopyBody);
      expect(storedCopySnapshot.rooms).toHaveLength(3);
      expect(storedCopySnapshot.rooms[0]?.geometry.width).toBe(5.9);
      expect(fingerprintDesignSnapshot(storedCopySnapshot)).toBe(localFingerprint);
      await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
        "3 rooms",
      );

      const unchangedOriginalResponse = await page.request.get(
        `/api/designs/${encodeURIComponent(seed.designId)}`,
      );
      expect(unchangedOriginalResponse.status()).toBe(200);
      expect(
        fingerprintDesignSnapshot(
          legacyApiToSnapshot(await unchangedOriginalResponse.json()),
        ),
      ).toBe(originalFingerprint);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("cloud conflict reload requires an explicit destructive choice", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      allowExpectedHttpFailure({
        page, method: "PUT", pathname: `/api/designs/${seed.designId}`,
        status: 409, reason: "exercise explicit destructive conflict reload",
      });
      const loadedCloudFingerprint = await readStableFingerprint(page);
      await page.route(`**/api/designs/${seed.designId}`, async (route) => {
        if (route.request().method() === "PUT") {
          await route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({
              error: "This design changed in another session.",
              code: "CONFLICT",
            }),
          });
          return;
        }
        await route.continue();
      });

      const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
      await widthInput.fill("5900");
      await widthInput.press("Enter");
      const dialog = page.getByTestId("cloud-save-conflict-dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      await expect(dialog).toContainText("Autosave is paused");
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();

      await page.getByTestId("cloud-conflict-reload").click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });
      await expect(widthInput).toHaveValue("5800");
      await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        loadedCloudFingerprint,
        { timeout: 30_000 }
      );
      await expect(page.getByTestId("save-status")).toHaveAttribute(
        "data-status",
        "saved"
      );
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("switching rooms restores each room's isolated items and zones", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      const loadedFingerprint = await readStableFingerprint(page);
      await openFurnishPanel(page);
      const roomSelect = page.getByTestId("furnish-room-target-select");

      await roomSelect.selectOption("beta-dining");
      await expect(page.getByTestId("furnish-active-room-name")).toContainText(
        "Dining Room",
      );
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(3);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-manual-zone-items",
        "beta-sloane-table-1",
      );

      await roomSelect.selectOption("beta-bedroom");
      await expect(page.getByTestId("furnish-active-room-name")).toContainText(
        "Bedroom",
      );
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(2);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-manual-zone-items",
        "beta-bedroom-chair-1,beta-bedroom-hugg-table-1",
      );

      await roomSelect.selectOption("beta-living");
      await expect(page.getByTestId("furnish-active-room-name")).toContainText(
        "Living Room",
      );
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(4);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-manual-zone-items",
        "beta-avery-chair-2,beta-dawson-chair-1,beta-hugg-side-table-1,beta-hugg-table-1",
      );
      const cycledFingerprint = await readStableFingerprint(page);
      expect(cycledFingerprint).toMatch(/^[a-f0-9]{8}$/);
      expect(cycledFingerprint).not.toBe(fingerprintDesignSnapshot(seed.snapshot));
      expect(loadedFingerprint).toMatch(/^[a-f0-9]{8}$/);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});

// Edits the account never took stay in this browser per design (lib/design-page-unsent-edits.ts)
// and come back when the design opens again: saved on the revision they were made on, or, when
// the account copy changed since, the conflict dialog asks which copy to keep.
test.describe("3b. Unsent edits survive reopening a design", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  async function refuseDesignWrites(
    page: Page,
    designId: string,
    status: 401 | 503,
  ) {
    allowExpectedHttpFailure({
      page, method: "PUT", pathname: `/api/designs/${designId}`, status,
      reason: status === 401
        ? "an expired sign-in refuses the autosave"
        : "a dropped connection loses the autosave",
    });
    const route = `**/api/designs/${designId}`;
    await page.route(route, async (request) => {
      if (request.request().method() !== "PUT") return request.continue();
      await request.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(status === 401
          ? { error: "Sign in to continue.", code: "UNAUTHORIZED" }
          : { error: "Cloud save is temporarily unavailable.", code: "INTERNAL_ERROR" }),
      });
    });
    return () => page.unroute(route);
  }

  async function editWidthTo5900(page: Page) {
    const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
    await widthInput.fill("5900");
    await widthInput.press("Enter");
    await expect(widthInput).toHaveValue("5900");
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "failed", {
      timeout: 30_000,
    });
  }

  // Another device renames the design, so the account copy moves on without this browser's edit.
  async function renameOnAnotherDevice(page: Page, designId: string) {
    const current = await page.request.get(`/api/designs/${encodeURIComponent(designId)}`);
    const body = await current.json() as Record<string, unknown>;
    const renamed = await page.request.put(`/api/designs/${encodeURIComponent(designId)}`, {
      data: {
        items: body.items, zones: body.zones, savedViews: body.savedViews,
        roomWidth: body.roomWidth, roomDepth: body.roomDepth, snapshot: body.snapshot,
        title: "Renamed on another device", expectedUpdatedAt: body.updatedAt,
      },
    });
    expect(renamed.status()).toBe(200);
  }

  async function storedWidth(page: Page, designId: string) {
    const response = await page.request.get(`/api/designs/${encodeURIComponent(designId)}`);
    expect(response.status()).toBe(200);
    return legacyApiToSnapshot(await response.json()).rooms[0]?.geometry.width;
  }

  // A full navigation in the middle of a session can cancel the editor's in-flight telemetry
  // beacons, as the sign-in reload above can cancel scripts.
  async function navigateWithinSession(page: Page, reason: string, navigate: () => Promise<unknown>, ready: () => Promise<void>) {
    const navigation = runtimePolicies.get(page)?.beginNavigationCancellation({ reason, maxCancellations: 6 });
    try {
      await navigate();
      await ready();
      navigation?.completeReplacementReady();
    } catch (cause) {
      navigation?.failReplacement(cause instanceof Error ? cause.message : String(cause));
      throw cause;
    }
  }

  async function reloadDesign(page: Page) {
    await navigateWithinSession(page, "reload the design", () => page.reload({ waitUntil: "domcontentloaded" }), async () => {
      const sceneCanvas = page.getByTestId("scene-canvas").first();
      await expect(sceneCanvas).toHaveAttribute("data-client-hydrated", "true", { timeout: 30_000 });
    });
  }

  async function openDesignById(page: Page, designId: string) {
    await navigateWithinSession(page, `open design ${designId} by its link`,
      () => page.goto(`/design?designId=${encodeURIComponent(designId)}`, { waitUntil: "domcontentloaded" }),
      () => expectCloudDesignReady(page, designId));
  }

  test("a reload after a failed save brings the edit back and saves it", async ({ page }) => {
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      await expectCloudDesignReady(page, seed.designId);
      const allowWrites = await refuseDesignWrites(page, seed.designId, 503);
      await editWidthTo5900(page);
      expect(await storedWidth(page, seed.designId)).toBe(5.8);

      await allowWrites();
      await reloadDesign(page);
      await expect(page.getByRole("spinbutton", { name: "Width mm" }).first()).toHaveValue("5900", {
        timeout: 30_000,
      });
      await expect.poll(() => storedWidth(page, seed.designId), { timeout: 60_000 }).toBe(5.9);
      await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", {
        timeout: 30_000,
      });
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("an expired sign-in asks to sign in and keeps the edit for the next visit", async ({ page }) => {
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      await expectCloudDesignReady(page, seed.designId);
      const allowWrites = await refuseDesignWrites(page, seed.designId, 401);
      await editWidthTo5900(page);
      const saveStatus = page.getByTestId("save-status");
      await expect(saveStatus).toHaveAttribute("aria-label", /^Signed out\. /);
      await expect(page.getByTestId("save-status-retry")).toHaveText("Sign in");

      // Signing in again brings the person back to the design, as this reload does.
      await allowWrites();
      await reloadDesign(page);
      await expect.poll(() => storedWidth(page, seed.designId), { timeout: 60_000 }).toBe(5.9);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("another device's save in between asks which copy to keep", async ({ page }) => {
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      await expectCloudDesignReady(page, seed.designId);
      const allowWrites = await refuseDesignWrites(page, seed.designId, 503);
      await editWidthTo5900(page);
      await allowWrites();

      await renameOnAnotherDevice(page, seed.designId);

      const dialog = page.getByTestId("cloud-save-conflict-dialog");
      // Twice: closing or reloading with the dialog open must not turn the edit into one made on
      // the renamed copy, which autosave would then send over it.
      for (let reopen = 0; reopen < 2; reopen += 1) {
        await reloadDesign(page);
        await expect(dialog).toBeVisible({ timeout: 30_000 });
        await expect(page.getByTestId("cloud-save-conflict-message")).toContainText("weren't saved");
        await page.waitForTimeout(CLOUD_AUTOSAVE_DELAY_MS * 3);
        expect(await storedWidth(page, seed.designId)).toBe(5.8);
      }

      await page.getByTestId("cloud-conflict-reload").click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });
      await expect(page.getByRole("spinbutton", { name: "Width mm" }).first()).toHaveValue("5800");
      await reloadDesign(page);
      await expectCloudDesignReady(page, seed.designId);
      await readStableFingerprint(page);
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("spinbutton", { name: "Width mm" }).first()).toHaveValue("5800");
      expect(await storedWidth(page, seed.designId)).toBe(5.8);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("saving the reopened edit as a copy leaves the original as the account has it", async ({ page }) => {
    test.setTimeout(180_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      await expectCloudDesignReady(page, seed.designId);
      const allowWrites = await refuseDesignWrites(page, seed.designId, 503);
      await editWidthTo5900(page);
      await allowWrites();
      await renameOnAnotherDevice(page, seed.designId);

      await reloadDesign(page);
      const dialog = page.getByTestId("cloud-save-conflict-dialog");
      await expect(dialog).toBeVisible({ timeout: 30_000 });
      const copyCreated = page.waitForResponse((response) =>
        response.request().method() === "POST" && new URL(response.url()).pathname === "/api/designs");
      await page.getByTestId("cloud-conflict-save-copy").click();
      const copy = await (await copyCreated).json() as { id: string };
      await expect(dialog).toBeHidden({ timeout: 30_000 });
      await expect.poll(() => storedWidth(page, copy.id), { timeout: 60_000 }).toBe(5.9);

      await openDesignById(page, seed.designId);
      await readStableFingerprint(page);
      await expect(dialog).toBeHidden();
      await expect(page.getByRole("spinbutton", { name: "Width mm" }).first()).toHaveValue("5800");
      expect(await storedWidth(page, seed.designId)).toBe(5.8);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("opening another design keeps the first design's unsent edit", async ({ page }) => {
    test.setTimeout(180_000);
    const email = `unsent-switch-${Date.now()}@example.com`;
    const seedA = await createBetaSeedDesign({ email });
    try {
      const seedB = await createBetaSeedDesign({ email });
      await loadSeedDesign(page, seedA);
      await expectCloudDesignReady(page, seedA.designId);
      const allowWrites = await refuseDesignWrites(page, seedA.designId, 503);
      await editWidthTo5900(page);
      await allowWrites();

      await openDesignById(page, seedB.designId);
      await expect(page.getByRole("spinbutton", { name: "Width mm" }).first()).toHaveValue("5800");

      await openDesignById(page, seedA.designId);
      await expect(page.getByRole("spinbutton", { name: "Width mm" }).first()).toHaveValue("5900", {
        timeout: 30_000,
      });
      await expect.poll(() => storedWidth(page, seedA.designId), { timeout: 60_000 }).toBe(5.9);
      expect(await storedWidth(page, seedB.designId)).toBe(5.8);
    } finally {
      await cleanupBetaSeed(seedA.userId);
    }
  });
});

// Earlier versions (lib/design-checkpoints.ts): every save keeps the design as it stood before it,
// at most one every 10 minutes, and a restore keeps the current design first.
test.describe("3c. Earlier versions", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  async function serverWidth(page: Page, designId: string) {
    const response = await page.request.get(`/api/designs/${encodeURIComponent(designId)}`);
    expect(response.status()).toBe(200);
    return legacyApiToSnapshot(await response.json()).rooms[0]?.geometry.width;
  }

  async function openEarlierVersions(page: Page) {
    await page.getByTestId("editor-command-overflow").click();
    await page.getByTestId("editor-command-overflow-earlier-versions").click();
    const dialog = page.getByTestId("design-earlier-versions-dialog");
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test("a save keeps the version before it, and restoring it can itself be undone", async ({ page }) => {
    test.setTimeout(180_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      await expectCloudDesignReady(page, seed.designId);
      let dialog = await openEarlierVersions(page);
      await expect(page.getByTestId("design-earlier-versions-empty")).toBeVisible({ timeout: 30_000 });
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();

      const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
      await widthInput.fill("5900");
      await widthInput.press("Enter");
      await expect.poll(() => serverWidth(page, seed.designId), { timeout: 60_000 }).toBe(5.9);
      await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 30_000 });

      dialog = await openEarlierVersions(page);
      const restoreButtons = page.getByTestId("design-earlier-versions-restore");
      await expect(restoreButtons).toHaveCount(1, { timeout: 30_000 });
      await expect(restoreButtons.first()).toBeEnabled();
      // The restored version opens afresh, as the account now has it: the server answers, then the page reloads.
      const navigation = runtimePolicies.get(page)?.beginNavigationCancellation({
        reason: "a restored version reloads the editor", maxCancellations: 6 });
      try {
        const restored = page.waitForResponse((response) =>
          response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/restore"));
        const reloaded = page.waitForEvent("load");
        await restoreButtons.first().click();
        expect((await restored).status()).toBe(200);
        await reloaded;
        await expectCloudDesignReady(page, seed.designId);
        navigation?.completeReplacementReady();
      } catch (cause) {
        navigation?.failReplacement(cause instanceof Error ? cause.message : String(cause));
        throw cause;
      }
      await expect(page.getByRole("spinbutton", { name: "Width mm" }).first()).toHaveValue("5800", { timeout: 30_000 });
      expect(await serverWidth(page, seed.designId)).toBe(5.8);

      // The design as it stood before the restore is a version too.
      dialog = await openEarlierVersions(page);
      await expect(page.getByTestId("design-earlier-versions-restore")).toHaveCount(2, { timeout: 30_000 });
      await expect(dialog.getByText(/^Before a restore/)).toHaveCount(1);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("restore stays off while a save hasn't reached the account", async ({ page }) => {
    test.setTimeout(150_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      await expectCloudDesignReady(page, seed.designId);
      // One save first, so there is a version to (not) restore.
      const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
      await widthInput.fill("5900");
      await widthInput.press("Enter");
      await expect.poll(() => serverWidth(page, seed.designId), { timeout: 60_000 }).toBe(5.9);
      await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "saved", { timeout: 30_000 });
      allowExpectedHttpFailure({
        page, method: "PUT", pathname: `/api/designs/${seed.designId}`, status: 503,
        reason: "a dropped connection loses the autosave",
      });
      await page.route(`**/api/designs/${seed.designId}`, async (route) => {
        if (route.request().method() !== "PUT") return route.continue();
        await route.fulfill({ status: 503, contentType: "application/json",
          body: JSON.stringify({ error: "Cloud save is temporarily unavailable.", code: "INTERNAL_ERROR" }) });
      });
      await widthInput.fill("6000");
      await widthInput.press("Enter");
      await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "failed", { timeout: 30_000 });

      await openEarlierVersions(page);
      await expect(page.getByTestId("design-earlier-versions-blocked")).toContainText("Save your latest changes first");
      await expect(page.getByTestId("design-earlier-versions-restore")).toHaveCount(1, { timeout: 30_000 });
      await expect(page.getByTestId("design-earlier-versions-restore").first()).toBeDisabled();
      expect(await serverWidth(page, seed.designId)).toBe(5.9);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});
