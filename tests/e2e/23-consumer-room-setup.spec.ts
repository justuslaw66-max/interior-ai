import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  addAuthCookies,
  buildBetaDesignSnapshot,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
} from "./beta-seed";
import { getE2EBaseUrl } from "./release-environment";
import {
  allowKnownChromiumDesignRuntimeEvents,
  installBrowserRuntimePolicy,
  type BrowserRuntimePolicy,
} from "./browser-runtime-policy";

const baseURL = getE2EBaseUrl();
const CLOUD_AUTOSAVE_DELAY_MS = 900;
const CLOUD_READY_TIMEOUT_MS = 30_000;
const runtimePolicies = new WeakMap<Page, BrowserRuntimePolicy>();

test.beforeEach(async ({ page }, testInfo) => {
  const policy = installBrowserRuntimePolicy(
    page,
    testInfo.titlePath.join(" > "),
  );
  allowKnownChromiumDesignRuntimeEvents(policy, baseURL);
  runtimePolicies.set(page, policy);
});

test.afterEach(async ({ page }) => {
  runtimePolicies.get(page)?.assertSatisfied();
});

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
}

async function expectUpdateCountStableAcrossAutosaveWindow(
  updates: unknown[],
  expectedCount: number,
) {
  const observationEndsAt = Date.now() + CLOUD_AUTOSAVE_DELAY_MS + 100;
  await expect
    .poll(
      () => ({
        complete: Date.now() >= observationEndsAt,
        count: updates.length,
      }),
      {
        intervals: [100],
        timeout: CLOUD_AUTOSAVE_DELAY_MS + 1_000,
      },
    )
    .toEqual({ complete: true, count: expectedCount });
}

async function readCaseCMutationEvidence(input: {
  width: Locator;
  fingerprint: Locator;
  layout: Locator;
  cloud: Locator;
  matchingPutCount: number;
}) {
  return {
    rawMillimetres: await input.width.getAttribute("data-model-value-mm"),
    fingerprint: await input.fingerprint.getAttribute("data-fingerprint"),
    historyCount: Number(
      await input.layout.getAttribute("data-history-past-count"),
    ),
    revision: await input.cloud.getAttribute("data-cloud-revision"),
    baselineStatus: await input.cloud.getAttribute(
      "data-cloud-baseline-status",
    ),
    matchingPutCount: input.matchingPutCount,
  };
}

async function expectTouchTarget(locator: Locator, label: string) {
  const box = await locator.boundingBox();
  expect(box, `${label} should be measurable`).not.toBeNull();
  expect(box?.height ?? 0, `${label} should be at least 44px tall`).toBeGreaterThanOrEqual(44);
}

async function openConsumerRoomSetup(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    if (window.sessionStorage.getItem("consumer-room-setup-initialized") === "1") {
      return;
    }
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    window.sessionStorage.setItem("consumer-room-setup-initialized", "1");
  });

  const response = await page.goto("/design", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "2D Plan", exact: true }).click();
  await expect(page.getByTestId("consumer-room-setup")).toBeVisible({ timeout: 20_000 });
}

test.describe("23. Consumer room setup", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("resolves persisted units before rendering unit-dependent values", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const hydrationWarnings: string[] = [];
    page.on("console", (message) => {
      if (/hydration|did not match|server rendered/i.test(message.text())) {
        hydrationWarnings.push(message.text());
      }
    });
    await page.addInitScript(() => {
      if (window.sessionStorage.getItem("measurement-preference-initialized") !== "1") {
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
        window.localStorage.setItem("plan_measurement_unit", "ft-in");
        window.sessionStorage.setItem("measurement-preference-initialized", "1");
      }
      const observed: string[] = [];
      Object.defineProperty(window, "__measurementPreferenceStates", {
        value: observed,
        configurable: true,
      });
      const visiblyRendered = (element: HTMLElement) => {
        if (element.closest('[hidden], [aria-hidden="true"]')) return false;
        for (let current: HTMLElement | null = element; current; current = current.parentElement) {
          const style = window.getComputedStyle(current);
          if (style.display === "none" || style.visibility === "hidden") return false;
        }
        return element.getClientRects().length > 0;
      };
      const capture = () => {
        const regions = document.querySelectorAll<HTMLElement>(
          '[data-testid="room-setup-unit-dependent"]',
        );
        for (const region of regions) {
          if (!visiblyRendered(region)) continue;
          const entry = `${region.getAttribute("data-measurement-preference-state")}:${region.textContent ?? ""}`;
          if (observed.at(-1) !== entry) observed.push(entry);
        }
      };
      Object.defineProperty(window, "__captureMeasurementPreferenceState", {
        value: capture,
        configurable: true,
      });
      new MutationObserver(capture).observe(document, {
        attributes: true,
        childList: true,
        subtree: true,
      });
      document.addEventListener("DOMContentLoaded", capture, { once: true });
    });

    const response = await page.goto("/design?view=2d", { waitUntil: "domcontentloaded" });
    expect(response?.status()).toBe(200);

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    const unitRegion = page.getByTestId("room-setup-unit-dependent");
    await expect(unitRegion).toHaveAttribute("data-measurement-preference-state", "ready");
    await expect(unitRegion).toHaveAttribute("aria-busy", "false");
    await expect(page.getByTestId("room-setup-measurement-units")).toHaveValue("ft-in");
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText(
      "16′ 4.9″ × 13′ 1.5″ · 215.3 ft²"
    );
    const observed = await page.evaluate(() =>
      (window as Window & { __measurementPreferenceStates?: string[] })
        .__measurementPreferenceStates ?? []
    );
    expect(observed.some((entry) => entry.startsWith("loading:"))).toBe(true);
    const firstReady = observed.findIndex((entry) => entry.startsWith("ready:"));
    expect(firstReady).toBeGreaterThan(0);
    expect(observed[firstReady]).toContain("16′ 4.9″ × 13′ 1.5″ · 215.3 ft²");
    expect(observed.slice(0, firstReady).some((entry) => /\d+(?:\.\d+)?\s*(?:mm|cm|m²|ft²|′|″)/.test(entry))).toBe(false);
    expect(observed.some((entry) => /500 cm|400 cm|m²/.test(entry))).toBe(false);

    const transportProbe = await page.evaluate(async () => {
      const state = window as Window & {
        __measurementPreferenceStates?: string[];
        __captureMeasurementPreferenceState?: () => void;
      };
      const decoy = document.createElement("div");
      decoy.dataset.testid = "room-setup-unit-dependent";
      decoy.dataset.measurementPreferenceState = "ready";
      decoy.textContent = "500 cm × 400 cm · 20 m²";
      decoy.hidden = true;
      document.body.append(decoy);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      state.__captureMeasurementPreferenceState?.();
      const hiddenCaptured = state.__measurementPreferenceStates?.some(
        (entry) => entry.includes("500 cm × 400 cm"),
      ) ?? false;
      decoy.hidden = false;
      decoy.style.position = "fixed";
      decoy.style.inset = "0 auto auto 0";
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      state.__captureMeasurementPreferenceState?.();
      const visibleCaptured = state.__measurementPreferenceStates?.some(
        (entry) => entry.includes("500 cm × 400 cm"),
      ) ?? false;
      decoy.remove();
      return { hiddenCaptured, visibleCaptured };
    });
    expect(transportProbe).toEqual({
      hiddenCaptured: false,
      visibleCaptured: true,
    });
    expect(hydrationWarnings).toEqual([]);

    for (const [stored, expected] of [
      ["mm", "mm"],
      ["cm", "cm"],
      ["in", "in"],
      ["unknown", "cm"],
    ] as const) {
      await page.evaluate((unit) => localStorage.setItem("plan_measurement_unit", unit), stored);
      await page.waitForLoadState("networkidle");
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("room-setup-measurement-units")).toHaveValue(expected);
      await expect.poll(() => page.evaluate(() => localStorage.getItem("plan_measurement_unit")))
        .toBe(expected);
    }
    expect(hydrationWarnings).toEqual([]);
  });

  test("validates measured dimensions, persists units, and keeps correction paths touch friendly", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const designMutations: string[] = [];
    page.on("request", (request) => {
      if (request.method() !== "GET" && /\/api\/designs(?:\/|$)/.test(request.url())) {
        designMutations.push(`${request.method()} ${request.url()}`);
      }
    });
    await openConsumerRoomSetup(page);

    await expect(page.getByTestId("room-setup-status")).toHaveText("Room ready");
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText("Visible scale:");
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText("m²");

    for (const section of ["importFloorPlan", "drawRoom", "openings", "templates"]) {
      await expect(
        page.getByTestId(`plan-tool-section-${section}`).getByRole("button").first()
      ).toHaveAttribute("aria-expanded", "false");
    }

    const displayUnits = page.getByTestId("room-setup-measurement-units");
    await expect(displayUnits).toHaveAccessibleName("Display units");
    await expect(displayUnits).toHaveValue("cm");
    await expect(displayUnits.locator("option:checked")).toHaveText(
      "Centimetres (cm)"
    );
    await expect(displayUnits.getByRole("option")).toHaveText([
      "Millimetres (mm)",
      "Centimetres (cm)",
      "Inches (in)",
      "Feet + inches (ft + in)",
    ]);
    const unitGroups = displayUnits.locator("optgroup");
    await expect(unitGroups).toHaveCount(2);
    await expect(unitGroups.nth(0)).toHaveAttribute("label", "Metric");
    await expect(unitGroups.nth(1)).toHaveAttribute("label", "Imperial");

    const width = page.getByTestId("room-setup-width-input");
    const originalModelWidth = Number(await width.getAttribute("data-model-value-mm"));
    expect(originalModelWidth).toBeGreaterThanOrEqual(1_800);

    await width.fill("10");
    await expect(width).toHaveAttribute("aria-invalid", "true");
    await width.press("Enter");
    await expect(width).toHaveAttribute("aria-invalid", "true");
    await expect(width).toHaveAttribute("data-model-value-mm", String(originalModelWidth));
    await expect(
      width.locator("xpath=../following-sibling::span[@role='alert']")
    ).toContainText("Enter 180 cm or more.");

    await width.press("Escape");
    await expect(width).not.toHaveAttribute("aria-invalid", "true");
    await expect(width).toHaveValue(String(originalModelWidth / 10));

    const revisedWidthCm = originalModelWidth / 10 - 5;
    await width.fill(String(revisedWidthCm));
    await width.press("Enter");
    await expect(width).toHaveAttribute(
      "data-model-value-mm",
      String(originalModelWidth - 50)
    );
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText(
      `${revisedWidthCm} cm`
    );

    const canonicalBeforeSwitch = await width.getAttribute("data-model-value-mm");
    const fingerprint = page.getByTestId("qa-editor-snapshot-fingerprint");
    const fingerprintBeforeSwitch = await fingerprint.getAttribute("data-fingerprint");
    await displayUnits.focus();
    await expect(displayUnits).toBeFocused();
    await displayUnits.press("f");
    await expect(displayUnits).toHaveValue("ft-in");
    await expect(displayUnits.locator("option:checked")).toHaveText(
      "Feet + inches (ft + in)"
    );
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("plan_measurement_unit")))
      .toBe("ft-in");
    await expect(width).toHaveAttribute("data-model-value-mm", canonicalBeforeSwitch ?? "");
    await expect(width).toHaveRole("textbox");
    await expect(width).toHaveValue(/\d+′ \d+(?:\.\d)?″/);
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText("ft²");

    await displayUnits.selectOption("cm");
    await displayUnits.selectOption("ft-in");
    await displayUnits.selectOption("cm");
    await expect(width).toHaveAttribute("data-model-value-mm", canonicalBeforeSwitch ?? "");
    await displayUnits.selectOption("ft-in");
    await expect(fingerprint).toHaveAttribute("data-fingerprint", fingerprintBeforeSwitch ?? "");
    expect(designMutations).toEqual([]);

    for (const [draft, errorText, commitMode] of [
      ["13.75 ft 9.4 in", "Enter a length such as", "Enter"],
      ["13 ft 12.1 in", "Inches must be less than 12", "blur"],
    ] as const) {
      const committed = await width.getAttribute("data-model-value-mm");
      await width.fill(draft);
      if (commitMode === "Enter") await width.press("Enter");
      else await displayUnits.focus();
      await expect(width).toHaveAttribute("aria-invalid", "true");
      await expect(width).toHaveAttribute("data-model-value-mm", committed ?? "");
      const describedBy = await width.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      await expect(page.locator(`#${describedBy!.split(" ")[0]}`)).toContainText(errorText);
      await width.press("Escape");
      await expect(width).not.toHaveAttribute("aria-invalid", "true");
    }

    await width.fill("14 ft");
    await width.press("Enter");
    await expect(width).toHaveAttribute("data-model-value-mm", "4267.2");
    await expect(width).toHaveValue("14′ 0″");

    await width.fill(`13' 9.4"`);
    await width.press("Enter");
    await expect(width).toHaveAttribute("data-model-value-mm", "4201.16");
    await width.fill("14 ft");
    await displayUnits.focus();
    await expect(width).toHaveAttribute("data-model-value-mm", "4267.2");
    await expect(width).toHaveValue("14′ 0″");

    const depth = page.getByTestId("room-setup-depth-input");
    await depth.fill("15 ft 9.0 in");
    await depth.press("Enter");
    await expect(depth).toHaveAttribute("data-model-value-mm", "4800.6");
    await expect(depth).toHaveValue("15′ 9.0″");
    await expect(page.getByTestId("room-setup-scale-summary")).toContainText(
      "14′ 0″ × 15′ 9.0″ · 220.5 ft²"
    );

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    if (!(await page.getByTestId("consumer-room-setup").isVisible().catch(() => false))) {
      await page.getByRole("button", { name: "2D Plan", exact: true }).click();
    }
    await expect(page.getByTestId("consumer-room-setup")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("room-setup-measurement-units")).toHaveValue(
      "ft-in"
    );
    await expect(page.getByTestId("room-setup-width-input")).toHaveAttribute(
      "data-model-value-mm",
      "4267.2"
    );
    await expect(page.getByTestId("room-setup-width-input")).toHaveValue("14′ 0″");

    const importFloorPlanSection = page.getByTestId(
      "plan-tool-section-importFloorPlan"
    );
    await importFloorPlanSection
      .getByRole("button", { name: "Import floor plan", exact: true })
      .click();
    await expect(
      importFloorPlanSection.getByRole("button", {
        name: "Import floor plan",
        exact: true,
      })
    ).toHaveAttribute("aria-expanded", "true");

    const touchTargets = [
      [page.getByTestId("room-setup-measurement-units"), "display units"],
      [page.getByTestId("room-setup-width-input"), "room width"],
      [page.getByTestId("room-setup-depth-input"), "room depth"],
      [page.getByTestId("plan-tool-door"), "add door"],
      [page.getByTestId("plan-tool-window"), "add window"],
      [page.getByTestId("room-setup-continue-furnish"), "continue to furnish"],
      [page.getByTestId("plan-start-template"), "starter layouts"],
      [page.getByTestId("plan-start-draw"), "draw measured room"],
      [page.getByTestId("plan-tool-import-2d"), "import 2D drawing"],
    ] as const;
    for (const [locator, label] of touchTargets) {
      await expectTouchTarget(locator, label);
    }
    await expect(
      page.getByText("Upload an existing plan", { exact: true })
    ).toHaveCount(0);

    await page.getByTestId("plan-tool-window").click();
    await expect(page.getByTestId("plan-focus-control")).toContainText("Placing window");
    await expect(page.getByTestId("plan-focus-progress")).toHaveText("Pick wall");
    await expect(page.getByTestId("plan-canvas-guidance")).toContainText(
      "Click the wall where it belongs."
    );
    await page.getByTestId("plan-focus-done").click();

    await page.getByTestId("plan-start-template").click();
    await expect(page.getByTestId("starter-floor-plan-picker")).toBeVisible();
    await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();

    const horizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(horizontalOverflow).toBeLessThanOrEqual(4);
  });

  test("preserves explicit imperial values and only treats exact rendered text as unchanged", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const snapshot = buildBetaDesignSnapshot();
    snapshot.rooms[0].geometry.width = 4.267;
    const seed = await createBetaSeedDesign({ snapshot });
    const designUpdates: unknown[] = [];
    page.on("request", (request) => {
      const pathname = new URL(request.url()).pathname;
      if (
        request.method() === "PUT" &&
        pathname === `/api/designs/${seed.designId}`
      ) {
        designUpdates.push(request.postDataJSON());
      }
    });

    try {
      await page.addInitScript(() => {
        window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
        window.localStorage.setItem("plan_measurement_unit", "ft-in");
      });
      await addAuthCookies(page.context(), baseURL, seed.sessionToken);
      await page.goto(`/design?designId=${encodeURIComponent(seed.designId)}`, {
        waitUntil: "domcontentloaded",
      });
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "2D Plan", exact: true }).click();
      await expect(page.getByTestId("consumer-room-setup")).toBeVisible({
        timeout: 20_000,
      });

      const width = page.getByTestId("room-setup-width-input");
      const units = page.getByTestId("room-setup-measurement-units");
      const fingerprint = page.getByTestId("qa-editor-snapshot-fingerprint");
      const layout = page.getByTestId("qa-design-layout-debug");
      const cloud = page.getByTestId("qa-editor-cloud-design");
      await expectCloudDesignReady(page, seed.designId);
      await expect(units).toHaveValue("ft-in");
      await expect(width).toHaveAttribute("data-model-value-mm", "4267");
      const initialFingerprint = await fingerprint.getAttribute("data-fingerprint");
      expect(initialFingerprint).toMatch(/^[a-f0-9]{8}$/);
      expect(designUpdates).toEqual([]);

      const savedFourteenFeet = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/designs/${seed.designId}`
      );
      await width.fill("14 ft");
      await width.press("Enter");
      await expect(width).toHaveAttribute("data-model-value-mm", "4267.2");
      await expect(width).toHaveValue("14′ 0″");
      await expect
        .poll(() => fingerprint.getAttribute("data-fingerprint"))
        .not.toBe(initialFingerprint);
      expect((await savedFourteenFeet).status()).toBe(200);
      await expect(page.getByTestId("save-status")).toHaveAttribute(
        "data-status",
        "saved",
        { timeout: 30_000 }
      );
      expect(designUpdates.at(-1)).toMatchObject({ roomWidth: 4.2672 });

      const storedFourteenFeet = await page.request.get(
        `/api/designs/${encodeURIComponent(seed.designId)}`
      );
      expect(storedFourteenFeet.status()).toBe(200);
      expect(await storedFourteenFeet.json()).toMatchObject({ roomWidth: 4.2672 });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 30_000,
      });
      await page.getByRole("button", { name: "2D Plan", exact: true }).click();
      await expectCloudDesignReady(page, seed.designId);
      await expect(width).toHaveAttribute("data-model-value-mm", "4267.2");
      await expect(width).toHaveValue("14′ 0″");

      const beforeHiddenPrecision = await readCaseCMutationEvidence({
        width, fingerprint, layout, cloud,
        matchingPutCount: designUpdates.length,
      });
      expect(beforeHiddenPrecision.rawMillimetres).toBe("4267.2");
      expect(beforeHiddenPrecision.baselineStatus).toBe("acknowledged");

      const savedHiddenPrecision = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/designs/${seed.designId}`
      );
      await width.fill("167.96 in");
      await width.press("Enter");
      await expect(width).toHaveAttribute("data-model-value-mm", "4266.184");
      const hiddenPrecisionResponse = await savedHiddenPrecision;
      expect(hiddenPrecisionResponse.status()).toBe(200);
      const hiddenPrecisionRevision = (await hiddenPrecisionResponse.json() as {
        updatedAt: string;
      }).updatedAt;
      expect(hiddenPrecisionRevision).not.toBe(beforeHiddenPrecision.revision);
      await expectCloudDesignReady(page, seed.designId, hiddenPrecisionRevision);
      const afterHiddenPrecision = await readCaseCMutationEvidence({
        width, fingerprint, layout, cloud,
        matchingPutCount: designUpdates.length,
      });
      expect(afterHiddenPrecision.rawMillimetres).toBe("4266.184");
      expect(
        Number(beforeHiddenPrecision.rawMillimetres) -
          Number(afterHiddenPrecision.rawMillimetres),
      ).toBeCloseTo(1.016, 6);
      expect(afterHiddenPrecision.fingerprint).not.toBe(
        beforeHiddenPrecision.fingerprint,
      );
      expect(afterHiddenPrecision.historyCount).toBe(
        beforeHiddenPrecision.historyCount + 1,
      );
      expect(afterHiddenPrecision.revision).toBe(hiddenPrecisionRevision);
      expect(afterHiddenPrecision.baselineStatus).toBe("acknowledged");
      expect(afterHiddenPrecision.matchingPutCount).toBe(
        beforeHiddenPrecision.matchingPutCount + 1,
      );
      expect(designUpdates.at(-1)).toMatchObject({ roomWidth: 4.266184 });
      const exactRenderedText = await width.inputValue();
      expect(exactRenderedText).toBe("14′ 0″");
      await expectUpdateCountStableAcrossAutosaveWindow(
        designUpdates,
        afterHiddenPrecision.matchingPutCount,
      );

      await width.fill(exactRenderedText);
      await width.press("Enter");
      await expectCloudDesignReady(page, seed.designId, hiddenPrecisionRevision);
      await expectUpdateCountStableAcrossAutosaveWindow(
        designUpdates,
        afterHiddenPrecision.matchingPutCount,
      );
      expect(await readCaseCMutationEvidence({
        width, fingerprint, layout, cloud,
        matchingPutCount: designUpdates.length,
      })).toEqual(afterHiddenPrecision);

      await width.fill(exactRenderedText);
      await units.focus();
      await expectCloudDesignReady(page, seed.designId, hiddenPrecisionRevision);
      await expectUpdateCountStableAcrossAutosaveWindow(
        designUpdates,
        afterHiddenPrecision.matchingPutCount,
      );
      expect(await readCaseCMutationEvidence({
        width, fingerprint, layout, cloud,
        matchingPutCount: designUpdates.length,
      })).toEqual(afterHiddenPrecision);

      const explicitFourteenFeetUpdates = designUpdates.length;
      const savedExplicitFourteenFeet = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/designs/${seed.designId}`
      );
      await width.fill("14 ft");
      await width.press("Enter");
      await expect(width).toHaveAttribute("data-model-value-mm", "4267.2");
      await expect
        .poll(() => designUpdates.length, { timeout: 30_000 })
        .toBeGreaterThan(explicitFourteenFeetUpdates);
      expect((await savedExplicitFourteenFeet).status()).toBe(200);

      const savedExact4200 = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/designs/${seed.designId}`
      );
      await width.fill("165.354330709 in");
      await width.press("Enter");
      await expect(width).toHaveAttribute("data-model-value-mm", "4200");
      expect((await savedExact4200).status()).toBe(200);

      const explicitCompoundUpdates = designUpdates.length;
      const savedExplicitCompound = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).pathname === `/api/designs/${seed.designId}`
      );
      await width.fill(`13' 9.4"`);
      await units.focus();
      await expect(width).toHaveAttribute("data-model-value-mm", "4201.16");
      await expect
        .poll(() => designUpdates.length, { timeout: 30_000 })
        .toBeGreaterThan(explicitCompoundUpdates);
      expect((await savedExplicitCompound).status()).toBe(200);
      expect(designUpdates.at(-1)).toMatchObject({ roomWidth: 4.20116 });
    } finally {
      await cleanupBetaSeed(seed);
    }
  });
});
