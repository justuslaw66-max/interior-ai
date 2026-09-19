import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { expect as baseExpect, test, type Browser, type Page, type TestInfo } from "@playwright/test";
import mountedTestInventory from "../../scripts/window-opening-mounted-tests.json";
import {
  isWindowOpeningCaptureDriverWarning,
  WINDOW_OPENING_TRACE_MODE,
} from "./window-opening-capture-runtime-policy";
import {
  cameraMotion,
  cameraTransition,
  observeCameraSettleOnRenderFrames,
  WINDOW_OPENING_CAMERA_SETTLE_CONFIG,
  type CameraSettleResult,
  type CameraState,
} from "./window-opening-camera-settle";

import {
  assertWindowOpeningTestOwner,
  windowOpeningCapturePaths,
  windowOpeningPrerequisite,
} from "../../scripts/window-opening-browser-context.mjs";
import {
  observeWindowOpeningLocalListener,
  windowOpeningCaptureProvenance,
} from "../../scripts/window-opening-capture-provenance.mjs";

const expect = baseExpect.configure({ timeout: 20_000 });
test.setTimeout(240_000);
test.use({ viewport: { width: 1440, height: 1000 }, actionTimeout: 30_000,
  navigationTimeout: 120_000, trace: WINDOW_OPENING_TRACE_MODE });

const STORAGE_KEY = "interior-ai:v1:livingroom-design";
type ExecutionContext = NonNullable<ReturnType<
  typeof import("../../scripts/window-opening-browser-context.mjs").canonicalWindowOpeningContext
>> | ReturnType<typeof import("../../scripts/window-opening-browser-context.mjs").localWindowOpeningContext>;
let executionContext: ExecutionContext;
let evidenceRoot: string;
let networkEvidencePath: string;
let runtimeEvidencePath: string;
let activeTestInfo: TestInfo;
const ACTIVE_IMPORT_KEY = "interior-ai:active-floor-plan-import:v1";
const sha256 = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const fixtureContexts = new WeakMap<Page, {
  id: string;
  sha256: string;
  roomIds: string[];
  openingIds: string[];
}>();
const observedPages = new WeakSet<Page>();
const pageIds = new WeakMap<Page, string>();
const mountedTestIds = new Set(mountedTestInventory.map((entry) => entry.id));
let nextPageId = 1;
const runtimeEvents: Array<{
  category: "consoleError" | "consoleWarning" | "pageError" | "requestFailure" | "responseError";
  testId: string;
  timestamp: string;
  message: string;
  url?: string;
  method?: string;
  status?: number;
  location?: { url: string; lineNumber: number; columnNumber: number };
  pageId: string;
}> = [];
const allowlistedRuntimeEvents: typeof runtimeEvents = [];
const rejectedRuntimeEvents: typeof runtimeEvents = [];
const runtimeTests: Array<{
  id: string;
  title: string;
  status: string;
  rejectedEventCount: number;
}> = [];
let activeTest: {
  id: string;
  title: string;
  project: string;
  outputDir: string;
  eventStart: number;
} | null = null;
const analyticsInterceptions: Array<{
  method: string;
  pathname: string;
  interceptedAt: string;
}> = [];

function mountedTestFor(testInfo: TestInfo) {
  const match = mountedTestInventory.find((entry) => entry.title === testInfo.title);
  if (!match) throw new Error(`Test is absent from the canonical mounted inventory: ${testInfo.title}.`);
  return match;
}

function currentTestId() {
  return activeTest?.id ?? "outside-active-test";
}

function recordRuntimeEvent(event: (typeof runtimeEvents)[number]) {
  runtimeEvents.push(event);
  const url = event.location?.url ?? event.url;
  const route = url ? new URL(url).pathname : null;
  const preloadWarning = /^The resource http:\/\/127\.0\.0\.1:\d+\/_next\/static\/css\/app\/layout\.css\?v=\d+ was preloaded using link preload but not used within a few seconds from the window's load event\. Please make sure it has an appropriate `as` value and it is preloaded intentionally\.$/;
  if (isWindowOpeningCaptureDriverWarning(
    event, route, WINDOW_OPENING_TRACE_MODE, allowlistedRuntimeEvents
  )) {
    allowlistedRuntimeEvents.push(event);
    return;
  }
  const preloadWarningCount = allowlistedRuntimeEvents.filter(
    (entry) => entry.pageId === event.pageId && preloadWarning.test(entry.message)
  ).length;
  if (event.category === "consoleWarning" && route === "/design" &&
      mountedTestIds.has(event.testId) && preloadWarning.test(event.message) &&
      preloadWarningCount < 1) {
    allowlistedRuntimeEvents.push(event);
    return;
  }
  const importReviewCloseAbortCount = allowlistedRuntimeEvents.filter(
    (entry) => entry.testId === "window-opening-05-import-review-override" &&
      entry.category === "requestFailure" && entry.method === "GET" &&
      entry.message === "net::ERR_ABORTED" && typeof entry.url === "string" &&
      new URL(entry.url).pathname === "/api/floor-plan-imports/mounted-import-job"
  ).length;
  if (event.testId === "window-opening-05-import-review-override" &&
      event.category === "requestFailure" && event.method === "GET" &&
      event.message === "net::ERR_ABORTED" &&
      route === "/api/floor-plan-imports/mounted-import-job" &&
      importReviewCloseAbortCount < 2) {
    allowlistedRuntimeEvents.push(event);
    return;
  }
  rejectedRuntimeEvents.push(event);
}

function attachRuntimePolicy(page: Page) {
  if (observedPages.has(page)) return;
  observedPages.add(page);
  const pageId = `page-${nextPageId}`;
  nextPageId += 1;
  pageIds.set(page, pageId);
  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") return;
    recordRuntimeEvent({
      category: message.type() === "error" ? "consoleError" : "consoleWarning",
      testId: currentTestId(),
      timestamp: new Date().toISOString(),
      message: message.text(),
      location: message.location(),
      pageId,
    });
  });
  page.on("pageerror", (error) => recordRuntimeEvent({
    category: "pageError", testId: currentTestId(), timestamp: new Date().toISOString(),
    message: error.message, pageId,
  }));
  page.on("requestfailed", (request) => recordRuntimeEvent({
    category: "requestFailure", testId: currentTestId(), timestamp: new Date().toISOString(),
    message: request.failure()?.errorText ?? "request failed",
    url: request.url(), method: request.method(), pageId,
  }));
  page.on("response", (response) => {
    if (response.status() < 400) return;
    recordRuntimeEvent({
      category: "responseError", testId: currentTestId(), timestamp: new Date().toISOString(),
      message: `Unexpected HTTP ${response.status()}.`,
      url: response.url(), method: response.request().method(), status: response.status(), pageId,
    });
  });
}

test.beforeAll(async ({}, testInfo) => {
  executionContext = testInfo.config.metadata.windowOpeningExecution;
  assertWindowOpeningTestOwner(executionContext, {
    baseURL: testInfo.project.use.baseURL,
    configFile: testInfo.config.configFile,
    project: testInfo.project.name,
  });
  if (executionContext.owner === "local-mounted") {
    await observeWindowOpeningLocalListener(executionContext);
    evidenceRoot = executionContext.evidenceRoot;
    networkEvidencePath = executionContext.networkRoot;
    runtimeEvidencePath = executionContext.runtimeRoot;
  } else {
    evidenceRoot = executionContext.outputPath;
    const runRoot = path.join(evidenceRoot, `window-opening-${executionContext.runId}`);
    networkEvidencePath = path.join(runRoot, "analytics-interceptions");
    runtimeEvidencePath = path.join(runRoot, "runtime-events");
  }
});

test.beforeEach(async ({}, testInfo) => {
  activeTestInfo = testInfo;
  const inventory = mountedTestFor(testInfo);
  activeTest = {
    id: inventory.id,
    title: inventory.title,
    project: testInfo.project.name,
    outputDir: testInfo.outputDir,
    eventStart: runtimeEvents.length,
  };
});

test.afterEach(async ({}, testInfo) => {
  const identity = activeTest;
  if (!identity) throw new Error("Mounted test identity was lost before policy verification.");
  const testEvents = runtimeEvents.slice(identity.eventStart);
  const rejected = testEvents.filter((event) => rejectedRuntimeEvents.includes(event));
  runtimeTests.push({
    id: identity.id,
    title: identity.title,
    status: testInfo.status ?? "unknown",
    rejectedEventCount: rejected.length,
  });
  activeTest = null;
  expect(rejected, "console, page, request, and HTTP policy violations").toEqual([]);
});

test.afterAll(async () => {
  if (!networkEvidencePath) return;
  await fs.mkdir(networkEvidencePath, { recursive: true });
  await fs.writeFile(
    path.join(networkEvidencePath, `worker-${process.pid}.json`),
    `${JSON.stringify(analyticsInterceptions, null, 2)}\n`,
    { flag: "wx", mode: 0o644 }
  );
  if (!runtimeEvidencePath) {
    throw windowOpeningPrerequisite("runtime evidence output was not configured.");
  }
  const eventCounts = (events: typeof runtimeEvents) => ({
    consoleError: events.filter((entry) => entry.category === "consoleError").length,
    consoleWarning: events.filter((entry) => entry.category === "consoleWarning").length,
    pageError: events.filter((entry) => entry.category === "pageError").length,
    requestFailure: events.filter((entry) => entry.category === "requestFailure").length,
    responseError: events.filter((entry) => entry.category === "responseError").length,
  });
  await fs.mkdir(runtimeEvidencePath, { recursive: true });
  await fs.writeFile(path.join(runtimeEvidencePath, `worker-${process.pid}.json`), `${JSON.stringify({
    schemaVersion: "window-opening-runtime-policy/v1",
    policy: "zero-unallowlisted-events",
    allowlistPolicies: [{
      id: "chromium-webgl-readpixels-driver-warning",
      origin: "Chromium OpenGL driver diagnostics",
      route: "/design",
      testIds: [...mountedTestIds],
      component: "Playwright screenshot and trace capture",
      maximumPerPage: 4,
      justification: "Exact bounded Chromium ReadPixels diagnostics observed during screenshot and trace-frame readback.",
    }, {
      id: "next-development-css-preload-warning",
      origin: "Chromium resource-hint diagnostics for Next development CSS",
      route: "/design",
      testIds: [...mountedTestIds],
      maximumPerPage: 1,
      justification: "Development-only framework preload timing warning; resource loaded successfully and is not an application error.",
    }, {
      id: "import-review-session-lifecycle-abort",
      origin: "Consumer import-session AbortController lifecycle",
      testId: "window-opening-05-import-review-override",
      route: "/api/floor-plan-imports/mounted-import-job",
      method: "GET",
      message: "net::ERR_ABORTED",
      maximumPerTest: 2,
      justification: "The import session cancels two superseded no-store loads while reconciling the mounted job; the fulfilled fixture state is verified afterward.",
    }],
    counts: eventCounts(runtimeEvents),
    allowlistedCounts: eventCounts(allowlistedRuntimeEvents),
    rejectedCounts: eventCounts(rejectedRuntimeEvents),
    allowlistedEvents: allowlistedRuntimeEvents,
    rejectedEvents: rejectedRuntimeEvents,
    tests: runtimeTests,
  }, null, 2)}\n`, { flag: "wx", mode: 0o644 });
});

type FixtureRoom = {
  id: string;
  name: string;
  roomType: "living";
  geometry: { width: number; depth: number; wallThickness: number; height: number };
  planPosition: { x: number; z: number };
  planShape?: "rectangle" | "l_shape" | "custom_polygon";
  planPolygon?: Array<{ x: number; z: number }>;
  items: never[];
  zones: never[];
  savedViews: never[];
};

type FixtureOpening = {
  id: string;
  roomId?: string;
  wall: "north" | "south" | "east" | "west";
  offsetMm: number;
  widthMm: number;
  heightMm?: number;
  bottomMm?: number;
  kind: "door" | "window";
  requestedWorldCenterMm?: { x: number; z: number };
  evidence?: {
    width?: "assumed" | "user_confirmed" | "source_documented" | "site_measured";
    height?: "assumed" | "user_confirmed" | "source_documented" | "site_measured";
    sillHeight?: "assumed" | "user_confirmed" | "source_documented" | "site_measured";
  };
};

function importReviewDocument() {
  const provenance = {
    confidence: 0.98,
    extractionVersion: "window-opening-mounted-v1",
    evidence: [{
      sourceId: "mounted-source",
      basis: "vector_traced",
      confidence: 0.98,
      extractorVersion: "window-opening-mounted-v1",
      pageNumber: 1,
    }],
    reviewHistory: [],
  };
  const vertex = (id: string, xMm: number, zMm: number) => ({
    id, xMm, zMm, provenance,
  });
  return {
    schemaVersion: 2,
    units: "mm",
    id: "mounted-import-review",
    revisionId: "mounted-review-r1",
    createdAt: "2026-09-01T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [{
      id: "mounted-source", kind: "pdf", name: "Mounted import review",
      mimeType: "application/pdf", sha256: "b".repeat(64), pageCount: 1,
    }],
    floors: [{
      id: "mounted-floor", name: "Mounted floor", levelIndex: 0,
      elevationMm: 0, storeyHeightMm: 2800, slabThicknessMm: 150,
      defaults: {
        wallHeight: { valueMm: 2600, evidence: "assumed", provenance },
        doorHeight: { valueMm: 2100, evidence: "assumed", provenance },
        windowHeight: { valueMm: 1200, evidence: "assumed", provenance },
        windowSillHeight: { valueMm: 900, evidence: "assumed", provenance },
      },
      calibrations: [],
      vertices: [
        vertex("mounted-v1", -2000, -1500), vertex("mounted-v2", 2000, -1500),
        vertex("mounted-v3", 2000, 1500), vertex("mounted-v4", -2000, 1500),
      ],
      walls: [
        { id: "mounted-north", path: { kind: "line", startVertexId: "mounted-v1", endVertexId: "mounted-v2" }, thicknessMm: 120, classification: "exterior", adjacentRoomIds: ["mounted-room"], provenance },
        { id: "mounted-east", path: { kind: "line", startVertexId: "mounted-v2", endVertexId: "mounted-v3" }, thicknessMm: 120, classification: "exterior", adjacentRoomIds: ["mounted-room"], provenance },
        { id: "mounted-south", path: { kind: "line", startVertexId: "mounted-v3", endVertexId: "mounted-v4" }, thicknessMm: 120, classification: "exterior", adjacentRoomIds: ["mounted-room"], provenance },
        { id: "mounted-west", path: { kind: "line", startVertexId: "mounted-v4", endVertexId: "mounted-v1" }, thicknessMm: 120, classification: "exterior", adjacentRoomIds: ["mounted-room"], provenance },
      ],
      rooms: [{
        id: "mounted-room", name: "Mounted room", roomType: "living",
        wallLoops: [{ kind: "outer", walls: [
          { wallId: "mounted-north", direction: "forward" },
          { wallId: "mounted-east", direction: "forward" },
          { wallId: "mounted-south", direction: "forward" },
          { wallId: "mounted-west", direction: "forward" },
        ] }], provenance,
      }],
      openings: [{
        id: "mounted-protected-window", wallId: "mounted-north", kind: "window",
        operation: "fixed", offsetMm: 1000, widthMm: 900, widthEvidence: "source_documented",
        heightMm: 1200, heightEvidence: "source_documented",
        sillHeightMm: 900, sillHeightEvidence: "source_documented",
        hinge: "none", handing: "none", provenance,
      }],
      structures: [], annotations: [], dimensions: [],
    }],
  };
}

function importReviewJob() {
  return {
    id: "mounted-import-job", status: "needs_review", progress: 100,
    adapterId: "mounted-fixture", extractionVersion: "window-opening-mounted-v1",
    statusChangedAt: null, lastAttemptAt: null, nextAttemptAt: null,
    leaseExpiresAt: null, heartbeatAt: null, renderedPagesJson: [],
    candidateJson: importReviewDocument(), reviewIssuesJson: [], candidateVersion: 1,
    errorMessage: null, appliedDesignId: null,
    sourceRetentionExpiresAt: "2026-09-02T00:00:00.000Z",
    sourceDeletionRequestedAt: null, trainingBenchmarkOptIn: false,
    sourceAsset: { fileName: "mounted-review.pdf", mimeType: "application/pdf", contentDeletedAt: null },
  };
}

function fixture(rooms: FixtureRoom[], openings: FixtureOpening[]) {
  return {
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
    activeRoomId: rooms[0].id,
    rooms,
    floorPlan: { openings },
  };
}

function room(
  id: string,
  x: number,
  z: number,
  width = 4,
  depth = 4
): FixtureRoom {
  return {
    id,
    name: id.replaceAll("-", " "),
    roomType: "living",
    geometry: { width, depth, wallThickness: 0.12, height: 2.6 },
    planPosition: { x, z },
    planShape: "rectangle",
    items: [],
    zones: [],
    savedViews: [],
  };
}

function assertFixtureTarget(page: Page, pathname: string) {
  const url = new URL(page.url());
  if (url.origin !== executionContext.baseURL || url.pathname !== pathname) {
    throw windowOpeningPrerequisite("fixture navigation redirected away from the configured target/route; provide the existing deployment access and authentication prerequisites.");
  }
}

async function loadFixture(
  page: Page,
  value: ReturnType<typeof fixture>,
  route = "/design?debug_layout=1"
) {
  attachRuntimePolicy(page);
  await page.addInitScript(() => {
    // Enable the existing read-only diagnostics before production scene creation.
    Object.defineProperty(globalThis, "__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__", {
      configurable: true, writable: true, value: true,
    });
  });
  const fixtureSha256 = sha256(JSON.stringify(value));
  fixtureContexts.set(page, {
    id: `${currentTestId()}:${fixtureSha256.slice(0, 16)}`,
    sha256: fixtureSha256,
    roomIds: value.rooms.map((entry) => entry.id),
    openingIds: value.floorPlan.openings.map((entry) => entry.id),
  });
  const plan = route.includes("mode=designer") ? "pro" : "free";
  await page.route("**/api/track/app-event", async (request) => {
    const url = new URL(request.request().url());
    analyticsInterceptions.push({
      method: request.request().method(),
      pathname: url.pathname,
      interceptedAt: new Date().toISOString(),
    });
    await request.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, persisted: false, intercepted: true }),
    });
  });
  await page.route("**/api/me", async (request) => {
    await request.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan, source: "window-opening-playwright" }),
    });
  });
  const health = await page.goto("/api/health", { waitUntil: "domcontentloaded" });
  expect(health?.status(), "window fixture requires the owner's healthy target").toBe(200);
  assertFixtureTarget(page, "/api/health");
  await page.evaluate(({ key, raw }) => {
    localStorage.clear();
    localStorage.setItem("__window_opening_fixture_loaded", "1");
    localStorage.setItem(key, raw);
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    localStorage.setItem("plan_measurement_unit", "mm");
    localStorage.setItem("scene_performance_mode", "quality");
    localStorage.setItem("plan_guided_actions", "0");
    localStorage.setItem("plan_guided_actions_choice_seen", "1");
  }, { key: STORAGE_KEY, raw: JSON.stringify(value) });
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });
  expect(response?.status(), "window fixture requires an authorized /design route").toBe(200);
  assertFixtureTarget(page, "/design");
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible();
  const debug = page.getByTestId("qa-design-layout-debug");
  await expect(debug).toHaveAttribute("data-active-room-id", value.rooms[0].id);
  await expect.poll(() => page.evaluate(() => ({
    layout: document.querySelectorAll('[data-testid="qa-design-layout-debug"]').length,
    camera: Boolean(document.documentElement.getAttribute("data-qa-camera-state")),
    frames: Boolean(document.documentElement.getAttribute("data-qa-camera-render-frame")),
  })), { message: "Window-opening execution prerequisite: the selected artifact must already contain approved layout and camera QA hooks (NEXT_PUBLIC_ENABLE_QA_HOOKS=1 at build); do not substitute another artifact." })
    .toEqual({ layout: 1, camera: true, frames: true });
  const view2d = page.locator('[data-testid="editor-view-2d"]:visible').first();
  if ((await view2d.getAttribute("aria-pressed")) !== "true") await view2d.click();
  await expect(debug).toHaveAttribute(
    "data-view-mode",
    "2d"
  );
  const analyticsProbe = await page.evaluate(async () => {
    const response = await fetch("/api/track/app-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "window_opening_evidence_probe" }),
    });
    return response.json();
  });
  expect(analyticsProbe).toMatchObject({ persisted: false, intercepted: true });
}

async function replaceFixture(page: Page, value: ReturnType<typeof fixture>) {
  const fixtureSha256 = sha256(JSON.stringify(value));
  fixtureContexts.set(page, {
    id: `${currentTestId()}:${fixtureSha256.slice(0, 16)}`,
    sha256: fixtureSha256,
    roomIds: value.rooms.map((entry) => entry.id),
    openingIds: value.floorPlan.openings.map((entry) => entry.id),
  });
  await page.evaluate(({ key, raw }) => {
    localStorage.clear();
    localStorage.setItem("__window_opening_fixture_loaded", "1");
    localStorage.setItem(key, raw);
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    localStorage.setItem("plan_measurement_unit", "mm");
    localStorage.setItem("scene_performance_mode", "quality");
    localStorage.setItem("plan_guided_actions", "0");
    localStorage.setItem("plan_guided_actions_choice_seen", "1");
  }, { key: STORAGE_KEY, raw: JSON.stringify(value) });
  await page.reload({ waitUntil: "domcontentloaded" });
  const debug = page.getByTestId("qa-design-layout-debug");
  await expect(debug).toHaveAttribute("data-active-room-id", value.rooms[0].id);
  const view2d = page.locator('[data-testid="editor-view-2d"]:visible').first();
  if ((await view2d.getAttribute("aria-pressed")) !== "true") await view2d.click();
  await expect(debug).toHaveAttribute("data-view-mode", "2d");
}

type CameraTransitionCapture = {
  fromScreenshotId: string;
  minimumAngleDeg: number;
  minimumPositionDistance: number;
  maximumTargetDrift: number;
  fromCameraState: CameraState;
  settleProof?: CameraSettleResult;
};

async function capture(page: Page, name: string,
  cameraTransitionRequest: CameraTransitionCapture | null = null) {
  if (!activeTest) throw new Error("Mounted capture has no active test identity.");
  const fixtureContext = fixtureContexts.get(page);
  if (!fixtureContext) throw new Error("Mounted capture has no fixture identity.");
  const { screenshotPath, sidecarPath, tracePath } = windowOpeningCapturePaths(executionContext, {
    outputDir: activeTest.outputDir, testId: activeTest.id,
    project: activeTest.project, screenshotId: name,
  });
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  const captureStartedAt = new Date().toISOString();
  const url = new URL(page.url());
  const debug = page.getByTestId("qa-design-layout-debug");
  const [viewport, deviceScaleFactor, mode, activeRoomId, cameraStateRaw, focusRaw] =
    await Promise.all([
      Promise.resolve(page.viewportSize()),
      page.evaluate(() => window.devicePixelRatio),
      debug.getAttribute("data-view-mode"),
      debug.getAttribute("data-active-room-id"),
      page.locator("html").getAttribute("data-qa-camera-state"),
      page.evaluate(() => document.querySelector(
        '[data-testid="active-room-focus-toolbar"]'
      )?.getAttribute("data-focus-enabled") ?? null),
    ]);
  if (!viewport || !mode || !cameraStateRaw) {
    throw new Error(`Mounted capture context is incomplete for ${name}.`);
  }
  const cameraState: CameraState = JSON.parse(cameraStateRaw);
  const postSettleMotion = cameraTransitionRequest?.settleProof
    ? cameraMotion(cameraTransitionRequest.settleProof.lastState, cameraState) : null;
  if (postSettleMotion) {
    expect(postSettleMotion.positionDistance).toBeLessThanOrEqual(0.005);
    expect(postSettleMotion.quaternionDistance).toBeLessThanOrEqual(0.0005);
    expect(postSettleMotion.targetDistance).toBeLessThanOrEqual(0.001);
    expect(postSettleMotion.zoomDistance).toBeLessThanOrEqual(0.001);
  }
  const transitionMetrics = cameraTransitionRequest
    ? cameraTransition(cameraTransitionRequest.fromCameraState, cameraState) : null;
  if (cameraTransitionRequest && transitionMetrics) {
    expect(transitionMetrics.angleDeg).toBeGreaterThanOrEqual(
      cameraTransitionRequest.minimumAngleDeg
    );
    expect(transitionMetrics.positionDistance).toBeGreaterThanOrEqual(
      cameraTransitionRequest.minimumPositionDistance
    );
    expect(transitionMetrics.targetDrift).toBeLessThanOrEqual(
      cameraTransitionRequest.maximumTargetDrift
    );
  }
  const cameraTransitionProof = cameraTransitionRequest && transitionMetrics ? {
    ...cameraTransitionRequest,
    observedAngleDeg: transitionMetrics.angleDeg,
    observedPositionDistance: transitionMetrics.positionDistance,
    observedTargetDrift: transitionMetrics.targetDrift,
    postSettleMotion,
    toCameraState: cameraState,
  } : null;
  const provenance = await windowOpeningCaptureProvenance(executionContext, name, page.url());
  const content = await page.screenshot({
    path: screenshotPath,
    fullPage: false,
  });
  const captureTimestamp = new Date().toISOString();
  const relativePath = path.relative(evidenceRoot, screenshotPath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("Mounted screenshot lies outside its run root.");
  }
  await fs.writeFile(sidecarPath, `${JSON.stringify({
    schemaVersion: executionContext.owner === "local-mounted"
      ? "window-opening-screenshot-capture/v2" : "window-opening-canonical-capture/v1",
    ...provenance,
    screenshotId: name,
    test: {
      id: activeTest.id,
      title: activeTest.title,
      project: activeTest.project,
    },
    absolutePath: screenshotPath,
    evidenceRootRelativePath: relativePath,
    captureStartedAt,
    captureTimestamp,
    route: url.pathname,
    query: Object.fromEntries([...url.searchParams.entries()].sort()),
    fixture: fixtureContext,
    logicalDesignId: STORAGE_KEY,
    logicalRoomIds: fixtureContext.roomIds,
    logicalOpeningIds: fixtureContext.openingIds,
    viewport: { ...viewport, deviceScaleFactor },
    mode,
    focus: focusRaw === "true" ? "focused_room" : "full_plan",
    focusedRoomId: focusRaw === "true" ? activeRoomId : null,
    cameraState,
    cameraTransitionProof,
    mime: "image/png",
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20),
    bytes: content.byteLength,
    sha256: sha256(content),
    trace: {
      testId: activeTest.id,
      absolutePath: tracePath,
      evidenceRootRelativePath: path.relative(evidenceRoot, tracePath),
    },
  }, null, 2)}\n`, { flag: "wx", mode: 0o644 });
  if (executionContext.owner !== "local-mounted") {
    await activeTestInfo.attach(`${name}.png`, { path: screenshotPath, contentType: "image/png" });
    await activeTestInfo.attach(`${name}.capture.json`, { path: sidecarPath, contentType: "application/json" });
  }
  return cameraState;
}

async function storedOpening(page: Page, openingId: string) {
  return page.evaluate(
    ({ key, id }) => {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      return JSON.parse(raw).floorPlan?.openings?.find(
        (opening: { id: string }) => opening.id === id
      ) ?? null;
    },
    { key: STORAGE_KEY, id: openingId }
  );
}

async function findCanvasCursorPoint({
  page,
  approximate,
  cursor,
}: {
  page: Page;
  approximate: { x: number; y: number };
  cursor: string;
}) {
  const offsets = [0, 6, -6, 12, -12, 18, -18, 24, -24];
  for (const yOffset of offsets) {
    for (const xOffset of offsets) {
      const point = {
        x: approximate.x + xOffset,
        y: approximate.y + yOffset,
      };
      await page.mouse.move(point.x, point.y);
      if (await page.evaluate((expected) => document.body.style.cursor === expected, cursor)) {
        return point;
      }
    }
  }
  throw new Error(`Could not find mounted canvas target with ${cursor} cursor.`);
}

async function selectedOpeningDragBasis(
  page: Page,
  openingId: string,
  requireSelection = true
) {
  const anchor = page.getByTestId(`qa-opening-anchor-2d-${openingId}`);
  const tangentMarker = page.getByTestId(`qa-opening-tangent-2d-${openingId}`);
  await anchor.waitFor({ state: "attached" });
  await tangentMarker.waitFor({ state: "attached" });
  const [anchorBox, tangentBox] = await Promise.all([
    anchor.boundingBox(), tangentMarker.boundingBox(),
  ]);
  expect(anchorBox).toBeTruthy();
  expect(tangentBox).toBeTruthy();
  const approximateCenter = {
    x: anchorBox!.x + anchorBox!.width / 2,
    y: anchorBox!.y + anchorBox!.height / 2,
  };
  const tangentVector = {
    x: tangentBox!.x + tangentBox!.width / 2 - approximateCenter.x,
    z: tangentBox!.y + tangentBox!.height / 2 - approximateCenter.y,
  };
  const projectedLength = Math.hypot(tangentVector.x, tangentVector.z);
  expect(projectedLength).toBeGreaterThan(2);
  const tangent = {
    x: tangentVector.x / projectedLength,
    z: tangentVector.z / projectedLength,
  };
  const selector = page.getByTestId(`qa-opening-select-2d-${openingId}`);
  if ((await selector.getAttribute("data-selected")) !== "true") {
    await selector.dispatchEvent("click");
    if (requireSelection) await expect(selector).toHaveAttribute("data-selected", "true");
  }
  const start = await findCanvasCursorPoint({ page, approximate: approximateCenter, cursor: "grab" });
  return { start, pixelsPerMeter: projectedLength / 0.3, tangent };
}

async function dragOpening2D(input: {
  page: Page;
  openingId: string;
  alongMeters: number;
  perpendicularMeters?: number;
}) {
  const basis = await selectedOpeningDragBasis(input.page, input.openingId, false);
  const perpendicular = input.perpendicularMeters ?? 0;
  const dx = (basis.tangent.x * input.alongMeters - basis.tangent.z * perpendicular) *
    basis.pixelsPerMeter;
  const dy = (basis.tangent.z * input.alongMeters + basis.tangent.x * perpendicular) *
    basis.pixelsPerMeter;
  await input.page.mouse.move(basis.start.x, basis.start.y);
  await input.page.mouse.down();
  await input.page.mouse.move(basis.start.x + dx, basis.start.y + dy, { steps: 14 });
  await input.page.mouse.up();
  return basis;
}

async function dragOpening3D(page: Page, openingId: string, pixels: number) {
  const anchor = page.getByTestId(`qa-opening-anchor-3d-${openingId}`);
  const dragPlane = page.getByTestId(`qa-opening-drag-plane-3d-${openingId}`);
  const tangentMarker = page.getByTestId(`qa-opening-tangent-3d-${openingId}`);
  const normalMarker = page.getByTestId(`qa-opening-normal-3d-${openingId}`);
  await anchor.waitFor({ state: "attached" });
  await dragPlane.waitFor({ state: "attached" });
  await tangentMarker.waitFor({ state: "attached" });
  await normalMarker.waitFor({ state: "attached" });
  const [anchorBox, dragPlaneBox, tangentBox, normalBox] = await Promise.all([
    anchor.boundingBox(), dragPlane.boundingBox(), tangentMarker.boundingBox(), normalMarker.boundingBox(),
  ]);
  expect(anchorBox).toBeTruthy();
  expect(dragPlaneBox).toBeTruthy();
  expect(tangentBox).toBeTruthy();
  expect(normalBox).toBeTruthy();
  const start = {
    x: anchorBox!.x + anchorBox!.width / 2,
    y: anchorBox!.y + anchorBox!.height / 2,
  };
  const vector = {
    x: tangentBox!.x - dragPlaneBox!.x,
    y: tangentBox!.y - dragPlaneBox!.y,
  };
  const length = Math.hypot(vector.x, vector.y);
  expect(length).toBeGreaterThan(2);
  const unit = { x: vector.x / length, y: vector.y / length };
  const normalVector = {
    x: normalBox!.x - dragPlaneBox!.x,
    y: normalBox!.y - dragPlaneBox!.y,
  };
  const normalLength = Math.hypot(normalVector.x, normalVector.y);
  expect(normalLength).toBeGreaterThan(2);
  const normal = { x: normalVector.x / normalLength, y: normalVector.y / normalLength };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + unit.x * pixels, start.y + unit.y * pixels, { steps: 16 });
  await page.mouse.up();
  return { tangent: unit, normal };
}

async function newPolygonCase(
  browser: Browser,
  id: string,
  polygon: Array<{ x: number; z: number }>,
  zoom: "default" | "in" | "out" = "default",
  wall: FixtureOpening["wall"] = "north"
) {
  const page = await browser.newPage();
  const polygonRoom: FixtureRoom = {
    ...room(`${id}-room`, 0, 0, 4, 4),
    planShape: "custom_polygon",
    planPolygon: polygon,
  };
  await loadFixture(page, fixture([polygonRoom], [{
    id, roomId: polygonRoom.id, wall, offsetMm: 0,
    widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window",
  }]));
  if (zoom !== "default") {
    const debug = page.getByTestId("qa-design-layout-debug");
    const before = Number(await debug.getAttribute("data-plan-zoom"));
    const canvas = page.getByTestId("scene-canvas").first();
    await canvas.hover();
    await page.mouse.wheel(0, zoom === "in" ? -700 : 700);
    const zoomValue = expect.poll(
      async () => Number(await debug.getAttribute("data-plan-zoom"))
    );
    if (zoom === "in") await zoomValue.toBeGreaterThan(before);
    else await zoomValue.toBeLessThan(before);
  }
  return { page };
}

async function openImportReview(page: Page, proMode: boolean) {
  const job = importReviewJob();
  await page.route("**/api/floor-plan-imports?limit=6", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ jobs: [], nextCursor: null }),
    });
  });
  await page.route("**/api/floor-plan-imports/mounted-import-job", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ job }),
    });
  });
  await loadFixture(
    page,
    fixture([room("import-shell-room", 0, 0)], []),
    proMode ? "/design?mode=designer&debug_layout=1" : "/design?debug_layout=1"
  );
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: ACTIVE_IMPORT_KEY, value: job.id }
  );
  await page.locator('[data-testid="plan-opening-kind-label"]').first().click();
  await page.getByTestId("floor-plan-import-workspace-launcher").first().click();
  await expect(page.getByTestId("floor-plan-import-review")).toBeVisible();
  await page.locator("summary").filter({ hasText: "Help AI finish this plan" }).click();
  await page.locator("summary").filter({ hasText: "Expert corrections" }).click();
  await page.getByText("Correct walls, openings and structures", { exact: true }).click();
  await page.getByTestId("import-review-opening-select")
    .selectOption("mounted-protected-window");
}

async function assertOpeningMarkerInCanvas(page: Page, openingId: string) {
  const canvasBox = await page.getByTestId("scene-canvas").first().boundingBox();
  const markerBox = await page.getByTestId(`qa-opening-anchor-3d-${openingId}`).boundingBox();
  expect(canvasBox).toBeTruthy();
  expect(markerBox).toBeTruthy();
  expect(markerBox!.x + markerBox!.width).toBeGreaterThan(canvasBox!.x);
  expect(markerBox!.x).toBeLessThan(canvasBox!.x + canvasBox!.width);
  expect(markerBox!.y + markerBox!.height).toBeGreaterThan(canvasBox!.y);
  expect(markerBox!.y).toBeLessThan(canvasBox!.y + canvasBox!.height);
}

async function orbitToSecondDirection(page: Page, first: CameraState) {
  const canvas = page.getByTestId("scene-canvas").first();
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  expect(box).toBeTruthy();
  const start = { x: box!.x + box!.width * 0.68, y: box!.y + box!.height * 0.48 };
  const end = { x: box!.x + box!.width * 0.26, y: box!.y + box!.height * 0.56 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button: "left" });
  await page.mouse.move(end.x, end.y, { steps: 24 });
  await page.mouse.up({ button: "left" });
  const settle = await page.evaluate(
    observeCameraSettleOnRenderFrames,
    WINDOW_OPENING_CAMERA_SETTLE_CONFIG
  );
  if (settle.status !== "settled") {
    throw new Error(`OrbitControls must settle before the direction-B capture.\n${
      JSON.stringify(settle, null, 2)
    }`);
  }
  expect(settle.stableSamples).toBeGreaterThanOrEqual(2);
  const second = settle.lastState;
  const metrics = cameraTransition(first, second);
  expect(metrics.angleDeg).toBeGreaterThanOrEqual(10);
  expect(metrics.positionDistance).toBeGreaterThanOrEqual(0.75);
  expect(metrics.targetDrift).toBeLessThanOrEqual(0.5);
  expect(second).not.toEqual(first);
  return { second, metrics, settle };
}

test("final window matrix remains visible in full plan, focus, and both 3D directions", async ({ page }) => {
  const roomA = { ...room("evidence-room-a", 0, 0, 4, 4), name: "Evidence Room A" };
  const roomB = { ...room("evidence-room-b", 3, 1, 2, 2), name: "Evidence Room B" };
  await loadFixture(page, fixture([roomA, roomB], [
    {
      id: "seeded-roomless-door",
      wall: "north",
      offsetMm: 0,
      widthMm: 900,
      heightMm: 2100,
      bottomMm: 0,
      kind: "door",
      requestedWorldCenterMm: { x: 0, z: -2000 },
    },
    {
      id: "seeded-roomless-window",
      wall: "west",
      offsetMm: 0,
      widthMm: 900,
      heightMm: 1200,
      bottomMm: 900,
      kind: "window",
      requestedWorldCenterMm: { x: -2000, z: 0 },
    },
    {
      id: "standard-window",
      roomId: roomA.id,
      wall: "south",
      offsetMm: -800,
      widthMm: 900,
      heightMm: 1200,
      bottomMm: 900,
      kind: "window",
    },
    {
      id: "partial-shared-window",
      roomId: roomA.id,
      wall: "east",
      offsetMm: 1000,
      widthMm: 800,
      heightMm: 1100,
      bottomMm: 950,
      kind: "window",
    },
    {
      id: "full-height-window",
      roomId: roomB.id,
      wall: "east",
      offsetMm: 0,
      widthMm: 900,
      heightMm: 2400,
      bottomMm: 0,
      kind: "window",
    },
  ]));
  await expect(page.locator('[data-opening-id="seeded-roomless-door"]')).toBeVisible();
  await expect(page.locator('[data-opening-id="seeded-roomless-window"]')).toBeVisible();
  await capture(page, "01-full-plan-2d-seeded-and-partial");

  await page.locator('[data-testid="editor-view-3d"]:visible').first().click();
  await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute("data-view-mode", "3d");
  await assertOpeningMarkerInCanvas(page, "standard-window");
  await assertOpeningMarkerInCanvas(page, "full-height-window");
  const cameraA = await capture(page, "02-full-plan-3d-direction-a-standard-window");
  const directionB = await orbitToSecondDirection(page, cameraA);
  await assertOpeningMarkerInCanvas(page, "standard-window");
  await assertOpeningMarkerInCanvas(page, "full-height-window");
  await capture(page, "03-full-plan-3d-direction-b-full-height-window", {
    fromScreenshotId: "02-full-plan-3d-direction-a-standard-window",
    minimumAngleDeg: 10,
    minimumPositionDistance: 0.75,
    maximumTargetDrift: 0.5,
    fromCameraState: cameraA,
    settleProof: directionB.settle,
  });
  await capture(page, "04-partial-shared-full-plan-3d");

  await page.getByLabel("Focus Evidence Room A").click({ force: true });
  await page.getByTestId("active-room-focus-toggle").click();
  await expect(page.getByTestId("active-room-focus-toolbar")).toHaveAttribute(
    "data-focus-enabled",
    "true"
  );
  await capture(page, "05-partial-shared-focus-room-a");
  await page.getByTestId("active-room-focus-toggle").click();
  await expect(page.getByTestId("active-room-focus-toolbar")).toHaveAttribute(
    "data-focus-enabled",
    "false"
  );
  const focusRoomB = page.getByLabel("Focus Evidence Room B");
  await expect(focusRoomB).toBeVisible();
  await focusRoomB.click({ force: true });
  await page.getByTestId("active-room-focus-toggle").click();
  await capture(page, "06-partial-shared-focus-room-b");
  await page.locator('[data-testid="editor-view-2d"]:visible').first().click();
  await capture(page, "07-standard-and-full-height-windows");
});

test("known unresolved marker selects, repairs, and remains discoverable in 3D", async ({ page }) => {
  const lRoom: FixtureRoom = {
    ...room("l-room", 0, 0, 4, 4),
    planShape: "custom_polygon",
    planPolygon: [
      { x: -2, z: -2 }, { x: 2, z: -2 },
      { x: 1, z: 2 }, { x: -1, z: 2 },
    ],
  };
  await loadFixture(page, fixture([lRoom], [
    {
      id: "known-unresolved", roomId: lRoom.id, wall: "south", offsetMm: 2000,
      widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window",
      requestedWorldCenterMm: { x: -1209, z: 1164 },
    },
    {
      id: "repair-host-blocker", roomId: lRoom.id, wall: "west", offsetMm: 0,
      widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window",
    },
  ]));

  const knownMarker = page.locator(
    '[data-testid="unresolved-opening-label-2d"][data-opening-id="known-unresolved"]'
  );
  await expect(knownMarker).toBeVisible();
  await expect(knownMarker).toHaveAttribute("data-host-status", "unresolved");
  await capture(page, "13-unresolved-known-position-2d");
  await knownMarker.click();
  await expect(page.getByTestId("selection-inspector-opening-dimensions")).toBeVisible();
  await expect(page.getByTestId("selection-inspector-opening-host-warning")).toBeVisible();
  await capture(page, "14-unresolved-repair-inspector");

  const issue = page.getByTestId("plan-quality-review-issue-opening-host:known-unresolved");
  await expect(issue).toContainText("Window needs wall repair");
  await page.locator('[data-testid="editor-view-3d"]:visible').first().click();
  await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute(
    "data-view-mode",
    "3d"
  );
  await expect(issue).toBeVisible();
  await expect(page.getByTestId("qa-opening-anchor-3d-known-unresolved")).toHaveCount(0);
  await capture(page, "15-unresolved-issue-3d");

  await page.locator('[data-testid="editor-view-2d"]:visible').first().click();
  await knownMarker.click();
  await expect(page.getByTestId("selection-inspector-opening-host-warning")).toBeVisible();
  await page.getByTestId("selection-inspector-opening-wall-repair").selectOption("west");
  await expect(knownMarker).toHaveCount(0);
  await expect(issue).toHaveCount(0);
  await expect.poll(async () => (await storedOpening(page, "known-unresolved"))?.wall)
    .toBe("west");
  await expect.poll(async () => (await storedOpening(page, "known-unresolved"))?.offsetMm)
    .toBe(1200);
  await dragOpening2D({ page, openingId: "known-unresolved", alongMeters: -0.8 });
  const repaired = await storedOpening(page, "known-unresolved");
  expect(repaired.id).toBe("known-unresolved");
  expect(repaired.wall).toBe("west");
  expect(repaired.offsetMm).not.toBe(1200);
  expect(Math.abs(repaired.offsetMm)).toBeGreaterThanOrEqual(980);
  await page.locator('[data-testid="editor-view-3d"]:visible').first().click();
  await expect(page.getByTestId("qa-opening-anchor-3d-known-unresolved")).toBeAttached();
  await page.locator('[data-testid="editor-view-2d"]:visible').first().click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedOpening(page, "known-unresolved"))?.offsetMm)
    .toBe(1200);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(knownMarker).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(knownMarker).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(knownMarker).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await storedOpening(page, "known-unresolved"))?.wall)
    .toBe("west");
  expect((await storedOpening(page, "known-unresolved"))?.offsetMm).toBe(repaired.offsetMm);
  await expect(knownMarker).toHaveCount(0);
  await page.locator('[data-testid="editor-view-3d"]:visible').first().click();
  await expect(page.getByTestId("qa-opening-anchor-3d-known-unresolved")).toBeAttached();
});

test("missing-room opening has no origin marker and stays inspectable in both views", async ({ page }) => {
  await loadFixture(page, fixture([room("remaining-room", 0, 0)], [{
    id: "missing-position",
    roomId: "removed-room",
    wall: "north",
    offsetMm: 0,
    widthMm: 800,
    kind: "window",
  }]));
  await expect(page.getByTestId("unresolved-opening-label-2d")).toHaveCount(0);
  const issue = page.getByTestId("plan-quality-review-issue-opening-host:missing-position");
  await expect(issue).toContainText("original room and wall are unavailable");
  await capture(page, "16-missing-position-no-origin-marker");
  await issue.click();
  await expect(issue).toContainText("Choose a new wall");
  await page.locator('[data-testid="editor-view-3d"]:visible').first().click();
  await expect(issue).toBeVisible();
});

test("ambiguous opening names the ambiguity and never auto-selects a candidate", async ({ page }) => {
  await loadFixture(page, fixture([
    room("upper", 0, -2),
    room("lower", 0, 2),
  ], [{
    id: "ambiguous-opening",
    wall: "west",
    offsetMm: 0,
    widthMm: 800,
    kind: "window",
  }]));
  const marker = page.locator(
    '[data-testid="unresolved-opening-label-2d"][data-opening-id="ambiguous-opening"]'
  );
  await expect(marker).toHaveAttribute("data-host-status", "ambiguous");
  const issue = page.getByTestId("plan-quality-review-issue-opening-host:ambiguous-opening");
  await expect(issue).toContainText("more than one wall");
  await marker.click();
  await expect(page.getByTestId("selection-inspector-opening-host-warning")).toBeVisible();
  expect((await storedOpening(page, "ambiguous-opening"))?.roomId).toBeUndefined();
  await capture(page, "17-ambiguous-opening-repair-state");
});

test("mounted import review locks protected fields independently and Pro records an override", async ({ browser }) => {
  const consumerPage = await browser.newPage();
  await openImportReview(consumerPage, false);
  await expect(consumerPage.getByTestId("import-review-opening-width")).toBeDisabled();
  await expect(consumerPage.getByTestId("import-review-opening-width-locked"))
    .toContainText("Source documented measurement is locked");
  await consumerPage.getByTestId("import-review-opening-offset").fill("1100");
  await consumerPage.getByRole("button", { name: "Update opening safely" }).click();
  await consumerPage.getByTestId("import-review-opening-select").selectOption("");
  await consumerPage.getByTestId("import-review-opening-select")
    .selectOption("mounted-protected-window");
  await expect(consumerPage.getByTestId("import-review-opening-offset")).toHaveValue("1100");
  await expect(consumerPage.getByTestId("import-review-opening-width")).toHaveValue("900");
  await consumerPage.close();

  const proPage = await browser.newPage();
  await openImportReview(proPage, true);
  await expect(proPage.getByTestId("import-review-opening-width")).toBeDisabled();
  await proPage.getByTestId("import-review-opening-width-approve-override").click();
  await expect(proPage.getByTestId("import-review-opening-width")).toBeEnabled();
  await proPage.getByRole("button", { name: "Update opening safely" }).click();
  await expect(proPage.getByTestId("import-review-opening-width")).toBeDisabled();
  await proPage.getByTestId("import-review-opening-width-approve-override").click();
  await proPage.getByTestId("import-review-opening-offset").fill("1100");
  await proPage.getByRole("button", { name: "Update opening safely" }).click();
  await expect(proPage.getByTestId("import-review-opening-width")).toBeDisabled();
  await proPage.getByTestId("import-review-opening-select").selectOption("");
  await proPage.getByTestId("import-review-opening-select")
    .selectOption("mounted-protected-window");
  await expect(proPage.getByTestId("import-review-opening-offset")).toHaveValue("1100");
  await proPage.getByTestId("import-review-opening-width-approve-override").click();
  await proPage.locator("label").filter({ hasText: /^Handing/ }).first()
    .locator("select").selectOption("left");
  await proPage.getByRole("button", { name: "Update opening safely" }).click();
  await expect(proPage.getByTestId("import-review-opening-width")).toBeDisabled();
  await proPage.getByTestId("import-review-opening-width-approve-override").click();
  await proPage.getByTestId("import-review-opening-width").fill("1000");
  await proPage.getByTestId("import-review-opening-offset").fill("1150");
  await proPage.getByRole("button", { name: "Update opening safely" }).click();
  await proPage.getByTestId("import-review-opening-select").selectOption("");
  await proPage.getByTestId("import-review-opening-select")
    .selectOption("mounted-protected-window");
  await expect(proPage.getByTestId("import-review-opening-width")).toHaveValue("1000");
  await expect(proPage.getByTestId("import-review-opening-offset")).toHaveValue("1150");
  await capture(proPage, "18-import-review-pro-evidence-override");
  await proPage.close();
});

test("Consumer blocks and Pro explicitly approves a documented sill kind change", async ({ browser }) => {
  const value = fixture([room("kind-room", 0, 0, 5, 4)], [{
    id: "locked-window",
    roomId: "kind-room",
    wall: "north",
    offsetMm: 0,
    widthMm: 1200,
    heightMm: 1200,
    bottomMm: 900,
    kind: "window",
    evidence: {
      width: "source_documented",
      height: "source_documented",
      sillHeight: "source_documented",
    },
  }]);
  const consumerPage = await browser.newPage();
  await loadFixture(consumerPage, value);
  await consumerPage.locator(
    '[data-testid="plan-opening-kind-label"][data-opening-id="locked-window"]'
  ).click();
  const consumerKind = consumerPage.getByTestId("selection-inspector-opening-kind");
  await consumerKind.selectOption("door");
  await expect(consumerPage.getByTestId("selection-inspector-opening-kind-blocked"))
    .toContainText("requires an approved reviewed override");
  expect((await storedOpening(consumerPage, "locked-window"))?.kind).toBe("window");
  await capture(consumerPage, "11-locked-sill-kind-change-blocked");
  await consumerPage.close();

  const proPage = await browser.newPage();
  await loadFixture(proPage, value, "/design?mode=designer&debug_layout=1");
  await proPage.locator(
    '[data-testid="plan-opening-kind-label"][data-opening-id="locked-window"]'
  ).click();
  await proPage.getByTestId("selection-inspector-opening-kind").selectOption("door");
  await proPage.getByTestId("selection-inspector-opening-kind-approve-override").click();
  await expect.poll(async () => (await storedOpening(proPage, "locked-window"))?.kind)
    .toBe("door");
  const approved = await storedOpening(proPage, "locked-window");
  expect(approved.bottomMm).toBe(0);
  expect(approved.evidence.sillHeight).toBe("user_confirmed");
  await capture(proPage, "12-approved-kind-override");
  await proPage.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedOpening(proPage, "locked-window"))?.kind)
    .toBe("window");
  await proPage.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(async () => (await storedOpening(proPage, "locked-window"))?.kind)
    .toBe("door");
  await proPage.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await storedOpening(proPage, "locked-window"))?.kind)
    .toBe("door");
  expect((await storedOpening(proPage, "locked-window")).evidence.sillHeight)
    .toBe("user_confirmed");
  await proPage.close();
});

test("mounted diagonal drag persists one exact wall-local metre and resizes", async ({ page }) => {
  const diagonal: FixtureRoom = {
    ...room("diagonal-room", 0, 0, 4, 4),
    planShape: "custom_polygon",
    planPolygon: [
      { x: -2, z: -2.75 },
      { x: 1, z: 0.25 },
      { x: 2, z: 2 },
      { x: -2, z: 2 },
    ],
  };
  await loadFixture(page, fixture([diagonal], [{
    id: "diagonal-window",
    roomId: diagonal.id,
    wall: "north",
    offsetMm: 0,
    widthMm: 800,
    heightMm: 1200,
    bottomMm: 900,
    kind: "window",
  }]));
  const label = page.locator(
    '[data-testid="plan-opening-kind-label"][data-opening-id="diagonal-window"]'
  );
  await expect(label).toBeVisible();
  await capture(page, "08-diagonal-before-move");
  const center = await label.boundingBox();
  expect(center).toBeTruthy();
  const debug = page.getByTestId("qa-design-layout-debug");
  const roomWidthPx = Number(
    await debug.getAttribute("data-plan-2d-projected-room-min-width-px")
  );
  expect(roomWidthPx).toBeGreaterThan(100);
  const pixelsPerMeter = roomWidthPx / 4;
  await label.click();
  const liveCenter = await page.getByTestId("plan-opening-live-label").boundingBox();
  expect(liveCenter).toBeTruthy();
  const identityX = center!.x + center!.width / 2;
  const identityY = center!.y + center!.height / 2;
  const liveX = liveCenter!.x + liveCenter!.width / 2;
  const liveY = liveCenter!.y + liveCenter!.height / 2;
  const approximateCenter = {
    x: (0.34 * identityX + 0.22 * liveX) / 0.56,
    y: (0.34 * identityY + 0.22 * liveY) / 0.56,
  };
  const start = await findCanvasCursorPoint({
    page,
    approximate: approximateCenter,
    cursor: "grab",
  });
  const delta = Math.SQRT1_2 * pixelsPerMeter;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta, start.y + delta, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await storedOpening(page, "diagonal-window"))?.offsetMm)
    .toBeGreaterThanOrEqual(995);
  const moved = await storedOpening(page, "diagonal-window");
  expect(moved.offsetMm).toBeLessThanOrEqual(1005);
  await capture(page, "09-diagonal-after-1000mm-move");

  const approximateEndHandle = {
    x: start.x + delta + Math.SQRT1_2 * 0.4 * pixelsPerMeter,
    y: start.y + delta + Math.SQRT1_2 * 0.4 * pixelsPerMeter,
  };
  const endHandle = await findCanvasCursorPoint({
    page,
    approximate: approximateEndHandle,
    cursor: "ew-resize",
  });
  await page.mouse.click(endHandle.x, endHandle.y);
  await expect(page.getByTestId("qa-opening-select-2d-diagonal-window"))
    .toHaveAttribute("data-selected", "true");
  expect((await storedOpening(page, "diagonal-window"))?.widthMm).toBe(moved.widthMm);
  await page.mouse.move(endHandle.x, endHandle.y);
  await page.mouse.down();
  await page.mouse.move(
    endHandle.x + Math.SQRT1_2 * 0.35 * pixelsPerMeter,
    endHandle.y + Math.SQRT1_2 * 0.35 * pixelsPerMeter,
    { steps: 10 }
  );
  await page.mouse.up();
  await expect.poll(async () => (await storedOpening(page, "diagonal-window"))?.widthMm)
    .toBeGreaterThan(1080);
  await expect(page.getByTestId("selection-inspector-opening-dimensions")).toBeVisible();
  await expect(page.getByTestId("qa-opening-select-2d-diagonal-window"))
    .toHaveAttribute("data-selected", "true");
  await capture(page, "10-diagonal-resize-result");
});

test("mounted 2D movement projects every wall orientation, zoom, noise, and clamp", async ({ browser }) => {
  const cases = [
    {
      id: "positive-diagonal-matrix",
      polygon: [{ x: -2, z: -2 }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
      zoom: "default" as const,
      noise: 0,
      wall: "north" as const,
    },
    {
      id: "negative-diagonal-matrix",
      polygon: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 1, z: 2 }, { x: -2, z: 2 }],
      zoom: "out" as const,
      noise: 0,
      wall: "east" as const,
    },
    {
      id: "reversed-diagonal-matrix",
      polygon: [{ x: -2, z: 2 }, { x: 1, z: 2 }, { x: 2, z: -2 }, { x: -2, z: -2 }],
      zoom: "default" as const,
      noise: 0,
      wall: "east" as const,
    },
    {
      id: "near-horizontal-matrix",
      polygon: [{ x: -2, z: -1.8 }, { x: 2, z: -1.6 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
      zoom: "in" as const,
      noise: 0.35,
      wall: "north" as const,
    },
    {
      id: "near-vertical-matrix",
      polygon: [{ x: -2, z: -2 }, { x: 1.999, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
      zoom: "default" as const,
      noise: -0.35,
      wall: "east" as const,
    },
  ];
  for (const entry of cases) {
    const { page } = await newPolygonCase(
      browser, entry.id, entry.polygon, entry.zoom, entry.wall
    );
    await dragOpening2D({
      page, openingId: entry.id, alongMeters: 0.6,
      perpendicularMeters: entry.noise,
    });
    const opening = await storedOpening(page, entry.id);
    expect(Math.abs(opening.offsetMm)).toBeGreaterThanOrEqual(590);
    expect(Math.abs(opening.offsetMm)).toBeLessThanOrEqual(610);
    expect(opening.wall).toBe(entry.wall);
    await page.close();
  }

  for (const direction of [-1, 1]) {
    const id = `far-clamp-${direction < 0 ? "start" : "end"}`;
    const polygon = [{ x: -2, z: -2 }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: -2, z: 2 }];
    const { page } = await newPolygonCase(browser, id, polygon);
    await dragOpening2D({ page, openingId: id, alongMeters: direction * 3.5 });
    const opening = await storedOpening(page, id);
    expect(Math.sign(opening.offsetMm)).toBe(direction);
    expect(Math.abs(opening.offsetMm)).toBeLessThan(1800);
    expect(opening.wall).toBe("north");
    await page.close();
  }
});

test("mounted 3D drag uses the projected physical tangent and persists undo/redo", async ({ browser }) => {
  const polygon = [{ x: -2, z: -2.75 }, { x: 1, z: 0.25 }, { x: 2, z: 2 }, { x: -2, z: 2 }];
  const { page } = await newPolygonCase(browser, "three-d-diagonal", polygon);
  const roomLabel = page.locator(
    '[data-testid="house-room-2d-label"][data-room-id="three-d-diagonal-room"]'
  );
  await expect(roomLabel).toBeVisible();
  const roomBox = await roomLabel.boundingBox();
  expect(roomBox).toBeTruthy();
  await page.mouse.click(roomBox!.x + roomBox!.width / 2, roomBox!.y + roomBox!.height / 2);
  await expect(roomLabel).toHaveAttribute("data-active", "true");
  await page.locator(
    '[data-testid="plan-opening-kind-label"][data-opening-id="three-d-diagonal"]'
  ).click();
  await page.locator('[data-testid="editor-view-3d"]:visible').first().click();
  await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute("data-view-mode", "3d");

  const vectors = await dragOpening3D(page, "three-d-diagonal", 90);
  const positive = (await storedOpening(page, "three-d-diagonal")).offsetMm;
  expect(Math.abs(positive)).toBeGreaterThan(100);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedOpening(page, "three-d-diagonal")).offsetMm).toBe(0);
  await dragOpening3D(page, "three-d-diagonal", -90);
  const negative = (await storedOpening(page, "three-d-diagonal")).offsetMm;
  expect(Math.abs(negative)).toBeGreaterThan(100);
  expect(Math.sign(negative)).toBe(-Math.sign(positive));
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedOpening(page, "three-d-diagonal")).offsetMm).toBe(0);

  const anchor = await page.getByTestId("qa-opening-anchor-3d-three-d-diagonal").boundingBox();
  expect(anchor).toBeTruthy();
  const start = { x: anchor!.x + anchor!.width / 2, y: anchor!.y + anchor!.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x + vectors.normal.x * 75, start.y + vectors.normal.y * 75, { steps: 14 }
  );
  await page.mouse.up();
  const noisyOffset = (await storedOpening(page, "three-d-diagonal")).offsetMm;
  expect(Math.abs(noisyOffset)).toBeLessThan(Math.abs(positive) * 0.35);
  if (noisyOffset !== 0) await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedOpening(page, "three-d-diagonal")).offsetMm).toBe(0);

  await dragOpening3D(page, "three-d-diagonal", 75);
  const persistedOffset = (await storedOpening(page, "three-d-diagonal")).offsetMm;
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await storedOpening(page, "three-d-diagonal")).offsetMm).toBe(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect.poll(async () => (await storedOpening(page, "three-d-diagonal")).offsetMm)
    .toBe(persistedOffset);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(async () => (await storedOpening(page, "three-d-diagonal")).offsetMm)
    .toBe(persistedOffset);
  await expect(page.getByTestId("qa-opening-anchor-3d-three-d-diagonal")).toBeAttached();
  const twoDimensionalView = page.locator('[data-testid="editor-view-2d"]:visible').first();
  await twoDimensionalView.click();
  await expect(twoDimensionalView).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("qa-design-layout-debug")).toHaveAttribute("data-view-mode", "2d");
  expect((await storedOpening(page, "three-d-diagonal")).offsetMm).toBe(persistedOffset);
  await capture(page, "19-mounted-3d-diagonal-persisted-in-2d");
  await page.close();

  const reversed = [{ x: 1, z: 0.25 }, { x: -2, z: -2.75 }, { x: -2, z: 2 }, { x: 2, z: 2 }];
  const reversedCase = await newPolygonCase(browser, "three-d-reversed", reversed);
  await reversedCase.page.locator(
    '[data-testid="plan-opening-kind-label"][data-opening-id="three-d-reversed"]'
  ).click();
  await reversedCase.page.locator('[data-testid="editor-view-3d"]:visible').first().click();
  await dragOpening3D(reversedCase.page, "three-d-reversed", 80);
  expect(Math.abs((await storedOpening(reversedCase.page, "three-d-reversed")).offsetMm))
    .toBeGreaterThan(100);
  await reversedCase.page.close();
});

test("mounted resize covers both handles, anchoring, minimum, endpoints, history, and reload", async ({ browser }) => {
  const polygon = [{ x: -2, z: -2 }, { x: 1, z: 1 }, { x: 2, z: 2 }, { x: -2, z: 2 }];
  for (const handle of ["start", "end"] as const) {
    const id = `resize-${handle}`;
    const { page } = await newPolygonCase(
      browser, id, polygon, handle === "start" ? "out" : "in"
    );
    const basis = await selectedOpeningDragBasis(page, id);
    const { tangent } = basis;
    const sign = handle === "start" ? -1 : 1;
    const approximate = {
      x: basis.start.x + tangent.x * sign * 0.4 * basis.pixelsPerMeter,
      y: basis.start.y + tangent.z * sign * 0.4 * basis.pixelsPerMeter,
    };
    const point = await findCanvasCursorPoint({ page, approximate, cursor: "ew-resize" });
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(
      point.x + tangent.x * sign * 0.35 * basis.pixelsPerMeter,
      point.y + tangent.z * sign * 0.35 * basis.pixelsPerMeter,
      { steps: 12 }
    );
    await page.mouse.up();
    const expanded = await storedOpening(page, id);
    expect(expanded.widthMm).toBeGreaterThanOrEqual(1140);
    expect(Math.sign(expanded.offsetMm)).toBe(sign);
    const fixedEdge = handle === "start"
      ? expanded.offsetMm + expanded.widthMm / 2
      : expanded.offsetMm - expanded.widthMm / 2;
    expect(Math.abs(fixedEdge - (handle === "start" ? 400 : -400))).toBeLessThanOrEqual(5);
    await page.keyboard.press("ControlOrMeta+z");
    await expect.poll(async () => (await storedOpening(page, id)).widthMm).toBe(800);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect.poll(async () => (await storedOpening(page, id)).widthMm)
      .toBe(expanded.widthMm);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(async () => (await storedOpening(page, id)).widthMm)
      .toBe(expanded.widthMm);
    await page.close();
  }

  const minimum = await newPolygonCase(browser, "resize-minimum", polygon);
  const basis = await selectedOpeningDragBasis(minimum.page, "resize-minimum");
  const startHandle = await findCanvasCursorPoint({
    page: minimum.page,
    approximate: {
      x: basis.start.x - basis.tangent.x * 0.4 * basis.pixelsPerMeter,
      y: basis.start.y - basis.tangent.z * 0.4 * basis.pixelsPerMeter,
    },
    cursor: "ew-resize",
  });
  await minimum.page.mouse.move(startHandle.x, startHandle.y);
  await minimum.page.mouse.down();
  await minimum.page.mouse.move(
    startHandle.x + basis.tangent.x * 3 * basis.pixelsPerMeter,
    startHandle.y + basis.tangent.z * 3 * basis.pixelsPerMeter,
    { steps: 18 }
  );
  await minimum.page.mouse.up();
  expect((await storedOpening(minimum.page, "resize-minimum")).widthMm).toBe(400);
  await minimum.page.close();

  const reversedPolygon = [
    { x: -2, z: 2 }, { x: 1, z: 2 }, { x: 2, z: -2 }, { x: -2, z: -2 },
  ];
  const reversed = await newPolygonCase(
    browser, "resize-reversed-negative", reversedPolygon, "default", "east"
  );
  const reversedBasis = await selectedOpeningDragBasis(
    reversed.page, "resize-reversed-negative"
  );
  const reversedHandle = await findCanvasCursorPoint({
    page: reversed.page,
    approximate: {
      x: reversedBasis.start.x - reversedBasis.tangent.x * 0.4 * reversedBasis.pixelsPerMeter,
      y: reversedBasis.start.y - reversedBasis.tangent.z * 0.4 * reversedBasis.pixelsPerMeter,
    },
    cursor: "ns-resize",
  });
  await reversed.page.mouse.move(reversedHandle.x, reversedHandle.y);
  await reversed.page.mouse.down();
  await reversed.page.mouse.move(
    reversedHandle.x - reversedBasis.tangent.x * 0.3 * reversedBasis.pixelsPerMeter,
    reversedHandle.y - reversedBasis.tangent.z * 0.3 * reversedBasis.pixelsPerMeter,
    { steps: 12 }
  );
  await reversed.page.mouse.up();
  expect((await storedOpening(reversed.page, "resize-reversed-negative")).widthMm)
    .toBeGreaterThanOrEqual(1090);
  await reversed.page.close();

  for (const handle of ["start", "end"] as const) {
    const id = `resize-endpoint-${handle}`;
    const endpoint = await newPolygonCase(browser, id, polygon);
    const endpointBasis = await selectedOpeningDragBasis(endpoint.page, id);
    const sign = handle === "start" ? -1 : 1;
    const point = await findCanvasCursorPoint({
      page: endpoint.page,
      approximate: {
        x: endpointBasis.start.x + endpointBasis.tangent.x * sign * 0.4 * endpointBasis.pixelsPerMeter,
        y: endpointBasis.start.y + endpointBasis.tangent.z * sign * 0.4 * endpointBasis.pixelsPerMeter,
      }, cursor: "ew-resize",
    });
    await endpoint.page.mouse.move(point.x, point.y);
    await endpoint.page.mouse.down();
    await endpoint.page.mouse.move(
      point.x + endpointBasis.tangent.x * sign * 3.5 * endpointBasis.pixelsPerMeter,
      point.y + endpointBasis.tangent.z * sign * 3.5 * endpointBasis.pixelsPerMeter,
      { steps: 18 }
    );
    await endpoint.page.mouse.up();
    const clamped = await storedOpening(endpoint.page, id);
    expect(clamped.widthMm).toBeGreaterThan(1500);
    expect(clamped.widthMm).toBeLessThan(4250);
    await endpoint.page.close();
  }
});

test("mounted diagonal collision remains on its physical host", async ({ page }) => {
  const diagonal: FixtureRoom = {
    ...room("collision-diagonal-room", 0, 0, 4, 4),
    planShape: "custom_polygon",
    planPolygon: [{ x: -2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
  };
  await loadFixture(page, fixture([diagonal], [
    { id: "collision-mover", roomId: diagonal.id, wall: "north", offsetMm: -1000,
      widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window" },
    { id: "collision-blocker", roomId: diagonal.id, wall: "north", offsetMm: 1000,
      widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window" },
  ]));
  await dragOpening2D({
    page, openingId: "collision-mover", alongMeters: 1.02,
  });
  const adjacent = await storedOpening(page, "collision-mover");
  const blocker = await storedOpening(page, "collision-blocker");
  expect(Math.abs(adjacent.offsetMm - blocker.offsetMm)).toBe(980);
  await dragOpening2D({ page, openingId: "collision-mover", alongMeters: 0.2 });
  const rejected = await storedOpening(page, "collision-mover");
  expect(rejected.offsetMm).toBe(adjacent.offsetMm);
  expect(rejected.wall).toBe("north");
  expect(rejected.roomId).toBe(diagonal.id);
});

test("mounted collision distinguishes shared ownership from a nearby parallel host", async ({ page }) => {
  const sharedA = room("shared-a", -2, 0, 4, 4);
  const sharedB = room("shared-b", 2, 0, 4, 4);
  const sharedPage = page;
  await loadFixture(sharedPage, fixture([sharedA, sharedB], [
    { id: "shared-mover", roomId: sharedA.id, wall: "east", offsetMm: -900,
      widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window" },
    { id: "shared-blocker", roomId: sharedB.id, wall: "west", offsetMm: 900,
      widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window" },
  ]));
  await dragOpening2D({
    page: sharedPage, openingId: "shared-mover", alongMeters: 1.8,
  });
  const sharedMover = await storedOpening(sharedPage, "shared-mover");
  const sharedBlocker = await storedOpening(sharedPage, "shared-blocker");
  expect(Math.abs(sharedMover.offsetMm - sharedBlocker.offsetMm)).toBeGreaterThanOrEqual(980);
  expect(sharedMover.wall).toBe("east");

  const parallelA = room("parallel-a", -2, 0, 4, 4);
  const parallelB = room("parallel-b", 2.3, 0, 4, 4);
  const parallelPage = page;
  await replaceFixture(parallelPage, fixture([parallelA, parallelB], [
    { id: "parallel-mover", roomId: parallelA.id, wall: "east", offsetMm: -900,
      widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window" },
    { id: "parallel-neighbor", roomId: parallelB.id, wall: "west", offsetMm: 900,
      widthMm: 800, heightMm: 1200, bottomMm: 900, kind: "window" },
  ]));
  await dragOpening2D({
    page: parallelPage, openingId: "parallel-mover", alongMeters: 1.8,
  });
  expect((await storedOpening(parallelPage, "parallel-mover")).offsetMm)
    .toBeGreaterThanOrEqual(890);
});
