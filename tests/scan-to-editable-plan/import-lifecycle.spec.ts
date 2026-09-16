import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import webpack from "webpack";
import { lifecycleImportJob } from "../../scripts/fixtures/scan-to-editable-plan/import-lifecycle";
import { ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY } from "../../lib/floor-plan-import-client";
import { calibratedScaleFixture, scaleMeasurement } from "../../scripts/fixtures/scan-to-editable-plan/scale-review";
import { collectScaleMeasurementIssues } from "../../lib/floor-plan-imports/scale-measurement-readiness";
import { test, expect, type Page } from "@playwright/test";

let bundle: string;
test.beforeAll(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "scan-plan-lifecycle-component-"));
  bundle = path.join(output, "review.js");
  const compiler = webpack({ mode: "production", target: "web", devtool: false, cache: false,
    entry: path.resolve("tests/scan-to-editable-plan/import-lifecycle-entry.tsx"),
    output: { path: output, filename: "review.js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": process.cwd(), "next/navigation$": path.resolve("tests/required/fixtures/next-navigation-browser-fixture.ts") } },
    module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: path.resolve("scripts/guest-save-overlay-ts-loader.mjs") }] },
    plugins: [new webpack.DefinePlugin({ "process.env": JSON.stringify({ NODE_ENV: "production", NEXT_PUBLIC_POSTHOG_KEY: "" }) })],
    optimization: { minimize: false }, performance: { hints: false },
  });
  await new Promise<void>((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(() => undefined);
    if (error || stats?.hasErrors()) reject(error ?? new Error(stats?.toString({ all: false, errors: true })));
    else resolve();
  }));
});
test.afterAll(async () => { if (bundle) await fs.rm(path.dirname(bundle), { recursive: true, force: true }); });

test("History restores a parent review after a new child replaces the active job", async ({ page }) => {
  await mountWorkspace(page,"needs_review");
  const parent=lifecycleImportJob("original-job","needs_review"),child=lifecycleImportJob("child-job","ready");
  parent.reviewIssuesJson=[{id:"missing-boundaries",code:"photo_recomputed_boundaries_review",severity:"critical",resolved:false,message:"Review missing source boundaries before accepting this synthetic fixture."}];
  await page.route("**/api/floor-plan-imports?*",route=>route.fulfill({json:{jobs:[child,parent],nextCursor:null}}));
  await page.route("**/original-job",route=>route.fulfill({json:{job:parent}}));
  await page.route("**/original-job/retry-detection",route=>route.fulfill({json:{job:{id:child.id}}}));
  await page.route("**/child-job",route=>route.fulfill({json:{job:child}}));
  await page.reload();await page.addScriptTag({path:bundle});
  await page.getByRole("button",{name:"Rerun AI detection",exact:true}).click();
  await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe(child.id);
  await page.getByText("Previous imports & privacy",{exact:true}).click();
  await page.getByText("My floor-plan imports",{exact:true}).click();
  await page.getByTestId("floor-plan-import-history-original-job").getByRole("button",{name:"Resume",exact:true}).click();
  await expect(page.getByTestId("floor-plan-import-review")).toBeVisible();
  await expect(page.getByTestId("floor-plan-import-ready")).toHaveCount(0);
  await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe(parent.id);
});

test("Continuing the already active review retains unsaved consumer corrections", async ({page})=>{
  await mountWorkspace(page,"needs_review");
  await page.route("**/api/floor-plan-imports?*",route=>route.fulfill({json:{jobs:[lifecycleImportJob("original-job","needs_review")],nextCursor:null}}));
  const names=page.locator("details").filter({has:page.getByText("Edit room names (optional)",{exact:true})});
  await names.locator("summary").click();await names.locator("input").first().fill("Unsaved consumer correction");
  await page.getByText("Previous imports & privacy",{exact:true}).click();
  await page.getByText("My floor-plan imports",{exact:true}).click();
  await page.getByTestId("floor-plan-import-history-original-job").getByRole("button",{name:"Continue below",exact:true}).click();
  await expect(names.locator("input").first()).toHaveValue("Unsaved consumer correction");
});

test("An incomplete consumer review draft preserves corrections and conflicts after reload", async ({ page }, info) => {
  await mountWorkspace(page, "needs_review");
  const candidate = calibratedScaleFixture();
  candidate.floors[0].calibrations[0].independentMeasurements = [scaleMeasurement({ confirmedLengthMm: 4400 })];
  const stored = { ...lifecycleImportJob("original-job", "needs_review"), candidateJson: candidate,
    reviewIssuesJson: collectScaleMeasurementIssues(candidate) };
  let patches = 0, confirmations = 0;
  await page.route("**/api/floor-plan-imports/original-job**", (route) => {
    if (route.request().url().includes("/assets/")) return route.fallback();
    if (route.request().url().endsWith("/confirm")) { confirmations++; return route.fulfill({ status: 409 }); }
    if (route.request().method() === "PATCH") {
      const body: { candidate: typeof candidate; candidateVersion: number; correctionNote: string } = route.request().postDataJSON();
      expect(body.candidateVersion).toBe(stored.candidateVersion);
      expect(body.correctionNote).toContain("incomplete review draft");
      stored.candidateJson = body.candidate; stored.candidateVersion++; patches++;
      stored.reviewIssuesJson = collectScaleMeasurementIssues(body.candidate);
      return route.fulfill({ json: { ok: true, candidateVersion: stored.candidateVersion } });
    }
    return route.fulfill({ json: { job: stored } });
  });
  await page.reload(); await page.addScriptTag({ path: bundle });
  const names = page.locator("details").filter({ has: page.getByText("Edit room names (optional)", { exact: true }) });
  await names.locator("summary").click(); await names.locator("input").first().fill("Saved review room");
  await page.getByRole("button", { name: "Save review draft", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Review draft version 8 saved");
  expect(patches).toBe(1); expect(confirmations).toBe(0);
  expect(stored.reviewIssuesJson.some((issue) => issue.code === "independent_scale_conflict")).toBe(true);
  expect(stored.candidateJson.floors[0].rooms[0].name).toBe("Saved review room");
  await page.reload(); await page.addScriptTag({ path: bundle });
  await names.locator("summary").click();
  await expect(names.locator("input").first()).toHaveValue("Saved review room");
  await expect(page.getByTestId("floor-plan-import-ready")).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/scan-plan-lifecycle-component");
  await fs.writeFile(info.outputPath("saved-incomplete-draft.json"), JSON.stringify({ stored, patches, confirmations }, null, 2));
});

async function mountWorkspace(page: Page, status: Parameters<typeof lifecycleImportJob>[1] = "ready") {
  const state = { candidateVersion: 7 };
  await page.route("**/scan-plan-lifecycle-component", (route) => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html><head><title>Import lifecycle fixture</title><style>body{font-family:Arial}button,summary{margin:8px}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.h-full{height:100%}.w-full{width:100%}svg{display:block}</style></head><body></body></html>' }));
  await page.route("**/api/floor-plan-imports**", (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.includes("/assets/")) return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"/>' });
    if (pathname === "/api/floor-plan-imports") {
      if (route.request().method() === "POST") return route.fulfill({ json: { job: { id: "replacement-job" }, next: { statusUrl: "/api/floor-plan-imports/replacement-job", processUrl: "/api/floor-plan-imports/replacement-job/process" } } });
      return route.fulfill({ json: { jobs: [], nextCursor: null } });
    }
    return route.fulfill({ json: { job: { ...lifecycleImportJob(pathname.split("/").at(-1)!, pathname.endsWith("original-job") ? status : "ready"), candidateVersion: state.candidateVersion } } });
  });
  await page.goto("/scan-plan-lifecycle-component");
  await page.evaluate((key) => localStorage.setItem(key, "original-job"), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY);
  await page.addScriptTag({ path: bundle });
  await expect(page.getByTestId(status === "selecting_page" ? "floor-plan-page-selection" : status === "failed" ? "floor-plan-import-failed" : status === "needs_review" ? "floor-plan-import-review" : "floor-plan-import-ready")).toBeVisible();
  return state;
}

for (const change of ["close", "replace"] as const) {
  test(`A late confirmation after workspace ${change} cannot navigate or clear the replacement import`, async ({ page }, info) => {
    const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
    await mountWorkspace(page);
    let release!: () => void, started!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const received = new Promise<void>((resolve) => { started = resolve; });
    await page.route("**/original-job/confirm", async (route) => {
      started(); await pending; await route.fulfill({ status: 201, json: { id: "completed-old-design" } });
    });
    await page.getByRole("button", { name: "Confirm review & create editable plan", exact: true }).click();
    await received;
    await page.getByRole("button", { name: change === "close" ? "Close workspace" : "Replace upload", exact: true }).click();
    if (change === "replace") {
      await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe("replacement-job");
      await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
    } else await expect(page.getByTestId("floor-plan-import-workspace")).toHaveCount(0);
    const completed = page.waitForEvent("requestfinished", (request) => request.url().endsWith("/original-job/confirm"));
    release(); await completed;
    // Response body and React work settle before checking absence of stale side effects.
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(new URL(page.url()).pathname).toBe("/scan-plan-lifecycle-component");
    const active = await page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY);
    expect(active).toBe(change === "replace" ? "replacement-job" : "original-job");
    if (change === "replace") await expect(page.getByRole("button", { name: "Confirm review & create editable plan", exact: true })).toBeEnabled();
    await fs.writeFile(info.outputPath("late-confirmation.json"), JSON.stringify({ change, url: page.url(), active, errors }, null, 2));
    expect(errors).toEqual([]);
  });
}

for (const action of ["candidate", "retry-detection", "source", "select-page"] as const) {
  test(`A delayed ${action} response cannot alter a replacement upload`, async ({ page }, info) => {
    await mountWorkspace(page, action === "select-page" ? "selecting_page" : action === "candidate" ? "needs_review" : action === "retry-detection" ? "failed" : "ready");
    let release!: () => void, started!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const received = new Promise<void>((resolve) => { started = resolve; });
    let oldFollowups = 0;
    page.on("request", (request) => { if (/\/(original-job|retry-job)(\/process)?$/.test(new URL(request.url()).pathname)) oldFollowups++; });
    await page.route(`**/original-job/${action}`, async (route) => {
      started(); await pending;
      await route.fulfill({ json: action === "source" ? { deletionState: "deleted", designUnderlaysScrubbed: 1 } : { job: { id: "retry-job" } } });
    });
    if (action === "source") await page.getByText("Rename, plan options & privacy", { exact: true }).click();
    await page.getByRole("button", { name: action === "select-page" ? "Use this page" : action === "candidate" ? "Yes, continue" : action === "retry-detection" ? "Retry with improved detection" : "Delete private upload", exact: true }).click();
    await received;
    await page.getByRole("button", { name: "Replace upload", exact: true }).click();
    await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe("replacement-job");
    await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
    const completed = page.waitForEvent("requestfinished", (request) => request.url().endsWith(`/original-job/${action}`));
    release(); await completed;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm review & create editable plan", exact: true })).toBeEnabled();
    expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe("replacement-job");
    expect(oldFollowups).toBe(0);
    await page.getByText("Rename, plan options & privacy", { exact: true }).click();
    await expect(page.getByRole("button", { name: "Delete private upload", exact: true })).toBeEnabled();
    await fs.writeFile(info.outputPath("late-action.json"), JSON.stringify({ action, oldFollowups, url: page.url() }, null, 2));
  });
}

test("Version conflict requires reopening the latest candidate before confirmation", async ({ page }, info) => {
  const server = await mountWorkspace(page);
  server.candidateVersion = 8;
  let attempts = 0;
  await page.route("**/original-job/confirm", (route) => {
    attempts++;
    const version = route.request().postDataJSON().candidateVersion;
    return route.fulfill(version !== server.candidateVersion ? { status: 409, json: { error: "Another tab saved a newer candidate. Reopen this import." } } : { status: 201, json: { id: "new-private-design" } });
  });
  await page.getByRole("button", { name: "Confirm review & create editable plan", exact: true }).click();
  await expect(page.getByText(/Creation paused: Another tab/)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/scan-plan-lifecycle-component");
  expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe("original-job");
  await page.getByRole("button", { name: "Try creating again", exact: true }).click();
  await expect(page.getByText(/Creation paused: Another tab/)).toBeVisible();
  expect(attempts).toBe(2);
  await page.reload(); await page.addScriptTag({ path: bundle });
  await page.getByRole("button", { name: "Confirm review & create editable plan", exact: true }).click();
  await expect(page).toHaveURL(/\/design\?designId=new-private-design/);
  expect(attempts).toBe(3);
  expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBeNull();
  await fs.writeFile(info.outputPath("conflict-retry.json"), JSON.stringify({ attempts, url: page.url() }, null, 2));
});

test("A buffered upload response cannot replace a newer upload even if transport cancellation is ignored", async ({ page }, info) => {
  await mountWorkspace(page);
  await page.evaluate(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => fetch(input, input === "/api/floor-plan-imports" ? { ...init, signal: undefined } : init);
  });
  let release!: () => void, started!: () => void, uploads = 0;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const received = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/api/floor-plan-imports", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    uploads++;
    if (uploads !== 1) return route.fallback();
    started(); await pending;
    await route.fulfill({ json: { job: { id: "obsolete-upload" }, next: { statusUrl: "/api/floor-plan-imports/obsolete-upload", processUrl: "/api/floor-plan-imports/obsolete-upload/process" } } });
  });
  await page.getByRole("button", { name: "Replace upload", exact: true }).click(); await received;
  await page.getByRole("button", { name: "Replace upload", exact: true }).click();
  await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe("replacement-job");
  let obsoleteReads = 0;
  page.on("request", (request) => { if (request.url().includes("obsolete-upload")) obsoleteReads++; });
  const finished = page.waitForEvent("requestfinished", (request) => request.method() === "POST" && new URL(request.url()).pathname === "/api/floor-plan-imports");
  release(); await finished;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe("replacement-job");
  expect(obsoleteReads).toBe(0); expect(uploads).toBe(2);
  await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
  await fs.writeFile(info.outputPath("buffered-upload.json"), JSON.stringify({ obsoleteReads, uploads }, null, 2));
});

test("A delayed correction status read cannot restart processing after replacement", async ({ page }, info) => {
  await mountWorkspace(page, "needs_review");
  await page.evaluate(() => {
    const fetch = window.fetch.bind(window);
    window.fetch = (input, init) => fetch(input, input === "/api/floor-plan-imports/original-job" ? { ...init, signal: undefined } : init);
  });
  let release!: () => void, started!: () => void, processRequests = 0;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const received = new Promise<void>((resolve) => { started = resolve; });
  await page.route("**/original-job", async (route) => {
    started(); await pending; await route.fulfill({ json: { job: lifecycleImportJob("original-job", "validating") } });
  });
  page.on("request", (request) => { if (request.url().endsWith("/original-job/process")) processRequests++; });
  await page.getByRole("button", { name: "Yes, continue", exact: true }).click(); await received;
  await page.getByRole("button", { name: "Replace upload", exact: true }).click();
  await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
  const finished = page.waitForEvent("requestfinished", (request) => request.url().endsWith("/original-job"));
  release(); await finished;
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(processRequests).toBe(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), ACTIVE_FLOOR_PLAN_IMPORT_STORAGE_KEY)).toBe("replacement-job");
  await expect(page.getByTestId("floor-plan-import-ready")).toBeVisible();
  await fs.writeFile(info.outputPath("late-status-read.json"), JSON.stringify({ processRequests }, null, 2));
});
