import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
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
export const GITLEAKS_ARTIFACT_SCHEMA = "interior-ai.gitleaks-artifact.v2";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactSha(value, description) {
  const normalized = value?.trim().toLowerCase();
  if (!/^[0-9a-f]{40,64}$/.test(normalized ?? "")) {
    throw new Error(`${description} is missing or malformed`);
  }
  return normalized;
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

function gitHead(repositoryRoot) {
  try {
    return exactSha(
      execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: path.resolve(repositoryRoot),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
      "checked-out source SHA",
    );
  } catch (error) {
    if (error instanceof Error && /checked-out source SHA/.test(error.message)) throw error;
    throw new Error("Unable to resolve the checked-out source SHA");
  }
}

function containsMachinePath(value) {
  if (typeof value === "string") {
    return (
      /(?:^|[\s"'(])\/(?:home|Users|private\/tmp|tmp|var\/tmp|var\/folders)\//i.test(value) ||
      /\b[A-Za-z]:[\\/](?:Users|Temp|a)[\\/]/i.test(value) ||
      /(?:^|\/)work\/[^/\s]+\/[^/\s]+\//i.test(value) ||
      value.startsWith("file://")
    );
  }
  if (Array.isArray(value)) return value.some(containsMachinePath);
  if (value && typeof value === "object") return Object.values(value).some(containsMachinePath);
  return false;
}

export function verifyCheckedOutSourceIdentity({
  repositoryRoot,
  expectedSourceSha,
  githubOutputPath,
}) {
  const actual = gitHead(repositoryRoot);
  const expected = exactSha(expectedSourceSha, "expected source SHA");
  if (actual !== expected) {
    throw new Error("Checked-out source SHA does not match the workflow's expected source SHA");
  }
  if (!githubOutputPath || !path.isAbsolute(githubOutputPath) || !existsSync(githubOutputPath)) {
    throw new Error("GitHub Actions step output file is unavailable");
  }
  appendFileSync(githubOutputPath, `tested_source_sha=${actual}\n`, { encoding: "utf8" });
  return actual;
}

export function verifyGitleaksArtifact({
  repositoryRoot,
  stagingRoot = GITLEAKS_STAGING_ROOT,
  expectedTestedSourceSha,
}) {
  const root = path.resolve(repositoryRoot);
  const outputRoot = repositoryPath(root, stagingRoot, "Gitleaks staging root");
  if (!existsSync(outputRoot)) throw new Error("Gitleaks artifact staging root is missing");
  const entries = readdirSync(outputRoot, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile())) {
    throw new Error("Gitleaks artifact contains a non-file archive entry");
  }
  const actualEntries = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(actualEntries) !== JSON.stringify([...GITLEAKS_ARCHIVE_ENTRIES])) {
    throw new Error("Gitleaks artifact archive entries are not exact");
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(outputRoot, "artifact-manifest.json"), "utf8"));
  } catch {
    throw new Error("Gitleaks artifact manifest is malformed");
  }
  if (manifest?.schema !== GITLEAKS_ARTIFACT_SCHEMA) {
    throw new Error("Gitleaks artifact manifest schema is unsupported");
  }
  const testedSourceSha = exactSha(manifest.testedSourceSha, "manifest testedSourceSha");
  exactSha(manifest.workflowContextSha, "manifest workflowContextSha");
  const expected = exactSha(expectedTestedSourceSha, "expected tested source SHA");
  if (testedSourceSha !== expected) {
    throw new Error("Gitleaks artifact testedSourceSha does not match the tested checkout");
  }
  if (JSON.stringify(manifest.archiveEntries) !== JSON.stringify(GITLEAKS_ARCHIVE_ENTRIES)) {
    throw new Error("Gitleaks artifact manifest archive entries are not exact");
  }
  const sarifBytes = readFileSync(path.join(outputRoot, "results.sarif"));
  if (manifest?.sarif?.archiveEntry !== "results.sarif" || manifest.sarif.sha256 !== sha256(sarifBytes)) {
    throw new Error("Gitleaks artifact SARIF hash does not match the archive entry");
  }
  return manifest;
}

export function prepareGitleaksArtifact({
  repositoryRoot,
  sourcePath = "results.sarif",
  stagingRoot = GITLEAKS_STAGING_ROOT,
  testedSourceSha,
  workflowContextSha,
  runId,
  runAttempt,
}) {
  const root = path.resolve(repositoryRoot);
  if (sourcePath !== "results.sarif") throw new Error("Gitleaks SARIF source must be exactly results.sarif");
  if (stagingRoot !== GITLEAKS_STAGING_ROOT) {
    throw new Error(`Gitleaks staging root must be exactly ${GITLEAKS_STAGING_ROOT}`);
  }
  const tested = exactSha(testedSourceSha, "tested source SHA");
  const workflowContext = exactSha(workflowContextSha, "workflow-context SHA");
  if (gitHead(root) !== tested) {
    throw new Error("Gitleaks tested source SHA does not match the checked-out source SHA");
  }
  if (!/^\d+$/.test(String(runId ?? "")) || !/^\d+$/.test(String(runAttempt ?? ""))) {
    throw new Error("Gitleaks artifact requires numeric GitHub run identity");
  }

  const sourceAbsolutePath = repositoryPath(root, sourcePath, "Gitleaks SARIF source");
  const outputRoot = repositoryPath(root, stagingRoot, "Gitleaks staging root");
  const temporaryRoot = repositoryPath(root, `${GITLEAKS_STAGING_ROOT}.staging`, "Gitleaks temporary staging root");
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
    if (sarif?.version !== "2.1.0" || !Array.isArray(sarif?.runs) || containsMachinePath(sarif)) {
      throw new Error("Gitleaks results.sarif is malformed or contains runner paths");
    }
    mkdirSync(temporaryRoot, { recursive: true });
    writeFileSync(path.join(temporaryRoot, "results.sarif"), sarifBytes);
    const manifest = {
      schema: GITLEAKS_ARTIFACT_SCHEMA,
      testedSourceSha: tested,
      workflowContextSha: workflowContext,
      githubRun: { id: String(runId), attempt: String(runAttempt) },
      sarif: { archiveEntry: "results.sarif", sha256: sha256(sarifBytes) },
      archiveEntries: GITLEAKS_ARCHIVE_ENTRIES,
    };
    writeFileSync(path.join(temporaryRoot, "artifact-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    renameSync(temporaryRoot, outputRoot);
    return verifyGitleaksArtifact({ repositoryRoot: root, stagingRoot, expectedTestedSourceSha: tested });
  } catch (error) {
    rmSync(temporaryRoot, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
    throw error;
  }
}

async function cli() {
  const command = process.argv[2];
  if (command === "verify-source") {
    verifyCheckedOutSourceIdentity({
      repositoryRoot: process.cwd(),
      expectedSourceSha: process.env.GITLEAKS_EXPECTED_SOURCE_SHA,
      githubOutputPath: process.env.GITHUB_OUTPUT,
    });
    console.log("Verified the checked-out source identity.");
    return;
  }
  if (command === "prepare") {
    prepareGitleaksArtifact({
      repositoryRoot: process.cwd(),
      testedSourceSha: process.env.GITLEAKS_SOURCE_COMMIT_SHA,
      workflowContextSha: process.env.GITLEAKS_WORKFLOW_CONTEXT_SHA,
      runId: process.env.GITHUB_RUN_ID?.trim(),
      runAttempt: process.env.GITHUB_RUN_ATTEMPT?.trim(),
    });
    console.log("Prepared and verified portable Gitleaks SARIF artifact entries.");
    return;
  }
  if (command === "verify") {
    verifyGitleaksArtifact({
      repositoryRoot: process.cwd(),
      stagingRoot: process.argv[3] ?? GITLEAKS_STAGING_ROOT,
      expectedTestedSourceSha: process.env.GITLEAKS_SOURCE_COMMIT_SHA,
    });
    console.log("Verified the exact portable Gitleaks SARIF artifact entries.");
    return;
  }
  throw new Error("Usage: gitleaks-artifact.mjs verify-source|prepare|verify [artifact-root]");
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
