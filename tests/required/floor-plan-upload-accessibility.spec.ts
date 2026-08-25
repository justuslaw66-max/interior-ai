import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  expectFloorPlanInertFixtureHost,
  openFloorPlanInertFixtureHost,
} from "./fixtures/floor-plan-inert-html-host";

type Entry = "pointer" | "keyboard";
type Mode = "consumer" | "pro";
type ImportJob = ReturnType<typeof importJob>;

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const ACTIVE_IMPORT_KEY = "interior-ai:active-floor-plan-import:v1";
const FLOOR_PLAN_FIXTURE_OUTPUT = path.join(
  process.cwd(),
  ".next",
  "cache",
  "floor-plan-upload-browser-fixture"
);

function minimalDocument(calibrated = true) {
  const provenance = {
    confidence: 0.9,
    extractionVersion: "ch0015i-fixture",
    evidence: [],
    reviewHistory: [],
  };
  const measured = (valueMm: number) => ({
    valueMm,
    evidence: "measured",
    provenance,
  });
  return {
    schemaVersion: 2,
    units: "mm",
    id: "ch0015i-document",
    revisionId: "ch0015i-revision",
    createdAt: "2026-08-12T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [
      {
        id: "source-1",
        kind: "pdf",
        name: "Synthetic plan.pdf",
        mimeType: "application/pdf",
        sha256: "a".repeat(64),
        pageCount: 2,
      },
    ],
    floors: [
      {
        id: "floor-1",
        name: "Level 1",
        levelIndex: 0,
        elevationMm: 0,
        storeyHeightMm: 2800,
        slabThicknessMm: 150,
        defaults: {
          wallHeight: measured(2600),
          doorHeight: measured(2100),
          windowHeight: measured(1200),
          windowSillHeight: measured(900),
        },
        calibrations: calibrated
          ? [
              {
                id: "calibration-1",
                sourceId: "source-1",
                pageNumber: 1,
                imageWidthPx: 1000,
                imageHeightPx: 800,
                controlPoints: [
                  { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } },
                  { sourcePx: { x: 1000, y: 800 }, planMm: { xMm: 4000, zMm: 3000 } },
                ],
                rmsErrorPx: 0,
              },
            ]
          : [],
        vertices: [
          { id: "v1", xMm: 0, zMm: 0, provenance },
          { id: "v2", xMm: 4000, zMm: 0, provenance },
          { id: "v3", xMm: 4000, zMm: 3000, provenance },
          { id: "v4", xMm: 0, zMm: 3000, provenance },
        ],
        walls: [
          ["w1", "v1", "v2"],
          ["w2", "v2", "v3"],
          ["w3", "v3", "v4"],
          ["w4", "v4", "v1"],
        ].map(([id, startVertexId, endVertexId]) => ({
          id,
          path: { kind: "line", startVertexId, endVertexId },
          thicknessMm: 100,
          classification: "exterior",
          adjacentRoomIds: ["room-1"],
          provenance,
        })),
        rooms: [
          {
            id: "room-1",
            name: "Living room",
            roomType: "living",
            wallLoops: [
              {
                kind: "outer",
                walls: ["w1", "w2", "w3", "w4"].map((wallId) => ({
                  wallId,
                  direction: "forward",
                })),
              },
            ],
            provenance,
          },
        ],
        openings: [],
        structures: [],
        annotations: [],
        dimensions: [
          {
            id: "dimension-1",
            fromVertexId: "v1",
            toVertexId: "v2",
            axis: "horizontal",
            measuredMm: 4000,
            provenance,
          },
        ],
      },
    ],
  };
}

function pageSelectionEvidence() {
  const candidate = (pageNumber: number, rank: number) => ({
    pageNumber,
    rank,
    score: 0.9 - rank / 10,
    widthPx: 1000,
    heightPx: 800,
    roomLabelCount: 2,
    dimensionLabelCount: 3,
    openingSymbolCount: 1,
    vectorPathCount: 4,
    vectorSegmentCount: 12,
  });
  return {
    kind: "floor_plan_deterministic_evidence_v2",
    pageCandidates: [candidate(1, 1), candidate(2, 2)],
    selectedPageNumber: null,
  };
}

function importJob(
  status: "selecting_page" | "needs_review" | "ready" | "failed",
  candidateJson: unknown = null,
  reviewIssuesJson: unknown[] = []
) {
  return {
    id: "ch0015i-job",
    status,
    progress: status === "ready" ? 100 : 70,
    adapterId: "ch0015i-synthetic",
    extractionVersion: "ch0015i-fixture",
    statusChangedAt: "2026-08-12T00:00:00.000Z",
    lastAttemptAt: "2026-08-12T00:00:00.000Z",
    nextAttemptAt: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    renderedPagesJson: [1, 2].map((pageNumber) => ({
      pageNumber,
      widthPx: 1000,
      heightPx: 800,
      assetKey: `page-${pageNumber}`,
    })),
    candidateJson,
    reviewIssuesJson,
    candidateVersion: 1,
    errorMessage: status === "failed" ? "Synthetic detection failure" : null,
    appliedDesignId: null,
    sourceRetentionExpiresAt: "2030-01-01T00:00:00.000Z",
    sourceDeletionRequestedAt: null,
    trainingBenchmarkOptIn: false,
    sourceAsset: {
      fileName: "Synthetic plan.pdf",
      mimeType: "application/pdf",
      contentDeletedAt: null,
      contentDeletionReason: null,
    },
  };
}

function historySummary(job: ImportJob) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    adapterId: job.adapterId,
    candidateVersion: job.candidateVersion,
    errorMessage: job.errorMessage,
    appliedDesignId: job.appliedDesignId,
    sourceRetentionExpiresAt: job.sourceRetentionExpiresAt,
    sourceDeletionRequestedAt: job.sourceDeletionRequestedAt,
    sourceAsset: job.sourceAsset,
    nextAttemptAt: job.nextAttemptAt,
    leaseExpiresAt: job.leaseExpiresAt,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  };
}

async function installBoundaries(page: Page, state: { job: ImportJob | null }) {
  await page.route("**/api/floor-plans?*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        query: new URL(route.request().url()).searchParams.get("q") ?? "",
        unitQuery: null,
        count: 0,
        nextCursor: null,
        results: [],
      }),
    })
  );
  await page.route("**/api/models/imported", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"models":[]}' })
  );
  await page.route("**/api/me", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: '{"plan":"pro","source":"fixture"}' })
  );
  await page.route("**/api/auth/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: { id: "ch0015i-user", email: "ch0015i@example.test", name: "CH-0015I" },
        expires: "2030-01-01T00:00:00.000Z",
      }),
    })
  );
  await page.route("**/api/floor-plan-imports**", (route) => {
    const url = new URL(route.request().url());
    if (/\/assets\//.test(url.pathname)) {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nkwAAAAASUVORK5CYII=",
          "base64"
        ),
      });
    }
    if (url.pathname === "/api/floor-plan-imports") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobs: state.job ? [historySummary(state.job)] : [],
          nextCursor: null,
        }),
      });
    }
    if (route.request().method() === "POST" && url.pathname.endsWith("/process")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    }
    return route.fulfill({
      status: state.job ? 200 : 404,
      contentType: "application/json",
      body: state.job
        ? JSON.stringify({ job: state.job })
        : '{"error":"Synthetic job not found"}',
    });
  });
}

async function openEditor(
  page: Page,
  mode: Mode,
  viewport = DESKTOP,
  activeJob = false
) {
  await page.setViewportSize(viewport);
  await page.addInitScript(
    ({ key, jobId }) => {
      if (sessionStorage.getItem("ch0015i-initialized") === "true") return;
      localStorage.clear();
      localStorage.setItem("interior-ai:beta-start-dismissed", "1");
      localStorage.setItem("scene_performance_mode", "lite");
      if (jobId) localStorage.setItem(key, jobId);
      sessionStorage.setItem("ch0015i-initialized", "true");
    },
    { key: ACTIVE_IMPORT_KEY, jobId: activeJob ? "ch0015i-job" : null }
  );
  await page.goto(mode === "pro" ? "/design?mode=designer" : "/design", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute(
    "data-client-hydrated",
    "true"
  );
  await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute(
    "data-active-room-id",
    "room_living"
  );
  if (mode === "pro") {
    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
    await expect(page.getByTestId("floor-plan-import-workspace-launcher")).toBeVisible();
    await expect(page.getByTestId("floor-plan-import-workspace-launcher")).toBeEnabled();
  }
}

async function openEmptyPlanFixture(
  page: Page,
  viewport = DESKTOP,
  responsive = false
) {
  await page.setViewportSize(viewport);
  await openFloorPlanInertFixtureHost(page, responsive);
  await page.addScriptTag({ path: path.join(FLOOR_PLAN_FIXTURE_OUTPUT, "empty-entry.js") });
  const harness = page.getByTestId("floor-plan-empty-entry-harness");
  await expect(harness).toBeVisible();
  await expect(page.getByTestId("plan-start-upload")).toHaveCount(1);
  await expect(page.getByTestId("floor-plan-surfaces-upload")).toHaveCount(
    responsive ? 0 : 1
  );
  await expect(page.getByTestId("floor-plan-import-workspace-launcher")).toHaveCount(1);
  await expectFloorPlanInertFixtureHost(page);
  return harness;
}

async function activate(action: Locator, page: Page, entry: Entry) {
  if (entry === "pointer") return action.click();
  await action.focus();
  await page.keyboard.press("Enter");
}

async function openWorkspace(page: Page, mode: Mode, entry: Entry) {
  const action =
    mode === "consumer"
      ? page.getByTestId("plan-tool-import-2d")
      : page.getByTestId("plan-start-upload");
  if ((await action.count()) === 0 || !(await action.isVisible())) {
    const disclosure =
      mode === "consumer"
        ? page.getByRole("button", { name: "Import floor plan", exact: true })
        : page.locator("summary").getByText("Other ways to start", { exact: true });
    await expect(disclosure).toHaveCount(1);
    await disclosure.click();
  }
  await expect(action).toHaveCount(1);
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  await activate(action, page, entry);
  const dialog = page.getByRole("dialog", { name: "Import a floor plan" });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  return { action, dialog };
}

async function expectParentContract(
  page: Page,
  backgroundTestId = "save-design"
) {
  const dialog = page.getByRole("dialog", { name: "Import a floor plan" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("data-editor-dialog-focus-trap", "active");
  await expect(dialog).toHaveAttribute("data-editor-dialog-stack-index", "0");
  expect(
    await page.getByTestId(backgroundTestId).evaluate((element) => {
      const owner = element.closest<HTMLElement>("[inert]");
      return { inert: Boolean(owner?.inert), ariaHidden: owner?.getAttribute("aria-hidden") };
    })
  ).toEqual({ inert: true, ariaHidden: "true" });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  expect(
    await page.evaluate(() =>
      document.querySelectorAll('[role="dialog"][aria-modal="true"]').length
    )
  ).toBe(1);
  return dialog;
}

async function expectFocusInside(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
        return Boolean(dialog?.contains(document.activeElement));
      })
    )
    .toBe(true);
}

async function expectFocusId(page: Page, id: string) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        id: (document.activeElement as HTMLElement | null)?.id ?? "",
        tag: document.activeElement?.tagName ?? "",
      }))
    )
    .toMatchObject({ id });
}

async function expectFocusTestId(page: Page, testId: string) {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        id: (document.activeElement as HTMLElement | null)?.id ?? "",
        testId:
          (document.activeElement as HTMLElement | null)?.dataset.testid ?? "",
      }))
    )
    .toMatchObject({ testId });
}

for (const entry of ["pointer", "keyboard"] as const) {
  test(`consumer ${entry} desktop owns containment and semantic return`, async ({ page }) => {
    const state = { job: null as ImportJob | null };
    await installBoundaries(page, state);
    await openEditor(page, "consumer");
    const { action, dialog } = await openWorkspace(page, "consumer", entry);
    await expectParentContract(page);
    await expect(page.getByRole("button", { name: "Choose floor-plan file" })).toBeFocused();
    const historySummary = dialog.getByText("Previous imports & privacy", {
      exact: true,
    });
    await historySummary.focus();
    await page.keyboard.press("Tab");
    await expectFocusInside(page);
    await page.keyboard.press("Shift+Tab");
    await expectFocusInside(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Import a floor plan" })).toHaveCount(0);
    await expectFocusId(page, await action.getAttribute("id") ?? "missing-opener-id");
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
}

for (const entry of ["pointer", "keyboard"] as const) {
  test(`pro ${entry} desktop preserves backdrop, close, and opener return`, async ({ page }) => {
    const state = { job: null as ImportJob | null };
    await installBoundaries(page, state);
    const harness = await openEmptyPlanFixture(page);
    const { action, dialog } = await openWorkspace(page, "pro", entry);
    await expect(harness).toHaveAttribute("data-selected-mode", "upload");
    await expectParentContract(page, "floor-plan-empty-entry-harness");
    if (entry === "pointer") {
      await dialog.click({ position: { x: 2, y: 2 } });
    } else {
      await page.getByRole("button", { name: "Close floor-plan import" }).click();
    }
    await expect(dialog).toHaveCount(0);
    await expect(action).toBeFocused();

    const surfacesOpener = page.getByTestId("floor-plan-surfaces-upload");
    await activate(surfacesOpener, page, entry);
    await expect(dialog).toHaveCount(1);
    await expect(harness).toHaveAttribute("data-surface-activation-count", "1");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(surfacesOpener).toBeFocused();
  });
}

test("mobile 390x844 remains full-screen without overflow and survives responsive replacement", async ({ page }) => {
  const state = { job: null as ImportJob | null };
  await installBoundaries(page, state);
  await openEmptyPlanFixture(page, MOBILE, true);
  const { action } = await openWorkspace(page, "pro", "pointer");
  await expectParentContract(page, "floor-plan-empty-entry-harness");
  const geometry = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]')!;
    const panel = document.querySelector<HTMLElement>('[data-testid="floor-plan-import-dialog-panel"]')!;
    const focused = document.activeElement as HTMLElement;
    const rect = focused.getBoundingClientRect();
    return {
      dialog: dialog.getBoundingClientRect().toJSON(),
      panel: panel.getBoundingClientRect().toJSON(),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
      focusInViewport:
        rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
    };
  });
  expect(geometry.dialog).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });
  expect(geometry.panel).toMatchObject({ x: 0, y: 0, width: 390 });
  expect(geometry.panel.height).toBeCloseTo(844, 0);
  expect(geometry.horizontalOverflow).toBe(false);
  expect(geometry.focusInViewport).toBe(true);
  await action.evaluate((element) => {
    element.dataset.beforeResponsiveReplacement = "true";
  });
  await page.setViewportSize(DESKTOP);
  await expect(page.locator('[data-before-responsive-replacement="true"]')).toHaveCount(0);
  await expect(page.getByTestId("plan-start-upload")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("plan-start-upload")).toBeFocused();
});

test("state transitions focus page selection, calibration recovery, and review", async ({ page }) => {
  const state = {
    job: importJob("selecting_page", pageSelectionEvidence()) as ImportJob | null,
  };
  await installBoundaries(page, state);
  await openEditor(page, "consumer", DESKTOP, true);
  await openWorkspace(page, "consumer", "pointer");
  await expect(page.getByTestId("floor-plan-page-selection")).toBeVisible();
  await expectFocusTestId(page, "floor-plan-page-candidate-1");
  await page.getByTestId("floor-plan-page-candidate-1").click();
  state.job = importJob("needs_review", minimalDocument(false), [{
    id: "scale-unresolved", code: "scale_unresolved", severity: "critical",
    message: "Register the source scale before continuing.", entityIds: [],
  }]);
  await page.getByRole("button", { name: "Use this page" }).click();
  const rerun = page.getByRole("button", { name: "Rerun AI detection" });
  await expect(rerun).toBeVisible();
  await expect(rerun).toBeFocused();
  state.job = importJob("needs_review", minimalDocument(true));
  await rerun.click();
  await expect(page.getByRole("button", { name: "Yes, continue" })).toBeFocused();
});

test("state transitions focus ready, failure, and image upload", async ({ page }) => {
  const state = { job: importJob("failed") as ImportJob | null };
  await installBoundaries(page, state);
  await openEditor(page, "consumer", DESKTOP, true);
  await openWorkspace(page, "consumer", "pointer");
  const retry = page.getByRole("button", { name: "Retry with improved detection" });
  await expect(retry).toBeVisible();
  await expect(retry).toBeFocused();
  state.job = importJob("ready", minimalDocument(true));
  await retry.click();
  await expect(page.getByRole("button", { name: "Create editable plan" })).toBeFocused();

  await page.keyboard.press("Escape");
  state.job = null;
  await page.evaluate((key) => localStorage.removeItem(key), ACTIVE_IMPORT_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas")).toHaveAttribute("data-client-hydrated", "true");
  await openWorkspace(page, "consumer", "pointer");
  let releaseUpload!: () => void;
  const uploadMayFinish = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  await page.route("**/api/floor-plan-imports", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    await uploadMayFinish;
    await route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Synthetic upload stop"}' });
  });
  await page.getByTestId("floor-plan-upload-input").setInputFiles({
    name: "synthetic-plan.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nkwAAAAASUVORK5CYII=",
      "base64"
    ),
  });
  await expect(page.getByTestId("floor-plan-import-progress")).toBeVisible();
  await expectFocusInside(page);
  releaseUpload();
});

test("registered child supersedes, returns inside, and retains Strict Mode scroll ownership", async ({ page }) => {
  const state = { job: null as ImportJob | null };
  await installBoundaries(page, state);
  await openEditor(page, "consumer");
  await page.addScriptTag({
    path: path.join(FLOOR_PLAN_FIXTURE_OUTPUT, "bundle.js"),
  });
  const childOpener = page.getByTestId("floor-plan-open-child-dialog");
  await expect(childOpener).toBeVisible();
  await page.getByTestId("coohom-floor-panel").evaluate((element) => {
    (element as HTMLElement).style.display = "none";
  });
  await childOpener.click();
  const child = page.getByRole("dialog", { name: "Floor Plan child fixture" });
  await expect(child).toHaveAttribute("data-editor-dialog-stack-index", "0");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(childOpener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");

  await page.getByTestId("floor-plan-child-harness-host").evaluate((element) => element.remove());
  await page.getByTestId("floor-plan-child-portal-host").evaluate((element) => element.remove());
  await openWorkspace(page, "consumer", "pointer");
  const dialog = page.getByTestId("floor-plan-import-dialog");
  await page.addScriptTag({
    path: path.join(FLOOR_PLAN_FIXTURE_OUTPUT, "bundle.js"),
  });
  const nestedChildOpener = page.getByTestId("floor-plan-open-child-dialog");
  await nestedChildOpener.evaluate((element) => (element as HTMLElement).click());
  await expect(child).toHaveCount(1);
  await expect(child).toHaveAttribute("data-editor-dialog-stack-index", "1");
  await expect(page.getByTestId("floor-plan-child-close")).toBeFocused();
  expect(await dialog.evaluate((element) => ({
    inert: (element as HTMLElement).inert,
    ariaHidden: element.getAttribute("aria-hidden"),
  }))).toEqual({ inert: true, ariaHidden: "true" });
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(nestedChildOpener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("history confirmation is unchanged and guards parent Escape while scope replacement cancels stale return", async ({ page }) => {
  const state = { job: importJob("failed") as ImportJob | null };
  await installBoundaries(page, state);
  await openEditor(page, "consumer");
  const { action, dialog } = await openWorkspace(page, "consumer", "pointer");
  await page.getByTestId("floor-plan-import-secondary-options").getByText(
    "Previous imports & privacy",
    { exact: true }
  ).click();
  await page.getByText("My floor-plan imports", { exact: true }).click();
  await page.getByTestId("floor-plan-import-history-ch0015i-job").getByRole(
    "button",
    { name: "Delete", exact: true }
  ).click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Delete this import from your history?",
  });
  await expect(confirmation).toHaveCount(1);
  await expect(confirmation).not.toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(1);
  await expect(confirmation).toHaveCount(1);
  await confirmation.getByRole("button", { name: "Keep import" }).click();
  await expect(confirmation).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Select Synthetic plan.pdf" }).check();
  await page.getByRole("button", { name: "Delete selected", exact: true }).click();
  const bulkConfirmation = page.getByRole("alertdialog", {
    name: "Delete 1 selected import?",
  });
  await expect(bulkConfirmation).toHaveCount(1);
  await expect(bulkConfirmation).not.toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(1);
  await page.getByText("My floor-plan imports", { exact: true }).click();
  await expect(bulkConfirmation).not.toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(action).toBeFocused();
  await activate(action, page, "pointer");
  await expect(page.getByRole("dialog", { name: "Import a floor plan" })).toHaveCount(1);
  await page.evaluate(() => {
    history.pushState(
      null,
      "",
      "/design?designId=ch0015i-replacement&projectId=ch0015i-project"
    );
  });
  await expect(page).toHaveURL(/designId=ch0015i-replacement/);
  await expect(page.getByRole("dialog", { name: "Import a floor plan" })).toHaveCount(0);
  await expect(action).not.toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});

test("removed opener falls back and reopen creates a new lifecycle generation", async ({ page }) => {
  const state = { job: null as ImportJob | null };
  await installBoundaries(page, state);
  await openEditor(page, "consumer");
  const { action, dialog } = await openWorkspace(page, "consumer", "pointer");
  const firstGeneration = await dialog.getAttribute("data-editor-dialog-generation");
  const [fileChooser] = await Promise.all([
    page.waitForEvent("filechooser"),
    page.getByRole("button", { name: "Choose file", exact: true }).click(),
  ]);
  await fileChooser.setFiles([]);
  await page.getByRole("button", { name: "Close floor-plan import" }).click();
  await expect(action).toBeFocused();

  const importAction = page.locator("#floor-plan-import-action");
  await importAction.click();
  await expect(dialog).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(importAction).toBeFocused();

  const launcher = page.getByTestId("floor-plan-import-workspace-launcher");
  await launcher.click();
  await expect(dialog).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(launcher).toBeFocused();

  await page.getByRole("button", { name: "Starter layouts", exact: true }).click();
  await page.getByTestId("floor-plan-address-search").fill("No Match Street");
  await expect(page.getByText("No approved floor plan found for that address yet.")).toBeVisible();
  await page.locator("#floor-plan-address-upload-action").click();
  await expect(dialog).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expectFocusId(page, "floor-plan-workspace-launch-action");

  await launcher.click();
  const reopened = page.getByRole("dialog", { name: "Import a floor plan" });
  await expect(reopened).toHaveCount(1);
  await launcher.evaluate((element) => element.remove());
  await page.keyboard.press("Escape");
  await expect(page.locator("#floor-plan-workspace-fallback-action")).toBeFocused();
  await importAction.click();
  await expect(reopened).toHaveCount(1);
  expect(await reopened.getAttribute("data-editor-dialog-generation")).not.toBe(firstGeneration);
  await page.keyboard.press("Escape");
  await expect(importAction).toBeFocused();
});
