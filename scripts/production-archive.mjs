import { spawnSync } from "node:child_process";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  cpSync,
  chmodSync,
  existsSync,
  lstatSync,
  lutimesSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { resolveAuthorizedExternalEvidenceRoot } from "./playwright-report-path.mjs";
import {
  PRODUCTION_ARCHIVE_INVENTORY_SCHEMA,
  PRODUCTION_ARCHIVE_PLAN_SCHEMA,
  PHASE8_SOURCE_BINDING_PATHS,
  canonicalJsonBytes,
  productionArchiveInventoryIssues,
  sha256Bytes,
} from "./production-certification-contract.mjs";
import { deriveProductionVerifierClosure } from "./production-verifier-closure.mjs";
import { projectCertificationChildEnvironment } from "./production-certification-stage-environment.mjs";

const DEFAULT_MANIFEST = ".local/production-artifact-evidence/manifest.json";
const DEFAULT_JOURNAL =
  ".local/production-artifact-evidence/semantic-event-journal.json";
const DEFAULT_ARTIFACT_INVENTORY =
  ".local/production-artifact-evidence/artifact-inventory.json";
const GENERATED_ROOT = ".certification";
const PROHIBITED_PATHS = Object.freeze([
  ".git",
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".vercel",
  "tests",
]);

function portable(value) {
  return value.split(path.sep).join("/");
}

function normalizedRelative(value, description) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    path.isAbsolute(value) ||
    value.includes("\\") ||
    path.normalize(value) !== value ||
    value === ".." ||
    value.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`${description} must be a normalized relative path`);
  }
  return portable(value);
}

function outsideRepositoryAbsolute(
  value,
  repositoryRoot,
  description,
  externalEvidenceRoot = process.env.CERTIFICATION_EVIDENCE_ROOT,
) {
  if (typeof value !== "string" || !path.isAbsolute(value)) {
    throw new Error(`${description} must be absolute`);
  }
  const root = realpathSync(repositoryRoot);
  const resolved = path.resolve(value);
  if (resolved === root || resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${description} must remain outside the repository`);
  }
  const authorized = resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot: externalEvidenceRoot,
    repositoryRoot,
  });
  if (!resolved.startsWith(`${authorized.externalRoot}${path.sep}`)) {
    throw new Error(`${description} must remain beneath the authorized evidence root`);
  }
  let parentRealpath;
  try {
    parentRealpath = realpathSync(path.dirname(resolved));
  } catch {
    throw new Error(`${description} parent must already exist`);
  }
  if (!parentRealpath.startsWith(`${authorized.externalRootRealpath}${path.sep}`)) {
    throw new Error(`${description} parent escapes the authorized evidence root`);
  }
  return resolved;
}

function assertPhysicalArchivePath(
  absolutePath,
  repositoryRoot,
  description,
  expectedType,
  externalEvidenceRoot = process.env.CERTIFICATION_EVIDENCE_ROOT,
) {
  const entry = lstatSync(absolutePath);
  if (
    entry.isSymbolicLink() ||
    (expectedType === "file" && !entry.isFile()) ||
    (expectedType === "directory" && !entry.isDirectory())
  ) {
    throw new Error(`${description} must be a physical ${expectedType}`);
  }
  const authorized = resolveAuthorizedExternalEvidenceRoot({
    authorizedExternalRoot: externalEvidenceRoot,
    repositoryRoot,
  });
  if (!realpathSync(absolutePath).startsWith(`${authorized.externalRootRealpath}${path.sep}`)) {
    throw new Error(`${description} escapes the authorized evidence root`);
  }
}

function physicalSource(repositoryRoot, relativePath) {
  const root = path.resolve(repositoryRoot);
  const absolutePath = path.resolve(root, relativePath);
  if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
    throw new Error(`archive input escapes source root: ${relativePath}`);
  }
  const metadata = lstatSync(absolutePath);
  if (metadata.isSymbolicLink()) {
    const resolved = realpathSync(absolutePath);
    const realRoot = realpathSync(root);
    if (!resolved.startsWith(`${realRoot}${path.sep}`)) {
      throw new Error(`archive symlink input escapes source root: ${relativePath}`);
    }
  }
  return { absolutePath, metadata };
}

function walkFiles(root, relativePath, records = []) {
  const { absolutePath, metadata } = physicalSource(root, relativePath);
  if (metadata.isDirectory()) {
    for (const entry of readdirSync(absolutePath).sort()) {
      walkFiles(root, path.join(relativePath, entry), records);
    }
    return records;
  }
  if (!metadata.isFile() && !metadata.isSymbolicLink()) {
    throw new Error(`archive input is not a file or symlink: ${relativePath}`);
  }
  records.push(portable(relativePath));
  return records;
}

function readJson(filePath, description) {
  let value;
  try {
    value = JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    throw new Error(`${description} is missing or invalid JSON`);
  }
  return value;
}

function addInput(inputMap, relativePath, reason) {
  const normalized = normalizedRelative(relativePath, "archive input");
  const existing = inputMap.get(normalized);
  if (existing) existing.add(reason);
  else inputMap.set(normalized, new Set([reason]));
}

function requiredServerInputs(repositoryRoot) {
  const requiredFilesPath = path.join(
    repositoryRoot,
    ".next/required-server-files.json",
  );
  const value = readJson(requiredFilesPath, "required-server-files manifest");
  return Array.isArray(value.files)
    ? value.files.map((entry) =>
        normalizedRelative(portable(entry), "required-server-files entry"),
      )
    : [];
}

function nftDerivedInputs(repositoryRoot) {
  const nftPaths = walkFiles(repositoryRoot, ".next").filter((entry) =>
    entry.endsWith(".nft.json"),
  );
  const inputs = [];
  for (const nftPath of nftPaths) {
    const nft = readJson(path.join(repositoryRoot, nftPath), `NFT manifest ${nftPath}`);
    if (!Array.isArray(nft.files)) throw new Error(`NFT manifest files are invalid: ${nftPath}`);
    const nftDirectory = path.dirname(nftPath);
    for (const reference of nft.files) {
      if (typeof reference !== "string") {
        throw new Error(`NFT manifest reference is invalid: ${nftPath}`);
      }
      const resolved = portable(path.normalize(path.join(nftDirectory, reference)));
      if (resolved === ".." || resolved.startsWith("../")) {
        throw new Error(`NFT manifest reference escapes source: ${nftPath}`);
      }
      if (existsSync(path.join(repositoryRoot, resolved))) inputs.push(resolved);
    }
  }
  return [...new Set(inputs)].sort();
}

function prohibitedArchivePath(relativePath) {
  return (
    PROHIBITED_PATHS.some(
      (entry) => relativePath === entry || relativePath.startsWith(`${entry}/`),
    ) ||
    /^scripts\/test-/.test(relativePath) ||
    relativePath.includes("\n")
  );
}

export function planProductionArchive({
  repositoryRoot,
  manifestPath = DEFAULT_MANIFEST,
  journalPath = DEFAULT_JOURNAL,
  artifactInventoryPath = DEFAULT_ARTIFACT_INVENTORY,
}) {
  const root = path.resolve(repositoryRoot);
  const closure = deriveProductionVerifierClosure(root);
  const inputs = new Map();
  for (const [relativePath, reason] of [
    [".next", "executable-next-artifact"],
    ["public", "public-static-assets"],
    ["package.json", "package-manager-and-runtime-identity"],
    ["package-lock.json", "immutable-dependency-identity"],
    [manifestPath, "production-manifest-v3"],
    [`${manifestPath}.sha256`, "production-manifest-sidecar"],
    [journalPath, "semantic-journal-v2"],
    [artifactInventoryPath, "bound-artifact-inventory"],
    [
      "docs/qa/production-certification-contract.v1.json",
      "certification-contract-matrix",
    ],
    [
      "docs/qa/production-certification-stage-environment.v2.json",
      "certification-stage-environment-contract",
    ],
  ]) {
    for (const file of walkFiles(root, normalizedRelative(relativePath, "archive root input"))) {
      addInput(inputs, file, reason);
    }
  }
  if (existsSync(path.join(root, ".nvmrc"))) {
    addInput(inputs, ".nvmrc", "node-runtime-identity");
  }
  for (const relativePath of requiredServerInputs(root)) {
    for (const file of walkFiles(root, relativePath)) {
      addInput(inputs, file, "required-server-files");
    }
  }
  for (const relativePath of nftDerivedInputs(root)) {
    for (const file of walkFiles(root, relativePath)) {
      addInput(inputs, file, "nft-derived-runtime-file");
    }
  }
  for (const file of closure.files) {
    addInput(inputs, file.path, "standalone-verifier-source-closure");
  }
  for (const relativePath of PHASE8_SOURCE_BINDING_PATHS) {
    addInput(inputs, relativePath, "phase8-source-binding");
  }
  const files = [...inputs.entries()].sort(([left], [right]) => left.localeCompare(right));
  for (const [relativePath] of files) {
    if (prohibitedArchivePath(relativePath)) {
      throw new Error(`archive inclusion policy rejects ${relativePath}`);
    }
  }
  const inventory = files.map(([relativePath, reasons]) => {
    const { absolutePath, metadata } = physicalSource(root, relativePath);
    const bytes = metadata.isSymbolicLink()
      ? Buffer.from(`symlink:${readlinkSync(absolutePath)}`)
      : readFileSync(absolutePath);
    return {
      path: relativePath,
      reasons: [...reasons].sort(),
      type: metadata.isSymbolicLink() ? "symlink" : "file",
      bytes: bytes.byteLength,
      sha256: sha256Bytes(bytes),
    };
  });
  const plan = {
    schema: PRODUCTION_ARCHIVE_PLAN_SCHEMA,
    version: 1,
    constructor: "scripts/production-archive.mjs",
    inputs: inventory,
    verifierClosure: closure,
    generatedFiles: [
      `${GENERATED_ROOT}/archive-plan.json`,
      `${GENERATED_ROOT}/archive-inventory.json`,
      `${GENERATED_ROOT}/archive-preflight.json`,
      `${GENERATED_ROOT}/verifier-source-closure.json`,
    ],
    scannerPolicy: {
      prohibitedPaths: [...PROHIBITED_PATHS],
      rejectedHistoricalTestScripts: true,
      broadScriptsOrTestsInclusion: false,
    },
  };
  return Object.freeze({
    ...plan,
    planSha256: sha256Bytes(canonicalJsonBytes(plan)),
  });
}

function copyPlannedInput(sourceRoot, stageRoot, input) {
  const sourcePath = path.join(sourceRoot, input.path);
  const destinationPath = path.join(stageRoot, input.path);
  mkdirSync(path.dirname(destinationPath), { recursive: true });
  const metadata = lstatSync(sourcePath);
  if (metadata.isSymbolicLink()) {
    const link = readlinkSync(sourcePath);
    if (path.isAbsolute(link)) {
      throw new Error(`archive input uses an absolute symlink: ${input.path}`);
    }
    symlinkSync(link, destinationPath);
  } else {
    cpSync(sourcePath, destinationPath, { preserveTimestamps: false });
  }
}

function assertContainedArchiveSymlinks(root) {
  const absoluteRoot = realpathSync(root);
  for (const relativePath of walkFiles(root, ".")) {
    const absolutePath = path.join(root, relativePath);
    if (!lstatSync(absolutePath).isSymbolicLink()) continue;
    let target;
    try {
      target = realpathSync(absolutePath);
    } catch {
      throw new Error(`archive symlink is dangling: ${relativePath}`);
    }
    if (!target.startsWith(`${absoluteRoot}${path.sep}`)) {
      throw new Error(`archive symlink escapes staged bytes: ${relativePath}`);
    }
  }
}

function plannedInputIssues(plan, sourceRoot) {
  const issues = [];
  const seen = new Set();
  for (const input of plan.inputs ?? []) {
    if (seen.has(input.path)) issues.push(`duplicate archive destination ${input.path}`);
    seen.add(input.path);
    try {
      const { absolutePath, metadata } = physicalSource(sourceRoot, input.path);
      const bytes = metadata.isSymbolicLink()
        ? Buffer.from(`symlink:${readlinkSync(absolutePath)}`)
        : readFileSync(absolutePath);
      if (sha256Bytes(bytes) !== input.sha256) issues.push(`archive input changed: ${input.path}`);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  return issues;
}

function verifierEnvironment(repositoryRoot, environment, closureSha256) {
  const required = [
    "PRODUCTION_EVIDENCE_EXPECTED_CANDIDATE_ID",
    "PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA",
    "PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA",
    "PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID",
    "PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256",
  ];
  const missing = required.filter((name) => !environment[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`archive verification environment is incomplete: ${missing.join(", ")}`);
  }
  return projectCertificationChildEnvironment({
    repositoryRoot,
    baseEnvironment: environment,
    stage: "archive-verifier",
    profileId: "archive-verifier",
    stageInputs: {
      CERTIFICATION_ENVIRONMENT_STAGE: "archive-verifier",
      ...Object.fromEntries(required.map((name) => [name, environment[name]])),
      PRODUCTION_EVIDENCE_EXPECTED_VERIFIER_SOURCE_CLOSURE_SHA256: closureSha256,
    },
  }).environment;
}

export function verifyProductionArchiveStage({ stageRoot, environment = process.env }) {
  const sourceRoot = environment.PRODUCTION_ARCHIVE_SOURCE_ROOT || process.cwd();
  const root = outsideRepositoryAbsolute(
    stageRoot,
    sourceRoot,
    "archive stage root",
    environment.CERTIFICATION_EVIDENCE_ROOT,
  );
  assertPhysicalArchivePath(
    root,
    sourceRoot,
    "archive stage root",
    "directory",
    environment.CERTIFICATION_EVIDENCE_ROOT,
  );
  const closurePath = path.join(root, GENERATED_ROOT, "verifier-source-closure.json");
  const closure = readJson(closurePath, "staged verifier closure");
  const child = spawnSync(
    process.execPath,
    ["scripts/production-artifact-evidence.mjs", "verify-archive-preflight"],
    {
      cwd: root,
      env: verifierEnvironment(root, environment, closure.closureSha256),
      encoding: "utf8",
    },
  );
  if (child.status !== 0 || child.signal) {
    throw new Error(
      `staged archive preflight failed: ${String(child.stderr || child.stdout).trim()}`,
    );
  }
  let result;
  try {
    result = JSON.parse(child.stdout);
  } catch {
    throw new Error("staged archive preflight did not return sealed JSON");
  }
  if (result.preflightPassed !== true || result.certificationComplete !== false) {
    throw new Error("staged archive preflight overstated or omitted its result");
  }
  const receiptPath = path.join(root, GENERATED_ROOT, "archive-preflight.json");
  const resultBytes = canonicalJsonBytes(result);
  if (existsSync(receiptPath)) {
    if (!readFileSync(receiptPath).equals(resultBytes)) {
      throw new Error("staged archive preflight receipt is contradictory");
    }
  } else {
    writeFileSync(receiptPath, resultBytes, { flag: "wx", mode: 0o600 });
  }
  return result;
}

function stageInventory(stageRoot) {
  const files = walkFiles(stageRoot, ".").filter(
    (entry) => entry !== `${GENERATED_ROOT}/archive-inventory.json`,
  );
  const records = files.sort().map((relativePath) => {
    const absolutePath = path.join(stageRoot, relativePath);
    const metadata = lstatSync(absolutePath);
    const bytes = metadata.isSymbolicLink()
      ? Buffer.from(`symlink:${readlinkSync(absolutePath)}`)
      : readFileSync(absolutePath);
    return { path: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
  });
  const inventory = {
    schema: PRODUCTION_ARCHIVE_INVENTORY_SCHEMA,
    files: records,
    fileCount: records.length,
    bytes: records.reduce((total, record) => total + record.bytes, 0),
  };
  return {
    ...inventory,
    inventorySha256: sha256Bytes(canonicalJsonBytes(inventory)),
  };
}

export function inventoryProductionArchiveTree(stageRoot) {
  return stageInventory(stageRoot);
}

function deterministicArchive(stageRoot, archivePath) {
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "production-archive-tar-"));
  try {
    const tarPath = path.join(temporaryRoot, "archive.tar");
    const listPath = path.join(temporaryRoot, "files.txt");
    const files = walkFiles(stageRoot, ".").sort();
    const epoch = new Date(0);
    for (const relativePath of files) {
      const absolutePath = path.join(stageRoot, relativePath);
      if (lstatSync(absolutePath).isSymbolicLink()) {
        lutimesSync(absolutePath, epoch, epoch);
      } else {
        chmodSync(absolutePath, 0o644);
        utimesSync(absolutePath, epoch, epoch);
      }
    }
    writeFileSync(listPath, `${files.join("\n")}\n`);
    const child = spawnSync(
      "tar",
      [
        "--no-xattrs",
        "--uid",
        "0",
        "--gid",
        "0",
        "--uname",
        "root",
        "--gname",
        "root",
        "-cf",
        tarPath,
        "-C",
        stageRoot,
        "-T",
        listPath,
      ],
      { encoding: "utf8", env: { ...process.env, COPYFILE_DISABLE: "1" } },
    );
    if (child.status !== 0 || child.signal) {
      throw new Error(`deterministic tar failed: ${String(child.stderr).trim()}`);
    }
    const compressed = gzipSync(readFileSync(tarPath), { level: 9, mtime: 0 });
    writeFileSync(archivePath, compressed, { flag: "wx", mode: 0o600 });
    return sha256Bytes(compressed);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function createProductionArchive({
  repositoryRoot,
  plan,
  stageRoot,
  archivePath,
  environment = process.env,
}) {
  const staged = stageProductionArchive({
    repositoryRoot,
    plan,
    stageRoot,
    environment,
  });
  const compressed = compressProductionArchive({
    repositoryRoot,
    stageRoot: staged.stageRoot,
    archivePath,
  });
  return { ...staged, ...compressed };
}

export function stageProductionArchive({
  repositoryRoot,
  plan,
  stageRoot,
  environment = process.env,
}) {
  const sourceRoot = path.resolve(repositoryRoot);
  const stage = outsideRepositoryAbsolute(stageRoot, sourceRoot, "archive stage root");
  if (existsSync(stage)) throw new Error("archive stage root must be absent");
  const issues = plannedInputIssues(plan, sourceRoot);
  if (issues.length > 0) throw new Error(issues.join("; "));
  mkdirSync(stage, { recursive: false, mode: 0o700 });
  for (const input of plan.inputs) copyPlannedInput(sourceRoot, stage, input);
  assertContainedArchiveSymlinks(stage);
  mkdirSync(path.join(stage, GENERATED_ROOT), { recursive: true, mode: 0o700 });
  writeFileSync(
    path.join(stage, GENERATED_ROOT, "archive-plan.json"),
    canonicalJsonBytes(plan),
    { flag: "wx", mode: 0o600 },
  );
  writeFileSync(
    path.join(stage, GENERATED_ROOT, "verifier-source-closure.json"),
    canonicalJsonBytes(plan.verifierClosure),
    { flag: "wx", mode: 0o600 },
  );
  verifyProductionArchiveStage({ stageRoot: stage, environment });
  const inventory = stageInventory(stage);
  writeFileSync(
    path.join(stage, GENERATED_ROOT, "archive-inventory.json"),
    canonicalJsonBytes(inventory),
    { flag: "wx", mode: 0o600 },
  );
  return { stageRoot: stage, inventory, verification: true };
}

export function compressProductionArchive({ repositoryRoot, stageRoot, archivePath }) {
  const sourceRoot = path.resolve(repositoryRoot);
  const stage = outsideRepositoryAbsolute(stageRoot, sourceRoot, "archive stage root");
  const archive = outsideRepositoryAbsolute(archivePath, sourceRoot, "archive path");
  if (!existsSync(stage) || existsSync(archive)) {
    throw new Error("archive stage must exist and archive target must be absent");
  }
  assertPhysicalArchivePath(stage, sourceRoot, "archive stage root", "directory");
  const inventory = readJson(
    path.join(stage, GENERATED_ROOT, "archive-inventory.json"),
    "staged archive inventory",
  );
  const inventoryIssues = productionArchiveInventoryIssues(inventory);
  if (inventoryIssues.length > 0) {
    throw new Error(inventoryIssues.join("; "));
  }
  mkdirSync(path.dirname(archive), { recursive: true, mode: 0o700 });
  const archiveSha256 = deterministicArchive(stage, archive);
  return { archivePath: archive, archiveSha256, inventory };
}

function assertSafeArchiveEntries(entries) {
  for (const entry of entries) {
    const normalized = path.posix.normalize(entry);
    if (
      entry.startsWith("/") ||
      normalized === ".." ||
      normalized.startsWith("../") ||
      normalized !== entry
    ) {
      throw new Error("compressed archive contains an unsafe extraction path");
    }
  }
}

export function extractAndVerifyProductionArchive({
  archivePath,
  extractionRoot,
  environment = process.env,
}) {
  const sourceRoot = environment.PRODUCTION_ARCHIVE_SOURCE_ROOT || process.cwd();
  const archive = outsideRepositoryAbsolute(archivePath, sourceRoot, "archive path");
  const extracted = outsideRepositoryAbsolute(
    extractionRoot,
    sourceRoot,
    "archive extraction root",
  );
  if (existsSync(extracted)) throw new Error("archive extraction root must be absent");
  assertPhysicalArchivePath(archive, sourceRoot, "archive path", "file");
  const temporaryRoot = mkdtempSync(path.join(tmpdir(), "production-archive-extract-"));
  try {
    const tarPath = path.join(temporaryRoot, "archive.tar");
    writeFileSync(tarPath, gunzipSync(readFileSync(archive)));
    const listed = spawnSync("tar", ["-tf", tarPath], { encoding: "utf8" });
    if (listed.status !== 0 || listed.signal) throw new Error("archive inventory read failed");
    const entries = listed.stdout.trim().split("\n").filter(Boolean);
    assertSafeArchiveEntries(entries);
    mkdirSync(extracted, { recursive: false, mode: 0o700 });
    const child = spawnSync("tar", ["-xf", tarPath, "-C", extracted], {
      encoding: "utf8",
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    if (child.status !== 0 || child.signal) throw new Error("archive extraction failed");
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
  assertContainedArchiveSymlinks(extracted);
  const verification = verifyProductionArchiveStage({
    stageRoot: extracted,
    environment,
  });
  const recordedInventory = readJson(
    path.join(extracted, GENERATED_ROOT, "archive-inventory.json"),
    "extracted archive inventory",
  );
  const inventoryIssues = productionArchiveInventoryIssues(recordedInventory);
  if (inventoryIssues.length > 0) {
    throw new Error(inventoryIssues.join("; "));
  }
  const actualInventory = stageInventory(extracted);
  if (actualInventory.inventorySha256 !== recordedInventory.inventorySha256) {
    throw new Error("extracted archive bytes do not match the staged inventory");
  }
  return { extractionRoot: extracted, verification, inventory: actualInventory };
}

function writePlanFromEnvironment() {
  const repositoryRoot = process.env.PRODUCTION_ARCHIVE_SOURCE_ROOT || process.cwd();
  const planPath = outsideRepositoryAbsolute(
    process.env.PRODUCTION_ARCHIVE_PLAN,
    repositoryRoot,
    "archive plan path",
  );
  if (existsSync(planPath)) throw new Error("archive plan target must be absent");
  const plan = planProductionArchive({ repositoryRoot });
  mkdirSync(path.dirname(planPath), { recursive: true, mode: 0o700 });
  writeFileSync(planPath, canonicalJsonBytes(plan), { flag: "wx", mode: 0o600 });
  return plan;
}

function cli() {
  const command = process.argv[2];
  if (command === "plan") {
    const plan = writePlanFromEnvironment();
    console.log(JSON.stringify({ planSha256: plan.planSha256 }));
    return;
  }
  const repositoryRoot = process.env.PRODUCTION_ARCHIVE_SOURCE_ROOT || process.cwd();
  const planPath = outsideRepositoryAbsolute(
    process.env.PRODUCTION_ARCHIVE_PLAN,
    repositoryRoot,
    "archive plan path",
  );
  assertPhysicalArchivePath(planPath, repositoryRoot, "archive plan path", "file");
  const plan = readJson(planPath, "archive plan");
  if (command === "create") {
    const result = compressProductionArchive({
      repositoryRoot,
      stageRoot: process.env.PRODUCTION_ARCHIVE_STAGE_ROOT,
      archivePath: process.env.PRODUCTION_ARCHIVE_PATH,
    });
    console.log(JSON.stringify({
      archiveSha256: result.archiveSha256,
      inventorySha256: result.inventory.inventorySha256,
    }));
  } else if (command === "verify") {
    const stageRoot = process.env.PRODUCTION_ARCHIVE_STAGE_ROOT;
    const result = existsSync(stageRoot)
      ? {
          verification: verifyProductionArchiveStage({ stageRoot }),
          inventory: stageInventory(stageRoot),
        }
      : stageProductionArchive({ repositoryRoot, plan, stageRoot });
    console.log(JSON.stringify({
      preflightPassed:
        result.verification === true || result.verification.preflightPassed === true,
      inventorySha256: result.inventory.inventorySha256,
    }));
  } else if (command === "extract-and-verify") {
    const result = extractAndVerifyProductionArchive({
      archivePath: process.env.PRODUCTION_ARCHIVE_PATH,
      extractionRoot: process.env.PRODUCTION_ARCHIVE_EXTRACTION_ROOT,
    });
    console.log(JSON.stringify({
      inventorySha256: result.inventory.inventorySha256,
      preflightPassed: result.verification.preflightPassed,
    }));
  } else {
    throw new Error("usage: production-archive.mjs plan|create|verify|extract-and-verify");
  }
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  try {
    cli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
