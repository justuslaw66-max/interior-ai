import fs from "node:fs/promises";

import { expect, test } from "@playwright/test";

const STORAGE_KEY = "interior-ai:v1:livingroom-design";
const LAST_VALID_KEY = `${STORAGE_KEY}:last-known-valid`;
const INVALID_RAW = '{"private":"raw-backup-must-survive"';

const validBackup = JSON.stringify({
  version: 3,
  schemaRevision: 1,
  units: {
    roomGeometry: "m",
    scenePosition: "m",
    productDimensions: "mm",
    rotation: "rad",
  },
  coordinateSystem: {
    handedness: "right",
    origin: "room_center_floor",
    axes: { x: "right", y: "up", z: "forward" },
  },
  activeRoomId: "recovered-room",
  rooms: [
    {
      id: "recovered-room",
      name: "Recovered Room",
      roomType: "living",
      geometry: { width: 5.2, depth: 4.1, wallThickness: 0.12 },
      items: [],
      zones: [],
      savedViews: [],
    },
  ],
});

test.describe("local backup recovery", () => {
  test("quarantines without overwriting and cleans only after explicit choice", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.addInitScript(
      ({ key, raw }) => {
        const sentinel = "__local_recovery_invalid_seeded";
        if (localStorage.getItem(sentinel)) return;
        localStorage.clear();
        localStorage.setItem(sentinel, "1");
        localStorage.setItem(key, raw);
      },
      { key: STORAGE_KEY, raw: INVALID_RAW }
    );
    await page.goto("/design", { waitUntil: "domcontentloaded" });

    const dialog = page.getByTestId("local-backup-recovery-dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await expect(dialog).toContainText("INVALID_JSON");
    const downloadButton = page.getByRole("button", {
      name: "Download raw backup",
    });
    await expect(downloadButton).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();

    const retained = await page.evaluate(
      ({ key, raw }) => ({
        primary: localStorage.getItem(key),
        quarantine: Object.keys(localStorage).some(
          (candidate) =>
            candidate.startsWith(`${key}:quarantine:`) &&
            localStorage.getItem(candidate) === raw
        ),
      }),
      { key: STORAGE_KEY, raw: INVALID_RAW }
    );
    expect(retained.primary).toBe(INVALID_RAW);
    expect(retained.quarantine).toBe(true);

    const downloadPromise = page.waitForEvent("download");
    await downloadButton.click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    expect(await fs.readFile(downloadPath!, "utf8")).toBe(INVALID_RAW);

    await page.getByRole("button", { name: "Start a clean copy" }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return false;
          try {
            return JSON.parse(raw).schemaRevision === 1;
          } catch {
            return false;
          }
        }, STORAGE_KEY)
      )
      .toBe(true);
    expect(
      await page.evaluate((key) =>
        Object.keys(localStorage).some((candidate) =>
          candidate.startsWith(`${key}:quarantine:`)
        ), STORAGE_KEY
      )
    ).toBe(true);
  });

  test("opens an explicit last-known-valid copy", async ({ page }) => {
    test.setTimeout(90_000);
    await page.addInitScript(
      ({ key, lastValidKey, invalidRaw, lastValidRaw }) => {
        localStorage.clear();
        localStorage.setItem(key, invalidRaw);
        localStorage.setItem(lastValidKey, lastValidRaw);
      },
      {
        key: STORAGE_KEY,
        lastValidKey: LAST_VALID_KEY,
        invalidRaw: INVALID_RAW,
        lastValidRaw: validBackup,
      }
    );
    await page.goto("/design", { waitUntil: "domcontentloaded" });

    const dialog = page.getByTestId("local-backup-recovery-dialog");
    await expect(dialog).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Open last valid copy" }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          try {
            return JSON.parse(raw).rooms?.[0]?.name ?? null;
          } catch {
            return null;
          }
        }, STORAGE_KEY)
      )
      .toBe("Recovered Room");
    expect(await page.evaluate((key) => localStorage.getItem(key), LAST_VALID_KEY)).toContain(
      "Recovered Room"
    );
  });
});
