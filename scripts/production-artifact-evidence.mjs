import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { validateRequiredTestReport } from "./required-test-truthfulness.mjs";
import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  RUNTIME_SMOKE_OVERHEAD_BUDGETS,
  RUNTIME_SMOKE_PHASE_BUDGETS,
  RUNTIME_SMOKE_PHASE_TIMING_SCHEMA,
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
} from "./runtime-smoke-phase-budget.mjs";
import {
  validateRuntimeSmokeFailureProvenance,
} from "./runtime-smoke-failure-evidence.mjs";

export const PRODUCTION_EVIDENCE_SCHEMA =
  "interior-ai.production-artifact-evidence.v1";
export const PRODUCTION_EVIDENCE_SERVER_COMMAND =
  "npm run evidence:production:serve";

const DEFAULT_EVIDENCE_DIRECTORY = ".local/production-artifact-evidence";
const DEFAULT_MANIFEST_PATH = `${DEFAULT_EVIDENCE_DIRECTORY}/manifest.json`;
const DEFAULT_REPORT_PATH = `${DEFAULT_EVIDENCE_DIRECTORY}/runtime-smoke.json`;
const DEFAULT_PHASE_TIMINGS_PATH =
  `${DEFAULT_EVIDENCE_DIRECTORY}/runtime-smoke-phases.json`;
const DEFAULT_UPLOAD_DIRECTORY = `${DEFAULT_EVIDENCE_DIRECTORY}/upload`;
const DEFAULT_BUNDLE_PATH = `${DEFAULT_UPLOAD_DIRECTORY}/ch0016-ch0017-evidence-bundle.tar.gz`;
const GENERATED_SOURCE_CHECK_COMMAND =
  "npx ts-node --transpile-only --compiler-options '{\"module\":\"CommonJS\",\"moduleResolution\":\"node\"}' scripts/generate-surface-material-runtime.ts --check";
const BUILD_COMMAND = "npm run build";
const DEPENDENCY_INSTALL_COMMAND = "npm ci --include=dev";
const UNDERLYING_SERVER_COMMAND = "npm run start";
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
  return {
    commitSha,
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

export async function createProductionEvidenceManifest(options) {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const source = inspectSourceIdentity(repositoryRoot);
  const initialSourceIssues = sourceIssues(source);
  if (initialSourceIssues.length > 0) throw new Error(initialSourceIssues.join("; "));
  if (!options.candidateIdentifier?.trim()) {
    throw new Error("PRODUCTION_EVIDENCE_CANDIDATE_ID is required.");
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(options.candidateIdentifier.trim())) {
    throw new Error("PRODUCTION_EVIDENCE_CANDIDATE_ID must use a safe immutable identifier.");
  }
  const developmentOnlyFlags = safeBuildFlags(options.environment);
  assertBuildContract(options.build, developmentOnlyFlags);
  const recordedEnvironmentIdentity = environmentIdentity(
    options.environment,
    options.build.applicationEnvironment,
  );
  const requiredVariableNames = validateConfigurationShape(options.environment);
  if (options.generatedSourceCheck?.status !== "passed") {
    throw new Error("generated-source drift check did not pass");
  }
  const [dependencies, artifact] = await Promise.all([
    inspectDependencyIdentity(repositoryRoot),
    inspectProductionArtifact(repositoryRoot),
  ]);
  if (artifact.traceInventory.missingPaths.length > 0) {
    throw new Error("traced output contains missing files");
  }
  if (artifact.traceInventory.prohibitedPaths.length > 0) {
    throw new Error("traced output contains prohibited files");
  }
  if (
    artifact.traceInventory.traceFileCount <= 0 ||
    artifact.traceInventory.referenceCount <= 0
  ) {
    throw new Error("traced output inventory is empty");
  }
  const manifest = {
    schema: PRODUCTION_EVIDENCE_SCHEMA,
    validatorVersion: 1,
    candidateIdentifier: options.candidateIdentifier.trim(),
    evidenceKind: "local-production-mode-artifact",
    source,
    dependencies: {
      ...dependencies,
      installCommand: options.dependencyInstall.command,
      installStartedAt: options.dependencyInstall.startedAt,
      installCompletedAt: options.dependencyInstall.completedAt,
    },
    toolchain: options.toolchain,
    generatedSourceCheck: options.generatedSourceCheck,
    build: {
      mode: "production",
      applicationEnvironment: options.build.applicationEnvironment,
      catalogStrictValidation: options.build.catalogStrictValidation,
      developmentOnlyFlags,
      featureFlags: safeFeatureFlags(options.environment),
      environmentConfiguration: {
        status: "passed",
        requiredVariableNames,
        environmentValuesRecorded: false,
      },
      environmentIdentity: recordedEnvironmentIdentity,
      command: options.build.command,
      serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
      underlyingServerCommand: UNDERLYING_SERVER_COMMAND,
      startedAt: options.build.startedAt,
      completedAt: options.build.completedAt,
      nextBuildId: artifact.nextBuildId,
    },
    artifact: {
      roots: artifact.roots,
      excludedMutablePaths: artifact.excludedMutablePaths,
      hashAlgorithm: artifact.hashAlgorithm,
      sha256: artifact.sha256,
      fileCount: artifact.fileCount,
      bytes: artifact.bytes,
      files: artifact.files,
      traceInventory: artifact.traceInventory,
    },
    tests: [],
    externalControls: structuredClone(EXTERNAL_CONTROLS),
    repositoryEvidence: {
      status: "pending_tests",
      releaseReady: false,
      actualDeploymentVerified: false,
      statement: REPOSITORY_EVIDENCE_STATEMENT,
    },
    createdAt: new Date().toISOString(),
  };
  const manifestText = canonicalManifestBytes(manifest).toString("utf8");
  const leaks = leakedSensitiveEnvironmentValues(manifestText, options.environment);
  if (leaks.length > 0) {
    throw new Error(`Sensitive environment values leaked into the manifest: ${leaks.join(", ")}`);
  }
  return manifest;
}

export async function writeProductionEvidenceManifest({
  repositoryRoot,
  manifestPath,
  manifest,
}) {
  const absolutePath = resolveRepositoryPath(repositoryRoot, manifestPath, "manifest path");
  await mkdir(path.dirname(absolutePath), { recursive: true });
  const bytes = canonicalManifestBytes(manifest);
  writeFileSync(absolutePath, bytes);
  writeFileSync(`${absolutePath}.sha256`, `${sha256(bytes)}  ${path.basename(absolutePath)}\n`);
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

export function canonicalizeProductionEvidenceReport(repositoryRoot, reportPath) {
  const absoluteReportPath = resolveRepositoryPath(
    repositoryRoot,
    reportPath,
    "test report path",
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
) {
  const absoluteReportPath = resolveRepositoryPath(
    repositoryRoot,
    reportPath,
    "test report path",
  );
  const absoluteTimingPath = resolveRepositoryPath(
    repositoryRoot,
    phaseTimingPath,
    "runtime-smoke phase timing path",
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

function readRuntimeSmokePhaseTimings(
  repositoryRoot,
  test,
  issues,
  environment,
  { allowFailure = false, report = null } = {},
) {
  if (test.phaseTimings?.path !== DEFAULT_PHASE_TIMINGS_PATH) {
    issues.push("runtime-smoke phase timing path is not canonical");
    return null;
  }
  let timingPath;
  try {
    timingPath = resolveRepositoryPath(
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
  requireTests = true,
  standalone = false,
  expectedSourceCommitSha,
  environment = process.env,
  allowFailedRuntimeSmoke = false,
}) {
  const root = path.resolve(repositoryRoot);
  const issues = [];
  const readResult = readProductionEvidenceManifest(root, manifestPath, issues);
  if (!readResult) return { valid: false, issues, manifest: null };
  const { manifest, bytes } = readResult;
  if (manifest.schema !== PRODUCTION_EVIDENCE_SCHEMA || manifest.validatorVersion !== 1) {
    issues.push("unsupported production evidence schema or validator version");
  }
  const sensitiveKeys = sensitiveManifestKeys(manifest);
  if (sensitiveKeys.length > 0) {
    issues.push(`manifest contains prohibited secret-bearing fields: ${sensitiveKeys.join(", ")}`);
  }
  const leaks = leakedSensitiveEnvironmentValues(bytes.toString("utf8"), environment);
  if (leaks.length > 0) issues.push(`manifest contains sensitive environment values: ${leaks.join(", ")}`);

  if (standalone) {
    issues.push(...sourceIssues(manifest.source));
    if (!/^[0-9a-f]{40,64}$/i.test(expectedSourceCommitSha ?? "")) {
      issues.push("standalone verification requires an exact expected source commit SHA");
    } else if (manifest.source?.commitSha !== expectedSourceCommitSha) {
      issues.push("standalone evidence belongs to another source commit");
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
  if (manifest.generatedSourceCheck?.command !== GENERATED_SOURCE_CHECK_COMMAND) {
    issues.push("generated-source drift check command is not canonical");
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
    const { traceInventory: recordedTraceInventory, ...recordedArtifactCore } =
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
    } else {
      compareTraceInventory(recordedTraceInventory, artifact.traceInventory, issues);
      if (
        JSON.stringify(manifest.artifact) !==
        JSON.stringify({ ...currentArtifactCore, traceInventory: artifact.traceInventory })
      ) {
        issues.push("artifact file inventory does not match the recorded manifest");
      }
    }
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }

  const timestamps = [
    manifest.dependencies?.installStartedAt,
    manifest.dependencies?.installCompletedAt,
    manifest.generatedSourceCheck?.completedAt,
    manifest.build?.startedAt,
    manifest.build?.completedAt,
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
    if (requireTests && !manifest.tests.some((test) => test.name === "runtime-smoke")) {
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
    requireTests &&
    !allowFailedRuntimeSmoke &&
    manifest.repositoryEvidence?.status !== "valid"
  ) {
    issues.push("failed evidence validation cannot produce an approval-ready result");
  }
  if (
    requireTests &&
    allowFailedRuntimeSmoke &&
    manifest.repositoryEvidence?.status !== "failed"
  ) {
    issues.push("runtime-smoke failure evidence does not remain fail-closed");
  }
  return { valid: issues.length === 0, issues, manifest };
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
}) {
  const preflight = await validateProductionEvidence({
    repositoryRoot,
    manifestPath,
    requireTests: false,
  });
  if (!preflight.valid) throw new Error(preflight.issues.join("; "));
  const manifest = preflight.manifest;
  const absoluteReportPath = resolveRepositoryPath(repositoryRoot, reportPath, "test report path");
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
  const leaks = leakedSensitiveEnvironmentValues(reportText);
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
  const absolutePhaseTimingPath = resolveRepositoryPath(
    repositoryRoot,
    phaseTimingPath,
    "runtime-smoke phase timing path",
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
    process.env,
    { allowFailure: processExitCode !== 0, report },
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
  const test = {
    name,
    command,
    processExitCode,
    serverCommand: PRODUCTION_EVIDENCE_SERVER_COMMAND,
    sourceCommitSha: manifest.source.commitSha,
    artifactSha256: manifest.artifact.sha256,
    nextBuildId: manifest.build.nextBuildId,
    report: {
      path: normalizeRelativePath(path.relative(repositoryRoot, absoluteReportPath)),
      sha256: sha256(reportBytes),
    },
    phaseTimings: {
      path: normalizeRelativePath(
        path.relative(repositoryRoot, absolutePhaseTimingPath),
      ),
      sha256: sha256(phaseTimingBytes),
      wholeTestTimeoutMs: phaseTimings.wholeTestTimeoutMs,
      phaseCount: phaseTimings.phases.length,
      totalElapsedMs: phaseTimings.phases.reduce(
        (total, phase) => total + phase.elapsedMs,
        0,
      ),
    },
    stats,
    completedAt,
  };
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
    requireTests: true,
    environment,
    allowFailedRuntimeSmoke: true,
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

function runRequired(command, args, { repositoryRoot, environment }) {
  const result = run(command, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit",
    allowFailure: true,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
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
  const dependencyInstall = {
    command: DEPENDENCY_INSTALL_COMMAND,
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  runRequired(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--include=dev"], {
    repositoryRoot,
    environment,
  });
  dependencyInstall.completedAt = new Date().toISOString();

  const generatedSourceCheck = {
    command: GENERATED_SOURCE_CHECK_COMMAND,
    status: "running",
    completedAt: null,
  };
  runRequired(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "ts-node",
      "--transpile-only",
      "--compiler-options",
      '{"module":"CommonJS","moduleResolution":"node"}',
      "scripts/generate-surface-material-runtime.ts",
      "--check",
    ],
    { repositoryRoot, environment },
  );
  generatedSourceCheck.status = "passed";
  generatedSourceCheck.completedAt = new Date().toISOString();

  const build = {
    command: BUILD_COMMAND,
    startedAt: new Date().toISOString(),
    completedAt: null,
    applicationEnvironment,
    catalogStrictValidation,
  };
  runRequired(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build"], {
    repositoryRoot,
    environment,
  });
  build.completedAt = new Date().toISOString();

  const manifest = await createProductionEvidenceManifest({
    repositoryRoot,
    candidateIdentifier,
    dependencyInstall,
    generatedSourceCheck,
    build,
    toolchain: { nodeVersion: process.version, npmVersion: npmVersion(repositoryRoot) },
    environment,
  });
  await writeProductionEvidenceManifest({ repositoryRoot, manifestPath, manifest });
  console.log(
    `Recorded production artifact ${manifest.artifact.sha256} for ${manifest.source.commitSha}.`,
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
    requireTests: true,
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
    "scripts/production-artifact-evidence.mjs",
    "scripts/runtime-smoke-phase-budget.mjs",
    "scripts/runtime-smoke-failure-evidence.mjs",
    "scripts/runtime-smoke-operation-contracts.mjs",
    "scripts/runtime-smoke-operation-deadline.mjs",
    "scripts/required-test-truthfulness.mjs",
    "scripts/required-test-manifest.json",
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
    requireTests: false,
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
    requireTests: false,
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
    CATALOG_STRICT_VALIDATION: "true",
    PLAYWRIGHT_USE_PRODUCTION_SERVER: "1",
    PRODUCTION_EVIDENCE_MANIFEST: manifestPath,
    PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
    RUNTIME_SMOKE_PHASE_TIMINGS_PATH: DEFAULT_PHASE_TIMINGS_PATH,
    PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID: manifest.build.nextBuildId,
    PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256: manifest.artifact.sha256,
    PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA: manifest.source.commitSha,
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
    requireTests: true,
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
  } else if (command === "verify-standalone") {
    const result = await validateProductionEvidence({
      repositoryRoot,
      manifestPath,
      requireTests: true,
      standalone: true,
      expectedSourceCommitSha:
        process.env.PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA?.trim(),
    });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log(
      `Standalone production artifact evidence valid for ${result.manifest.source.commitSha} (${result.manifest.artifact.sha256}, ${result.manifest.build.nextBuildId}).`,
    );
  } else if (command === "verify") {
    const result = await validateProductionEvidence({
      repositoryRoot,
      manifestPath,
      requireTests: true,
    });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log(
      `Production artifact evidence valid for ${result.manifest.source.commitSha} (${result.manifest.artifact.sha256}).`,
    );
  } else {
    throw new Error(
      "Usage: production-artifact-evidence.mjs build|serve|smoke|verify-runtime-failure|bundle|verify|verify-standalone",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
