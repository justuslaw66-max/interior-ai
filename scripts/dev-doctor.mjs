#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const port = Number(process.env.DEV_PORT ?? process.env.PORT ?? 3000);
const nextDevDir = path.join(rootDir, ".next", "dev");
const lockPath = path.join(nextDevDir, "lock");
const routes = ["/design", "/api/me", "/api/catalog/live", "/api/health"];
const routeTimeoutMs = Number(process.env.DEV_DOCTOR_ROUTE_TIMEOUT_MS ?? 45000);
const assetTimeoutMs = Number(process.env.DEV_DOCTOR_ASSET_TIMEOUT_MS ?? 15000);
const knownCacheCrashPatterns = [
  /turbo-persistence/i,
  /static_sorted_file/i,
  /Another write batch or compaction is already active/i,
  /range start index .* out of range/i,
  /PackFileCacheStrategy.*Caching failed/i,
  /\.pack\.gz/i,
  /ENOTEMPTY.*\.next\/dev/i,
  /ENOENT.*\.next\/dev/i,
];

function fileExists(filePath) {
  try {
    fs.accessSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function canConnect(host) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(1200);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function canBindPort() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", (error) => {
      resolve(error?.code !== "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "0.0.0.0");
  });
}

async function fetchRoute(baseUrl, route) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), routeTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}${route}`, {
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      route,
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: "ERR",
      route,
      ms: Date.now() - startedAt,
      error: error?.name === "AbortError" ? "timeout" : error?.message ?? "request failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractStaticAssetUrls(baseUrl, html) {
  const urls = new Set();
  const staticAssetPattern = /\b(?:href|src)="([^"]*\/_next\/static\/[^"]+)"/g;
  let match;

  while ((match = staticAssetPattern.exec(html))) {
    try {
      urls.add(new URL(match[1], baseUrl).toString());
    } catch {
      // Ignore malformed URLs in partial/error HTML.
    }
  }

  return [...urls];
}

async function fetchText(baseUrl, route) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), routeTimeoutMs);

  try {
    const response = await fetch(`${baseUrl}${route}`, {
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      route,
      ms: Date.now() - startedAt,
      text: await response.text(),
    };
  } catch (error) {
    return {
      ok: false,
      status: "ERR",
      route,
      ms: Date.now() - startedAt,
      error: error?.name === "AbortError" ? "timeout" : error?.message ?? "request failed",
      text: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchStaticAsset(url) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), assetTimeoutMs);

  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      ok: response.status >= 200 && response.status < 400,
      status: response.status,
      url,
      ms: Date.now() - startedAt,
      contentType: response.headers.get("content-type") ?? "",
    };
  } catch (error) {
    return {
      ok: false,
      status: "ERR",
      url,
      ms: Date.now() - startedAt,
      error: error?.name === "AbortError" ? "timeout" : error?.message ?? "request failed",
      contentType: "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectDesignStaticAssets(baseUrl) {
  const designResult = await fetchText(baseUrl, "/design");
  if (!designResult.ok) {
    return {
      designResult,
      assetResults: [],
      failedAssets: [],
    };
  }

  const assetUrls = extractStaticAssetUrls(baseUrl, designResult.text);
  const assetResults = await Promise.all(assetUrls.map(fetchStaticAsset));
  return {
    designResult,
    assetResults,
    failedAssets: assetResults.filter((result) => !result.ok),
  };
}

function readRecentLog(filePath) {
  if (!fileExists(filePath)) return "";
  const content = fs.readFileSync(filePath, "utf8");
  return content.slice(-20000);
}

function findDevOutputIssues() {
  const issues = [];
  const nextLog = readRecentLog(path.join(nextDevDir, "logs", "next-development.log"));
  const localLog = readRecentLog("/tmp/interior-ai-next-dev.log");

  const recentLogs = `${nextLog}\n${localLog}`;
  if (knownCacheCrashPatterns.some((pattern) => pattern.test(recentLogs))) {
    issues.push("recent dev logs contain generated-cache crash signatures");
  }

  return issues;
}

function inspectLock() {
  if (!fileExists(lockPath)) return { exists: false };
  const lock = readJson(lockPath);
  const pid = Number(lock?.pid);
  return {
    exists: true,
    pid: Number.isInteger(pid) ? pid : null,
    alive: Number.isInteger(pid) ? isProcessAlive(pid) : false,
    raw: lock,
  };
}

function printResult({ status, action, details = [] }) {
  console.log(`Status: ${status}`);
  console.log(`Action: ${action}`);
  for (const detail of details) {
    console.log(`- ${detail}`);
  }
}

async function main() {
  const details = [`project: ${rootDir}`, `port: ${port}`];
  const lock = inspectLock();
  const devOutputIssues = findDevOutputIssues();

  if (lock.exists && !lock.alive) {
    printResult({
      status: "clear .next/dev",
      action: "run `npm run dev`; dev preflight will clear the stale cache automatically",
      details: [
        ...details,
        `stale lock: ${path.relative(rootDir, lockPath)}${lock.pid ? ` points to dead pid ${lock.pid}` : ""}`,
      ],
    });
    process.exitCode = 1;
    return;
  }

  const [has127, hasLocalhost] = await Promise.all([
    canConnect("127.0.0.1"),
    canConnect("localhost"),
  ]);

  if (!has127 && !hasLocalhost) {
    const portFree = await canBindPort();
    printResult({
      status: portFree ? "server down" : "port occupied",
      action: portFree
        ? "run `npm run dev`"
        : "run `npm run dev:stop`, or run the app on another port",
      details: [...details, ...devOutputIssues],
    });
    process.exitCode = 1;
    return;
  }

  const baseUrl = has127 ? `http://127.0.0.1:${port}` : `http://localhost:${port}`;
  const routeResults = await Promise.all(routes.map((route) => fetchRoute(baseUrl, route)));
  const failedRoutes = routeResults.filter((result) => !result.ok);
  const staticAssetInspection = await inspectDesignStaticAssets(baseUrl);

  if (failedRoutes.length > 0) {
    printResult({
      status: "server responding but app routes failing",
      action: "inspect the dev server log and fix the failing route before using the app",
      details: [
        ...details,
        `base url: ${baseUrl}`,
        ...devOutputIssues,
        ...routeResults.map((result) =>
          `${result.route}: ${result.status} in ${result.ms}ms${result.error ? ` (${result.error})` : ""}`
        ),
      ],
    });
    process.exitCode = 1;
    return;
  }

  if (staticAssetInspection.failedAssets.length > 0) {
    printResult({
      status: "server responding but static assets failing",
      action: "run `npm run dev:restart`; use `npm run dev:webpack` if Turbopack dev mode still fails",
      details: [
        ...details,
        `base url: ${baseUrl}`,
        `/design: ${staticAssetInspection.designResult.status} in ${staticAssetInspection.designResult.ms}ms`,
        ...devOutputIssues,
        ...staticAssetInspection.failedAssets.slice(0, 8).map((result) => {
          const url = new URL(result.url);
          return `${url.pathname}: ${result.status} in ${result.ms}ms${result.error ? ` (${result.error})` : ""}`;
        }),
        staticAssetInspection.failedAssets.length > 8
          ? `${staticAssetInspection.failedAssets.length - 8} more static asset failures`
          : null,
      ].filter(Boolean),
    });
    process.exitCode = 1;
    return;
  }

  printResult({
    status: "app healthy",
    action: "none",
    details: [
      ...details,
      `base url: ${baseUrl}`,
      ...routeResults.map((result) => `${result.route}: ${result.status} in ${result.ms}ms`),
      `static assets: ${staticAssetInspection.assetResults.length} checked`,
      ...devOutputIssues.map((issue) => `warning: ${issue}`),
    ],
  });
}

main().catch((error) => {
  printResult({
    status: "doctor failed",
    action: "inspect the script error, then run `npm run clean:next-dev-cache` if the app still will not load",
    details: [error?.stack ?? error?.message ?? String(error)],
  });
  process.exitCode = 1;
});
