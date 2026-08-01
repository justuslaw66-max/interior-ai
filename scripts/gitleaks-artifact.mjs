import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

export const GITLEAKS_STAGING_ROOT = ".local/gitleaks-upload";
export const GITLEAKS_ARCHIVE_ENTRIES = Object.freeze([
  "artifact-manifest.json",
  "results.sarif",
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function repositoryPath(repositoryRoot, relativePath, description) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${description} must be repository-relative`);
  }
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${description} must remain inside the repository`);
  }
  return resolved;
}

function containsMachinePath(value) {
  if (typeof value === "string") {
    return (
      /(?:^|[\s"'(])\/(?:home|Users|private\/tmp|tmp|var\/tmp|var\/folders)\//i.test(
        value,
      ) ||
      /\b[A-Za-z]:[\\/](?:Users|Temp|a)[\\/]/i.test(value) ||
      /(?:^|\/)work\/[^/\s]+\/[^/\s]+\//i.test(value) ||
      value.startsWith("file://")
    );
  }
  if (Array.isArray(value)) return value.some(containsMachinePath);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsMachinePath);
  }
  return false;
}

export function prepareGitleaksArtifact({
  repositoryRoot,
  sourcePath = "results.sarif",
  stagingRoot = GITLEAKS_STAGING_ROOT,
  sourceCommitSha,
  runId,
  runAttempt,
}) {
  const root = path.resolve(repositoryRoot);
  if (sourcePath !== "results.sarif") {
    throw new Error("Gitleaks SARIF source must be exactly results.sarif");
  }
  if (stagingRoot !== GITLEAKS_STAGING_ROOT) {
    throw new Error(`Gitleaks staging root must be exactly ${GITLEAKS_STAGING_ROOT}`);
  }
  if (!/^[0-9a-f]{40,64}$/i.test(sourceCommitSha ?? "")) {
    throw new Error("Gitleaks artifact requires an exact source commit SHA");
  }
  if (!/^\d+$/.test(String(runId ?? "")) || !/^\d+$/.test(String(runAttempt ?? ""))) {
    throw new Error("Gitleaks artifact requires numeric GitHub run identity");
  }

  const sourceAbsolutePath = repositoryPath(root, sourcePath, "Gitleaks SARIF source");
  const outputRoot = repositoryPath(root, stagingRoot, "Gitleaks staging root");
  const temporaryRoot = repositoryPath(
    root,
    `${GITLEAKS_STAGING_ROOT}.staging`,
    "Gitleaks temporary staging root",
  );
  rmSync(outputRoot, { recursive: true, force: true });
  rmSync(temporaryRoot, { recursive: true, force: true });
  try {
    if (!existsSync(sourceAbsolutePath)) throw new Error("Gitleaks results.sarif is missing");
    const sarifBytes = readFileSync(sourceAbsolutePath);
    let sarif;
    try {
      sarif = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(sarifBytes));
    } catch {
      throw new Error("Gitleaks results.sarif is not strict UTF-8 JSON");
    }
    if (
      sarif?.version !== "2.1.0" ||
      !Array.isArray(sarif?.runs) ||
      containsMachinePath(sarif)
    ) {
      throw new Error("Gitleaks results.sarif is malformed or contains runner paths");
    }
    mkdirSync(temporaryRoot, { recursive: true });
    writeFileSync(path.join(temporaryRoot, "results.sarif"), sarifBytes);
    const manifest = {
      schema: "interior-ai.gitleaks-artifact.v1",
      sourceCommitSha,
      githubRun: { id: String(runId), attempt: String(runAttempt) },
      sarif: { archiveEntry: "results.sarif", sha256: sha256(sarifBytes) },
      archiveEntries: GITLEAKS_ARCHIVE_ENTRIES,
    };
    writeFileSync(
      path.join(temporaryRoot, "artifact-manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
    renameSync(temporaryRoot, outputRoot);
    return manifest;
  } catch (error) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
    throw error;
  }
}

async function cli() {
  if (process.argv[2] !== "prepare") {
    throw new Error("Usage: gitleaks-artifact.mjs prepare");
  }
  prepareGitleaksArtifact({
    repositoryRoot: process.cwd(),
    sourceCommitSha: process.env.GITHUB_SHA?.trim(),
    runId: process.env.GITHUB_RUN_ID?.trim(),
    runAttempt: process.env.GITHUB_RUN_ATTEMPT?.trim(),
  });
  console.log("Prepared portable Gitleaks SARIF artifact entries.");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
