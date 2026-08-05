import { type Locator, type Page } from "@playwright/test";

import { test, expect } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
  openCatalogPreview,
  selectEditorWorkspace,
} from "./variant-test-utils";

const ROTATION_TEST_ITEM_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

async function readAngle(page: Page) {
  const text = await page.getByTestId("rotation-angle-label").innerText();
  const match = text.match(/Angle\s+(-?\d+)/i);
  if (!match) {
    throw new Error(`Unable to parse angle from label: ${text}`);
  }
  return normalizeAngle(Number(match[1]));
}

async function expectAngle(page: Page, expected: number) {
  await expect
    .poll(() => readAngle(page), { timeout: 5_000 })
    .toBe(normalizeAngle(expected));
}

async function readFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/);
  const fingerprint = await marker.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Editor snapshot fingerprint is missing");
  return fingerprint;
}

async function setupSelectedItem(page: Page): Promise<Locator> {
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
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  });

  const planReady = page.waitForResponse(
    (candidate) =>
      new URL(candidate.url()).pathname === "/api/me" &&
      candidate.status() === 200,
    { timeout: 120_000 },
  );
  const response = await page.goto("/design?mode=designer", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await planReady;
  await expect(page.getByTestId("editor-tool-rail")).toBeVisible({
    timeout: 15_000,
  });

  const opened = await openCatalogPreview(
    page,
    ROTATION_TEST_ITEM_ID,
    "Hugg",
  );
  expect(opened, "The Hugg rotation fixture must be available").toBe(true);
  await expect(page.getByTestId("catalog-item-drawer")).toContainText(
    "Hugg Nesting Square Coffee Table",
  );
  await addCatalogDrawerItemToRoom(page);

  const selectedItemPanel = getSelectedItemPanel(page);
  await expect(selectedItemPanel).toBeVisible({ timeout: 15_000 });
  await expect(selectedItemPanel).toContainText(
    "Hugg Nesting Square Coffee Table",
  );

  const rotationToggle = selectedItemPanel.getByTestId(
    "rotation-controls-toggle",
  );
  await expect(rotationToggle).toBeVisible();
  await expect(rotationToggle).toBeEnabled();
  if ((await rotationToggle.getAttribute("aria-expanded")) !== "true") {
    await rotationToggle.click();
  }
  await expect(rotationToggle).toHaveAttribute("aria-expanded", "true");

  await expect(page.getByTestId("rotation-angle-label")).toBeVisible();
  await expect(page.getByTestId("rotation-btn-reset")).toBeVisible();
  await expect(page.getByTestId("rotation-btn-reset")).toBeEnabled();
  await expect(page.getByTestId("rotation-input")).toBeVisible();
  await expect(page.getByTestId("rotation-input")).toBeEnabled();
  await expect(page.getByTestId("rotation-input-apply")).toBeVisible();
  await expect(page.getByTestId("rotation-input-apply")).toBeEnabled();

  await page.getByTestId("rotation-btn-reset").click();
  await expectAngle(page, 0);
  return selectedItemPanel;
}

test.describe("11. Rotation Shortcuts And Presets", () => {
  test("Q/E and R and 0 rotate as expected", async ({ page }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const start = await readAngle(page);

    await page.keyboard.press("E");
    await expectAngle(page, start + 15);

    await page.keyboard.press("Q");
    await expectAngle(page, start);

    await page.keyboard.press("R");
    await expectAngle(page, start + 90);

    await page.keyboard.press("Shift+R");
    await expectAngle(page, start);

    await page.keyboard.press("0");
    await expectAngle(page, 0);
  });

  test("one keypress creates one undoable rotation and toolbar rotation remains available", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const undo = page.getByTestId("command-undo");
    const undoLabelBeforeRotation = await undo.getAttribute("aria-label");
    await page.keyboard.press("R");
    await expectAngle(page, 90);
    await expect(undo).toHaveAccessibleName(/Undo Rotate \+90/i);

    await undo.click();
    await expectAngle(page, 0);
    expect(await undo.getAttribute("aria-label")).toBe(undoLabelBeforeRotation);

    await page.getByTestId("rotation-btn-quarter-turn").click();
    await expectAngle(page, 90);
    await expect(undo).toHaveAccessibleName(/Undo Rotate \+90/i);
  });

  test("active rectangle-wall tracing owns R without rotating the selected item", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const fingerprintBefore = await readFingerprint(page);
    const fingerprint = page.getByTestId("qa-editor-snapshot-fingerprint");
    const undo = page.getByTestId("command-undo");
    const undoLabelBefore = await undo.getAttribute("aria-label");
    const planView = page.getByTestId("editor-view-2d");
    await planView.click();
    await expect(planView).toHaveAttribute("aria-pressed", "true");
    await selectEditorWorkspace(page, "editor-workflow-plan");

    const selectedPlanItem = page.getByTestId("plan-item-keyboard-target").filter({
      hasText: "Hugg",
    });
    await expect(selectedPlanItem).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("floor-plan-tool-draw_room").click();
    await expect(page.getByTestId("floor-plan-trace-room-toggle")).toHaveText("Done");
    await page.getByTestId("floor-plan-draw-mode-straight_wall").click();
    await expect(page.getByTestId("floor-plan-exact-wall-length")).toBeVisible();

    await page.keyboard.press("R");

    await expect(page.getByTestId("floor-plan-exact-wall-length")).toHaveCount(0);
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      fingerprintBefore
    );
    expect(await undo.getAttribute("aria-label")).toBe(undoLabelBefore);
    await expect(selectedPlanItem).toHaveAttribute("aria-pressed", "true");

    const expectSelectedItemCommand = async (
      key: string,
      undoName: RegExp,
    ) => {
      await page.keyboard.press(key);
      await expect(fingerprint).not.toHaveAttribute(
        "data-fingerprint",
        fingerprintBefore,
      );
      await expect(undo).toHaveAccessibleName(undoName);
      await undo.click();
      await expect(fingerprint).toHaveAttribute(
        "data-fingerprint",
        fingerprintBefore,
      );
      expect(await undo.getAttribute("aria-label")).toBe(undoLabelBefore);
      await expect(selectedPlanItem).toHaveAttribute("aria-pressed", "true");
    };

    await expectSelectedItemCommand("Shift+R", /Undo Rotate -90/i);
    await expectSelectedItemCommand("Q", /Undo Rotate -15/i);
    await expectSelectedItemCommand("E", /Undo Rotate \+15/i);

    await page.keyboard.press("E");
    await expect(fingerprint).not.toHaveAttribute(
      "data-fingerprint",
      fingerprintBefore,
    );
    await page.keyboard.press("0");
    await expect(fingerprint).toHaveAttribute(
      "data-fingerprint",
      fingerprintBefore,
    );
    await expect(undo).toHaveAccessibleName(/Undo Reset rotation/i);
    await undo.click();
    await expect(fingerprint).not.toHaveAttribute(
      "data-fingerprint",
      fingerprintBefore,
    );
    await undo.click();
    await expect(fingerprint).toHaveAttribute(
      "data-fingerprint",
      fingerprintBefore,
    );
    expect(await undo.getAttribute("aria-label")).toBe(undoLabelBefore);

    await page.getByTestId("selection-inspector-clear").click();
    await expect(selectedPlanItem).toHaveAttribute("aria-pressed", "false");
    await page.getByTestId("floor-plan-draw-mode-straight_wall").click();
    await expect(page.getByTestId("floor-plan-exact-wall-length")).toBeVisible();
    await page.keyboard.press("R");
    await expect(page.getByTestId("floor-plan-exact-wall-length")).toHaveCount(0);
    await expect(fingerprint).toHaveAttribute(
      "data-fingerprint",
      fingerprintBefore,
    );
    expect(await undo.getAttribute("aria-label")).toBe(undoLabelBefore);
  });

  test("snap presets update keyboard step behavior", async ({ page }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const start = await readAngle(page);

    const precisePreset = page.getByTestId("rotation-snap-preset-5");
    await expect(precisePreset).toBeVisible();
    await expect(precisePreset).toBeEnabled();
    await precisePreset.click();
    await expect(page.getByTestId("rotation-angle-label")).toContainText("snap 5 deg");
    await page.keyboard.press("E");
    await expectAngle(page, start + 5);

    const freePreset = page.getByTestId("rotation-snap-preset-free");
    await expect(freePreset).toBeVisible();
    await expect(freePreset).toBeEnabled();
    await freePreset.click();
    await expect(page.getByTestId("rotation-angle-label")).toContainText("free");
    await page.keyboard.press("E");
    await expectAngle(page, start + 6);
  });

  test("exact-angle input ignores rotate shortcuts and applies its value", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const start = await readAngle(page);
    const input = page.getByTestId("rotation-input");
    const applyButton = page.getByTestId("rotation-input-apply");

    await expect(input).toHaveAttribute(
      "aria-label",
      "Exact rotation angle in degrees",
    );
    await input.fill("33");
    await expect(input).toHaveValue("33");
    await page.keyboard.press("E");
    await expectAngle(page, start);

    await input.fill("33");
    await applyButton.click();
    await expectAngle(page, 33);
    await expect(input).toHaveValue("33");
  });

  test("input, textarea, select, contenteditable, and modal focus suppress rotation", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    for (const kind of ["input", "textarea", "select", "contenteditable"] as const) {
      await page.evaluate((targetKind) => {
        document.getElementById("rotation-focus-exclusion")?.remove();
        const element = document.createElement(
          targetKind === "contenteditable" ? "div" : targetKind
        );
        element.id = "rotation-focus-exclusion";
        if (targetKind === "contenteditable") element.contentEditable = "true";
        if (element instanceof HTMLSelectElement) {
          element.append(new Option("Rotation focus fixture", "fixture"));
        }
        document.body.append(element);
        element.focus();
      }, kind);
      await expect(page.locator("#rotation-focus-exclusion")).toBeFocused();
      await page.keyboard.press("R");
      await expectAngle(page, 0);
    }
    await page.evaluate(() => {
      document.getElementById("rotation-focus-exclusion")?.remove();
    });

    await page.keyboard.press("Meta+K");
    const palette = page.getByTestId("editor-command-palette");
    await expect(palette).toBeVisible();
    const paletteAction = palette.locator("button").first();
    await expect(paletteAction).toBeVisible();
    await paletteAction.focus();
    await page.keyboard.press("R");
    await expectAngle(page, 0);
    await palette.click({ position: { x: 5, y: 5 } });
    await expect(palette).toBeHidden();
  });

  test("selection remounts and 2D/3D transitions retain one current rotation owner", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);

    const planView = page.getByTestId("editor-view-2d");
    await planView.click();
    await expect(planView).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("selected-item-panel")).toBeHidden();

    const planItem = page.getByTestId("plan-item-keyboard-target").filter({
      hasText: "Hugg",
    });
    await planItem.click();
    await expect(page.getByTestId("selected-item-panel")).toBeVisible();

    const spatialView = page.getByTestId("editor-view-3d");
    await spatialView.click();
    await expect(spatialView).toHaveAttribute("aria-pressed", "true");
    await planView.click();
    await expect(planView).toHaveAttribute("aria-pressed", "true");

    await page.keyboard.press("R");
    await expectAngle(page, 90);
    await expect(page.getByTestId("command-undo")).toHaveAccessibleName(
      /Undo Rotate \+90/i
    );
  });

  test("selection changes and group rotation affect each current item exactly once", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    await setupSelectedItem(page);
    await page.keyboard.press("Meta+D");

    const planView = page.getByTestId("editor-view-2d");
    await planView.click();
    await expect(planView).toHaveAttribute("aria-pressed", "true");
    const planItems = page.getByTestId("plan-item-keyboard-target").filter({
      hasText: "Hugg",
    });
    await expect(planItems).toHaveCount(2);

    await planItems.nth(0).click();
    await page.keyboard.press("R");
    await expectAngle(page, 90);

    await planItems.nth(1).click();
    await expectAngle(page, 0);
    await page.keyboard.press("Shift+R");
    await expectAngle(page, -90);

    await planItems.nth(0).click();
    await expectAngle(page, 90);
    await page.keyboard.press("0");
    await expectAngle(page, 0);
    await planItems.nth(1).click();
    await page.keyboard.press("0");
    await expectAngle(page, 0);

    await planItems.nth(0).click();
    await planItems.nth(1).click({ modifiers: ["Shift"] });
    await expect(planItems.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(planItems.nth(1)).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("R");

    await planItems.nth(0).click();
    await expectAngle(page, 90);
    await planItems.nth(1).click();
    await expectAngle(page, 90);
  });

  test("one repeat event rotates once and no selection is a safe no-op", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const panel = await setupSelectedItem(page);

    const lock = panel.getByRole("button", { name: "Lock", exact: true });
    await lock.click();
    const lockedFingerprint = await readFingerprint(page);
    await page.keyboard.press("R");
    await expectAngle(page, 0);
    expect(await readFingerprint(page)).toBe(lockedFingerprint);
    await expect(page.getByTestId("collision-toast")).toContainText(
      "Unlock this item to rotate"
    );
    await panel.getByRole("button", { name: "Unlock", exact: true }).click();

    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          bubbles: true,
          key: "r",
          repeat: true,
        })
      );
    });
    await expectAngle(page, 90);
    const undo = page.getByTestId("command-undo");
    await expect(undo).toHaveAccessibleName(/Undo Rotate \+90/i);
    await undo.click();
    await expectAngle(page, 0);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("selected-item-panel")).toBeHidden();
    const fingerprint = await readFingerprint(page);
    await page.keyboard.press("R");
    expect(await readFingerprint(page)).toBe(fingerprint);
  });
});
