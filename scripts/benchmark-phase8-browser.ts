import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { performance as nodePerformance } from "node:perf_hooks";

import { chromium, type BrowserContext, type Page } from "@playwright/test";

import { snapshotToStored } from "../lib/room-persistence";
import performanceBudgets from "../config/phase8-performance-budgets.json";
import {
  createAllPhase8RepresentativeProjects,
  type Phase8ProjectScale,
} from "./phase8-representative-projects";

const LOCAL_BACKUP_KEY = "interior-ai:v1:livingroom-design";
const baseURL = process.env.PHASE8_BASE_URL?.trim() || "http://127.0.0.1:3000";

type FrameSummary = { p50Ms: number; p95Ms: number; maxMs: number };

type BrowserBenchmark = {
  scale: Phase8ProjectScale;
  roomCount: number;
  itemCount: number;
  serializedBytes: number;
  startup: {
    editorInteractiveMs: number;
    domContentLoadedMs: number;
    loadEventMs: number;
    jsEncodedBytes: number;
    cssEncodedBytes: number;
    consumerLoadedProChunks: string[];
  };
  interaction: {
    pointerSweepMs: number;
    switchToPlan2dMs: number;
    localAutosaveMs: number;
    sessionLongTaskCount: number;
    sessionLongTaskDurationMs: number;
    frames: FrameSummary;
  };
  scene: {
    fps: number | null;
    drawCalls: number | null;
    triangles: number | null;
    geometries: number | null;
    textures: number | null;
  };
  memory: {
    beforeOpenHeapBytes: number;
    projectHeapBytes: number;
    afterCloseHeapBytes: number;
    retainedAfterCloseBytes: number;
  };
};

function round(value: number): number {
  return Number(value.toFixed(2));
}

function percentile(values: readonly number[], fraction: number): number {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.min(ordered.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1))];
}

function summarizeFrames(values: readonly number[]): FrameSummary {
  return {
    p50Ms: round(percentile(values, 0.5)),
    p95Ms: round(percentile(values, 0.95)),
    maxMs: round(Math.max(...values)),
  };
}

function findProductionProChunkNames(): string[] {
  const chunkDirectory = path.resolve(process.cwd(), ".next/static/chunks");
  if (!fs.existsSync(chunkDirectory)) return [];
  const initialChunks = new Set<string>();
  const routeManifestPath = path.resolve(
    process.cwd(),
    ".next/server/app/design/page_client-reference-manifest.js"
  );
  if (fs.existsSync(routeManifestPath)) {
    for (const match of fs
      .readFileSync(routeManifestPath, "utf8")
      .matchAll(/static\/chunks\/([^"\\]+\.js)/g)) {
      initialChunks.add(match[1]);
    }
  }
  const buildManifestPath = path.resolve(process.cwd(), ".next/build-manifest.json");
  if (fs.existsSync(buildManifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(buildManifestPath, "utf8")) as {
      polyfillFiles?: string[];
      rootMainFiles?: string[];
    };
    for (const file of [...(manifest.polyfillFiles ?? []), ...(manifest.rootMainFiles ?? [])]) {
      initialChunks.add(path.basename(file));
    }
  }
  return fs
    .readdirSync(chunkDirectory)
    .filter((file) => file.endsWith(".js"))
    .filter((file) => !initialChunks.has(file))
    .filter((file) => {
      const source = fs.readFileSync(path.join(chunkDirectory, file), "utf8");
      return /CabinetryStudio|cabinetry-studio|THREE\.GLTFExporter/.test(source);
    });
}

async function readHeapBytes(context: BrowserContext, page: Page): Promise<number> {
  const session = await context.newCDPSession(page);
  await session.send("Performance.enable");
  const result = await session.send("Performance.getMetrics");
  await session.detach();
  const metric = result.metrics.find((entry) => entry.name === "JSHeapUsedSize");
  return metric?.value ?? 0;
}

async function collectGarbage(context: BrowserContext, page: Page): Promise<void> {
  const session = await context.newCDPSession(page);
  await session.send("HeapProfiler.collectGarbage").catch(() => undefined);
  await session.detach();
}

async function readSceneMetrics(page: Page) {
  const marker = page.getByTestId("qa-scene-performance");
  if ((await marker.count()) === 0) {
    const canvas = page
      .locator(
        '[data-testid="scene-canvas"] canvas, canvas[data-measured-fps]'
      )
      .first();
    await page
      .waitForFunction(() => {
        const candidate =
          document.querySelector<HTMLElement>(
            '[data-testid="scene-canvas"] canvas'
          ) ?? document.querySelector<HTMLElement>("canvas[data-measured-fps]");
        return Boolean(candidate?.dataset.measuredFps);
      }, undefined, { timeout: 12_000 })
      .catch(() => undefined);
    const readCanvasNumber = async (name: string) => {
      const value = await canvas.getAttribute(name);
      const parsed = value === null || value === "" ? Number.NaN : Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };
    return {
      fps: await readCanvasNumber("data-measured-fps"),
      drawCalls: await readCanvasNumber("data-renderer-draw-calls"),
      triangles: await readCanvasNumber("data-renderer-triangles"),
      geometries: await readCanvasNumber("data-renderer-geometries"),
      textures: await readCanvasNumber("data-renderer-textures"),
    };
  }
  await page
    .waitForFunction(() => {
      const candidate = document.querySelector<HTMLElement>(
        '[data-testid="qa-scene-performance"]'
      );
      return Number(candidate?.dataset.fpsSamples ?? 0) >= 1;
    }, undefined, { timeout: 12_000 })
    .catch(() => undefined);
  const readNumber = async (name: string) => {
    const value = await marker.getAttribute(name);
    const parsed = value === null || value === "" ? Number.NaN : Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    fps: await readNumber("data-last-fps"),
    drawCalls: await readNumber("data-draw-calls"),
    triangles: await readNumber("data-triangles"),
    geometries: await readNumber("data-geometries"),
    textures: await readNumber("data-textures"),
  };
}

async function measureFrames(page: Page): Promise<FrameSummary> {
  const samples = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const values: number[] = [];
        let previous = performance.now();
        const tick = (now: number) => {
          values.push(now - previous);
          previous = now;
          if (values.length >= 120) {
            resolve(values.slice(1));
            return;
          }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
  return summarizeFrames(samples);
}

async function benchmarkProject(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  project: ReturnType<typeof createAllPhase8RepresentativeProjects>[number],
  proChunkNames: readonly string[]
): Promise<BrowserBenchmark> {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const browserSnapshot = structuredClone(project.snapshot);
  for (const room of browserSnapshot.rooms) {
    for (const item of room.items) {
      if (item.productSnapshot?.assets) {
        delete item.productSnapshot.assets.modelUrl;
      }
    }
  }
  const serialized = JSON.stringify(snapshotToStored(browserSnapshot));
  await context.addInitScript(
    ({ key, value }) => {
      window.localStorage.setItem(key, value);
      window.localStorage.setItem("scene_performance_mode", "auto");
      const longTasks: number[] = [];
      (window as Window & { __phase8LongTasks?: number[] }).__phase8LongTasks = longTasks;
      if (typeof PerformanceObserver !== "undefined") {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) longTasks.push(entry.duration);
          });
          observer.observe({ entryTypes: ["longtask"] });
        } catch {
          // Long-task observation is optional browser evidence.
        }
      }
    },
    { key: LOCAL_BACKUP_KEY, value: serialized }
  );
  const page = await context.newPage();
  await collectGarbage(context, page);
  const beforeOpenHeapBytes = await readHeapBytes(context, page);
  const startedAt = nodePerformance.now();
  await page.goto(`${baseURL}/design`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("scene-canvas").first().waitFor({ state: "visible", timeout: 60_000 });
  await page.waitForFunction(
    ({ roomCount }) => {
      const candidate = document.querySelector<HTMLElement>(
        '[data-testid="room-plan-status-room-count"]'
      );
      const expected = `${roomCount} ${roomCount === 1 ? "room" : "rooms"}`;
      return candidate?.textContent?.trim() === expected;
    },
    { roomCount: project.roomCount },
    { timeout: 60_000 }
  );
  const editorInteractiveMs = nodePerformance.now() - startedAt;
  const canvas = page
    .locator('[data-testid="scene-canvas"] canvas, [data-testid="scene-canvas"]')
    .first();
  const canvasBox = await canvas.boundingBox();
  let pointerSweepMs = 0;
  if (canvasBox) {
    await page.mouse.move(canvasBox.x + canvasBox.width * 0.15, canvasBox.y + canvasBox.height * 0.5);
    const pointerStartedAt = nodePerformance.now();
    await page.mouse.move(
      canvasBox.x + canvasBox.width * 0.85,
      canvasBox.y + canvasBox.height * 0.5,
      { steps: 30 }
    );
    pointerSweepMs = nodePerformance.now() - pointerStartedAt;
  }
  const frames = await measureFrames(page);
  await page.waitForTimeout(1_250);
  const scene = await readSceneMetrics(page);

  const switchStartedAt = nodePerformance.now();
  await page.getByRole("button", { name: "2D Plan" }).click();
  await page
    .getByTestId("scene-canvas")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLElement>('[data-testid="scene-canvas"]');
    return canvas?.hasAttribute("data-plan-2d-camera-valid") ?? false;
  });
  const switchToPlan2dMs = nodePerformance.now() - switchStartedAt;

  const localBackupBeforeEdit = await page.evaluate((key) => window.localStorage.getItem(key), LOCAL_BACKUP_KEY);
  const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
  const currentWidth = Number(await widthInput.inputValue());
  const autosaveStartedAt = nodePerformance.now();
  await widthInput.fill(String(Math.max(1000, currentWidth + 10)));
  await widthInput.press("Enter");
  await page.waitForFunction(
    ({ key, previous }) => window.localStorage.getItem(key) !== previous,
    { key: LOCAL_BACKUP_KEY, previous: localBackupBeforeEdit },
    { timeout: 15_000 }
  );
  const localAutosaveMs = nodePerformance.now() - autosaveStartedAt;

  const pageMetrics = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
    const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const longTasks =
      (window as Window & { __phase8LongTasks?: number[] }).__phase8LongTasks ?? [];
    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      loadEventMs: navigation?.loadEventEnd ?? 0,
      jsEncodedBytes: resources
        .filter((entry) => entry.name.includes(".js"))
        .reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      cssEncodedBytes: resources
        .filter((entry) => entry.name.includes(".css"))
        .reduce((sum, entry) => sum + entry.encodedBodySize, 0),
      resourceNames: resources.map((entry) => entry.name),
      longTaskCount: longTasks.length,
      longTaskDurationMs: longTasks.reduce((sum, duration) => sum + duration, 0),
    };
  });

  await collectGarbage(context, page);
  const projectHeapBytes = await readHeapBytes(context, page);
  await page.goto("about:blank");
  await collectGarbage(context, page);
  const afterCloseHeapBytes = await readHeapBytes(context, page);
  await context.close();

  return {
    scale: project.scale,
    roomCount: project.roomCount,
    itemCount: project.itemCount,
    serializedBytes: Buffer.byteLength(serialized, "utf8"),
    startup: {
      editorInteractiveMs: round(editorInteractiveMs),
      domContentLoadedMs: round(pageMetrics.domContentLoadedMs),
      loadEventMs: round(pageMetrics.loadEventMs),
      jsEncodedBytes: pageMetrics.jsEncodedBytes,
      cssEncodedBytes: pageMetrics.cssEncodedBytes,
      consumerLoadedProChunks: proChunkNames.filter((chunk) =>
        pageMetrics.resourceNames.some((resourceName) => resourceName.endsWith(`/${chunk}`))
      ).concat(
        pageMetrics.resourceNames
          .filter((resourceName) => /CabinetryStudio|GLTFExporter/.test(resourceName))
          .map((resourceName) => resourceName.split("/").pop() ?? resourceName)
      ),
    },
    interaction: {
      pointerSweepMs: round(pointerSweepMs),
      switchToPlan2dMs: round(switchToPlan2dMs),
      localAutosaveMs: round(localAutosaveMs),
      sessionLongTaskCount: pageMetrics.longTaskCount,
      sessionLongTaskDurationMs: round(pageMetrics.longTaskDurationMs),
      frames,
    },
    scene,
    memory: {
      beforeOpenHeapBytes,
      projectHeapBytes,
      afterCloseHeapBytes,
      retainedAfterCloseBytes: Math.max(0, afterCloseHeapBytes - beforeOpenHeapBytes),
    },
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const warmContext = await browser.newContext();
    const warmPage = await warmContext.newPage();
    await warmPage.goto(`${baseURL}/design`, { waitUntil: "domcontentloaded" });
    await warmPage
      .getByTestId("scene-canvas")
      .first()
      .waitFor({ state: "visible", timeout: 60_000 });
    await warmContext.close();

    const proChunkNames = findProductionProChunkNames();
    const results: BrowserBenchmark[] = [];
    for (const project of createAllPhase8RepresentativeProjects()) {
      results.push(await benchmarkProject(browser, project, proChunkNames));
    }
    if (process.argv.includes("--check")) {
      const limits = performanceBudgets.browserReference;
      for (const result of results) {
        assert(result.startup.editorInteractiveMs <= limits.maxEditorInteractiveMs);
        assert(result.interaction.switchToPlan2dMs <= limits.maxSwitchToPlan2dMs);
        assert(result.interaction.pointerSweepMs <= limits.maxPointerSweepMs);
        assert(result.interaction.localAutosaveMs <= limits.maxLocalAutosaveMs);
        assert(result.interaction.frames.p95Ms <= limits.maxFrameP95Ms);
        assert(result.memory.projectHeapBytes <= limits.maxProjectHeapBytes);
        assert(result.memory.retainedAfterCloseBytes <= limits.maxRetainedAfterCloseBytes);
        assert(
          result.startup.consumerLoadedProChunks.length <= limits.maxConsumerLoadedProChunks,
          `${result.scale} Consumer Mode loaded Pro chunks: ${result.startup.consumerLoadedProChunks.join(", ")}`
        );
        assert(result.scene.fps !== null, `${result.scale} scene FPS was not sampled.`);
        assert(result.scene.drawCalls !== null, `${result.scale} draw calls were not sampled.`);
      }
    }
    console.log(JSON.stringify(results, null, 2));
    if (process.argv.includes("--check")) {
      console.log("Phase 8 production browser reference budgets passed.");
    }
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error
      ? error.stack ?? error.message
      : "Phase 8 browser benchmark failed."
  );
  process.exitCode = 1;
});
