#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const nextDevDir = path.join(rootDir, ".next", "dev");
const lockPath = path.join(nextDevDir, "lock");

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

function fail(message) {
  console.error(`Development preflight failed: ${message}`);
  process.exit(1);
}

function assertLocalWorkspace() {
  if (process.platform !== "darwin") return;

  const normalizedRoot = `${path.resolve(rootDir)}${path.sep}`;
  const cloudManagedSegments = [
    `${path.sep}Documents${path.sep}`,
    `${path.sep}Mobile Documents${path.sep}`,
    `${path.sep}Library${path.sep}CloudStorage${path.sep}`,
  ];

  if (cloudManagedSegments.some((segment) => normalizedRoot.includes(segment))) {
    fail(`project is inside a cloud-managed folder (${rootDir}); use ~/Developer/interior-ai`);
  }
}

function assertNoCloudPlaceholders() {
  if (process.platform !== "darwin") return;

  const sourceRoots = ["app", "components", "features", "lib", "catalog", "public", "prisma", "scripts"];
  for (const relativeRoot of sourceRoots) {
    const absoluteRoot = path.join(rootDir, relativeRoot);
    if (!fileExists(absoluteRoot)) continue;

    const result = spawnSync(
      "/usr/bin/find",
      [absoluteRoot, "-type", "f", "-flags", "+dataless", "-print", "-quit"],
      { encoding: "utf8" }
    );
    const placeholder = result.stdout?.trim();
    if (placeholder) {
      fail(`cloud-offloaded file detected: ${path.relative(rootDir, placeholder)}`);
    }
  }
}

function assertLocalNextInstallation() {
  const packageJson = readJson(path.join(rootDir, "package.json"));
  const expectedVersion = packageJson?.dependencies?.next;
  let resolvedPackagePath;

  try {
    resolvedPackagePath = require.resolve("next/package.json");
  } catch {
    fail("Next.js is not installed; run `npm ci`");
  }

  const localNodeModules = `${path.join(rootDir, "node_modules")}${path.sep}`;
  if (!resolvedPackagePath.startsWith(localNodeModules)) {
    fail(`Next.js resolved outside this project: ${resolvedPackagePath}`);
  }

  const installedVersion = readJson(resolvedPackagePath)?.version;
  if (expectedVersion && installedVersion !== expectedVersion) {
    fail(`Next.js ${installedVersion ?? "unknown"} is installed; package.json requires ${expectedVersion}`);
  }
}

assertLocalWorkspace();
assertNoCloudPlaceholders();
assertLocalNextInstallation();

if (fileExists(lockPath)) {
  const lock = readJson(lockPath);
  const pid = Number(lock?.pid);
  const hasAlivePid = Number.isInteger(pid) && isProcessAlive(pid);

  if (!hasAlivePid) {
    fs.rmSync(nextDevDir, { recursive: true, force: true });
    const pidDetail = Number.isInteger(pid) ? ` for dead pid ${pid}` : "";
    console.log(`Cleared stale Next dev cache${pidDetail}.`);
  }
}
