import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { authoredApartment } from "../../scripts/fixtures/scan-to-editable-plan/apartment";
import { lifecycleImportJob } from "../../scripts/fixtures/scan-to-editable-plan/import-lifecycle";
import { canonicalFloorPlanToDesignSnapshot } from "../../lib/floor-plan-legacy-adapters";
import { snapshotToStored, storedToSnapshot } from "../../lib/room-persistence";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import { ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY } from "../../lib/floor-plan-import-client";

test("Closing an import with a pending confirmation preserves the actual Consumer editor and saved plan", async ({ page }, info) => {
  const key = "interior-ai:v1:livingroom-design", errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const initial = snapshotToStored(canonicalFloorPlanToDesignSnapshot(authoredApartment()).snapshot);
  await page.addInitScript(({ key, initial, importKey }) => {
    if (window !== window.top) return;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    localStorage.setItem(importKey, "original-job");
  }, { key, initial, importKey: ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY });
  await page.route("**/api/floor-plan-imports**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes("/assets/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"/>' });
    return route.fulfill({ json: pathname === "/api/floor-plan-imports" ? { jobs: [], nextCursor: null } : { job: lifecycleImportJob("original-job") } });
  });
  await page.goto("/design");
  await page.getByRole("button", { name: "Yes, it matches", exact: true }).click();
  await page.getByTestId("editor-view-2d").click();
  await expect(page.getByTestId("imported-wall-editor")).toBeVisible();
  const model = () => page.evaluate((key) => {
    const value = JSON.parse(localStorage.getItem(key)!);
    return { floorPlan: value.floorPlan, rooms: value.rooms };
  }, key);
  const before = await model();
  const fingerprint = await page.getByTestId("qa-editor-snapshot-fingerprint").getAttribute("data-fingerprint");
  const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  const reopenedFingerprint = fingerprintDesignSnapshot(storedToSnapshot(persisted));
  const opener = page.getByTestId("plan-tool-import-2d");
  if (!(await opener.isVisible())) await page.getByRole("button", { name: "Import floor plan", exact: true }).click();
  await opener.click();
  await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
  expect(await model()).toEqual(before);
  let release!: () => void, started!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const received = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/original-job/confirm", async (route) => {
    started(); await pending; await route.fulfill({ status: 201, json: { id: "old-completed-design" } });
  });
  await page.getByRole("button", { name: "Confirm review & create editable plan", exact: true }).click(); await received;
  await page.getByRole("button", { name: "Close floor-plan import", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Import a floor plan" })).toHaveCount(0);
  const completed = page.waitForEvent("requestfinished", (request) => request.url().endsWith("/original-job/confirm"));
  release(); await completed;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(page.url()).not.toContain("designId=");
  await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute("data-fingerprint", fingerprint!);
  expect(await model()).toEqual(before);
  await page.screenshot({ path: info.outputPath("preserved-consumer-plan.png") });
  await page.reload();
  await writeFile(info.outputPath("reload-diagnostic.json"), JSON.stringify({ before: persisted, after: await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key), fingerprint, reopenedFingerprint }, null, 2));
  await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute("data-fingerprint", reopenedFingerprint);
  expect(await model()).toEqual(before);
  await writeFile(info.outputPath("preserved-consumer-plan.json"), JSON.stringify({ before, after: await model(), fingerprint, errors }, null, 2));
  expect(errors).toEqual([]);
});
