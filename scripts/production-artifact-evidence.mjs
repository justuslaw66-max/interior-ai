import { spawn, spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  createReadStream,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { resolveRetainedExternalEvidenceFile } from "./playwright-report-path.mjs";
import { deriveProductionVerifierClosure } from "./production-verifier-closure.mjs";

const EXECUTING_REPOSITORY_ROOT = path.resolve(path.dirname(import.meta.filename), "..");
export const PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS = Object.freeze(
  deriveProductionVerifierClosure(EXECUTING_REPOSITORY_ROOT).files.map(
    (file) => file.path,
  ),
);

const ARCHIVE_PREFLIGHT_COMMAND = "verify-archive-preflight";
const ARCHIVE_PREFLIGHT_PROHIBITED_PATHS = Object.freeze([
  ".git",
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
  ".vercel",
  "release-evidence-private",
]);

function assertArchivePreflightBootstrap() {
  const stagedRoot = path.resolve(process.cwd());
  const executingPath = path.resolve(import.meta.filename);
  const stagedEntryPoint = path.join(
    stagedRoot,
    "scripts/production-artifact-evidence.mjs",
  );
  if (
    !existsSync(stagedEntryPoint) ||
    realpathSync(stagedEntryPoint) !== realpathSync(executingPath)
  ) {
    throw new Error(
      "archive-preflight verifier must execute from the staged archive root",
    );
  }
  for (const relativePath of ARCHIVE_PREFLIGHT_PROHIBITED_PATHS) {
    if (existsSync(path.join(stagedRoot, relativePath))) {
      throw new Error(
        `archive-preflight staged tree contains prohibited path: ${relativePath}`,
      );
    }
  }
  const closure = deriveProductionVerifierClosure(stagedRoot);
  const expectedClosureSha256 =
    process.env.PRODUCTION_EVIDENCE_EXPECTED_VERIFIER_SOURCE_CLOSURE_SHA256?.trim();
  if (!/^[0-9a-f]{64}$/.test(expectedClosureSha256 ?? "")) {
    throw new Error(
      "archive preflight requires an exact expected verifier source closure SHA-256",
    );
  }
  if (closure.closureSha256 !== expectedClosureSha256) {
    throw new Error("archive preflight verifier source closure SHA-256 mismatch");
  }
}

if (process.argv[2] === ARCHIVE_PREFLIGHT_COMMAND) {
  try {
    assertArchivePreflightBootstrap();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

const { validateRequiredTestReport } = await import(
  "./required-test-truthfulness.mjs"
);
const {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  RUNTIME_SMOKE_OVERHEAD_BUDGETS,
  RUNTIME_SMOKE_PHASE_BUDGETS,
  RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
} = await import("./runtime-smoke-phase-budget.mjs");
const { validateRuntimeSmokeFailureProvenance } = await import(
  "./runtime-smoke-failure-evidence.mjs"
);
const {
  RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT,
  summarizeRuntimeSmokeTelemetryBootstrapEvidence,
  validateRuntimeSmokeTelemetryBootstrapSequence,
} = await import("./runtime-smoke-telemetry-bootstrap-contract.mjs");
const {
  BUILD_COMMAND,
  DEPENDENCY_INSTALL_COMMAND,
  GENERATED_SOURCE_CHECK_COMMAND,
  PRODUCTION_EVIDENCE_JOURNAL_PATH,
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  PRODUCTION_EVIDENCE_SCHEMA,
  PRODUCTION_EVIDENCE_SERVER_COMMAND,
  PRODUCTION_EVIDENCE_UNDERLYING_SERVER_COMMAND: UNDERLYING_SERVER_COMMAND,
  PRODUCTION_EVIDENCE_VALIDATOR_VERSION,
  PRODUCTION_EVIDENCE_VERIFICATION_MODES,
  PRODUCTION_EVIDENCE_VERIFICATION_RESULT_SCHEMA,
  PRODUCTION_EVIDENCE_WRAPPER_VERSION,
  validateCurrentProductionEvidenceManifest,
} = await import("./production-artifact-contract.mjs");

export {
  BUILD_COMMAND,
  DEPENDENCY_INSTALL_COMMAND,
  GENERATED_SOURCE_CHECK_COMMAND,
  PRODUCTION_EVIDENCE_JOURNAL_PATH,
  PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
  PRODUCTION_EVIDENCE_JOURNAL_VERSION,
  PRODUCTION_EVIDENCE_SCHEMA,
  PRODUCTION_EVIDENCE_SERVER_COMMAND,
  PRODUCTION_EVIDENCE_VALIDATOR_VERSION,
  PRODUCTION_EVIDENCE_VERIFICATION_MODES,
  PRODUCTION_EVIDENCE_VERIFICATION_RESULT_SCHEMA,
  PRODUCTION_EVIDENCE_WRAPPER_VERSION,
};

const DEFAULT_EVIDENCE_DIRECTORY = ".local/production-artifact-evidence";
const DEFAULT_MANIFEST_PATH = `${DEFAULT_EVIDENCE_DIRECTORY}/manifest.json`;
const DEFAULT_JOURNAL_PATH = PRODUCTION_EVIDENCE_JOURNAL_PATH;
const DEFAULT_INVENTORY_SNAPSHOT_PATH =
  `${DEFAULT_EVIDENCE_DIRECTORY}/artifact-inventory.json`;
const DEFAULT_REPORT_PATH = `${DEFAULT_EVIDENCE_DIRECTORY}/runtime-smoke.json`;
const DEFAULT_PHASE_TIMINGS_PATH =
  `${DEFAULT_EVIDENCE_DIRECTORY}/runtime-smoke-phases.json`;
const DEFAULT_UPLOAD_DIRECTORY = `${DEFAULT_EVIDENCE_DIRECTORY}/upload`;
const DEFAULT_BUNDLE_PATH = `${DEFAULT_UPLOAD_DIRECTORY}/ch0016-ch0017-evidence-bundle.tar.gz`;
const RUNTIME_SMOKE_COMMAND =
  "npx playwright test tests/e2e/00-runtime-smoke.spec.ts --project=chromium";
const EXPECTED_RUNTIME_FAILURE_ISSUE_PATTERNS = Object.freeze([
  /test process exited nonzero$/,
  /required test failed: tests\/e2e\/00-runtime-smoke\.spec\.ts :: furnished template remains stable without a render loop :: chromium$/,
  /aggregate report contains failures$/,
]);
const ARTIFACT_ROOTS = [".next", "public"];
const ARTIFACT_EXCLUSIONS = [
  ".next/cache",
  ".next/dev",
  ".next/diagnostics",
  ".next/trace",
];
const REQUIRED_ARTIFACT_PATHS = [
  ".next/BUILD_ID",
  ".next/build-manifest.json",
  ".next/required-server-files.json",
  ".next/server",
  ".next/static",
  "public",
];
export const FLOOR_PLAN_ROUTE_NFT_PATHS = Object.freeze([
  ".next/server/app/api/admin/floor-plan-imports/[id]/construction-sources/route.js.nft.json",
  ".next/server/app/api/admin/floor-plan-imports/[id]/supplementary-sources/route.js.nft.json",
  ".next/server/app/api/floor-plan-imports/[id]/process/route.js.nft.json",
]);
const REJECTED_FLOOR_PLAN_ROUTE_TRACE_SOURCES = Object.freeze([
  "scripts/test-required-test-truthfulness.mjs",
  "scripts/test-production-artifact-evidence.mjs",
]);
const PRODUCTION_ENVIRONMENTS = new Set(["staging", "production"]);
const CANONICAL_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const INFLUENTIAL_ENVIRONMENT_FILES = [
  ".env",
  ".env.local",
  ".env.production",
  ".env.production.local",
];
const GENERATED_IGNORED_PATHS = [
  ".next",
  "node_modules",
  "app/generated/prisma",
  DEFAULT_EVIDENCE_DIRECTORY,
];
const DEVELOPMENT_ONLY_FLAGS = [
  "NEXT_PUBLIC_ENABLE_QA_HOOKS",
  "NEXT_PUBLIC_ENABLE_TEST_FIXTURES",
];
const SAFE_FEATURE_FLAGS = [
  "FEATURE_AI",
  "FEATURE_CABINETRY_STUDIO",
  "FEATURE_CHECKOUT",
  "FEATURE_CUSTOM_MILLWORK_STUDIO",
  "FEATURE_EMAIL",
  "NEXT_PUBLIC_FEATURE_CABINETRY_STUDIO",
  "NEXT_PUBLIC_FEATURE_CUSTOM_MILLWORK_STUDIO",
  "NEXT_PUBLIC_PAYWALL_FORCE_FALLBACK",
];
const REQUIRED_CONFIGURATION_SHAPE = [
  ["DATABASE_URL"],
  ["OPENAI_API_KEY"],
  ["SHOPIFY_STORE_DOMAIN"],
  ["SHOPIFY_STOREFRONT_ACCESS_TOKEN", "SHOPIFY_STOREFRONT_TOKEN"],
  ["POSTHOG_KEY", "NEXT_PUBLIC_POSTHOG_KEY"],
  ["STRIPE_SECRET_KEY"],
  ["STRIPE_WEBHOOK_SECRET"],
  ["STRIPE_PRICE_PRO_MONTHLY"],
  ["STRIPE_PRICE_PRO_YEARLY"],
  ["AUTH_SECRET"],
  ["GOOGLE_CLIENT_ID"],
  ["GOOGLE_CLIENT_SECRET"],
  ["APP_ORIGIN"],
  ["ADMIN_EMAILS"],
];
const SENSITIVE_ENVIRONMENT_NAME =
  /(SECRET|TOKEN|PASSWORD|PRIVATE_KEY|API_KEY|ACCESS_KEY|COOKIE|DATABASE_URL|AUTH_SECRET|CLIENT_SECRET)/i;
const SENSITIVE_MANIFEST_KEY =
  /(secret|token|password|private.?key|api.?key|access.?key|cookie|database.?url|credential)/i;
const REPOSITORY_EVIDENCE_STATEMENT =
  "Repository evidence only: a local production-mode Next.js artifact is not a Vercel, staging, or production deployment.";
const EXTERNAL_CONTROLS = [
  ["vercel", "Vercel", "Deployment project, build settings, aliases, and runtime configuration require platform evidence."],
  ["github", "GitHub", "Branch protection, required-check, workflow-permission, and artifact-retention settings require platform evidence."],
  ["oauth", "OAuth", "Provider application, redirect, and credential settings require provider evidence."],
  ["scheduler", "Scheduler", "Job enablement, target, identity, and cadence require scheduler evidence."],
  ["database", "Database", "Target identity, access policy, backup, and migration state require database-platform evidence."],
].map(([control, platform, reason]) => ({
  control,
  platform,
  status: "not_verified",
  reason,
}));

const VERIFICATION_MODE_CONFIG = Object.freeze({
  [PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT]: Object.freeze({
    standalone: false,
    testPolicy: "pre-runtime-optional",
    requireSemanticJournal: true,
    allowFailedRuntimeSmoke: false,
  }),
  [PRODUCTION_EVIDENCE_VERIFICATION_MODES.ARCHIVE_PREFLIGHT]: Object.freeze({
    standalone: true,
    testPolicy: "pre-runtime-optional",
    requireSemanticJournal: true,
    allowFailedRuntimeSmoke: false,
  }),
  [PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL]: Object.freeze({
    standalone: false,
    testPolicy: "runtime-required",
    requireSemanticJournal: true,
    allowFailedRuntimeSmoke: false,
  }),
  [PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_RUNTIME_FAILURE]:
    Object.freeze({
      standalone: false,
      testPolicy: "runtime-failure-required",
      requireSemanticJournal: true,
      allowFailedRuntimeSmoke: true,
    }),
  [PRODUCTION_EVIDENCE_VERIFICATION_MODES.STANDALONE_FINAL]: Object.freeze({
    standalone: true,
    testPolicy: "external-certification-required",
    requireSemanticJournal: false,
    allowFailedRuntimeSmoke: false,
  }),
});

function archivePreflightExpectedIdentity(environment) {
  return {
    candidateIdentifier:
      environment.PRODUCTION_EVIDENCE_EXPECTED_CANDIDATE_ID?.trim(),
    sourceCommitSha: environment.PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA?.trim(),
    sourceTreeSha: environment.PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA?.trim(),
    nextBuildId: environment.PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID?.trim(),
    artifactSha256:
      environment.PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256?.trim(),
    verifierSourceClosureSha256:
      environment.PRODUCTION_EVIDENCE_EXPECTED_VERIFIER_SOURCE_CLOSURE_SHA256?.trim(),
  };
}

function archivePreflightExpectedIdentityIssues(manifest, expectedIdentity) {
  const issues = [];
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(expectedIdentity?.candidateIdentifier ?? "")) {
    issues.push("archive preflight requires an exact expected candidate identifier");
  } else if (manifest.candidateIdentifier !== expectedIdentity.candidateIdentifier) {
    issues.push("archive preflight evidence belongs to another candidate");
  }
  if (!/^[0-9a-f]{40,64}$/i.test(expectedIdentity?.sourceCommitSha ?? "")) {
    issues.push("archive preflight requires an exact expected source commit SHA");
  } else if (manifest.source?.commitSha !== expectedIdentity.sourceCommitSha) {
    issues.push("archive preflight evidence belongs to another source commit");
  }
  if (!/^[0-9a-f]{40,64}$/i.test(expectedIdentity?.sourceTreeSha ?? "")) {
    issues.push("archive preflight requires an exact expected source tree SHA");
  } else if (manifest.source?.treeSha !== expectedIdentity.sourceTreeSha) {
    issues.push("archive preflight evidence belongs to another source tree");
  }
  if (
    typeof expectedIdentity?.nextBuildId !== "string" ||
    expectedIdentity.nextBuildId.length === 0
  ) {
    issues.push("archive preflight requires an exact expected Build ID");
  } else if (manifest.build?.nextBuildId !== expectedIdentity.nextBuildId) {
    issues.push("archive preflight evidence belongs to another Build ID");
  }
  if (!/^[0-9a-f]{64}$/.test(expectedIdentity?.artifactSha256 ?? "")) {
    issues.push("archive preflight requires an exact expected artifact SHA-256");
  } else if (manifest.artifact?.sha256 !== expectedIdentity.artifactSha256) {
    issues.push("archive preflight evidence belongs to another artifact");
  }
  if (
    !/^[0-9a-f]{64}$/.test(
      expectedIdentity?.verifierSourceClosureSha256 ?? "",
    )
  ) {
    issues.push(
      "archive preflight requires an exact expected verifier source closure SHA-256",
    );
  }
  return issues;
}

function archivePreflightSourceIdentityIssues(source) {
  return exactKeys(source, [
    "commitSha",
    "treeSha",
    "branch",
    "sourceRef",
    "trackedClean",
    "untrackedClean",
    "trackedChanges",
    "untrackedFiles",
    "ignoredInfluentialFiles",
    "influentialEnvironmentFiles",
    "submodulesClean",
    "submodules",
  ])
    ? []
    : ["archive preflight source identity shape is malformed"];
}

function unsafeAbsolutePortableFields(value, currentPath = "evidence") {
  if (typeof value === "string") {
    return path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) ||
      value.startsWith("~/") ||
      value.startsWith("~\\")
      ? [currentPath]
      : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) =>
      unsafeAbsolutePortableFields(entry, `${currentPath}[${index}]`),
    );
  }
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) =>
    unsafeAbsolutePortableFields(nested, `${currentPath}.${key}`),
  );
}

async function inspectVerifierSourceClosure(repositoryRoot) {
  const closure = deriveProductionVerifierClosure(path.resolve(repositoryRoot));
  return {
    hashAlgorithm: "sha256",
    sha256: closure.closureSha256,
    edgeLedgerSha256: closure.edgeLedgerSha256,
    fileCount: closure.files.length,
    files: closure.files,
    edges: closure.edges,
  };
}

function archiveInventoryBindingIssues(manifest, snapshot) {
  const issues = [];
  const manifestDependencies = {
    packageManager: manifest.dependencies?.packageManager,
    lockfile: manifest.dependencies?.lockfile,
    installedLockfile: manifest.dependencies?.installedLockfile,
  };
  const {
    floorPlanRouteNftContract: manifestFloorPlanRouteNftContract,
    ...manifestArtifact
  } = manifest.artifact ?? {};
  const { nextBuildId: snapshotNextBuildId, ...snapshotArtifact } =
    snapshot.artifact ?? {};
  if (
    JSON.stringify(manifestDependencies) !== JSON.stringify(snapshot.dependencies) ||
    JSON.stringify(manifestArtifact) !== JSON.stringify(snapshotArtifact) ||
    manifest.build?.nextBuildId !== snapshotNextBuildId ||
    JSON.stringify(manifestFloorPlanRouteNftContract) !==
      JSON.stringify(snapshot.floorPlanRouteNftContract)
  ) {
    issues.push("bound artifact inventory snapshot does not match the manifest");
  }
  return issues;
}

function archivePreflightVerificationResult(manifest, semanticJournal, verifierClosure) {
  return {
    schema: PRODUCTION_EVIDENCE_VERIFICATION_RESULT_SCHEMA,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.ARCHIVE_PREFLIGHT,
    preflightPassed: true,
    certificationComplete: false,
    runtimeEvidenceRequired: true,
    finalStandaloneVerificationRequired: true,
    candidateIdentifier: manifest.candidateIdentifier,
    source: {
      commitSha: manifest.source.commitSha,
      treeSha: manifest.source.treeSha,
    },
    artifact: {
      nextBuildId: manifest.build.nextBuildId,
      sha256: manifest.artifact.sha256,
      fileCount: manifest.artifact.fileCount,
      bytes: manifest.artifact.bytes,
    },
    semanticJournal: {
      schema: semanticJournal.schema,
      version: semanticJournal.version,
      runNonce: semanticJournal.runNonce,
    },
    verifierSourceClosure: verifierClosure,
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filePath) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) digest.update(chunk);
  return digest.digest("hex");
}

function canonicalManifestBytes(manifest) {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join("/");
}

export function comparePortablePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveRepositoryPath(repositoryRoot, relativePath, description) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${description} must be a non-empty repository-relative path.`);
  }
  const root = path.resolve(repositoryRoot);
  const target = path.resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${description} must remain inside the repository.`);
  }
  return target;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      result.stderr?.trim() ||
        result.stdout?.trim() ||
        `${command} ${args.join(" ")} failed with status ${result.status}`,
    );
  }
  return result;
}

function git(repositoryRoot, args, { trim = true, allowFailure = false } = {}) {
  const result = run("git", args, {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"],
    allowFailure,
  });
  if (result.status !== 0) return null;
  return trim ? result.stdout.trim() : result.stdout;
}

function parseStatus(repositoryRoot) {
  const output = git(
    repositoryRoot,
    ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
    { trim: false },
  );
  if (output === null) throw new Error("Unable to inspect the Git working tree.");
  const tracked = [];
  const untracked = [];
  const records = output.split("\0").filter(Boolean);
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const code = record.slice(0, 2);
    const filePath = normalizeRelativePath(record.slice(3));
    if (code === "??") untracked.push(filePath);
    else tracked.push(`${code} ${filePath}`);
    if (code.includes("R") || code.includes("C")) index += 1;
  }
  return { tracked, untracked };
}

function inspectSubmodules(repositoryRoot) {
  const output = git(repositoryRoot, ["submodule", "status", "--recursive"], {
    allowFailure: true,
  });
  if (output === null) return { clean: false, entries: [] };
  const entries = output ? output.split("\n") : [];
  return {
    clean: entries.every((entry) => entry.startsWith(" ")),
    entries,
  };
}

function generatedIgnoredPath(relativePath) {
  return (
    GENERATED_IGNORED_PATHS.some(
      (generatedPath) =>
        relativePath === generatedPath || relativePath.startsWith(`${generatedPath}/`),
    ) ||
    relativePath === "next-env.d.ts" ||
    relativePath.endsWith(".tsbuildinfo")
  );
}

function inspectIgnoredInfluentialFiles(repositoryRoot) {
  const output = git(
    repositoryRoot,
    ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"],
    { trim: false },
  );
  if (output === null) throw new Error("Unable to inspect ignored build inputs.");
  return output
    .split("\0")
    .filter(Boolean)
    .map(normalizeRelativePath)
    .filter((relativePath) => !generatedIgnoredPath(relativePath))
    .sort(comparePortablePaths);
}

export function inspectSourceIdentity(repositoryRoot) {
  const status = parseStatus(repositoryRoot);
  const submodules = inspectSubmodules(repositoryRoot);
  const ignoredInfluentialFiles = inspectIgnoredInfluentialFiles(repositoryRoot);
  const influentialEnvironmentFiles = INFLUENTIAL_ENVIRONMENT_FILES.filter(
    (relativePath) => existsSync(path.join(repositoryRoot, relativePath)),
  );
  const commitSha = git(repositoryRoot, ["rev-parse", "HEAD"]);
  if (!commitSha || !/^[0-9a-f]{40,64}$/i.test(commitSha)) {
    throw new Error("Unable to resolve the full source commit SHA.");
  }
  const treeSha = git(repositoryRoot, ["rev-parse", "HEAD^{tree}"]);
  if (!treeSha || !/^[0-9a-f]{40,64}$/i.test(treeSha)) {
    throw new Error("Unable to resolve the full source tree SHA.");
  }
  return {
    commitSha,
    treeSha,
    branch: git(repositoryRoot, ["branch", "--show-current"]) || null,
    sourceRef: git(repositoryRoot, ["describe", "--always", "--exact-match", "--tags"], {
      allowFailure: true,
    }),
    trackedClean: status.tracked.length === 0,
    untrackedClean: status.untracked.length === 0,
    trackedChanges: status.tracked,
    untrackedFiles: status.untracked,
    ignoredInfluentialFiles,
    influentialEnvironmentFiles,
    submodulesClean: submodules.clean,
    submodules: submodules.entries,
  };
}

function sourceIssues(source, currentSource = source) {
  const issues = [];
  if (!currentSource.trackedClean) issues.push("working tree is not clean (tracked changes are present)");
  if (!currentSource.untrackedClean) issues.push("untracked source files are present");
  if (currentSource.ignoredInfluentialFiles.length > 0) {
    issues.push(
      `ignored files could influence the build: ${currentSource.ignoredInfluentialFiles.join(", ")}`,
    );
  }
  if (currentSource.influentialEnvironmentFiles.length > 0) {
    issues.push(
      `influential local environment files are present: ${currentSource.influentialEnvironmentFiles.join(", ")}`,
    );
  }
  if (!currentSource.submodulesClean) issues.push("submodule state is not clean and resolved");
  if (source.commitSha !== currentSource.commitSha) issues.push("source commit does not match HEAD");
  if (source.treeSha !== currentSource.treeSha) issues.push("source tree does not match HEAD");
  return issues;
}

function artifactPathExcluded(relativePath) {
  return ARTIFACT_EXCLUSIONS.some(
    (excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}/`),
  );
}

function listArtifactPaths(repositoryRoot) {
  const paths = [];
  function visit(absolutePath, relativePath) {
    if (artifactPathExcluded(relativePath)) return;
    const metadata = lstatSync(absolutePath);
    if (metadata.isDirectory()) {
      for (const name of readdirSync(absolutePath).sort(comparePortablePaths)) {
        visit(path.join(absolutePath, name), `${relativePath}/${name}`);
      }
      return;
    }
    if (!metadata.isFile() && !metadata.isSymbolicLink()) {
      throw new Error(`Unsupported production artifact entry: ${relativePath}`);
    }
    paths.push({ absolutePath, relativePath, metadata });
  }

  for (const requiredPath of REQUIRED_ARTIFACT_PATHS) {
    if (!existsSync(path.join(repositoryRoot, requiredPath))) {
      throw new Error(`Required production artifact path is missing: ${requiredPath}`);
    }
  }
  for (const artifactRoot of ARTIFACT_ROOTS) {
    visit(path.join(repositoryRoot, artifactRoot), artifactRoot);
  }
  return paths;
}

function portableTracePath(repositoryRoot, resolvedPath) {
  const relativePath = path.relative(repositoryRoot, resolvedPath);
  if (relativePath === "" || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return "<outside-repository>";
  }
  return normalizeRelativePath(relativePath);
}

function containedRealPath(repositoryRoot, absolutePath, description) {
  let realPath;
  try {
    realPath = realpathSync(absolutePath);
  } catch {
    throw new Error(`${description} cannot be resolved.`);
  }
  if (portableTracePath(realpathSync(repositoryRoot), realPath) === "<outside-repository>") {
    throw new Error(`${description} escapes the repository.`);
  }
  const relativeRealPath = portableTracePath(realpathSync(repositoryRoot), realPath);
  if (tracePathProhibited(relativeRealPath)) {
    throw new Error(`${description} targets prohibited path ${relativeRealPath}.`);
  }
  return realPath;
}

async function hashContainedDirectory(repositoryRoot, directoryPath) {
  const records = [];
  const visit = async (absolutePath, relativePath, ancestors) => {
    const metadata = lstatSync(absolutePath);
    if (metadata.isSymbolicLink()) {
      const link = readlinkSync(absolutePath);
      const targetPath = containedRealPath(
        repositoryRoot,
        absolutePath,
        `Traced directory symlink ${relativePath}`,
      );
      const target = portableTracePath(realpathSync(repositoryRoot), targetPath);
      records.push({
        path: relativePath,
        type: "symlink",
        bytes: Buffer.byteLength(link),
        sha256: sha256(link),
        target,
      });
      const targetMetadata = statSync(targetPath);
      if (targetMetadata.isDirectory()) {
        if (ancestors.has(targetPath)) {
          throw new Error(`Traced directory symlink cycle at ${relativePath}.`);
        }
        const nextAncestors = new Set(ancestors).add(targetPath);
        for (const name of readdirSync(targetPath).sort(comparePortablePaths)) {
          await visit(path.join(targetPath, name), `${relativePath}/${name}`, nextAncestors);
        }
      } else if (targetMetadata.isFile()) {
        records.push({
          path: `${relativePath}@target`,
          type: "file",
          bytes: targetMetadata.size,
          sha256: await sha256File(targetPath),
        });
      } else {
        throw new Error(`Unsupported traced directory symlink target: ${relativePath}`);
      }
      return;
    }
    if (metadata.isDirectory()) {
      const realDirectory = containedRealPath(
        repositoryRoot,
        absolutePath,
        `Traced directory ${relativePath || "."}`,
      );
      if (ancestors.has(realDirectory)) {
        throw new Error(`Traced directory cycle at ${relativePath || "."}.`);
      }
      const nextAncestors = new Set(ancestors).add(realDirectory);
      for (const name of readdirSync(absolutePath).sort(comparePortablePaths)) {
        await visit(
          path.join(absolutePath, name),
          relativePath ? `${relativePath}/${name}` : name,
          nextAncestors,
        );
      }
      return;
    }
    if (!metadata.isFile()) {
      throw new Error(`Unsupported traced directory entry: ${relativePath}`);
    }
    records.push({
      path: relativePath,
      type: "file",
      bytes: metadata.size,
      sha256: await sha256File(absolutePath),
    });
  };

  await visit(directoryPath, "", new Set());
  const digestInput = records
    .map(
      (record) =>
        `${record.type}  ${record.sha256}  ${record.bytes}  ${record.path}  ${record.target ?? "-"}\n`,
    )
    .join("");
  return {
    sha256: sha256(digestInput),
    bytes: records.reduce((sum, record) => sum + record.bytes, 0),
    fileCount: records.length,
  };
}

function tracePathProhibited(relativePath) {
  if (relativePath === "<outside-repository>") return true;
  return (
    relativePath === ".git" ||
    relativePath.startsWith(".git/") ||
    relativePath === ".local" ||
    relativePath.startsWith(".local/") ||
    relativePath === ".vercel" ||
    relativePath.startsWith(".vercel/") ||
    relativePath === "release-evidence-private" ||
    relativePath.startsWith("release-evidence-private/") ||
    relativePath === "test-results" ||
    relativePath.startsWith("test-results/") ||
    relativePath === ".env" ||
    relativePath.startsWith(".env.")
  );
}

async function inspectTraceInventory(repositoryRoot, artifactFiles) {
  const traceFiles = artifactFiles.filter((file) => file.path.endsWith(".nft.json"));
  let referenceCount = 0;
  const missingPaths = new Set();
  const prohibitedPaths = new Set();
  const closureFiles = new Map();
  const rootCounts = { artifact: 0, public: 0, nodeModules: 0, repository: 0 };
  for (const traceFile of traceFiles) {
    let data;
    try {
      data = JSON.parse(readFileSync(path.join(repositoryRoot, traceFile.path), "utf8"));
    } catch {
      prohibitedPaths.add(`${traceFile.path}:invalid-json`);
      continue;
    }
    if (!Array.isArray(data.files)) {
      prohibitedPaths.add(`${traceFile.path}:missing-files-array`);
      continue;
    }
    for (const reference of data.files) {
      referenceCount += 1;
      if (typeof reference !== "string" || reference.includes("\0")) {
        prohibitedPaths.add(`${traceFile.path}:invalid-reference`);
        continue;
      }
      const resolvedPath = path.resolve(
        repositoryRoot,
        path.dirname(traceFile.path),
        reference,
      );
      const relativePath = portableTracePath(repositoryRoot, resolvedPath);
      if (!existsSync(resolvedPath)) missingPaths.add(relativePath);
      if (tracePathProhibited(relativePath)) prohibitedPaths.add(relativePath);
      if (existsSync(resolvedPath) && !tracePathProhibited(relativePath)) {
        let closurePath;
        try {
          closurePath = containedRealPath(
            repositoryRoot,
            resolvedPath,
            `Traced output ${relativePath}`,
          );
        } catch {
          prohibitedPaths.add(`${relativePath}:symlink-target-outside-repository`);
          continue;
        }
        const metadata = statSync(closurePath);
        if (!metadata.isFile() && !metadata.isDirectory()) {
          prohibitedPaths.add(`${relativePath}:unsupported-entry`);
        } else {
          closureFiles.set(relativePath, closurePath);
        }
      }
      if (relativePath.startsWith(".next/")) rootCounts.artifact += 1;
      else if (relativePath.startsWith("public/")) rootCounts.public += 1;
      else if (relativePath.startsWith("node_modules/")) rootCounts.nodeModules += 1;
      else rootCounts.repository += 1;
    }
  }
  const closure = [];
  let closureBytes = 0;
  for (const [relativePath, resolvedPath] of [...closureFiles.entries()].sort(
    ([left], [right]) => comparePortablePaths(left, right),
  )) {
    const metadata = statSync(resolvedPath);
    const identity = metadata.isDirectory()
      ? await hashContainedDirectory(repositoryRoot, resolvedPath)
      : { bytes: metadata.size, fileCount: 1, sha256: await sha256File(resolvedPath) };
    closureBytes += identity.bytes;
    closure.push({
      path: relativePath,
      type: metadata.isDirectory() ? "directory" : "file",
      ...identity,
    });
  }
  const closureDigestInput = closure
    .map(
      (entry) =>
        `${entry.type}  ${entry.sha256}  ${entry.bytes}  ${entry.fileCount}  ${entry.path}\n`,
    )
    .join("");
  return {
    traceFileCount: traceFiles.length,
    referenceCount,
    missingPaths: [...missingPaths].sort(),
    prohibitedPaths: [...prohibitedPaths].sort(),
    referencedRootCounts: rootCounts,
    closureSha256: sha256(closureDigestInput),
    closureEntryCount: closure.length,
    closureFileCount: closure.reduce((sum, entry) => sum + entry.fileCount, 0),
    closureBytes,
  };
}

export function inspectFloorPlanRouteNftContract(repositoryRoot) {
  const root = path.resolve(repositoryRoot);
  const issues = [];
  const rejectedSourceSet = new Set(REJECTED_FLOOR_PLAN_ROUTE_TRACE_SOURCES);
  const targetResults = [];
  const assetsRoot = path.join(root, "public", "assets");
  if (!existsSync(assetsRoot) || !statSync(assetsRoot).isDirectory()) {
    issues.push("public/assets: canonical runtime asset root is missing");
  } else {
    try {
      containedRealPath(root, assetsRoot, "Floor Plan public asset root");
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  for (const nftPath of FLOOR_PLAN_ROUTE_NFT_PATHS) {
    const nftAbsolutePath = path.join(root, nftPath);
    const routeChunkPath = nftPath.slice(0, -".nft.json".length);
    const routeChunkAbsolutePath = path.join(root, routeChunkPath);
    if (!existsSync(routeChunkAbsolutePath) || !statSync(routeChunkAbsolutePath).isFile()) {
      issues.push(`${nftPath} -> ${routeChunkPath}: required generated route chunk is missing`);
    } else {
      try {
        containedRealPath(root, routeChunkAbsolutePath, `Floor Plan route chunk ${routeChunkPath}`);
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    if (!existsSync(nftAbsolutePath) || !statSync(nftAbsolutePath).isFile()) {
      issues.push(`${nftPath}: required raw NFT manifest is missing`);
      continue;
    }
    try {
      containedRealPath(root, nftAbsolutePath, `Floor Plan raw NFT manifest ${nftPath}`);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      continue;
    }

    let manifest;
    try {
      manifest = JSON.parse(readFileSync(nftAbsolutePath, "utf8"));
    } catch {
      issues.push(`${nftPath}: raw NFT manifest is invalid JSON`);
      continue;
    }
    if (!Array.isArray(manifest.files)) {
      issues.push(`${nftPath}: raw NFT manifest files array is missing`);
      continue;
    }

    let publicAssetReferenceCount = 0;
    const normalizedPaths = new Set();
    for (const reference of manifest.files) {
      if (
        typeof reference !== "string" ||
        reference.includes("\0") ||
        reference.includes("\\") ||
        path.isAbsolute(reference) ||
        path.win32.isAbsolute(reference)
      ) {
        issues.push(`${nftPath} -> <invalid-reference>: NFT path is malformed`);
        continue;
      }
      const resolvedPath = path.resolve(root, path.dirname(nftPath), reference);
      const relativePath = portableTracePath(root, resolvedPath);
      const edge = `${nftPath} -> ${relativePath}`;
      normalizedPaths.add(relativePath);
      if (tracePathProhibited(relativePath)) {
        issues.push(`${edge}: NFT path is outside the permitted repository closure`);
        continue;
      }
      if (!existsSync(resolvedPath)) {
        issues.push(`${edge}: NFT path is missing`);
        continue;
      }
      let realRelativePath;
      try {
        const realPath = containedRealPath(root, resolvedPath, `Floor Plan NFT edge ${edge}`);
        realRelativePath = portableTracePath(realpathSync(root), realPath);
        const metadata = statSync(realPath);
        if (!metadata.isFile() && !metadata.isDirectory()) {
          issues.push(`${edge}: NFT path has an unsupported entry type`);
          continue;
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (
        rejectedSourceSet.has(relativePath) ||
        rejectedSourceSet.has(realRelativePath) ||
        /^scripts\/test-[^/]+/.test(relativePath) ||
        /^scripts\/test-[^/]+/.test(realRelativePath) ||
        relativePath === "tests" ||
        relativePath.startsWith("tests/") ||
        realRelativePath === "tests" ||
        realRelativePath.startsWith("tests/")
      ) {
        issues.push(
          `${edge}${realRelativePath === relativePath ? "" : ` -> ${realRelativePath}`}: production route NFT references a test source`,
        );
      }
      if (
        relativePath.startsWith("public/assets/floor-plans/") &&
        realRelativePath.startsWith("public/assets/floor-plans/")
      ) {
        publicAssetReferenceCount += 1;
      } else if (relativePath.startsWith("public/assets/floor-plans/")) {
        issues.push(`${edge} -> ${realRelativePath}: public asset resolves outside its canonical root`);
      }
    }
    if (publicAssetReferenceCount === 0) {
      issues.push(`${nftPath}: no canonical public/assets/floor-plans runtime input is referenced`);
    }
    targetResults.push({
      nftPath,
      routeChunkPath,
      referenceCount: manifest.files.length,
      uniqueNormalizedPathCount: normalizedPaths.size,
      publicAssetReferenceCount,
    });
  }

  if (issues.length > 0) {
    throw new Error(`Floor Plan route NFT contract failed:\n${[...new Set(issues)].join("\n")}`);
  }
  return {
    schema: "interior-ai.floor-plan-route-nft-contract.v1",
    targetCount: targetResults.length,
    rejectedSourceEdges: 0,
    testSourceEdges: 0,
    missingPaths: 0,
    prohibitedPaths: 0,
    targets: targetResults,
  };
}

function recordedFloorPlanRouteNftContractSafe(contract) {
  if (
    contract?.schema !== "interior-ai.floor-plan-route-nft-contract.v1" ||
    contract?.targetCount !== FLOOR_PLAN_ROUTE_NFT_PATHS.length ||
    contract?.rejectedSourceEdges !== 0 ||
    contract?.testSourceEdges !== 0 ||
    contract?.missingPaths !== 0 ||
    contract?.prohibitedPaths !== 0 ||
    !Array.isArray(contract?.targets) ||
    contract.targets.length !== FLOOR_PLAN_ROUTE_NFT_PATHS.length
  ) {
    return false;
  }
  return contract.targets.every((target, index) => {
    const nftPath = FLOOR_PLAN_ROUTE_NFT_PATHS[index];
    return target?.nftPath === nftPath &&
      target?.routeChunkPath === nftPath.slice(0, -".nft.json".length) &&
      Number.isSafeInteger(target?.referenceCount) &&
      target.referenceCount > 0 &&
      Number.isSafeInteger(target?.uniqueNormalizedPathCount) &&
      target.uniqueNormalizedPathCount > 0 &&
      target.uniqueNormalizedPathCount <= target.referenceCount &&
      Number.isSafeInteger(target?.publicAssetReferenceCount) &&
      target.publicAssetReferenceCount > 0 &&
      target.publicAssetReferenceCount <= target.referenceCount;
  });
}

export async function inspectProductionArtifact(
  repositoryRoot,
  { requireSymlinkTargets = true, inspectTraces = true } = {},
) {
  const entries = listArtifactPaths(repositoryRoot);
  const files = [];
  let bytes = 0;
  for (const entry of entries) {
    const type = entry.metadata.isSymbolicLink() ? "symlink" : "file";
    const content = type === "symlink" ? Buffer.from(readlinkSync(entry.absolutePath), "utf8") : null;
    let target;
    if (type === "symlink") {
      if (requireSymlinkTargets) {
        target = portableTracePath(
          realpathSync(repositoryRoot),
          containedRealPath(
            repositoryRoot,
            entry.absolutePath,
            `Production artifact symlink ${entry.relativePath}`,
          ),
        );
      } else {
        target = portableTracePath(
          repositoryRoot,
          path.resolve(path.dirname(entry.absolutePath), readlinkSync(entry.absolutePath)),
        );
        if (tracePathProhibited(target)) {
          throw new Error(
            `Production artifact symlink ${entry.relativePath} targets prohibited path ${target}.`,
          );
        }
      }
    }
    const digest = content ? sha256(content) : await sha256File(entry.absolutePath);
    const size = content ? content.byteLength : statSync(entry.absolutePath).size;
    if (!content && size !== entry.metadata.size) {
      throw new Error(`Production artifact changed while hashing: ${entry.relativePath}`);
    }
    bytes += size;
    files.push({
      path: entry.relativePath,
      type,
      bytes: size,
      sha256: digest,
      ...(target ? { target } : {}),
    });
  }
  const digestInput = files
    .map(
      (file) =>
        `${file.type}  ${file.sha256}  ${file.bytes}  ${file.path}  ${file.target ?? "-"}\n`,
    )
    .join("");
  const nextBuildId = readFileSync(path.join(repositoryRoot, ".next/BUILD_ID"), "utf8").trim();
  if (!nextBuildId) throw new Error("The Next.js BUILD_ID is empty.");
  const traceInventory = inspectTraces
    ? await inspectTraceInventory(repositoryRoot, files)
    : null;
  return {
    roots: [...ARTIFACT_ROOTS],
    excludedMutablePaths: [...ARTIFACT_EXCLUSIONS],
    hashAlgorithm: "sha256",
    sha256: sha256(digestInput),
    fileCount: files.length,
    bytes,
    files,
    traceInventory,
    nextBuildId,
  };
}

async function inspectDependencyIdentity(repositoryRoot) {
  const packagePath = path.join(repositoryRoot, "package.json");
  const lockfilePath = path.join(repositoryRoot, "package-lock.json");
  const installedLockfilePath = path.join(repositoryRoot, "node_modules/.package-lock.json");
  if (!existsSync(packagePath)) throw new Error("package.json is missing.");
  if (!existsSync(lockfilePath)) throw new Error("package-lock.json is missing.");
  if (!existsSync(installedLockfilePath)) {
    throw new Error("node_modules/.package-lock.json is missing; npm ci identity is unavailable.");
  }
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  if (!/^npm@\d+\.\d+\.\d+$/.test(packageJson.packageManager ?? "")) {
    throw new Error("package.json must declare an exact npm packageManager version.");
  }
  return {
    packageManager: packageJson.packageManager,
    lockfile: {
      path: "package-lock.json",
      sha256: await sha256File(lockfilePath),
      version: JSON.parse(readFileSync(lockfilePath, "utf8")).lockfileVersion,
    },
    installedLockfile: {
      path: "node_modules/.package-lock.json",
      sha256: await sha256File(installedLockfilePath),
    },
  };
}

function flagEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function canonicalUtcTimestamp(value) {
  return (
    typeof value === "string" &&
    CANONICAL_UTC_TIMESTAMP.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
}

function atomicWriteBytes(absolutePath, bytes) {
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporaryPath, absolutePath);
    const directoryDescriptor = openSync(path.dirname(absolutePath), "r");
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    throw error;
  }
}

function semanticJournalPath(repositoryRoot, journalPath = DEFAULT_JOURNAL_PATH) {
  return resolveRepositoryPath(repositoryRoot, journalPath, "semantic event journal path");
}

function worktreeIdentitySha256(repositoryRoot) {
  return sha256(`interior-ai-worktree\0${realpathSync(repositoryRoot)}`);
}

async function productionEvidenceWrapperIdentity(repositoryRoot) {
  const relativePath = "scripts/production-artifact-evidence.mjs";
  return {
    version: PRODUCTION_EVIDENCE_WRAPPER_VERSION,
    path: relativePath,
    sha256: await sha256File(path.join(repositoryRoot, relativePath)),
  };
}

function pendingChildEvent() {
  return {
    status: "pending",
    startedAt: null,
    completedAt: null,
    exitCode: null,
    signal: null,
    failureKind: null,
  };
}

function pendingInventoryEvent() {
  return {
    status: "pending",
    startedAt: null,
    completedAt: null,
    failureKind: null,
  };
}

function exactKeys(value, expected) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value)) === JSON.stringify(expected)
  );
}

function childEventIssues(name, event) {
  const issues = [];
  if (!exactKeys(event, ["status", "startedAt", "completedAt", "exitCode", "signal", "failureKind"])) {
    return [`semantic journal ${name} event shape is malformed`];
  }
  const terminal = event.status === "succeeded" || event.status === "failed";
  if (!["pending", "running", "succeeded", "failed"].includes(event.status)) {
    issues.push(`semantic journal ${name} status is invalid`);
  }
  if (event.status === "pending" && [event.startedAt, event.completedAt, event.exitCode, event.signal, event.failureKind].some((value) => value !== null)) {
    issues.push(`semantic journal ${name} pending event contains false execution fields`);
  }
  if (event.status === "running" && (!canonicalUtcTimestamp(event.startedAt) || event.completedAt !== null || event.exitCode !== null || event.signal !== null || event.failureKind !== null)) {
    issues.push(`semantic journal ${name} running event is incomplete or contradictory`);
  }
  if (terminal && (!canonicalUtcTimestamp(event.startedAt) || !canonicalUtcTimestamp(event.completedAt))) {
    issues.push(`semantic journal ${name} terminal timestamps are invalid`);
  }
  if (event.status === "succeeded" && (event.exitCode !== 0 || event.signal !== null || event.failureKind !== null)) {
    issues.push(`semantic journal ${name} success does not have exit code zero`);
  }
  if (event.status === "failed") {
    const exitAvailable =
      Number.isSafeInteger(event.exitCode) &&
      event.exitCode !== 0 &&
      event.signal === null &&
      event.failureKind === "child_exit_nonzero";
    const signalAvailable =
      event.exitCode === null &&
      typeof event.signal === "string" &&
      /^SIG[A-Z0-9]+$/.test(event.signal) &&
      event.failureKind === "child_signal";
    const dispatchFailed =
      event.exitCode === null &&
      event.signal === null &&
      event.failureKind === "dispatch_error";
    if (!exitAvailable && !signalAvailable && !dispatchFailed) {
      issues.push(`semantic journal ${name} failure does not retain truthful child status`);
    }
  }
  return issues;
}

function inventoryEventIssues(event) {
  if (!exactKeys(event, ["status", "startedAt", "completedAt", "failureKind"])) {
    return ["semantic journal artifact inventory event shape is malformed"];
  }
  const issues = [];
  if (!["pending", "running", "succeeded", "failed"].includes(event.status)) {
    issues.push("semantic journal artifact inventory status is invalid");
  }
  if (event.status === "pending" && [event.startedAt, event.completedAt, event.failureKind].some((value) => value !== null)) {
    issues.push("semantic journal pending artifact inventory contains false execution fields");
  }
  if (event.status === "running" && (!canonicalUtcTimestamp(event.startedAt) || event.completedAt !== null || event.failureKind !== null)) {
    issues.push("semantic journal running artifact inventory is incomplete or contradictory");
  }
  if (["succeeded", "failed"].includes(event.status) && (!canonicalUtcTimestamp(event.startedAt) || !canonicalUtcTimestamp(event.completedAt))) {
    issues.push("semantic journal artifact inventory terminal timestamps are invalid");
  }
  if (event.status === "succeeded" && event.failureKind !== null) {
    issues.push("semantic journal successful artifact inventory records a failure");
  }
  if (event.status === "failed" && event.failureKind !== "inventory_error") {
    issues.push("semantic journal artifact inventory failure kind is invalid");
  }
  return issues;
}

function expectedJournalCompletionState(journal) {
  if (journal.manifest?.status === "created") return "manifest_created";
  const inventoryStatus = journal.events?.artifactInventory?.status;
  if (inventoryStatus !== "pending") return `artifact_inventory_${inventoryStatus}`;
  const buildStatus = journal.events?.build?.status;
  if (buildStatus !== "pending") return `build_${buildStatus}`;
  const generatedStatus = journal.events?.generatedSourceCheck?.status;
  if (generatedStatus !== "pending") return `generated_source_check_${generatedStatus}`;
  const installStatus = journal.events?.dependencyInstall?.status;
  if (installStatus !== "pending") return `dependency_install_${installStatus}`;
  return "initialized";
}

function journalTimeline(journal) {
  return [
    ["cycleStartedAt", journal.events?.cycleStartedAt],
    ["installStartedAt", journal.events?.dependencyInstall?.startedAt],
    ["installCompletedAt", journal.events?.dependencyInstall?.completedAt],
    ["generatedSourceCheckStartedAt", journal.events?.generatedSourceCheck?.startedAt],
    ["generatedSourceCheckCompletedAt", journal.events?.generatedSourceCheck?.completedAt],
    ["buildStartedAt", journal.events?.build?.startedAt],
    ["buildCompletedAt", journal.events?.build?.completedAt],
    ["artifactInventoryStartedAt", journal.events?.artifactInventory?.startedAt],
    ["artifactInventoryCompletedAt", journal.events?.artifactInventory?.completedAt],
    ["manifestCreatedAt", journal.manifest?.createdAt],
  ].filter(([, value]) => value !== null && value !== undefined);
}

function journalBindingIssues(journal) {
  const issues = [];
  const binding = journal.bindings;
  if (!exactKeys(binding, ["artifactInventory", "nextBuildId", "artifactSha256"])) {
    return ["semantic journal output binding shape is malformed"];
  }
  if (journal.events.artifactInventory.status === "succeeded") {
    if (
      !exactKeys(binding.artifactInventory, ["path", "sha256"]) ||
      binding.artifactInventory.path !== DEFAULT_INVENTORY_SNAPSHOT_PATH ||
      !/^[0-9a-f]{64}$/.test(binding.artifactInventory.sha256 ?? "") ||
      typeof binding.nextBuildId !== "string" ||
      !binding.nextBuildId ||
      !/^[0-9a-f]{64}$/.test(binding.artifactSha256 ?? "")
    ) {
      issues.push("semantic journal completed artifact inventory binding is malformed");
    }
  } else if (binding.artifactInventory !== null || binding.nextBuildId !== null || binding.artifactSha256 !== null) {
    issues.push("semantic journal exposes artifact bindings before inventory completion");
  }
  return issues;
}

function journalDiagnosticsIssues(diagnostics) {
  if (!exactKeys(diagnostics, ["filesystemMetadata"]) || !Array.isArray(diagnostics.filesystemMetadata)) {
    return ["semantic journal diagnostic metadata shape is malformed"];
  }
  const issues = [];
  for (const entry of diagnostics.filesystemMetadata) {
    if (!exactKeys(entry, ["label", "birthtime", "ctime", "mtime"])) {
      issues.push("semantic journal filesystem diagnostics are malformed");
      continue;
    }
    if (!/^[a-z0-9][a-z0-9._-]{0,95}$/.test(entry.label ?? "")) {
      issues.push("semantic journal filesystem diagnostic label is unsafe");
    }
    for (const value of [entry.birthtime, entry.ctime, entry.mtime]) {
      if (value !== null && !canonicalUtcTimestamp(value)) {
        issues.push("semantic journal filesystem diagnostic timestamp is invalid");
      }
    }
  }
  return issues;
}

export function validateProductionEvidenceSemanticJournal(journal) {
  const issues = [];
  if (!exactKeys(journal, ["schema", "version", "runNonce", "candidateIdentifier", "source", "owner", "commands", "buildContract", "toolchain", "events", "bindings", "manifest", "completionState", "diagnostics"])) {
    return { valid: false, issues: ["semantic event journal shape is malformed"] };
  }
  if (
    journal.schema !== PRODUCTION_EVIDENCE_JOURNAL_SCHEMA ||
    journal.version !== PRODUCTION_EVIDENCE_JOURNAL_VERSION
  ) {
    issues.push("unsupported semantic event journal schema or version");
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(journal.runNonce ?? "")) {
    issues.push("semantic event journal run nonce is malformed");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(journal.candidateIdentifier ?? "")) {
    issues.push("semantic event journal candidate identity is malformed");
  }
  if (!exactKeys(journal.source, ["commitSha", "treeSha"]) || !/^[0-9a-f]{40,64}$/i.test(journal.source?.commitSha ?? "") || !/^[0-9a-f]{40,64}$/i.test(journal.source?.treeSha ?? "")) {
    issues.push("semantic event journal source binding is malformed");
  }
  if (!exactKeys(journal.owner, ["process", "worktreeIdentitySha256", "wrapper"]) || !exactKeys(journal.owner?.process, ["pid", "parentPid"]) || !Number.isSafeInteger(journal.owner?.process?.pid) || journal.owner.process.pid <= 0 || !Number.isSafeInteger(journal.owner.process.parentPid) || journal.owner.process.parentPid < 0 || !/^[0-9a-f]{64}$/.test(journal.owner?.worktreeIdentitySha256 ?? "") || !exactKeys(journal.owner?.wrapper, ["version", "path", "sha256"]) || journal.owner.wrapper.version !== PRODUCTION_EVIDENCE_WRAPPER_VERSION || journal.owner.wrapper.path !== "scripts/production-artifact-evidence.mjs" || !/^[0-9a-f]{64}$/.test(journal.owner.wrapper.sha256 ?? "")) {
    issues.push("semantic event journal owner binding is malformed");
  }
  if (!exactKeys(journal.commands, ["dependencyInstall", "generatedSourceCheck", "build"]) || journal.commands.dependencyInstall !== DEPENDENCY_INSTALL_COMMAND || journal.commands.generatedSourceCheck !== GENERATED_SOURCE_CHECK_COMMAND || journal.commands.build !== BUILD_COMMAND) {
    issues.push("semantic event journal command binding is not canonical");
  }
  if (!exactKeys(journal.buildContract, ["applicationEnvironment", "catalogStrictValidation"]) || !PRODUCTION_ENVIRONMENTS.has(journal.buildContract?.applicationEnvironment) || journal.buildContract?.catalogStrictValidation !== true) {
    issues.push("semantic event journal build contract is malformed");
  }
  if (!exactKeys(journal.toolchain, ["nodeVersion", "npmVersion"]) || typeof journal.toolchain.nodeVersion !== "string" || typeof journal.toolchain.npmVersion !== "string") {
    issues.push("semantic event journal toolchain binding is malformed");
  }
  if (!exactKeys(journal.events, ["cycleStartedAt", "buildWrapperStartedAt", "dependencyInstall", "generatedSourceCheck", "build", "artifactInventory"]) || !canonicalUtcTimestamp(journal.events?.cycleStartedAt) || !canonicalUtcTimestamp(journal.events?.buildWrapperStartedAt)) {
    issues.push("semantic event journal event envelope is malformed");
  } else {
    issues.push(...childEventIssues("dependency install", journal.events.dependencyInstall));
    issues.push(...childEventIssues("generated-source check", journal.events.generatedSourceCheck));
    issues.push(...childEventIssues("build", journal.events.build));
    issues.push(...inventoryEventIssues(journal.events.artifactInventory));
    if (Date.parse(journal.events.buildWrapperStartedAt) < Date.parse(journal.events.cycleStartedAt)) {
      issues.push("build wrapper start predates the evidence cycle");
    }
    if (
      canonicalUtcTimestamp(journal.events.build.startedAt) &&
      Date.parse(journal.events.buildWrapperStartedAt) > Date.parse(journal.events.build.startedAt)
    ) {
      issues.push("build wrapper start follows actual build dispatch");
    }
  }
  if (!exactKeys(journal.manifest, ["status", "createdAt"]) || !["pending", "created"].includes(journal.manifest?.status) || (journal.manifest.status === "pending" ? journal.manifest.createdAt !== null : !canonicalUtcTimestamp(journal.manifest.createdAt))) {
    issues.push("semantic event journal manifest state is malformed");
  }
  if (journal.events?.generatedSourceCheck?.status !== "pending" && journal.events?.dependencyInstall?.status !== "succeeded") {
    issues.push("generated-source check started before dependency installation succeeded");
  }
  if (journal.events?.build?.status !== "pending" && journal.events?.generatedSourceCheck?.status !== "succeeded") {
    issues.push("build started before generated-source verification succeeded");
  }
  if (journal.events?.artifactInventory?.status !== "pending" && journal.events?.build?.status !== "succeeded") {
    issues.push("artifact inventory started before the build succeeded");
  }
  if (journal.manifest?.status === "created" && journal.events?.artifactInventory?.status !== "succeeded") {
    issues.push("manifest was claimed before artifact inventory succeeded");
  }
  issues.push(...journalBindingIssues(journal));
  issues.push(...journalDiagnosticsIssues(journal.diagnostics));
  const timeline = journalTimeline(journal);
  if (timeline.some(([, value]) => !canonicalUtcTimestamp(value))) {
    issues.push("semantic event journal timestamps must use valid UTC ISO 8601 values");
  }
  for (let index = 1; index < timeline.length; index += 1) {
    if (Date.parse(timeline[index][1]) < Date.parse(timeline[index - 1][1])) {
      issues.push(`${timeline[index][0]} predates ${timeline[index - 1][0]}`);
    }
  }
  if (journal.completionState !== expectedJournalCompletionState(journal)) {
    issues.push("semantic event journal completion state is contradictory");
  }
  return { valid: issues.length === 0, issues };
}

function assertValidSemanticJournal(journal) {
  const validation = validateProductionEvidenceSemanticJournal(journal);
  if (!validation.valid) throw new Error(validation.issues.join("; "));
}

export function readProductionEvidenceSemanticJournal({
  repositoryRoot,
  journalPath = DEFAULT_JOURNAL_PATH,
}) {
  const absolutePath = semanticJournalPath(repositoryRoot, journalPath);
  if (!existsSync(absolutePath)) throw new Error("semantic event journal is missing");
  const bytes = readFileSync(absolutePath);
  let journal;
  try {
    journal = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("semantic event journal is not valid JSON");
  }
  if (!bytes.equals(canonicalJsonBytes(journal))) {
    throw new Error("semantic event journal is not in canonical JSON encoding");
  }
  assertValidSemanticJournal(journal);
  return journal;
}

function writeSemanticJournal(repositoryRoot, journalPath, journal) {
  assertValidSemanticJournal(journal);
  atomicWriteBytes(semanticJournalPath(repositoryRoot, journalPath), canonicalJsonBytes(journal));
}

function updateSemanticJournal({
  repositoryRoot,
  journalPath,
  expectedRunNonce,
  expectedOwnerProcess,
  mutate,
}) {
  const journal = readProductionEvidenceSemanticJournal({ repositoryRoot, journalPath });
  if (journal.runNonce !== expectedRunNonce) {
    throw new Error("semantic event journal run nonce mismatch");
  }
  if (
    expectedOwnerProcess &&
    JSON.stringify(journal.owner.process) !== JSON.stringify(expectedOwnerProcess)
  ) {
    throw new Error("semantic child event belongs to another executing process");
  }
  const updated = structuredClone(journal);
  mutate(updated);
  updated.completionState = expectedJournalCompletionState(updated);
  writeSemanticJournal(repositoryRoot, journalPath, updated);
  return updated;
}

export async function initializeProductionEvidenceSemanticJournal({
  repositoryRoot,
  journalPath = DEFAULT_JOURNAL_PATH,
  candidateIdentifier,
  source,
  buildContract,
  toolchain,
  clock = () => new Date().toISOString(),
  nonce = randomUUID(),
  processIdentity = { pid: process.pid, parentPid: process.ppid },
}) {
  const absolutePath = semanticJournalPath(repositoryRoot, journalPath);
  if (existsSync(absolutePath)) {
    throw new Error("semantic event journal path is not pristine");
  }
  const journal = {
    schema: PRODUCTION_EVIDENCE_JOURNAL_SCHEMA,
    version: PRODUCTION_EVIDENCE_JOURNAL_VERSION,
    runNonce: nonce,
    candidateIdentifier,
    source: { commitSha: source.commitSha, treeSha: source.treeSha },
    owner: {
      process: processIdentity,
      worktreeIdentitySha256: worktreeIdentitySha256(repositoryRoot),
      wrapper: await productionEvidenceWrapperIdentity(repositoryRoot),
    },
    commands: {
      dependencyInstall: DEPENDENCY_INSTALL_COMMAND,
      generatedSourceCheck: GENERATED_SOURCE_CHECK_COMMAND,
      build: BUILD_COMMAND,
    },
    buildContract,
    toolchain,
    events: {
      cycleStartedAt: clock(),
      buildWrapperStartedAt: clock(),
      dependencyInstall: pendingChildEvent(),
      generatedSourceCheck: pendingChildEvent(),
      build: pendingChildEvent(),
      artifactInventory: pendingInventoryEvent(),
    },
    bindings: { artifactInventory: null, nextBuildId: null, artifactSha256: null },
    manifest: { status: "pending", createdAt: null },
    completionState: "initialized",
    diagnostics: { filesystemMetadata: [] },
  };
  writeSemanticJournal(repositoryRoot, journalPath, journal);
  return journal;
}

const SEMANTIC_CHILD_ACTIONS = Object.freeze({
  install: "dependencyInstall",
  generatedSourceCheck: "generatedSourceCheck",
  build: "build",
});

export function executeProductionEvidenceChild({
  repositoryRoot,
  journalPath = DEFAULT_JOURNAL_PATH,
  expectedRunNonce,
  action,
  dispatch,
  clock = () => new Date().toISOString(),
}) {
  const eventKey = SEMANTIC_CHILD_ACTIONS[action];
  if (!eventKey) throw new Error(`unknown semantic child action: ${action}`);
  const processIdentity = { pid: process.pid, parentPid: process.ppid };
  updateSemanticJournal({
    repositoryRoot,
    journalPath,
    expectedRunNonce,
    expectedOwnerProcess: processIdentity,
    mutate(journal) {
      if (journal.events[eventKey].status !== "pending") {
        throw new Error(`semantic child action ${action} was already started`);
      }
      journal.events[eventKey] = {
        ...pendingChildEvent(),
        status: "running",
        startedAt: clock(),
      };
    },
  });
  let result;
  try {
    result = dispatch();
  } catch (error) {
    updateSemanticJournal({
      repositoryRoot,
      journalPath,
      expectedRunNonce,
      expectedOwnerProcess: processIdentity,
      mutate(journal) {
        journal.events[eventKey] = {
          ...journal.events[eventKey],
          status: "failed",
          completedAt: clock(),
          failureKind: "dispatch_error",
        };
      },
    });
    throw error;
  }
  const exitCode = Number.isSafeInteger(result?.status) ? result.status : null;
  const signal = typeof result?.signal === "string" ? result.signal : null;
  updateSemanticJournal({
    repositoryRoot,
    journalPath,
    expectedRunNonce,
    expectedOwnerProcess: processIdentity,
    mutate(journal) {
      journal.events[eventKey] = {
        ...journal.events[eventKey],
        status: exitCode === 0 && signal === null ? "succeeded" : "failed",
        completedAt: clock(),
        exitCode,
        signal,
        failureKind:
          exitCode === 0 && signal === null
            ? null
            : signal
              ? "child_signal"
              : exitCode === null
                ? "dispatch_error"
                : "child_exit_nonzero",
      };
    },
  });
  if (exitCode !== 0 || signal !== null) {
    const failure = new Error(
      `semantic child action ${action} failed with ${signal ? `signal ${signal}` : `status ${exitCode ?? "unavailable"}`}`,
    );
    failure.exitCode = exitCode;
    failure.signal = signal;
    throw failure;
  }
  return result;
}

function startArtifactInventory({ repositoryRoot, journalPath, expectedRunNonce, clock }) {
  return updateSemanticJournal({
    repositoryRoot,
    journalPath,
    expectedRunNonce,
    mutate(journal) {
      if (journal.events.artifactInventory.status !== "pending") {
        throw new Error("artifact inventory was already started");
      }
      journal.events.artifactInventory = {
        ...pendingInventoryEvent(),
        status: "running",
        startedAt: clock(),
      };
    },
  });
}

function completeArtifactInventory({ repositoryRoot, journalPath, expectedRunNonce, clock, binding }) {
  return updateSemanticJournal({
    repositoryRoot,
    journalPath,
    expectedRunNonce,
    mutate(journal) {
      if (journal.events.artifactInventory.status !== "running") {
        throw new Error("artifact inventory is not running");
      }
      journal.events.artifactInventory = {
        ...journal.events.artifactInventory,
        status: "succeeded",
        completedAt: clock(),
      };
      journal.bindings = binding;
    },
  });
}

function failArtifactInventory({ repositoryRoot, journalPath, expectedRunNonce, clock }) {
  return updateSemanticJournal({
    repositoryRoot,
    journalPath,
    expectedRunNonce,
    mutate(journal) {
      journal.events.artifactInventory = {
        ...journal.events.artifactInventory,
        status: "failed",
        completedAt: clock(),
        failureKind: "inventory_error",
      };
      journal.bindings = {
        artifactInventory: null,
        nextBuildId: null,
        artifactSha256: null,
      };
    },
  });
}

function recordManifestCreated({ repositoryRoot, journalPath, expectedRunNonce, createdAt }) {
  return updateSemanticJournal({
    repositoryRoot,
    journalPath,
    expectedRunNonce,
    mutate(journal) {
      if (journal.events.artifactInventory.status !== "succeeded") {
        throw new Error("manifest cannot be created before artifact inventory succeeds");
      }
      if (journal.manifest.status === "created" && journal.manifest.createdAt !== createdAt) {
        throw new Error("manifest creation timestamp is already bound to another value");
      }
      journal.manifest = { status: "created", createdAt };
    },
  });
}

function safeBuildFlags(environment = process.env) {
  return Object.fromEntries(
    DEVELOPMENT_ONLY_FLAGS.map((name) => [name, flagEnabled(environment[name])]),
  );
}

function safeFeatureFlags(environment = process.env) {
  return Object.fromEntries(
    SAFE_FEATURE_FLAGS.map((name) => [
      name,
      environment[name] === undefined ? null : flagEnabled(environment[name]),
    ]),
  );
}

function validateConfigurationShape(environment = process.env) {
  const missing = REQUIRED_CONFIGURATION_SHAPE.filter(
    (alternatives) =>
      !alternatives.some((name) => typeof environment[name] === "string" && environment[name].trim()),
  ).map((alternatives) => alternatives.join("|"));
  if (missing.length > 0) {
    throw new Error(`required staging configuration shape is incomplete: ${missing.join(", ")}`);
  }
  return REQUIRED_CONFIGURATION_SHAPE.map((alternatives) => alternatives.join("|"));
}

function assertBuildContract(build, developmentOnlyFlags) {
  if (!PRODUCTION_ENVIRONMENTS.has(build.applicationEnvironment)) {
    throw new Error("production evidence environment must be staging or production");
  }
  if (build.catalogStrictValidation !== true) {
    throw new Error("strict catalog validation was not enabled");
  }
  const enabledDevelopmentFlags = Object.entries(developmentOnlyFlags)
    .filter(([, enabled]) => enabled)
    .map(([name]) => name);
  if (enabledDevelopmentFlags.length > 0) {
    throw new Error(`development-only flags are enabled: ${enabledDevelopmentFlags.join(", ")}`);
  }
}

function environmentIdentity(environment, applicationEnvironment) {
  const processApplicationEnvironment = environment.APP_ENV?.trim().toLowerCase();
  if (processApplicationEnvironment !== applicationEnvironment) {
    throw new Error("APP_ENV must exactly match the recorded production evidence environment");
  }
  const publicEnvironment = environment.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase();
  if (publicEnvironment !== applicationEnvironment) {
    throw new Error(
      "NEXT_PUBLIC_APP_ENV must exactly match APP_ENV for production evidence",
    );
  }
  const rawVercelEnvironment = environment.VERCEL_ENV?.trim().toLowerCase() || null;
  const mappedVercelEnvironment =
    rawVercelEnvironment === "preview"
      ? "staging"
      : rawVercelEnvironment === "development" || rawVercelEnvironment === "production"
        ? rawVercelEnvironment
        : null;
  if (rawVercelEnvironment && mappedVercelEnvironment !== applicationEnvironment) {
    throw new Error("VERCEL_ENV contradicts APP_ENV for production evidence");
  }
  if (environment.NODE_ENV !== "production") {
    throw new Error("NODE_ENV must be production for production evidence");
  }
  return {
    appEnv: applicationEnvironment,
    nextPublicAppEnv: publicEnvironment,
    vercelEnv: rawVercelEnvironment,
    vercelEnvironment: mappedVercelEnvironment,
    nodeEnv: "production",
  };
}

function sensitiveManifestKeys(value, currentPath = "manifest") {
  const issues = [];
  if (!value || typeof value !== "object") return issues;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    if (SENSITIVE_MANIFEST_KEY.test(key)) issues.push(childPath);
    issues.push(...sensitiveManifestKeys(child, childPath));
  }
  return issues;
}

function filesystemTimestampSemanticPaths(value, currentPath = "manifest") {
  const issues = [];
  if (!value || typeof value !== "object") return issues;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${currentPath}.${key}`;
    if (/^(?:birthtime|ctime|mtime)$/i.test(key)) issues.push(childPath);
    issues.push(...filesystemTimestampSemanticPaths(child, childPath));
  }
  return issues;
}

function leakedSensitiveEnvironmentValues(manifestBytes, environment = process.env) {
  const leaks = [];
  for (const [name, value] of Object.entries(environment)) {
    if (
      SENSITIVE_ENVIRONMENT_NAME.test(name) &&
      typeof value === "string" &&
      value.length >= 8 &&
      manifestBytes.includes(value)
    ) {
      leaks.push(name);
    }
  }
  return leaks;
}

async function sensitiveArtifactEnvironmentValues(repositoryRoot, environment = process.env) {
  const candidates = Object.entries(environment)
    .filter(
      ([name, value]) =>
        SENSITIVE_ENVIRONMENT_NAME.test(name) &&
        typeof value === "string" &&
        value.length >= 8,
    )
    .map(([name, value]) => [name, Buffer.from(value)]);
  const leaks = new Set();
  for (const entry of listArtifactPaths(repositoryRoot)) {
    if (!entry.metadata.isFile()) continue;
    const bytes = readFileSync(entry.absolutePath);
    for (const [name, value] of candidates) {
      if (bytes.includes(value)) leaks.add(name);
    }
  }
  return [...leaks].sort(comparePortablePaths);
}

const ARTIFACT_INVENTORY_SNAPSHOT_SCHEMA =
  "interior-ai.production-artifact-inventory.v1";

function assertArtifactInventorySafe(artifact) {
  if (artifact.traceInventory.missingPaths.length > 0) {
    throw new Error("traced output contains missing files");
  }
  if (artifact.traceInventory.prohibitedPaths.length > 0) {
    throw new Error("traced output contains prohibited files");
  }
  if (artifact.traceInventory.traceFileCount <= 0 || artifact.traceInventory.referenceCount <= 0) {
    throw new Error("traced output inventory is empty");
  }
}

async function collectArtifactInventorySnapshot(repositoryRoot, journal) {
  const [dependencies, artifact] = await Promise.all([
    inspectDependencyIdentity(repositoryRoot),
    inspectProductionArtifact(repositoryRoot),
  ]);
  assertArtifactInventorySafe(artifact);
  return {
    schema: ARTIFACT_INVENTORY_SNAPSHOT_SCHEMA,
    runNonce: journal.runNonce,
    source: structuredClone(journal.source),
    dependencies,
    artifact,
    floorPlanRouteNftContract: inspectFloorPlanRouteNftContract(repositoryRoot),
  };
}

function writeArtifactInventorySnapshot(repositoryRoot, snapshot) {
  const absolutePath = resolveRepositoryPath(
    repositoryRoot,
    DEFAULT_INVENTORY_SNAPSHOT_PATH,
    "artifact inventory snapshot path",
  );
  const bytes = canonicalJsonBytes(snapshot);
  atomicWriteBytes(absolutePath, bytes);
  return {
    artifactInventory: {
      path: DEFAULT_INVENTORY_SNAPSHOT_PATH,
      sha256: sha256(bytes),
    },
    nextBuildId: snapshot.artifact.nextBuildId,
    artifactSha256: snapshot.artifact.sha256,
  };
}

function readArtifactInventorySnapshot(repositoryRoot, journal) {
  const binding = journal.bindings.artifactInventory;
  if (!binding) throw new Error("semantic event journal has no completed artifact inventory binding");
  const absolutePath = resolveRepositoryPath(
    repositoryRoot,
    binding.path,
    "artifact inventory snapshot path",
  );
  if (!existsSync(absolutePath)) throw new Error("bound artifact inventory snapshot is missing");
  const bytes = readFileSync(absolutePath);
  if (sha256(bytes) !== binding.sha256) {
    throw new Error("bound artifact inventory snapshot SHA-256 mismatch");
  }
  let snapshot;
  try {
    snapshot = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("bound artifact inventory snapshot is not valid JSON");
  }
  if (!bytes.equals(canonicalJsonBytes(snapshot))) {
    throw new Error("bound artifact inventory snapshot is not canonical JSON");
  }
  if (
    snapshot.schema !== ARTIFACT_INVENTORY_SNAPSHOT_SCHEMA ||
    snapshot.runNonce !== journal.runNonce ||
    JSON.stringify(snapshot.source) !== JSON.stringify(journal.source) ||
    snapshot.artifact?.nextBuildId !== journal.bindings.nextBuildId ||
    snapshot.artifact?.sha256 !== journal.bindings.artifactSha256
  ) {
    throw new Error("artifact inventory snapshot belongs to another run or artifact");
  }
  return snapshot;
}

async function assertCurrentInventoryMatchesSnapshot(repositoryRoot, snapshot) {
  const [dependencies, artifact] = await Promise.all([
    inspectDependencyIdentity(repositoryRoot),
    inspectProductionArtifact(repositoryRoot),
  ]);
  assertArtifactInventorySafe(artifact);
  const floorPlanRouteNftContract = inspectFloorPlanRouteNftContract(repositoryRoot);
  if (
    JSON.stringify({ dependencies, artifact, floorPlanRouteNftContract }) !==
    JSON.stringify({
      dependencies: snapshot.dependencies,
      artifact: snapshot.artifact,
      floorPlanRouteNftContract: snapshot.floorPlanRouteNftContract,
    })
  ) {
    throw new Error("current dependency, Build ID, or artifact identity does not match the semantic journal");
  }
}

async function assertRecoverableSemanticJournal({
  repositoryRoot,
  journal,
  expectedRunNonce,
  environment,
  toolchain,
}) {
  if (!expectedRunNonce || journal.runNonce !== expectedRunNonce) {
    throw new Error("semantic event journal run nonce mismatch");
  }
  const currentSource = inspectSourceIdentity(repositoryRoot);
  const issues = sourceIssues(currentSource);
  if (issues.length > 0) throw new Error(issues.join("; "));
  if (
    journal.source.commitSha !== currentSource.commitSha ||
    journal.source.treeSha !== currentSource.treeSha
  ) {
    throw new Error("semantic event journal source commit or tree mismatch");
  }
  if (journal.owner.worktreeIdentitySha256 !== worktreeIdentitySha256(repositoryRoot)) {
    throw new Error("semantic event journal belongs to another worktree");
  }
  const wrapper = await productionEvidenceWrapperIdentity(repositoryRoot);
  if (JSON.stringify(wrapper) !== JSON.stringify(journal.owner.wrapper)) {
    throw new Error("semantic event journal wrapper version or source hash mismatch");
  }
  if (JSON.stringify(toolchain) !== JSON.stringify(journal.toolchain)) {
    throw new Error("semantic event journal toolchain mismatch");
  }
  const developmentOnlyFlags = safeBuildFlags(environment);
  assertBuildContract(journal.buildContract, developmentOnlyFlags);
  environmentIdentity(environment, journal.buildContract.applicationEnvironment);
  validateConfigurationShape(environment);
  for (const [name, event] of [
    ["dependency installation", journal.events.dependencyInstall],
    ["generated-source check", journal.events.generatedSourceCheck],
    ["build", journal.events.build],
  ]) {
    if (event.status !== "succeeded" || event.exitCode !== 0) {
      throw new Error(`semantic event journal ${name} is incomplete or failed`);
    }
  }
  if (["running", "failed"].includes(journal.events.artifactInventory.status)) {
    throw new Error("semantic event journal artifact inventory is incomplete or failed");
  }
}

export async function createProductionEvidenceManifest(options) {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const source = inspectSourceIdentity(repositoryRoot);
  const journal = options.semanticJournal;
  const snapshot = options.inventorySnapshot;
  assertValidSemanticJournal(journal);
  const initialSourceIssues = sourceIssues(source);
  if (initialSourceIssues.length > 0) throw new Error(initialSourceIssues.join("; "));
  if (
    source.commitSha !== journal.source.commitSha ||
    source.treeSha !== journal.source.treeSha
  ) {
    throw new Error("manifest source commit or tree does not match the semantic journal");
  }
  if (
    journal.events.dependencyInstall.status !== "succeeded" ||
    journal.events.generatedSourceCheck.status !== "succeeded" ||
    journal.events.build.status !== "succeeded" ||
    journal.events.artifactInventory.status !== "succeeded"
  ) {
    throw new Error("manifest construction requires a complete successful semantic journal");
  }
  if (
    !snapshot ||
    snapshot.runNonce !== journal.runNonce ||
    JSON.stringify(snapshot.source) !== JSON.stringify(journal.source) ||
    snapshot.artifact?.nextBuildId !== journal.bindings.nextBuildId ||
    snapshot.artifact?.sha256 !== journal.bindings.artifactSha256
  ) {
    throw new Error("manifest construction requires the bound semantic artifact inventory");
  }
  const developmentOnlyFlags = safeBuildFlags(options.environment);
  assertBuildContract(journal.buildContract, developmentOnlyFlags);
  const recordedEnvironmentIdentity = environmentIdentity(
    options.environment,
    journal.buildContract.applicationEnvironment,
  );
  const requiredVariableNames = validateConfigurationShape(options.environment);
  const manifest = {
    schema: PRODUCTION_EVIDENCE_SCHEMA,
    validatorVersion: PRODUCTION_EVIDENCE_VALIDATOR_VERSION,
    candidateIdentifier: journal.candidateIdentifier,
    evidenceKind: "local-production-mode-artifact",
    source,
    dependencies: {
      ...snapshot.dependencies,
      installCommand: journal.commands.dependencyInstall,
      installStartedAt: journal.events.dependencyInstall.startedAt,
      installCompletedAt: journal.events.dependencyInstall.completedAt,
      processExitCode: journal.events.dependencyInstall.exitCode,
      processSignal: journal.events.dependencyInstall.signal,
    },
    toolchain: journal.toolchain,
    cycleStartedAt: journal.events.cycleStartedAt,
    execution: {
      runNonce: journal.runNonce,
      semanticJournalSchema: journal.schema,
      owner: {
        process: structuredClone(journal.owner.process),
        wrapper: structuredClone(journal.owner.wrapper),
      },
      commands: structuredClone(journal.commands),
    },
    generatedSourceCheck: {
      command: journal.commands.generatedSourceCheck,
      status: "passed",
      startedAt: journal.events.generatedSourceCheck.startedAt,
      completedAt: journal.events.generatedSourceCheck.completedAt,
      processExitCode: journal.events.generatedSourceCheck.exitCode,
      processSignal: journal.events.generatedSourceCheck.signal,
    },
    build: {
      mode: "production",
      applicationEnvironment: journal.buildContract.applicationEnvironment,
      catalogStrictValidation: journal.buildContract.catalogStrictValidation,
      developmentOnlyFlags,
      featureFlags: safeFeatureFlags(options.environment),
      environmentConfiguration: {
        status: "passed",
        requiredVariableNames,
        environmentValuesRecorded: false,
      },
      environmentIdentity: recordedEnvironmentIdentity,
      command: journal.commands.build,
      serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
      underlyingServerCommand: UNDERLYING_SERVER_COMMAND,
      wrapperStartedAt: journal.events.buildWrapperStartedAt,
      startedAt: journal.events.build.startedAt,
      completedAt: journal.events.build.completedAt,
      processExitCode: journal.events.build.exitCode,
      processSignal: journal.events.build.signal,
      nextBuildId: snapshot.artifact.nextBuildId,
    },
    artifact: {
      roots: snapshot.artifact.roots,
      excludedMutablePaths: snapshot.artifact.excludedMutablePaths,
      hashAlgorithm: snapshot.artifact.hashAlgorithm,
      sha256: snapshot.artifact.sha256,
      fileCount: snapshot.artifact.fileCount,
      bytes: snapshot.artifact.bytes,
      files: snapshot.artifact.files,
      traceInventory: snapshot.artifact.traceInventory,
      floorPlanRouteNftContract: snapshot.floorPlanRouteNftContract,
    },
    artifactInventory: {
      status: "completed",
      startedAt: journal.events.artifactInventory.startedAt,
      completedAt: journal.events.artifactInventory.completedAt,
    },
    tests: [],
    externalControls: structuredClone(EXTERNAL_CONTROLS),
    repositoryEvidence: {
      status: "pending_tests",
      releaseReady: false,
      actualDeploymentVerified: false,
      statement: REPOSITORY_EVIDENCE_STATEMENT,
    },
  };
  const manifestText = canonicalManifestBytes(manifest).toString("utf8");
  const leaks = leakedSensitiveEnvironmentValues(manifestText, options.environment);
  if (leaks.length > 0) {
    throw new Error(`Sensitive environment values leaked into the manifest: ${leaks.join(", ")}`);
  }
  return manifest;
}

export async function recoverProductionEvidenceFromSemanticJournal({
  repositoryRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
  journalPath = DEFAULT_JOURNAL_PATH,
  expectedRunNonce,
  environment = process.env,
  toolchain,
  clock = () => new Date().toISOString(),
  manifestFactory = createProductionEvidenceManifest,
  manifestWriter = writeProductionEvidenceManifest,
}) {
  const root = path.resolve(repositoryRoot);
  let journal = readProductionEvidenceSemanticJournal({ repositoryRoot: root, journalPath });
  await assertRecoverableSemanticJournal({
    repositoryRoot: root,
    journal,
    expectedRunNonce,
    environment,
    toolchain,
  });
  let snapshot;
  if (journal.events.artifactInventory.status === "pending") {
    startArtifactInventory({ repositoryRoot: root, journalPath, expectedRunNonce, clock });
    try {
      snapshot = await collectArtifactInventorySnapshot(root, journal);
      const binding = writeArtifactInventorySnapshot(root, snapshot);
      journal = completeArtifactInventory({
        repositoryRoot: root,
        journalPath,
        expectedRunNonce,
        clock,
        binding,
      });
    } catch (error) {
      failArtifactInventory({ repositoryRoot: root, journalPath, expectedRunNonce, clock });
      throw error;
    }
  } else {
    snapshot = readArtifactInventorySnapshot(root, journal);
    await assertCurrentInventoryMatchesSnapshot(root, snapshot);
  }
  const manifestDraft = await manifestFactory({
    repositoryRoot: root,
    semanticJournal: journal,
    inventorySnapshot: snapshot,
    environment,
  });
  const createdAt = journal.manifest.status === "created" ? journal.manifest.createdAt : clock();
  if (
    !canonicalUtcTimestamp(createdAt) ||
    Date.parse(createdAt) < Date.parse(journal.events.artifactInventory.completedAt)
  ) {
    throw new Error("manifest creation timestamp is invalid or predates artifact inventory");
  }
  const manifest = { ...manifestDraft, createdAt };
  const manifestText = canonicalManifestBytes(manifest).toString("utf8");
  const leaks = leakedSensitiveEnvironmentValues(manifestText, environment);
  if (leaks.length > 0) {
    throw new Error(`Sensitive environment values leaked into the manifest: ${leaks.join(", ")}`);
  }
  if (journal.manifest.status !== "created") {
    journal = recordManifestCreated({
      repositoryRoot: root,
      journalPath,
      expectedRunNonce,
      createdAt,
    });
  }
  await manifestWriter({ repositoryRoot: root, manifestPath, manifest });
  return { manifest, journal };
}

export async function writeProductionEvidenceManifest({
  repositoryRoot,
  manifestPath,
  manifest,
}) {
  const absolutePath = resolveRepositoryPath(repositoryRoot, manifestPath, "manifest path");
  const bytes = canonicalManifestBytes(manifest);
  atomicWriteBytes(absolutePath, bytes);
  atomicWriteBytes(
    `${absolutePath}.sha256`,
    Buffer.from(`${sha256(bytes)}  ${path.basename(absolutePath)}\n`),
  );
}

function readProductionEvidenceManifest(repositoryRoot, manifestPath, issues) {
  let absolutePath;
  try {
    absolutePath = resolveRepositoryPath(repositoryRoot, manifestPath, "manifest path");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    return null;
  }
  if (!existsSync(absolutePath)) {
    issues.push("production evidence manifest is missing");
    return null;
  }
  const bytes = readFileSync(absolutePath);
  const sidecarPath = `${absolutePath}.sha256`;
  if (!existsSync(sidecarPath)) {
    issues.push("manifest SHA-256 sidecar is missing");
  } else {
    const expectedSidecar = `${sha256(bytes)}  ${path.basename(absolutePath)}\n`;
    if (readFileSync(sidecarPath, "utf8") !== expectedSidecar) {
      issues.push("manifest SHA-256 sidecar mismatch");
    }
  }
  try {
    const manifest = JSON.parse(bytes.toString("utf8"));
    if (!bytes.equals(canonicalManifestBytes(manifest))) {
      issues.push("manifest is not in canonical JSON encoding");
    }
    return { manifest, bytes, absolutePath };
  } catch {
    issues.push("production evidence manifest is not valid JSON");
    return null;
  }
}

function compareTraceInventory(recorded, actual, issues) {
  if (actual.traceFileCount <= 0 || actual.referenceCount <= 0) {
    issues.push("traced output inventory is empty");
  }
  if (actual.missingPaths.length > 0) issues.push("traced output contains missing files");
  if (actual.prohibitedPaths.length > 0) issues.push("traced output contains prohibited files");
  if (JSON.stringify(recorded) !== JSON.stringify(actual)) {
    issues.push("traced output inventory does not match the recorded artifact");
  }
}

function localRepositoryPathLeaks(repositoryRoot, text) {
  const roots = new Set([path.resolve(repositoryRoot), realpathSync(repositoryRoot)]);
  return [...roots].filter((root) => text.includes(root));
}

function replaceRepositoryPaths(value, repositoryRoots) {
  if (typeof value === "string") {
    return repositoryRoots.reduce(
      (current, repositoryRoot) => current.split(repositoryRoot).join("<repository-root>"),
      value,
    );
  }
  if (Array.isArray(value)) {
    return value.map((child) => replaceRepositoryPaths(child, repositoryRoots));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        replaceRepositoryPaths(child, repositoryRoots),
      ]),
    );
  }
  return value;
}

function resolvedRetainedEvidencePath(
  repositoryRoot,
  filePath,
  description,
  authorizedExternalRoot,
) {
  return path.isAbsolute(filePath)
    ? resolveRetainedExternalEvidenceFile({
        filePath,
        authorizedExternalRoot,
        repositoryRoot,
      }).absolutePath
    : resolveRepositoryPath(repositoryRoot, filePath, description);
}

export function canonicalizeProductionEvidenceReport(
  repositoryRoot,
  reportPath,
  authorizedExternalRoot,
) {
  const absoluteReportPath = resolvedRetainedEvidencePath(
    repositoryRoot,
    reportPath,
    "test report path",
    authorizedExternalRoot,
  );
  const report = JSON.parse(readFileSync(absoluteReportPath, "utf8"));
  const repositoryRoots = [path.resolve(repositoryRoot), realpathSync(repositoryRoot)]
    .filter((root, index, values) => values.indexOf(root) === index)
    .sort((left, right) => right.length - left.length);
  writeFileSync(
    absoluteReportPath,
    `${JSON.stringify(replaceRepositoryPaths(report, repositoryRoots), null, 2)}\n`,
  );
}

export function bindRuntimeSmokeFailureToReport(
  repositoryRoot,
  reportPath,
  phaseTimingPath = DEFAULT_PHASE_TIMINGS_PATH,
  authorizedExternalRoot,
) {
  const absoluteReportPath = resolvedRetainedEvidencePath(
    repositoryRoot,
    reportPath,
    "test report path",
    authorizedExternalRoot,
  );
  const absoluteTimingPath = resolvedRetainedEvidencePath(
    repositoryRoot,
    phaseTimingPath,
    "runtime-smoke phase timing path",
    authorizedExternalRoot,
  );
  const report = JSON.parse(readFileSync(absoluteReportPath, "utf8"));
  const timing = JSON.parse(readFileSync(absoluteTimingPath, "utf8"));
  report.runtimeSmokeFailure = timing.failure ?? null;
  writeFileSync(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report.runtimeSmokeFailure;
}

function readReport(repositoryRoot, test, issues, environment) {
  let reportPath;
  try {
    reportPath = resolveRepositoryPath(repositoryRoot, test.report.path, "test report path");
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    return null;
  }
  if (!existsSync(reportPath) || !statSync(reportPath).isFile()) {
    issues.push("required test report is missing");
    return null;
  }
  const bytes = readFileSync(reportPath);
  if (sha256(bytes) !== test.report.sha256) issues.push("test report SHA-256 mismatch");
  try {
    const text = bytes.toString("utf8");
    if (localRepositoryPathLeaks(repositoryRoot, text).length > 0) {
      issues.push("test report contains machine-local repository paths");
    }
    const report = JSON.parse(text);
    const sensitiveKeys = sensitiveManifestKeys(report, "report");
    if (sensitiveKeys.length > 0) {
      issues.push(`test report contains prohibited secret-bearing fields: ${sensitiveKeys.join(", ")}`);
    }
    const leaks = leakedSensitiveEnvironmentValues(text, environment);
    if (leaks.length > 0) {
      issues.push(`test report contains sensitive environment values: ${leaks.join(", ")}`);
    }
    return report;
  } catch {
    issues.push("required test report is not valid JSON");
    return null;
  }
}

function collectReportSpecs(suites, specs = []) {
  for (const suite of Array.isArray(suites) ? suites : []) {
    specs.push(...(Array.isArray(suite?.specs) ? suite.specs : []));
    collectReportSpecs(suite?.suites, specs);
  }
  return specs;
}

function decodeRuntimeTelemetryAttachment(attachment, issues) {
  if (
    attachment?.name !== RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT ||
    attachment?.contentType !== "application/json" ||
    attachment?.path !== undefined ||
    typeof attachment?.body !== "string" ||
    attachment.body.length === 0 ||
    attachment.body.length > 65_536 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      attachment.body,
    )
  ) {
    issues.push("runtime telemetry report attachment is malformed or non-portable");
    return null;
  }
  const bytes = Buffer.from(attachment.body, "base64");
  if (bytes.toString("base64") !== attachment.body) {
    issues.push("runtime telemetry report attachment is not canonical base64");
    return null;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return JSON.parse(text);
  } catch {
    issues.push("runtime telemetry report attachment is not strict JSON");
    return null;
  }
}

export function readRuntimeSmokeTelemetryBootstrapEvidence(
  report,
  { allowFailure = false } = {},
) {
  const issues = [];
  const furnishedSpecs = collectReportSpecs(report?.suites).filter(
    (spec) =>
      spec?.file === "00-runtime-smoke.spec.ts" &&
      spec?.title === "furnished template remains stable without a render loop",
  );
  if (furnishedSpecs.length !== 1) {
    issues.push("runtime telemetry report owner is missing or duplicated");
    return {
      valid: false,
      issues,
      observations: [],
      summary: summarizeRuntimeSmokeTelemetryBootstrapEvidence([]),
    };
  }
  const tests = furnishedSpecs[0].tests;
  const results = Array.isArray(tests) && tests.length === 1
    ? tests[0]?.results
    : null;
  const finalResult = Array.isArray(results) ? results.at(-1) : null;
  if (!finalResult) {
    issues.push("runtime telemetry report has no furnished-template result");
  }
  const attachments = (Array.isArray(finalResult?.attachments)
    ? finalResult.attachments
    : []).filter(
      (attachment) =>
        attachment?.name === RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT,
    );
  const observations = attachments
    .map((attachment) => decodeRuntimeTelemetryAttachment(attachment, issues))
    .filter((observation) => observation !== null);
  const sequence = validateRuntimeSmokeTelemetryBootstrapSequence(observations, {
    requireComplete: !allowFailure,
    requireValid: !allowFailure,
  });
  issues.push(...sequence.issues);
  return {
    valid: issues.length === 0,
    issues,
    observations,
    summary: summarizeRuntimeSmokeTelemetryBootstrapEvidence(observations),
  };
}

function readRuntimeSmokePhaseTimings(
  repositoryRoot,
  test,
  issues,
  environment,
  { allowFailure = false, report = null, absoluteTimingPath = null } = {},
) {
  if (!absoluteTimingPath && test.phaseTimings?.path !== DEFAULT_PHASE_TIMINGS_PATH) {
    issues.push("runtime-smoke phase timing path is not canonical");
    return null;
  }
  let timingPath = absoluteTimingPath;
  try {
    timingPath ??= resolveRepositoryPath(
        repositoryRoot,
        test.phaseTimings.path,
        "runtime-smoke phase timing path",
      );
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    return null;
  }
  if (!existsSync(timingPath) || !statSync(timingPath).isFile()) {
    issues.push("runtime-smoke phase timing record is missing");
    return null;
  }
  const bytes = readFileSync(timingPath);
  if (sha256(bytes) !== test.phaseTimings.sha256) {
    issues.push("runtime-smoke phase timing SHA-256 mismatch");
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (localRepositoryPathLeaks(repositoryRoot, text).length > 0) {
      issues.push("runtime-smoke phase timing record contains machine-local repository paths");
    }
    const leaks = leakedSensitiveEnvironmentValues(text, environment);
    if (leaks.length > 0) {
      issues.push(
        `runtime-smoke phase timing record contains sensitive environment values: ${leaks.join(", ")}`,
      );
    }
    const timing = JSON.parse(text);
    const exactKeys = (value, expected) =>
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
    const canonicalText = `${JSON.stringify(timing, null, 2)}\n`;
    if (sensitiveManifestKeys(timing, "phaseTimings").length > 0) {
      issues.push("runtime-smoke phase timing record contains secret-bearing fields");
    }
    const expectedPhaseNames = RUNTIME_SMOKE_PHASE_BUDGETS.map((phase) => phase.name);
    const recordedPhaseNames = Array.isArray(timing.phases)
      ? timing.phases.map((phase) => phase.name)
      : [];
    if (
      text !== canonicalText ||
      !exactKeys(timing, [
        "schema",
        "testIdentity",
        "wholeTestTimeoutMs",
        "sequentialPhaseBudgetMs",
        "overheadBudgets",
        "phaseBudgets",
        "phases",
        "failure",
        "complete",
      ]) ||
      timing.schema !== RUNTIME_SMOKE_PHASE_TIMING_SCHEMA ||
      timing.testIdentity !== "runtime.template-stability" ||
      timing.wholeTestTimeoutMs !== RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS ||
      timing.sequentialPhaseBudgetMs !==
        RUNTIME_SMOKE_PHASE_BUDGETS.reduce((total, phase) => total + phase.timeoutMs, 0) ||
      JSON.stringify(timing.overheadBudgets) !==
        JSON.stringify(RUNTIME_SMOKE_OVERHEAD_BUDGETS) ||
      JSON.stringify(timing.phaseBudgets) !== JSON.stringify(RUNTIME_SMOKE_PHASE_BUDGETS) ||
      JSON.stringify(recordedPhaseNames) !== JSON.stringify(
        allowFailure
          ? expectedPhaseNames.slice(0, recordedPhaseNames.length)
          : expectedPhaseNames,
      ) ||
      timing.complete !== !allowFailure ||
      (allowFailure ? timing.failure === null : timing.failure !== null)
    ) {
      issues.push("runtime-smoke phase timing contract is incomplete or non-canonical");
    }
    const phases = Array.isArray(timing.phases) ? timing.phases : [];
    const failurePhases = phases.filter((phase) => phase.failure !== null);
    const phaseOutcomesInvalid =
      !Array.isArray(timing.phases) ||
      phases.some((phase, index) => {
        const isFailurePhase = phase.failure !== null;
        const checkpoints = Array.isArray(phase.progressCheckpoints)
          ? phase.progressCheckpoints
          : [];
        const lifecycleStates = [
          "not-observed",
          "loading",
          "ready",
          "error",
          "stable",
          "persisted",
        ];
        return (
          !exactKeys(phase, [
            "name",
            "startTimeRelativeMs",
            "elapsedMs",
            "outcome",
            "timeoutBudgetMs",
            "performanceWarningThresholdMs",
            "performanceWarningExceeded",
            "finalLifecycleState",
            "failure",
            "progressCheckpoints",
          ]) ||
          (!isFailurePhase && phase.outcome !== "passed") ||
          !lifecycleStates.includes(phase.finalLifecycleState) ||
          !Number.isSafeInteger(phase.startTimeRelativeMs) ||
          phase.startTimeRelativeMs < 0 ||
          !Number.isSafeInteger(phase.elapsedMs) ||
          phase.elapsedMs < 0 ||
          (!isFailurePhase && phase.elapsedMs > phase.timeoutBudgetMs) ||
          phase.timeoutBudgetMs !== RUNTIME_SMOKE_PHASE_BUDGETS[index]?.timeoutMs ||
          phase.performanceWarningThresholdMs !==
            (FURNISHED_TEMPLATE_PHASE_CONTRACTS[phase.name]
              ?.performanceWarningThresholdMs ?? null) ||
          phase.performanceWarningExceeded !==
            (phase.performanceWarningThresholdMs !== null &&
              phase.elapsedMs > phase.performanceWarningThresholdMs) ||
          checkpoints.length < (isFailurePhase ? 1 : 2) ||
          checkpoints.some(
            (checkpoint) =>
              !exactKeys(checkpoint, [
                "name",
                "elapsedMs",
                "finalLifecycleState",
              ]) ||
              typeof checkpoint.name !== "string" ||
              !/^[a-z0-9][a-z0-9-]{0,95}$/.test(checkpoint.name) ||
              !Number.isSafeInteger(checkpoint.elapsedMs) ||
              checkpoint.elapsedMs < 0 ||
              checkpoint.elapsedMs > phase.elapsedMs ||
              !lifecycleStates.includes(checkpoint.finalLifecycleState),
          ) ||
          checkpoints[0]?.name !== "phase-start" ||
          (!isFailurePhase && checkpoints.at(-1)?.name !== "phase-complete") ||
          checkpoints.some((checkpoint, checkpointIndex) =>
            checkpointIndex > 0 &&
            checkpoint.elapsedMs < checkpoints[checkpointIndex - 1].elapsedMs
          )
        );
      });
    if (
      phaseOutcomesInvalid ||
      (allowFailure
        ? failurePhases.length !== 1 || phases.at(-1) !== failurePhases[0]
        : failurePhases.length !== 0)
    ) {
      issues.push("runtime-smoke phase timing outcomes are invalid");
    }
    if (allowFailure && failurePhases.length === 1) {
      const failurePhase = failurePhases[0];
      issues.push(
        ...validateRuntimeSmokeFailureProvenance({
          failure: failurePhase.failure,
          phase: failurePhase,
          phaseContract: FURNISHED_TEMPLATE_PHASE_CONTRACTS[failurePhase.name],
        }),
      );
      if (JSON.stringify(timing.failure) !== JSON.stringify(failurePhase.failure)) {
        issues.push("runtime-smoke top-level failure disagrees with its phase record");
      }
      if (
        !report ||
        JSON.stringify(report.runtimeSmokeFailure) !== JSON.stringify(timing.failure)
      ) {
        issues.push("runtime-smoke report failure disagrees with phase timing evidence");
      }
    } else if (!allowFailure && report?.runtimeSmokeFailure !== null) {
      issues.push("successful runtime-smoke report retains stale failure provenance");
    }
    if (Array.isArray(timing.phases)) {
      const timelineInvalid = timing.phases.some((phase, index) => {
        if (
          !Number.isSafeInteger(phase.startTimeRelativeMs) ||
          !Number.isSafeInteger(phase.elapsedMs)
        ) {
          return true;
        }
        const phaseEnd = phase.startTimeRelativeMs + phase.elapsedMs;
        if (!Number.isSafeInteger(phaseEnd) || phaseEnd > RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS) {
          return true;
        }
        if (index === 0) return false;
        const previous = timing.phases[index - 1];
        if (
          !Number.isSafeInteger(previous?.startTimeRelativeMs) ||
          !Number.isSafeInteger(previous?.elapsedMs)
        ) {
          return true;
        }
        return phase.startTimeRelativeMs <
          previous.startTimeRelativeMs + previous.elapsedMs;
      });
      if (timelineInvalid) {
        issues.push(
          "runtime-smoke phase timing timeline is overlapping or exceeds the whole-test timeout",
        );
      }
    }
    return timing;
  } catch {
    issues.push("runtime-smoke phase timing record is not strict UTF-8 JSON");
    return null;
  }
}

export function validateRetainedRuntimeSmokePhaseTimings({
  repositoryRoot,
  timingPath,
  timingSha256,
  report,
  environment = {},
}) {
  const issues = [];
  const timing = readRuntimeSmokePhaseTimings(
    repositoryRoot,
    { phaseTimings: { path: timingPath, sha256: timingSha256 } },
    issues,
    environment,
    { report, absoluteTimingPath: timingPath },
  );
  return { valid: Boolean(timing) && issues.length === 0, issues, timing };
}

function validateTestRecord(
  manifest,
  test,
  report,
  phaseTimings,
  issues,
  {
    requiredTestRepositoryRoot,
    validateRequiredTestRepository = true,
    allowFailedRuntimeSmoke = false,
  } = {},
) {
  if (
    test.name !== "runtime-smoke" ||
    test.command !== RUNTIME_SMOKE_COMMAND ||
    test.report?.path !== DEFAULT_REPORT_PATH
  ) {
    issues.push("required production smoke command or report path is not canonical");
  }
  if (test.sourceCommitSha !== manifest.source.commitSha) {
    issues.push("test report is bound to another source commit");
  }
  if (test.artifactSha256 !== manifest.artifact.sha256) {
    issues.push("test report is bound to another artifact");
  }
  if (test.nextBuildId !== manifest.build.nextBuildId) {
    issues.push("test report is bound to another Next.js build ID");
  }
  if (test.serverCommand !== PRODUCTION_EVIDENCE_SERVER_COMMAND) {
    issues.push("development server or unverified server command was used for production evidence");
  }
  if (
    phaseTimings &&
    (test.phaseTimings.wholeTestTimeoutMs !== phaseTimings.wholeTestTimeoutMs ||
      test.phaseTimings.phaseCount !== phaseTimings.phases.length ||
      test.phaseTimings.totalElapsedMs !==
        phaseTimings.phases.reduce((total, phase) => total + phase.elapsedMs, 0))
  ) {
    issues.push("recorded runtime-smoke phase timing summary does not match its report");
  }
  const stats = test.stats ?? {};
  if (allowFailedRuntimeSmoke) {
    if (test.processExitCode === 0 || stats.unexpected <= 0 || stats.flaky !== 0) {
      issues.push("runtime-smoke failure evidence does not record a real failed process");
    }
  } else {
    if (test.processExitCode !== 0) {
      issues.push("production smoke command exited nonzero");
    }
    if (stats.unexpected !== 0 || stats.flaky !== 0) {
      issues.push("required test report contains failures or flaky tests");
    }
    if (!Number.isSafeInteger(stats.expected) || stats.expected <= 0) {
      issues.push("required test report contains zero passing tests");
    }
  }
  if (stats.skipped !== 0) issues.push("critical production smoke contains skipped tests");
  if (!report) return;
  const projects = report.config?.projects;
  if (
    report.config?.configFile !== "<repository-root>/playwright.config.ts" ||
    report.config?.rootDir !== "<repository-root>/tests/e2e" ||
    !Array.isArray(projects) ||
    projects.length === 0 ||
    projects.some(
      (project) =>
        project.testDir !== "<repository-root>/tests/e2e" ||
        project.outputDir !==
          "<repository-root>/.local/production-artifact-evidence/playwright-output" ||
        (project.snapshotDir !== null &&
          project.snapshotDir !== undefined &&
          !project.snapshotDir.startsWith("<repository-root>/")),
    )
  ) {
    issues.push("test report contains non-canonical or machine-local Playwright paths");
  }
  if (
    report.config?.webServer?.command !== PRODUCTION_EVIDENCE_SERVER_COMMAND ||
    report.config?.webServer?.url !== "http://127.0.0.1:3000" ||
    report.config?.webServer?.reuseExistingServer !== false
  ) {
    issues.push("test report does not prove the canonical non-reused production server");
  }
  if (JSON.stringify(report.stats) !== JSON.stringify(test.stats)) {
    issues.push("recorded test counts do not match the test report");
  }
  const telemetryBootstrap = readRuntimeSmokeTelemetryBootstrapEvidence(report, {
    allowFailure: allowFailedRuntimeSmoke,
  });
  issues.push(
    ...telemetryBootstrap.issues.map(
      (entry) => `runtime telemetry bootstrap: ${entry}`,
    ),
  );
  if (
    JSON.stringify(test.telemetryBootstrap) !==
    JSON.stringify(telemetryBootstrap.summary)
  ) {
    issues.push("recorded runtime telemetry bootstrap summary does not match the report");
  }
  const identity = report.config?.metadata?.productionArtifactEvidence;
  if (
    identity?.schema !== PRODUCTION_EVIDENCE_SCHEMA ||
    identity?.sourceCommitSha !== manifest.source.commitSha ||
    identity?.artifactSha256 !== manifest.artifact.sha256 ||
    identity?.nextBuildId !== manifest.build.nextBuildId ||
    identity?.serverCommand !== PRODUCTION_EVIDENCE_SERVER_COMMAND ||
    identity?.buildMode !== "production"
  ) {
    issues.push("test report metadata does not identify the recorded production artifact");
  }
  const truthfulness = validateRequiredTestReport({
    repositoryRoot:
      requiredTestRepositoryRoot ?? path.resolve(import.meta.dirname, ".."),
    gateId: "ci.production-runtime-smoke",
    report,
    processExitCode: test.processExitCode,
    requireMetadata: false,
    validateRepository: validateRequiredTestRepository,
  });
  const truthfulnessIssues = allowFailedRuntimeSmoke
    ? truthfulRuntimeSmokeFailureIssues(truthfulness)
    : truthfulness.issues;
  issues.push(...truthfulnessIssues.map((issue) => `required runtime smoke: ${issue}`));
}

export async function validateProductionEvidence({
  repositoryRoot,
  manifestPath,
  verificationMode = PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
  expectedSourceCommitSha,
  expectedArchiveIdentity,
  environment = process.env,
}) {
  const root = path.resolve(repositoryRoot);
  const modeConfig = VERIFICATION_MODE_CONFIG[verificationMode];
  if (!modeConfig) {
    return {
      valid: false,
      issues: [`unknown production evidence verification mode: ${String(verificationMode)}`],
      manifest: null,
      verificationResult: null,
    };
  }
  const {
    standalone,
    testPolicy,
    requireSemanticJournal,
    allowFailedRuntimeSmoke,
  } = modeConfig;
  const runtimeRequired =
    testPolicy === "runtime-required" ||
    testPolicy === "runtime-failure-required";
  const issues = [];
  let semanticJournal = null;
  let verifierSourceClosure = null;
  const readResult = readProductionEvidenceManifest(root, manifestPath, issues);
  if (!readResult) {
    return { valid: false, issues, manifest: null, verificationResult: null };
  }
  const { manifest, bytes } = readResult;
  if (
    manifest.schema !== PRODUCTION_EVIDENCE_SCHEMA ||
    manifest.validatorVersion !== PRODUCTION_EVIDENCE_VALIDATOR_VERSION
  ) {
    issues.push("unsupported production evidence schema or validator version");
  }
  if (requireSemanticJournal) {
    try {
      semanticJournal = readProductionEvidenceSemanticJournal({ repositoryRoot: root });
      const currentContract = validateCurrentProductionEvidenceManifest({
        manifest,
        semanticJournal,
      });
      issues.push(...currentContract.issues);
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (verificationMode === PRODUCTION_EVIDENCE_VERIFICATION_MODES.ARCHIVE_PREFLIGHT) {
    issues.push(
      ...archivePreflightExpectedIdentityIssues(manifest, expectedArchiveIdentity),
      ...archivePreflightSourceIdentityIssues(manifest.source),
    );
    const unsafePortableFields = unsafeAbsolutePortableFields({
      manifest,
      semanticJournal,
    });
    if (unsafePortableFields.length > 0) {
      issues.push(
        `archive preflight evidence contains unsafe absolute portable fields: ${unsafePortableFields.join(", ")}`,
      );
    }
    for (const relativePath of ARCHIVE_PREFLIGHT_PROHIBITED_PATHS) {
      if (existsSync(path.join(root, relativePath))) {
        issues.push(`archive preflight staged tree contains prohibited path: ${relativePath}`);
      }
    }
    if (semanticJournal) {
      try {
        const snapshot = readArtifactInventorySnapshot(root, semanticJournal);
        issues.push(...archiveInventoryBindingIssues(manifest, snapshot));
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
    }
    try {
      verifierSourceClosure = await inspectVerifierSourceClosure(root);
      if (
        /^[0-9a-f]{64}$/.test(
          expectedArchiveIdentity?.verifierSourceClosureSha256 ?? "",
        ) &&
        verifierSourceClosure.sha256 !==
          expectedArchiveIdentity.verifierSourceClosureSha256
      ) {
        issues.push(
          "archive preflight verifier source closure SHA-256 mismatch",
        );
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  const sensitiveKeys = sensitiveManifestKeys(manifest);
  if (sensitiveKeys.length > 0) {
    issues.push(`manifest contains prohibited secret-bearing fields: ${sensitiveKeys.join(", ")}`);
  }
  const filesystemTimestampPaths = filesystemTimestampSemanticPaths(manifest);
  if (filesystemTimestampPaths.length > 0) {
    issues.push(
      `filesystem timestamps cannot populate portable semantic evidence: ${filesystemTimestampPaths.join(", ")}`,
    );
  }
  const leaks = leakedSensitiveEnvironmentValues(bytes.toString("utf8"), environment);
  if (leaks.length > 0) issues.push(`manifest contains sensitive environment values: ${leaks.join(", ")}`);

  if (standalone) {
    issues.push(...sourceIssues(manifest.source));
    if (
      verificationMode === PRODUCTION_EVIDENCE_VERIFICATION_MODES.STANDALONE_FINAL
    ) {
      if (!/^[0-9a-f]{40,64}$/i.test(expectedSourceCommitSha ?? "")) {
        issues.push("standalone verification requires an exact expected source commit SHA");
      } else if (manifest.source?.commitSha !== expectedSourceCommitSha) {
        issues.push("standalone evidence belongs to another source commit");
      }
    }
  } else {
    try {
      const currentSource = inspectSourceIdentity(root);
      issues.push(...sourceIssues(manifest.source, currentSource));
      if (JSON.stringify(manifest.source) !== JSON.stringify(currentSource)) {
        issues.push("recorded source identity does not match the current checkout");
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(manifest.candidateIdentifier ?? "")) {
    issues.push("release-candidate identity is missing or malformed");
  }
  if (!/^[0-9a-f]{40,64}$/i.test(manifest.source?.treeSha ?? "")) {
    issues.push("source tree binding is missing or malformed");
  }
  const execution = manifest.execution;
  if (
    !exactKeys(execution, ["runNonce", "semanticJournalSchema", "owner", "commands"]) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(execution?.runNonce ?? "") ||
    execution?.semanticJournalSchema !== PRODUCTION_EVIDENCE_JOURNAL_SCHEMA ||
    !exactKeys(execution?.owner, ["process", "wrapper"]) ||
    !exactKeys(execution?.owner?.process, ["pid", "parentPid"]) ||
    !Number.isSafeInteger(execution?.owner?.process?.pid) ||
    execution.owner.process.pid <= 0 ||
    !Number.isSafeInteger(execution.owner.process.parentPid) ||
    execution.owner.process.parentPid < 0 ||
    !exactKeys(execution?.owner?.wrapper, ["version", "path", "sha256"]) ||
    execution.owner.wrapper.version !== PRODUCTION_EVIDENCE_WRAPPER_VERSION ||
    execution.owner.wrapper.path !== "scripts/production-artifact-evidence.mjs" ||
    !/^[0-9a-f]{64}$/.test(execution.owner.wrapper.sha256 ?? "") ||
    !exactKeys(execution?.commands, ["dependencyInstall", "generatedSourceCheck", "build"]) ||
    execution.commands.dependencyInstall !== DEPENDENCY_INSTALL_COMMAND ||
    execution.commands.generatedSourceCheck !== GENERATED_SOURCE_CHECK_COMMAND ||
    execution.commands.build !== BUILD_COMMAND
  ) {
    issues.push("semantic execution binding is missing, malformed, or non-canonical");
  } else {
    try {
      const wrapper = await productionEvidenceWrapperIdentity(root);
      if (JSON.stringify(wrapper) !== JSON.stringify(execution.owner.wrapper)) {
        issues.push("executing wrapper version or source hash mismatch");
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }
  if (manifest.evidenceKind !== "local-production-mode-artifact") {
    issues.push("evidence kind must identify a local production-mode artifact");
  }
  if (manifest.build?.mode !== "production") issues.push("development-mode evidence is not accepted");
  try {
    assertBuildContract(manifest.build, manifest.build?.developmentOnlyFlags ?? {});
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  if (
    JSON.stringify(manifest.build?.developmentOnlyFlags) !==
      JSON.stringify(Object.fromEntries(DEVELOPMENT_ONLY_FLAGS.map((name) => [name, false])))
  ) {
    issues.push("development-only flag identity is incomplete or malformed");
  }
  if (manifest.generatedSourceCheck?.status !== "passed") {
    issues.push("generated-source drift check did not pass");
  }
  if (
    !exactKeys(manifest.generatedSourceCheck, ["command", "status", "startedAt", "completedAt", "processExitCode", "processSignal"]) ||
    manifest.generatedSourceCheck?.command !== GENERATED_SOURCE_CHECK_COMMAND ||
    manifest.generatedSourceCheck?.processExitCode !== 0 ||
    manifest.generatedSourceCheck?.processSignal !== null
  ) {
    issues.push("generated-source drift check command is not canonical");
  }
  if (
    manifest.dependencies?.processExitCode !== 0 ||
    manifest.dependencies?.processSignal !== null
  ) {
    issues.push("dependency installation did not complete successfully");
  }
  if (
    manifest.build?.processExitCode !== 0 ||
    manifest.build?.processSignal !== null ||
    !exactKeys(manifest.artifactInventory, ["status", "startedAt", "completedAt"]) ||
    manifest.artifactInventory?.status !== "completed"
  ) {
    issues.push("build or artifact inventory did not complete successfully");
  }
  if (
    manifest.build?.environmentConfiguration?.status !== "passed" ||
    manifest.build?.environmentConfiguration?.environmentValuesRecorded !== false ||
    JSON.stringify(manifest.build?.environmentConfiguration?.requiredVariableNames) !==
      JSON.stringify(REQUIRED_CONFIGURATION_SHAPE.map((alternatives) => alternatives.join("|")))
  ) {
    issues.push("required environment configuration shape was not validated safely");
  }
  const environmentIdentity = manifest.build?.environmentIdentity;
  const allowedVercelIdentity =
    environmentIdentity?.vercelEnv === null && environmentIdentity?.vercelEnvironment === null
      ? true
      : manifest.build?.applicationEnvironment === "staging"
        ? environmentIdentity?.vercelEnv === "preview" &&
          environmentIdentity?.vercelEnvironment === "staging"
        : environmentIdentity?.vercelEnv === "production" &&
          environmentIdentity?.vercelEnvironment === "production";
  if (
    environmentIdentity?.appEnv !== manifest.build?.applicationEnvironment ||
    environmentIdentity?.nextPublicAppEnv !== manifest.build?.applicationEnvironment ||
    environmentIdentity?.nodeEnv !== "production" ||
    !allowedVercelIdentity
  ) {
    issues.push("recorded application environment identity is contradictory");
  }
  if (
    JSON.stringify(Object.keys(manifest.build?.featureFlags ?? {})) !==
      JSON.stringify(SAFE_FEATURE_FLAGS) ||
    Object.values(manifest.build?.featureFlags ?? {}).some(
      (value) => value !== null && typeof value !== "boolean",
    )
  ) {
    issues.push("safe feature-flag identity is incomplete or malformed");
  }

  try {
    const dependencies = standalone
      ? await (async () => {
          const packagePath = path.join(root, "package.json");
          const lockfilePath = path.join(root, "package-lock.json");
          if (!existsSync(packagePath)) throw new Error("package.json is missing.");
          if (!existsSync(lockfilePath)) throw new Error("package-lock.json is missing.");
          const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
          return {
            packageManager: packageJson.packageManager,
            lockfile: {
              path: "package-lock.json",
              sha256: await sha256File(lockfilePath),
              version: JSON.parse(readFileSync(lockfilePath, "utf8")).lockfileVersion,
            },
          };
        })()
      : await inspectDependencyIdentity(root);
    if (manifest.dependencies?.lockfile?.path !== "package-lock.json") {
      issues.push("lockfile path is not canonical");
    }
    if (manifest.dependencies?.installedLockfile?.path !== "node_modules/.package-lock.json") {
      issues.push("installed dependency identity path is not canonical");
    }
    if (!existsSync(path.join(root, "package-lock.json"))) {
      issues.push("required lockfile is missing");
    } else if (dependencies.lockfile.sha256 !== manifest.dependencies?.lockfile?.sha256) {
      issues.push("lockfile SHA-256 mismatch");
    }
    if (
      !standalone &&
      dependencies.installedLockfile.sha256 !== manifest.dependencies?.installedLockfile?.sha256
    ) {
      issues.push("installed dependency identity does not match the npm ci result");
    }
    if (manifest.dependencies?.installCommand !== DEPENDENCY_INSTALL_COMMAND) {
      issues.push("dependencies were not installed with the canonical npm ci command");
    }
    if (dependencies.packageManager !== manifest.dependencies?.packageManager) {
      issues.push("package-manager identity mismatch");
    }
    if (dependencies.lockfile.version !== 3 || manifest.dependencies?.lockfile?.version !== 3) {
      issues.push("package-lock.json must use lockfile version 3");
    }
    if (
      manifest.toolchain?.nodeVersion !== process.version ||
      manifest.toolchain?.npmVersion !== dependencies.packageManager.split("@")[1]
    ) {
      issues.push("runtime toolchain identity mismatch");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("package-lock.json is missing")) issues.push("required lockfile is missing");
    else issues.push(message);
  }

  try {
    const artifact = await inspectProductionArtifact(
      root,
      standalone ? { requireSymlinkTargets: false, inspectTraces: false } : {},
    );
    if (artifact.sha256 !== manifest.artifact?.sha256) issues.push("artifact SHA-256 mismatch");
    if (artifact.nextBuildId !== manifest.build?.nextBuildId) {
      issues.push("Next.js BUILD_ID does not match the recorded build");
    }
    const currentArtifactCore = {
      roots: artifact.roots,
      excludedMutablePaths: artifact.excludedMutablePaths,
      hashAlgorithm: artifact.hashAlgorithm,
      sha256: artifact.sha256,
      fileCount: artifact.fileCount,
      bytes: artifact.bytes,
      files: artifact.files,
    };
    const {
      traceInventory: recordedTraceInventory,
      floorPlanRouteNftContract: recordedFloorPlanRouteNftContract,
      ...recordedArtifactCore
    } =
      manifest.artifact ?? {};
    if (JSON.stringify(recordedArtifactCore) !== JSON.stringify(currentArtifactCore)) {
      issues.push("artifact file inventory does not match the recorded manifest");
    }
    if (standalone) {
      if (
        !recordedTraceInventory ||
        recordedTraceInventory.traceFileCount <= 0 ||
        recordedTraceInventory.referenceCount <= 0 ||
        recordedTraceInventory.missingPaths?.length !== 0 ||
        recordedTraceInventory.prohibitedPaths?.length !== 0
      ) {
        issues.push("recorded traced output inventory is incomplete or unsafe");
      }
      if (!recordedFloorPlanRouteNftContractSafe(recordedFloorPlanRouteNftContract)) {
        issues.push("recorded Floor Plan route NFT contract is incomplete or unsafe");
      }
    } else {
      compareTraceInventory(recordedTraceInventory, artifact.traceInventory, issues);
      const currentFloorPlanRouteNftContract = inspectFloorPlanRouteNftContract(root);
      if (
        JSON.stringify(recordedFloorPlanRouteNftContract) !==
        JSON.stringify(currentFloorPlanRouteNftContract)
      ) {
        issues.push("Floor Plan route NFT contract does not match the recorded artifact");
      }
      if (
        JSON.stringify(manifest.artifact) !==
        JSON.stringify({
          ...currentArtifactCore,
          traceInventory: artifact.traceInventory,
          floorPlanRouteNftContract: currentFloorPlanRouteNftContract,
        })
      ) {
        issues.push("artifact file inventory does not match the recorded manifest");
      }
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  const timestamps = [
    manifest.cycleStartedAt,
    manifest.dependencies?.installStartedAt,
    manifest.dependencies?.installCompletedAt,
    manifest.generatedSourceCheck?.startedAt,
    manifest.generatedSourceCheck?.completedAt,
    manifest.build?.startedAt,
    manifest.build?.completedAt,
    manifest.artifactInventory?.startedAt,
    manifest.artifactInventory?.completedAt,
    manifest.createdAt,
  ];
  if (
    timestamps.some((value) => !canonicalUtcTimestamp(value))
  ) {
    issues.push("evidence timestamps must use valid UTC ISO 8601 values");
  }
  if (
    timestamps.every((value) => value && !Number.isNaN(Date.parse(value))) &&
    !timestamps.every((value, index) => index === 0 || Date.parse(value) >= Date.parse(timestamps[index - 1]))
  ) {
    issues.push("evidence timestamps are stale or contradictory");
  }
  if (
    !canonicalUtcTimestamp(manifest.build?.wrapperStartedAt) ||
    (canonicalUtcTimestamp(manifest.cycleStartedAt) &&
      Date.parse(manifest.build.wrapperStartedAt) < Date.parse(manifest.cycleStartedAt)) ||
    (canonicalUtcTimestamp(manifest.build?.startedAt) &&
      Date.parse(manifest.build.wrapperStartedAt) > Date.parse(manifest.build.startedAt))
  ) {
    issues.push("build wrapper start is invalid or contradicts actual build dispatch");
  }
  const futureLimit = Date.now() + 5 * 60 * 1000;
  if (timestamps.some((value) => value && Date.parse(value) > futureLimit)) {
    issues.push("evidence timestamps cannot be in the future");
  }

  if (!Array.isArray(manifest.externalControls) || manifest.externalControls.length !== EXTERNAL_CONTROLS.length) {
    issues.push("external-control checklist is incomplete");
  } else if (manifest.externalControls.some((control) => control.status !== "not_verified")) {
    issues.push("external controls must remain not_verified in repository evidence");
  } else if (JSON.stringify(manifest.externalControls) !== JSON.stringify(EXTERNAL_CONTROLS)) {
    issues.push("external-control checklist does not match the repository contract");
  }
  if (
    Array.isArray(manifest.tests) &&
    JSON.stringify(manifest.repositoryEvidence) !==
      JSON.stringify({
        status:
          manifest.tests.length === 0
            ? "pending_tests"
            : manifest.tests.every((test) => {
                const stats = test.stats ?? {};
                return (
                  test.processExitCode === 0 &&
                  Number.isSafeInteger(stats.expected) &&
                  stats.expected > 0 &&
                  stats.unexpected === 0 &&
                  stats.flaky === 0 &&
                  stats.skipped === 0
                );
              })
              ? "valid"
              : "failed",
        releaseReady: false,
        actualDeploymentVerified: false,
        statement: REPOSITORY_EVIDENCE_STATEMENT,
      })
  ) {
    issues.push("repository evidence claim is not canonical or overstates deployment verification");
  }
  if (
    manifest.build?.command !== BUILD_COMMAND ||
    manifest.build?.serverCommand !== PRODUCTION_EVIDENCE_SERVER_COMMAND ||
    manifest.build?.underlyingServerCommand !== UNDERLYING_SERVER_COMMAND
  ) {
    issues.push("build or production-server command is not canonical");
  }

  if (!Array.isArray(manifest.tests)) {
    issues.push("test evidence list is malformed");
  } else {
    if (runtimeRequired && !manifest.tests.some((test) => test.name === "runtime-smoke")) {
      issues.push("required production runtime-smoke report is missing");
    }
    for (const test of manifest.tests) {
      const report = readReport(root, test, issues, environment);
      const phaseTimings = readRuntimeSmokePhaseTimings(
        root,
        test,
        issues,
        environment,
        { report, allowFailure: allowFailedRuntimeSmoke && test.processExitCode !== 0 },
      );
      validateTestRecord(manifest, test, report, phaseTimings, issues, {
        requiredTestRepositoryRoot: standalone ? root : undefined,
        validateRequiredTestRepository: !standalone,
        allowFailedRuntimeSmoke,
      });
      if (!canonicalUtcTimestamp(test.completedAt)) {
        issues.push("test evidence timestamp must use valid UTC ISO 8601 format");
      }
      if (Date.parse(test.completedAt) < Date.parse(manifest.build.completedAt)) {
        issues.push("test evidence predates the recorded artifact");
      }
      if (Date.parse(test.completedAt) > futureLimit) {
        issues.push("test evidence timestamp cannot be in the future");
      }
    }
  }
  if (
    runtimeRequired &&
    !allowFailedRuntimeSmoke &&
    manifest.repositoryEvidence?.status !== "valid"
  ) {
    issues.push("failed evidence validation cannot produce an approval-ready result");
  }
  if (
    runtimeRequired &&
    allowFailedRuntimeSmoke &&
    manifest.repositoryEvidence?.status !== "failed"
  ) {
    issues.push("runtime-smoke failure evidence does not remain fail-closed");
  }
  return {
    valid: issues.length === 0,
    issues,
    manifest,
    verificationResult:
      issues.length === 0 &&
      verificationMode === PRODUCTION_EVIDENCE_VERIFICATION_MODES.ARCHIVE_PREFLIGHT
        ? archivePreflightVerificationResult(
            manifest,
            semanticJournal,
            verifierSourceClosure,
          )
        : null,
  };
}

function truthfulRuntimeSmokeFailureIssues(truthfulness) {
  const unexpectedIssues = truthfulness.issues.filter(
    (issue) =>
      !EXPECTED_RUNTIME_FAILURE_ISSUE_PATTERNS.some((pattern) => pattern.test(issue)),
  );
  const missingExpectedFailure = EXPECTED_RUNTIME_FAILURE_ISSUE_PATTERNS.some(
    (pattern) => !truthfulness.issues.some((issue) => pattern.test(issue)),
  );
  return missingExpectedFailure
    ? [...unexpectedIssues, "required runtime-smoke failure signals are incomplete"]
    : unexpectedIssues;
}

export async function recordProductionEvidenceTest({
  repositoryRoot,
  manifestPath,
  reportPath,
  phaseTimingPath = DEFAULT_PHASE_TIMINGS_PATH,
  name,
  command,
  processExitCode,
  completedAt = new Date().toISOString(),
  environment = process.env,
  persistManifest = true,
}) {
  const preflight = await validateProductionEvidence({
    repositoryRoot,
    manifestPath,
    verificationMode:
      PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
  });
  if (!preflight.valid) throw new Error(preflight.issues.join("; "));
  const manifest = preflight.manifest;
  const authorizedExternalRoot = environment.CERTIFICATION_EVIDENCE_ROOT?.trim();
  const absoluteReportPath = resolvedRetainedEvidencePath(
    repositoryRoot,
    reportPath,
    "test report path",
    authorizedExternalRoot,
  );
  if (!existsSync(absoluteReportPath)) throw new Error("required test report is missing");
  const reportBytes = readFileSync(absoluteReportPath);
  const reportText = reportBytes.toString("utf8");
  const report = JSON.parse(reportText);
  if (localRepositoryPathLeaks(repositoryRoot, reportText).length > 0) {
    throw new Error("test report contains machine-local repository paths");
  }
  const sensitiveKeys = sensitiveManifestKeys(report, "report");
  if (sensitiveKeys.length > 0) {
    throw new Error(`test report contains prohibited secret-bearing fields: ${sensitiveKeys.join(", ")}`);
  }
  const leaks = leakedSensitiveEnvironmentValues(reportText, environment);
  if (leaks.length > 0) {
    throw new Error(`test report contains sensitive environment values: ${leaks.join(", ")}`);
  }
  const identity = report.config?.metadata?.productionArtifactEvidence;
  if (
    identity?.schema !== PRODUCTION_EVIDENCE_SCHEMA ||
    identity?.sourceCommitSha !== manifest.source.commitSha ||
    identity?.artifactSha256 !== manifest.artifact.sha256 ||
    identity?.nextBuildId !== manifest.build.nextBuildId ||
    identity?.serverCommand !== PRODUCTION_EVIDENCE_SERVER_COMMAND ||
    identity?.buildMode !== "production"
  ) {
    throw new Error("test report metadata does not identify the recorded production artifact");
  }
  const projects = report.config?.projects;
  if (
    report.config?.configFile !== "<repository-root>/playwright.config.ts" ||
    report.config?.rootDir !== "<repository-root>/tests/e2e" ||
    !Array.isArray(projects) ||
    projects.length === 0 ||
    projects.some(
      (project) =>
        project.testDir !== "<repository-root>/tests/e2e" ||
        project.outputDir !==
          "<repository-root>/.local/production-artifact-evidence/playwright-output" ||
        (project.snapshotDir !== null &&
          project.snapshotDir !== undefined &&
          !project.snapshotDir.startsWith("<repository-root>/")),
    )
  ) {
    throw new Error("test report contains non-canonical or machine-local Playwright paths");
  }
  if (
    report.config?.webServer?.command !== PRODUCTION_EVIDENCE_SERVER_COMMAND ||
    report.config?.webServer?.url !== "http://127.0.0.1:3000" ||
    report.config?.webServer?.reuseExistingServer !== false
  ) {
    throw new Error("test report does not prove the canonical non-reused production server");
  }
  const truthfulness = validateRequiredTestReport({
    repositoryRoot: path.resolve(import.meta.dirname, ".."),
    gateId: "ci.production-runtime-smoke",
    report,
    processExitCode,
    requireMetadata: false,
  });
  if (processExitCode === 0) {
    if (!truthfulness.valid) throw new Error(truthfulness.issues.join("; "));
  } else {
    const failureIssues = truthfulRuntimeSmokeFailureIssues(truthfulness);
    if (failureIssues.length > 0) {
      throw new Error([...truthfulness.issues, ...failureIssues].join("; "));
    }
  }
  const telemetryBootstrap = readRuntimeSmokeTelemetryBootstrapEvidence(report, {
    allowFailure: processExitCode !== 0,
  });
  if (!telemetryBootstrap.valid) {
    throw new Error(telemetryBootstrap.issues.join("; "));
  }
  const absolutePhaseTimingPath = resolvedRetainedEvidencePath(
    repositoryRoot,
    phaseTimingPath,
    "runtime-smoke phase timing path",
    authorizedExternalRoot,
  );
  if (!existsSync(absolutePhaseTimingPath)) {
    throw new Error("runtime-smoke phase timing record is missing");
  }
  const phaseTimingBytes = readFileSync(absolutePhaseTimingPath);
  const phaseTimingIssues = [];
  const phaseTimings = readRuntimeSmokePhaseTimings(
    repositoryRoot,
    {
      phaseTimings: {
        path: normalizeRelativePath(
          path.relative(repositoryRoot, absolutePhaseTimingPath),
        ),
        sha256: sha256(phaseTimingBytes),
      },
    },
    phaseTimingIssues,
    environment,
    {
      allowFailure: processExitCode !== 0,
      report,
      absoluteTimingPath: absolutePhaseTimingPath,
    },
  );
  if (!phaseTimings || phaseTimingIssues.length > 0) {
    throw new Error(phaseTimingIssues.join("; "));
  }
  const stats = report.stats ?? {};
  const passed =
    processExitCode === 0 &&
    Number.isSafeInteger(stats.expected) &&
    stats.expected > 0 &&
    stats.unexpected === 0 &&
    stats.flaky === 0 &&
    stats.skipped === 0;
  const portableRecordedPath = (absolutePath) => {
    const externalRoot = authorizedExternalRoot
      ? path.resolve(authorizedExternalRoot)
      : null;
    const base =
      externalRoot && absolutePath.startsWith(`${externalRoot}${path.sep}`)
        ? externalRoot
        : repositoryRoot;
    return normalizeRelativePath(path.relative(base, absolutePath));
  };
  const test = {
    name,
    command,
    processExitCode,
    serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
    sourceCommitSha: manifest.source.commitSha,
    artifactSha256: manifest.artifact.sha256,
    nextBuildId: manifest.build.nextBuildId,
    report: {
      path: portableRecordedPath(absoluteReportPath),
      sha256: sha256(reportBytes),
    },
    phaseTimings: {
      path: portableRecordedPath(absolutePhaseTimingPath),
      sha256: sha256(phaseTimingBytes),
      wholeTestTimeoutMs: phaseTimings.wholeTestTimeoutMs,
      phaseCount: phaseTimings.phases.length,
      totalElapsedMs: phaseTimings.phases.reduce(
        (total, phase) => total + phase.elapsedMs,
        0,
      ),
    },
    telemetryBootstrap: telemetryBootstrap.summary,
    stats,
    completedAt,
  };
  if (!persistManifest) {
    return { manifest, test, report, phaseTimings, telemetryBootstrap, truthfulness };
  }
  manifest.tests = [...manifest.tests.filter((entry) => entry.name !== name), test];
  manifest.repositoryEvidence.status = passed ? "valid" : "failed";
  manifest.repositoryEvidence.releaseReady = false;
  manifest.repositoryEvidence.actualDeploymentVerified = false;
  await writeProductionEvidenceManifest({ repositoryRoot, manifestPath, manifest });
  return manifest;
}

export async function verifyRuntimeSmokeFailureEvidence({
  repositoryRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
  reportPath = DEFAULT_REPORT_PATH,
  phaseTimingPath = DEFAULT_PHASE_TIMINGS_PATH,
  environment = process.env,
}) {
  const root = path.resolve(repositoryRoot);
  const fullValidation = await validateProductionEvidence({
    repositoryRoot: root,
    manifestPath,
    verificationMode:
      PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_RUNTIME_FAILURE,
    environment,
  });
  if (!fullValidation.valid) throw new Error(fullValidation.issues.join("; "));
  const manifest = fullValidation.manifest;
  const absoluteReportPath = resolveRepositoryPath(root, reportPath, "test report path");
  const absoluteTimingPath = resolveRepositoryPath(
    root,
    phaseTimingPath,
    "runtime-smoke phase timing path",
  );
  const reportBytes = readFileSync(absoluteReportPath);
  const timingBytes = readFileSync(absoluteTimingPath);
  const report = JSON.parse(reportBytes.toString("utf8"));
  const test = manifest.tests?.find((candidate) => candidate.name === "runtime-smoke");
  const issues = [];
  if (
    manifest.repositoryEvidence?.status !== "failed" ||
    manifest.repositoryEvidence?.releaseReady !== false ||
    !test ||
    test.processExitCode === 0
  ) {
    issues.push("runtime-smoke failure evidence does not remain fail-closed");
  }
  if (
    test?.sourceCommitSha !== manifest.source?.commitSha ||
    test?.artifactSha256 !== manifest.artifact?.sha256 ||
    test?.nextBuildId !== manifest.build?.nextBuildId
  ) {
    issues.push("runtime-smoke failure evidence is bound to another source or artifact");
  }
  if (
    test?.report?.path !== reportPath ||
    test?.report?.sha256 !== sha256(reportBytes) ||
    test?.phaseTimings?.path !== phaseTimingPath ||
    test?.phaseTimings?.sha256 !== sha256(timingBytes)
  ) {
    issues.push("runtime-smoke failure evidence hashes or paths are contradictory");
  }
  const timing = readRuntimeSmokePhaseTimings(
    root,
    {
      phaseTimings: {
        path: phaseTimingPath,
        sha256: sha256(timingBytes),
      },
    },
    issues,
    environment,
    { allowFailure: true, report },
  );
  if (
    timing &&
    (test?.phaseTimings?.wholeTestTimeoutMs !== timing.wholeTestTimeoutMs ||
      test?.phaseTimings?.phaseCount !== timing.phases.length ||
      test?.phaseTimings?.totalElapsedMs !==
        timing.phases.reduce((total, phase) => total + phase.elapsedMs, 0))
  ) {
    issues.push("runtime-smoke failure timing summary is contradictory");
  }
  const truthfulness = validateRequiredTestReport({
    repositoryRoot: path.resolve(import.meta.dirname, ".."),
    gateId: "ci.production-runtime-smoke",
    report,
    processExitCode: test?.processExitCode ?? 1,
    requireMetadata: false,
  });
  issues.push(...truthfulRuntimeSmokeFailureIssues(truthfulness));
  if (JSON.stringify(test?.stats) !== JSON.stringify(report.stats)) {
    issues.push("runtime-smoke failure aggregate stats disagree with the test report");
  }
  if (issues.length > 0) throw new Error(issues.join("; "));
  return { manifest, report, timing, failure: timing.failure };
}

function npmVersion(repositoryRoot) {
  return run(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], {
    cwd: repositoryRoot,
    stdio: ["ignore", "pipe", "pipe"],
  }).stdout.trim();
}

export function resolveProductionEvidenceToolchain({
  repositoryRoot,
  nodeVersion = process.version,
  npmVersionReader = npmVersion,
}) {
  const packageManager = JSON.parse(
    readFileSync(path.join(repositoryRoot, "package.json"), "utf8"),
  ).packageManager;
  if (!/^npm@\d+\.\d+\.\d+$/.test(packageManager ?? "")) {
    throw new Error("package.json must declare an exact npm packageManager version");
  }
  const actualNpmVersion = npmVersionReader(repositoryRoot);
  if (actualNpmVersion !== packageManager.split("@")[1]) {
    throw new Error("executing npm version does not match the committed package manager identity");
  }
  return { nodeVersion, npmVersion: actualNpmVersion };
}

async function buildEvidence(repositoryRoot, manifestPath) {
  const candidateIdentifier = process.env.PRODUCTION_EVIDENCE_CANDIDATE_ID?.trim();
  const applicationEnvironment = process.env.APP_ENV?.trim();
  const catalogStrictValidation = process.env.CATALOG_STRICT_VALIDATION === "true";
  assertBuildContract(
    { applicationEnvironment, catalogStrictValidation },
    safeBuildFlags(process.env),
  );
  const originalIdentityEnvironment = {
    ...process.env,
    NEXT_PUBLIC_APP_ENV:
      process.env.NEXT_PUBLIC_APP_ENV?.trim() || applicationEnvironment,
    NODE_ENV: "production",
  };
  environmentIdentity(originalIdentityEnvironment, applicationEnvironment);
  const source = inspectSourceIdentity(repositoryRoot);
  const issues = sourceIssues(source);
  if (issues.length > 0) throw new Error(issues.join("; "));
  if (existsSync(path.join(repositoryRoot, ".next"))) {
    throw new Error("Refusing to create evidence over an existing .next directory; use a fresh clean checkout.");
  }
  validateConfigurationShape(process.env);

  const environment = {
    ...process.env,
    APP_ENV: applicationEnvironment,
    NEXT_PUBLIC_APP_ENV: applicationEnvironment,
    CATALOG_STRICT_VALIDATION: "true",
    NODE_ENV: "production",
  };
  const toolchain = resolveProductionEvidenceToolchain({ repositoryRoot });
  const journal = await initializeProductionEvidenceSemanticJournal({
    repositoryRoot,
    candidateIdentifier,
    source,
    buildContract: { applicationEnvironment, catalogStrictValidation },
    toolchain,
  });
  console.log(`semantic_event_run_nonce=${journal.runNonce}`);
  const execute = (action, command, args) =>
    executeProductionEvidenceChild({
      repositoryRoot,
      expectedRunNonce: journal.runNonce,
      action,
      dispatch: () => run(command, args, {
        cwd: repositoryRoot,
        env: environment,
        stdio: "inherit",
        allowFailure: true,
      }),
    });
  execute(
    "install",
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["ci", "--include=dev"],
  );
  execute(
    "generatedSourceCheck",
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "ts-node",
      "--transpile-only",
      "--compiler-options",
      '{"module":"CommonJS","moduleResolution":"node"}',
      "scripts/generate-surface-material-runtime.ts",
      "--check",
    ],
  );
  execute(
    "build",
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "build"],
  );
  const result = await recoverProductionEvidenceFromSemanticJournal({
    repositoryRoot,
    manifestPath,
    expectedRunNonce: journal.runNonce,
    environment,
    toolchain,
  });
  console.log(
    `Verified ${result.manifest.artifact.floorPlanRouteNftContract.targetCount} Floor Plan route NFT manifests with zero test-source edges.`,
  );
  console.log(
    `Recorded production artifact ${result.manifest.artifact.sha256} for ${result.manifest.source.commitSha}.`,
  );
}

export async function createProductionEvidenceBundle({
  repositoryRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
  reportPath = DEFAULT_REPORT_PATH,
  bundlePath = DEFAULT_BUNDLE_PATH,
  environment = process.env,
}) {
  const root = path.resolve(repositoryRoot);
  if (normalizeRelativePath(bundlePath) !== DEFAULT_BUNDLE_PATH) {
    throw new Error(
      `evidence bundle path must be exactly ${DEFAULT_BUNDLE_PATH}`,
    );
  }
  const uploadDirectory = resolveRepositoryPath(
    root,
    DEFAULT_UPLOAD_DIRECTORY,
    "evidence upload directory",
  );
  if (uploadDirectory !== path.join(root, DEFAULT_UPLOAD_DIRECTORY)) {
    throw new Error("evidence upload directory is not the dedicated safe path");
  }
  rmSync(uploadDirectory, { recursive: true, force: true });
  const result = await validateProductionEvidence({
    repositoryRoot: root,
    manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
    environment,
  });
  if (!result.valid) throw new Error(result.issues.join("; "));
  const artifactLeaks = await sensitiveArtifactEnvironmentValues(root, environment);
  if (artifactLeaks.length > 0) {
    throw new Error(
      `production artifact contains sensitive environment values: ${artifactLeaks.join(", ")}`,
    );
  }

  const bundleInputs = [
    ".next",
    "public",
    ".nvmrc",
    "package.json",
    "package-lock.json",
    ...PRODUCTION_EVIDENCE_VERIFIER_SOURCE_PATHS,
    manifestPath,
    `${manifestPath}.sha256`,
    reportPath,
    DEFAULT_PHASE_TIMINGS_PATH,
  ];
  for (const relativePath of bundleInputs) {
    const absolutePath = resolveRepositoryPath(root, relativePath, "evidence bundle input");
    if (!existsSync(absolutePath)) {
      throw new Error(`evidence bundle input is missing: ${relativePath}`);
    }
  }
  await mkdir(uploadDirectory, { recursive: true });
  const absoluteBundlePath = resolveRepositoryPath(root, bundlePath, "evidence bundle path");
  run(
    "tar",
    [
      "-czf",
      absoluteBundlePath,
      ...ARTIFACT_EXCLUSIONS.map((excludedPath) => `--exclude=${excludedPath}`),
      ...bundleInputs,
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  const bundleSha256 = await sha256File(absoluteBundlePath);
  writeFileSync(
    `${absoluteBundlePath}.sha256`,
    `${bundleSha256}  ${path.basename(absoluteBundlePath)}\n`,
  );
  console.log(
    `Prepared standalone evidence bundle ${bundleSha256} for ${result.manifest.source.commitSha}.`,
  );
  return { bundlePath, bundleSha256, manifest: result.manifest };
}

async function serveEvidence(repositoryRoot, manifestPath) {
  const result = await validateProductionEvidence({
    repositoryRoot,
    manifestPath,
    verificationMode:
      PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
  });
  if (!result.valid) throw new Error(result.issues.join("; "));
  const manifest = result.manifest;
  const port = "3000";
  const environment = {
    ...process.env,
    NODE_ENV: "production",
    APP_ENV: manifest.build.applicationEnvironment,
    NEXT_PUBLIC_APP_ENV: manifest.build.applicationEnvironment,
    CATALOG_STRICT_VALIDATION: "true",
    PRODUCTION_ARTIFACT_EVIDENCE: "1",
    PRODUCTION_ARTIFACT_BUILD_ID: manifest.build.nextBuildId,
    PRODUCTION_ARTIFACT_SHA256: manifest.artifact.sha256,
    PRODUCTION_ARTIFACT_COMMIT_SHA: manifest.source.commitSha,
  };
  for (const name of [...SAFE_FEATURE_FLAGS, ...DEVELOPMENT_ONLY_FLAGS]) delete environment[name];
  for (const [name, enabled] of Object.entries(manifest.build.featureFlags)) {
    if (enabled !== null) environment[name] = enabled ? "true" : "false";
  }
  for (const name of DEVELOPMENT_ONLY_FLAGS) environment[name] = "false";
  const server = spawn(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["run", "start", "--", "--hostname", "127.0.0.1", "--port", port],
    { cwd: repositoryRoot, env: environment, stdio: "inherit" },
  );
  let terminating = false;
  const stopServer = (signal) => {
    terminating = true;
    server.kill(signal);
  };
  process.once("SIGINT", stopServer);
  process.once("SIGTERM", stopServer);
  const exitCode = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("exit", (code) => resolve(code));
  });
  process.removeListener("SIGINT", stopServer);
  process.removeListener("SIGTERM", stopServer);
  if (!terminating && exitCode !== 0) {
    throw new Error(`Production server exited with status ${exitCode ?? "unknown"}.`);
  }
}

async function smokeEvidence(repositoryRoot, manifestPath, reportPath) {
  const preflight = await validateProductionEvidence({
    repositoryRoot,
    manifestPath,
    verificationMode:
      PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
  });
  if (!preflight.valid) throw new Error(preflight.issues.join("; "));
  const manifest = preflight.manifest;
  const absoluteReportPath = resolveRepositoryPath(repositoryRoot, reportPath, "test report path");
  if (existsSync(absoluteReportPath)) rmSync(absoluteReportPath);
  const absolutePhaseTimingPath = resolveRepositoryPath(
    repositoryRoot,
    DEFAULT_PHASE_TIMINGS_PATH,
    "runtime-smoke phase timing path",
  );
  if (existsSync(absolutePhaseTimingPath)) rmSync(absolutePhaseTimingPath);
  const environment = {
    ...process.env,
    CI: "true",
    APP_ENV: manifest.build.applicationEnvironment,
    NEXT_PUBLIC_APP_ENV: manifest.build.applicationEnvironment,
    CATALOG_STRICT_VALIDATION: "true",
    PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
    PRODUCTION_EVIDENCE_MANIFEST: manifestPath,
    PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
    RUNTIME_SMOKE_PHASE_TIMINGS_PATH: DEFAULT_PHASE_TIMINGS_PATH,
    PRODUCTION_EVIDENCE_JOURNAL_PATH: DEFAULT_JOURNAL_PATH,
    PRODUCTION_EVIDENCE_EXPECTED_MANIFEST_SHA256: sha256(
      readFileSync(resolveRepositoryPath(repositoryRoot, manifestPath, "manifest path")),
    ),
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: manifest.build.nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: manifest.artifact.sha256,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
    PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: manifest.source.treeSha,
  };
  const playwright = run(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["playwright", "test", "tests/e2e/00-runtime-smoke.spec.ts", "--project=chromium"],
    {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
      allowFailure: true,
    },
  );
  if (!existsSync(absoluteReportPath)) throw new Error("required test report is missing");
  canonicalizeProductionEvidenceReport(repositoryRoot, reportPath);
  bindRuntimeSmokeFailureToReport(
    repositoryRoot,
    reportPath,
    DEFAULT_PHASE_TIMINGS_PATH,
  );
  await recordProductionEvidenceTest({
    repositoryRoot,
    manifestPath,
    reportPath,
    phaseTimingPath: DEFAULT_PHASE_TIMINGS_PATH,
    name: "runtime-smoke",
    command: RUNTIME_SMOKE_COMMAND,
    processExitCode: playwright.status ?? 1,
  });
  if (playwright.status !== 0) process.exit(playwright.status ?? 1);
  const finalResult = await validateProductionEvidence({
    repositoryRoot,
    manifestPath,
    verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
  });
  if (!finalResult.valid) throw new Error(finalResult.issues.join("; "));
  console.log(
    `Verified production smoke against artifact ${finalResult.manifest.artifact.sha256}.`,
  );
}

async function cli() {
  const repositoryRoot = process.cwd();
  const command = process.argv[2];
  const manifestPath =
    process.env.PRODUCTION_EVIDENCE_MANIFEST?.trim() || DEFAULT_MANIFEST_PATH;
  const reportPath =
    process.env.PLAYWRIGHT_JSON_OUTPUT_FILE?.trim() || DEFAULT_REPORT_PATH;
  if (command === "build") await buildEvidence(repositoryRoot, manifestPath);
  else if (command === "recover") {
    const toolchain = resolveProductionEvidenceToolchain({ repositoryRoot });
    const result = await recoverProductionEvidenceFromSemanticJournal({
      repositoryRoot,
      manifestPath,
      expectedRunNonce: process.env.PRODUCTION_EVIDENCE_RUN_NONCE?.trim(),
      environment: { ...process.env, NODE_ENV: "production" },
      toolchain,
    });
    console.log(
      `Recovered production artifact evidence ${result.manifest.artifact.sha256} from its semantic event journal.`,
    );
  }
  else if (command === "verify-floor-plan-traces") {
    const result = inspectFloorPlanRouteNftContract(repositoryRoot);
    console.log(JSON.stringify(result, null, 2));
  }
  else if (command === "verify-preflight") {
    const result = await validateProductionEvidence({
      repositoryRoot,
      manifestPath,
      verificationMode:
        PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_PREFLIGHT,
    });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log("Production artifact canonical preflight valid.");
  }
  else if (command === "serve") await serveEvidence(repositoryRoot, manifestPath);
  else if (command === "smoke") await smokeEvidence(repositoryRoot, manifestPath, reportPath);
  else if (command === "verify-runtime-failure") {
    const result = await verifyRuntimeSmokeFailureEvidence({
      repositoryRoot,
      manifestPath,
      reportPath,
    });
    console.log(
      `Verified structured ${result.failure.failureKind} runtime-smoke failure evidence.`,
    );
  } else if (command === "bundle") {
    await createProductionEvidenceBundle({
      repositoryRoot,
      manifestPath,
      reportPath,
    });
  } else if (command === ARCHIVE_PREFLIGHT_COMMAND) {
    const result = await validateProductionEvidence({
      repositoryRoot,
      manifestPath,
      verificationMode:
        PRODUCTION_EVIDENCE_VERIFICATION_MODES.ARCHIVE_PREFLIGHT,
      expectedArchiveIdentity: archivePreflightExpectedIdentity(process.env),
    });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log(JSON.stringify(result.verificationResult, null, 2));
  } else if (command === "verify-standalone") {
    const result = await validateProductionEvidence({
      repositoryRoot,
      manifestPath,
      verificationMode:
        PRODUCTION_EVIDENCE_VERIFICATION_MODES.STANDALONE_FINAL,
      expectedSourceCommitSha:
        process.env.PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA?.trim(),
    });
    if (!result.valid) throw new Error(result.issues.join("; "));
    const { verifyFinalCertificationEvidence } = await import(
      "./production-certification-evidence.mjs"
    );
    const certification = verifyFinalCertificationEvidence({
      artifactRoot: repositoryRoot,
      manifestPath,
      environment: process.env,
    });
    console.log(JSON.stringify(certification));
  } else if (command === "verify") {
    const result = await validateProductionEvidence({
      repositoryRoot,
      manifestPath,
      verificationMode: PRODUCTION_EVIDENCE_VERIFICATION_MODES.REPOSITORY_FINAL,
    });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log(
      `Production artifact evidence valid for ${result.manifest.source.commitSha} (${result.manifest.artifact.sha256}).`,
    );
  } else {
    throw new Error(
      "Usage: production-artifact-evidence.mjs build|recover|verify-floor-plan-traces|verify-preflight|verify-archive-preflight|serve|smoke|verify-runtime-failure|bundle|verify|verify-standalone",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
