import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
  openCatalogPreview,
} from "./variant-test-utils";

const EDITOR_ITEM_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

type DemandAnimationKind =
  | "placement-scale"
  | "snap-bump"
  | "locked-shake"
  | "control-damping";

type DemandSnapshot = {
  rendererCalls: number;
  invalidationCalls: number;
  pendingInvalidation: boolean;
  activeSupportedAnimationCount: number;
  animationEvents: Array<{
    kind: DemandAnimationKind;
    phase: "started" | "frame" | "settled";
    rendererCalls: number;
    value: number | null;
  }>;
  mutationEvents: Array<{
    kind: "exposure" | "resize";
    rendererCalls: number;
    value: number;
  }>;
  itemFrames: Array<{
    itemId: string;
    rendererCalls: number;
    position: [number, number, number];
    scale: [number, number, number];
    canvasPoint: [number, number];
  }>;
};

async function readDemandSnapshot(page: Page): Promise<DemandSnapshot> {
  return page.evaluate(() => {
    const hook = (
      globalThis as typeof globalThis & {
        __INTERIOR_AI_SCENE_DEMAND_SNAPSHOT__?: () => DemandSnapshot;
      }
    ).__INTERIOR_AI_SCENE_DEMAND_SNAPSHOT__;
    if (!hook) throw new Error("Scene demand diagnostics are unavailable");
    return hook();
  });
}

async function expectRendererPlateau(page: Page, durationMs = 1_800) {
  let settled: DemandSnapshot | null = null;
  await expect
    .poll(
      async () => {
        const before = await readDemandSnapshot(page);
        await page.waitForTimeout(durationMs);
        const after = await readDemandSnapshot(page);
        const stable =
          before.activeSupportedAnimationCount === 0 &&
          !before.pendingInvalidation &&
          after.rendererCalls === before.rendererCalls &&
          after.invalidationCalls === before.invalidationCalls;
        if (stable) settled = after;
        return stable;
      },
      { timeout: 20_000 },
    )
    .toBe(true);
  if (!settled) throw new Error("Renderer did not reach a stable plateau");
  return settled;
}

function expectCompletedFiniteAnimation(
  snapshot: DemandSnapshot,
  kind: Exclude<DemandAnimationKind, "control-damping">,
) {
  const events = snapshot.animationEvents.filter((event) => event.kind === kind);
  const frames = events.filter((event) => event.phase === "frame");
  expect(events.some((event) => event.phase === "started")).toBe(true);
  expect(frames.length).toBeGreaterThanOrEqual(2);
  expect(new Set(frames.map((event) => event.rendererCalls)).size).toBeGreaterThanOrEqual(2);
  expect(events.at(-1)?.phase).toBe("settled");
  return frames;
}

async function readFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/);
  const fingerprint = await marker.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Editor snapshot fingerprint is missing");
  return fingerprint;
}

async function readModelMillimetres(input: Locator): Promise<number> {
  const raw = await input.getAttribute("data-model-value-mm");
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid model position: ${raw ?? "missing"}`);
  }
  return value;
}

async function setupSelectedItem(page: Page) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "pro", source: "playwright" }),
    });
  });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("plan_measurement_unit", "mm");
    (
      globalThis as typeof globalThis & {
        __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
      }
    ).__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ = true;
  });

  const response = await page.goto("/design?mode=designer", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
    timeout: 30_000,
  });

  const newPlan = page.getByTestId("editor-command-new-plan");
  await expect(newPlan).toBeVisible();
  const starterPicker = page.getByTestId("starter-floor-plan-picker");
  await expect(async () => {
    if (await starterPicker.isVisible().catch(() => false)) return;

    const replaceCurrent = page.getByTestId("new-plan-replace-current");
    if (await replaceCurrent.isVisible().catch(() => false)) {
      await replaceCurrent.click();
    } else {
      await newPlan.click();
    }

    await expect(starterPicker).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
  await page.getByTestId("apply-plan-template-studio").click();
  const planChoice = page.getByTestId("new-plan-choice-dialog");
  if (await planChoice.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await page.getByTestId("new-plan-replace-current").click();
  }
  await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
    "4 rooms",
  );

  const opened = await openCatalogPreview(page, EDITOR_ITEM_ID, "Hugg");
  expect(opened, "The deterministic Hugg editor fixture must be available").toBe(
    true,
  );
  await expect(page.getByTestId("catalog-item-drawer")).toContainText(
    "Hugg Nesting Square Coffee Table",
  );
  await addCatalogDrawerItemToRoom(page);

  const selectedPanel = getSelectedItemPanel(page);
  await expect(selectedPanel).toBeVisible({ timeout: 15_000 });
  await expect(selectedPanel).toContainText("Hugg Nesting Square Coffee Table");

  const controlsToggle = selectedPanel.getByTestId(
    "selected-item-advanced-controls-toggle",
  );
  await expect(controlsToggle).toBeVisible();
  await expect(controlsToggle).toBeEnabled();
  if ((await controlsToggle.getAttribute("aria-expanded")) !== "true") {
    await controlsToggle.evaluate((button) =>
      (button as HTMLButtonElement).click(),
    );
  }
  await expect(controlsToggle).toHaveAttribute("aria-expanded", "true");

  const xInput = selectedPanel.getByTestId("selected-item-position-x");
  const zInput = selectedPanel.getByTestId("selected-item-position-z");
  await expect(xInput).toBeVisible();
  await expect(zInput).toBeVisible();
  return { selectedPanel, xInput, zInput };
}

test.describe("2. Editor Correctness", () => {
  test("New plan moves focus into the picker and restores it when dismissed", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const newPlan = page.getByTestId("editor-command-new-plan");
    await expect(newPlan).toBeEnabled();
    await newPlan.focus();
    await page.keyboard.press("Enter");

    const picker = page.getByTestId("starter-floor-plan-picker");
    const pickerHeading = page.getByRole("heading", { name: "Choose a floor plan" });
    await expect(picker).toBeVisible();
    await expect(pickerHeading).toBeFocused();

    await page.keyboard.press("Tab");
    const skipToLayouts = page.getByTestId("skip-to-starter-layouts");
    await expect(skipToLayouts).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("apply-plan-template-studio")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(newPlan).toBeFocused();
  });

  test("New plan asks before replacing even when the saved room still has starter geometry", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const newPlan = page.getByTestId("editor-command-new-plan");
    await expect(newPlan).toBeEnabled();
    await newPlan.click();
    await expect(page.getByTestId("starter-floor-plan-picker")).toBeVisible();
    await page.getByTestId("apply-plan-template-studio").click();

    const choice = page.getByTestId("new-plan-choice-dialog");
    await expect(choice).toBeVisible();
    await expect(choice).toContainText("Rectangular studio");
    await expect(page.getByTestId("new-plan-save-current")).toBeVisible();
    await expect(page.getByTestId("new-plan-replace-current")).toBeVisible();
    await page.getByTestId("new-plan-cancel").click();
    await expect(choice).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
  });

  test("collision detection rejects an overlapping precision move", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { selectedPanel, xInput, zInput } = await setupSelectedItem(page);
    const occupiedX = await readModelMillimetres(xInput);
    const occupiedZ = await readModelMillimetres(zInput);

    await selectedPanel.getByTestId("selected-item-duplicate").click();
    const duplicateFingerprint = await readFingerprint(page);
    const duplicateX = await readModelMillimetres(xInput);
    const duplicateZ = await readModelMillimetres(zInput);
    expect([duplicateX, duplicateZ]).not.toEqual([occupiedX, occupiedZ]);

    await xInput.fill(String(occupiedX));
    await xInput.press("Enter");
    await zInput.fill(String(occupiedZ));
    await zInput.press("Enter");

    await expect(page.getByTestId("collision-toast")).toContainText("Blocked by", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      duplicateFingerprint,
    );
    expect(await readModelMillimetres(xInput)).toBe(duplicateX);
    expect(await readModelMillimetres(zInput)).toBe(duplicateZ);
  });

  test("wall snap moves the selected item once and leaves it stable", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { selectedPanel, xInput, zInput } = await setupSelectedItem(page);
    const beforeFingerprint = await readFingerprint(page);
    const before = [
      await readModelMillimetres(xInput),
      await readModelMillimetres(zInput),
    ];

    await selectedPanel.getByTestId("selected-item-snap-wall").click();
    await expect
      .poll(() => readFingerprint(page), { timeout: 10_000 })
      .not.toBe(beforeFingerprint);
    const snappedFingerprint = await readFingerprint(page);
    const snapped = [
      await readModelMillimetres(xInput),
      await readModelMillimetres(zInput),
    ];
    expect(snapped).not.toEqual(before);

    await selectedPanel.getByTestId("selected-item-snap-wall").click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      snappedFingerprint,
    );
    expect([
      await readModelMillimetres(xInput),
      await readModelMillimetres(zInput),
    ]).toEqual(snapped);
  });

  test("demand rendering completes placement, locked shake, and pointer snap before idling", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    const { selectedPanel } = await setupSelectedItem(page);

    await expect
      .poll(async () => {
        const snapshot = await readDemandSnapshot(page);
        return snapshot.animationEvents.at(-1)?.phase;
      })
      .toBe("settled");
    let snapshot = await readDemandSnapshot(page);
    const placementFrames = expectCompletedFiniteAnimation(
      snapshot,
      "placement-scale",
    );
    expect(placementFrames.some((event) => (event.value ?? 1) < 1)).toBe(true);
    expect(placementFrames.at(-1)?.value).toBe(1);
    expect(snapshot.itemFrames).toHaveLength(1);
    expect(snapshot.itemFrames[0]?.scale).toEqual([1, 1, 1]);
    await expectRendererPlateau(page);

    await page.getByRole("button", { name: "3D", exact: true }).first().click({
      force: true,
    });
    await expectRendererPlateau(page);

    const canvas = page.getByTestId("scene-canvas").first();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) throw new Error("Scene canvas bounds are missing");

    const lockButton = selectedPanel.getByRole("button", {
      name: /^Lock(?: selected)?$/,
    });
    await lockButton.click();
    await expect(
      selectedPanel.getByRole("button", { name: /^Unlock(?: selected)?$/ }),
    ).toBeVisible();
    const beforeShake = (await readDemandSnapshot(page)).itemFrames[0];
    expect(beforeShake).toBeTruthy();
    await page.mouse.click(
      canvasBox.x + beforeShake.canvasPoint[0],
      canvasBox.y + beforeShake.canvasPoint[1],
    );
    await expect
      .poll(async () => {
        const current = await readDemandSnapshot(page);
        return current.animationEvents.filter(
          (event) => event.kind === "locked-shake",
        ).at(-1)?.phase;
      })
      .toBe("settled");
    snapshot = await readDemandSnapshot(page);
    const shakeFrames = expectCompletedFiniteAnimation(snapshot, "locked-shake");
    expect(shakeFrames.some((event) => Math.abs(event.value ?? 0) > 0)).toBe(true);
    expect(shakeFrames.at(-1)?.value).toBe(0);
    expect(snapshot.itemFrames[0]?.position).toEqual(beforeShake.position);
    await expectRendererPlateau(page);

    await selectedPanel
      .getByRole("button", { name: /^Unlock(?: selected)?$/ })
      .click();
    await page.getByRole("button", { name: "2D Plan", exact: true }).first().click({
      force: true,
    });
    await expectRendererPlateau(page);
    const beforeSnap = (await readDemandSnapshot(page)).itemFrames[0];
    await page.mouse.move(
      canvasBox.x + beforeSnap.canvasPoint[0],
      canvasBox.y + beforeSnap.canvasPoint[1] - 20,
    );
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(canvasBox.x + 400, canvasBox.y + beforeSnap.canvasPoint[1] - 20, {
      steps: 12,
    });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await expect
      .poll(async () => {
        const current = await readDemandSnapshot(page);
        return current.animationEvents.filter(
          (event) => event.kind === "snap-bump",
        ).at(-1)?.phase;
      })
      .toBe("settled");
    snapshot = await readDemandSnapshot(page);
    const snapFrames = expectCompletedFiniteAnimation(snapshot, "snap-bump");
    expect(snapFrames.some((event) => Math.abs(event.value ?? 0) > 0)).toBe(true);
    expect(snapFrames.at(-1)?.value).toBe(0);
    expect(snapshot.itemFrames[0]?.position).not.toEqual(beforeSnap.position);
    expect(snapshot.itemFrames[0]?.scale).toEqual([1, 1, 1]);
    await expect(selectedPanel).toBeVisible();
    await expect(page.getByTestId("collision-toast")).toHaveCount(0);
    await expectRendererPlateau(page);
  });

  test("camera, exposure, and resize updates render their final state then plateau", async ({
    page,
  }) => {
    test.setTimeout(150_000);
    await setupSelectedItem(page);
    await page.getByRole("button", { name: "3D", exact: true }).first().click({
      force: true,
    });
    await expectRendererPlateau(page);

    const canvas = page.getByTestId("scene-canvas").first();
    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    if (!canvasBox) throw new Error("Scene canvas bounds are missing");
    const beforeControlEvents = (await readDemandSnapshot(page)).animationEvents.length;
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.52,
      canvasBox.y + canvasBox.height * 0.75,
    );
    await page.mouse.down();
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.45,
      canvasBox.y + canvasBox.height * 0.62,
      { steps: 10 },
    );
    await page.mouse.up();
    await page.mouse.wheel(0, -480);
    await expect
      .poll(async () => {
        const events = (await readDemandSnapshot(page)).animationEvents.slice(
          beforeControlEvents,
        );
        return events.filter((event) => event.kind === "control-damping").at(-1)
          ?.phase;
      })
      .toBe("settled");
    const controlEvents = (await readDemandSnapshot(page)).animationEvents
      .slice(beforeControlEvents)
      .filter((event) => event.kind === "control-damping");
    expect(controlEvents[0]?.phase).toBe("started");
    expect(controlEvents.at(-1)?.phase).toBe("settled");
    expect(controlEvents.at(-1)?.rendererCalls).toBeGreaterThan(
      controlEvents[0]?.rendererCalls ?? Number.MAX_SAFE_INTEGER,
    );
    await expectRendererPlateau(page);

    const exposureEventsBefore = (await readDemandSnapshot(page)).mutationEvents
      .filter((event) => event.kind === "exposure").length;
    const beforeExposureImage = await canvas.screenshot();
    await page.getByTestId("editor-command-overflow").click();
    await page.getByTestId("editor-command-overflow-lighting").click();
    const exposureInput = page.getByTestId("lighting-exposure-input");
    await expect(exposureInput).toBeVisible();
    await exposureInput.fill("0.6");
    await expect
      .poll(async () =>
        (await readDemandSnapshot(page)).mutationEvents.filter(
          (event) => event.kind === "exposure",
        ).length,
      )
      .toBe(exposureEventsBefore + 1);
    let snapshot = await readDemandSnapshot(page);
    const exposureMutation = snapshot.mutationEvents.filter(
      (event) => event.kind === "exposure",
    ).at(-1);
    expect(snapshot.rendererCalls).toBeGreaterThan(
      exposureMutation?.rendererCalls ?? Number.MAX_SAFE_INTEGER,
    );
    const changedExposure = await canvas.getAttribute("data-lighting-exposure");
    const afterExposureImage = await canvas.screenshot();
    expect(changedExposure).not.toBeNull();
    expect(Buffer.compare(beforeExposureImage, afterExposureImage)).not.toBe(0);
    await expectRendererPlateau(page);

    await exposureInput.fill("0.6");
    await page.waitForTimeout(400);
    expect(
      (await readDemandSnapshot(page)).mutationEvents.filter(
        (event) => event.kind === "exposure",
      ),
    ).toHaveLength(exposureEventsBefore + 1);

    await exposureInput.fill("-0.4");
    await expect
      .poll(async () =>
        (await readDemandSnapshot(page)).mutationEvents.filter(
          (event) => event.kind === "exposure",
        ).length,
      )
      .toBe(exposureEventsBefore + 2);
    await expect(canvas).not.toHaveAttribute(
      "data-lighting-exposure",
      changedExposure ?? "",
    );
    await expectRendererPlateau(page);

    const resizeEventsBefore = (await readDemandSnapshot(page)).mutationEvents
      .filter((event) => event.kind === "resize").length;
    await page.setViewportSize({ width: 1180, height: 760 });
    await expect
      .poll(async () =>
        (await readDemandSnapshot(page)).mutationEvents.filter(
          (event) => event.kind === "resize",
        ).length,
      )
      .toBeGreaterThan(resizeEventsBefore);
    snapshot = await readDemandSnapshot(page);
    const resizeMutation = snapshot.mutationEvents.filter(
      (event) => event.kind === "resize",
    ).at(-1);
    expect(snapshot.rendererCalls).toBeGreaterThan(
      resizeMutation?.rendererCalls ?? Number.MAX_SAFE_INTEGER,
    );
    await expectRendererPlateau(page);
  });

  test("one duplicate is restored by one undo and one redo", async ({ page }) => {
    test.setTimeout(120_000);
    const { selectedPanel } = await setupSelectedItem(page);
    const beforeDuplicate = await readFingerprint(page);

    await selectedPanel.getByTestId("selected-item-duplicate").click();
    await expect
      .poll(() => readFingerprint(page), { timeout: 10_000 })
      .not.toBe(beforeDuplicate);
    const afterDuplicate = await readFingerprint(page);

    const undo = page.getByTestId("command-undo");
    await expect(undo).toBeEnabled();
    await expect(undo).toHaveAccessibleName(/Undo Duplicate Hugg/i);
    await undo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      beforeDuplicate,
    );

    const redo = page.getByTestId("command-redo");
    await expect(redo).toBeEnabled();
    await expect(redo).toHaveAccessibleName(/Redo Duplicate Hugg/i);
    await redo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      afterDuplicate,
    );
  });
});
