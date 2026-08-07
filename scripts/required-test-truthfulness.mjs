import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

export const REQUIRED_TEST_MANIFEST_SCHEMA =
  "interior-ai.required-test-manifest.v1";
export const REQUIRED_TEST_EVIDENCE_SCHEMA =
  "interior-ai.required-test-evidence.v1";

const DEFAULT_MANIFEST_PATH = "scripts/required-test-manifest.json";
const DEFAULT_REQUIRED_TEST_EVIDENCE_ROOT = ".local/required-test-evidence";
const DEFAULT_REQUIRED_TEST_UPLOAD_ROOT = ".local/required-test-upload";
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SENSITIVE_KEY =
  /(secret|token|password|private.?key|api.?key|access.?key|cookie|database.?url|credential)/i;
const RETAINED_TEXT_EXTENSIONS = new Set([
  ".css",
  ".html",
  ".js",
  ".json",
  ".log",
  ".md",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);
const PROHIBITED_ENVIRONMENT_OUTPUT =
  /["']?\b(?:AUTH_SECRET|NEXTAUTH_SECRET|DATABASE_URL|GOOGLE_CLIENT_SECRET|OPENAI_API_KEY|SHOPIFY_STOREFRONT_(?:ACCESS_)?TOKEN|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET)["']?\s*(?:=|:)/i;
const SHAPED_SECRET_VALUE =
  /\b(?:GOCSPX-[A-Za-z0-9_-]{8,}|sk_(?:live|test)_[A-Za-z0-9_-]{8,}|whsec_[A-Za-z0-9_-]{8,})\b/;
const GENERIC_CREDENTIAL_VALUE =
  /(?:\bgithub_pat_[A-Za-z0-9_]{10,}|\bgh[pousr]_[A-Za-z0-9_]{10,}|\bAuthorization\s*:\s*(?:Bearer|Basic)\s+\S+|-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----)/i;
const DATABASE_CONNECTION_VALUE =
  /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"'<>]+/i;
const BINARY_SIGNATURES = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x1f, 0x8b],
  [0x89, 0x50, 0x4e, 0x47],
  [0xff, 0xd8, 0xff],
  [0x1a, 0x45, 0xdf, 0xa3],
  [0x25, 0x50, 0x44, 0x46, 0x2d],
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function hasHiddenPathSegment(relativePath) {
  return normalizePath(relativePath)
    .split("/")
    .some((segment) => segment.startsWith("."));
}

function machineLocalPathPatterns() {
  return [
    /\/home\/[^\s"'<>]+/gi,
    /\/Users\/[^\s"'<>]+/gi,
    /\/(?:private\/)?tmp\/[^\s"'<>]+/gi,
    /\/(?:private\/)?var\/(?:tmp|folders)\/[^\s"'<>]+/gi,
    /\b[A-Za-z]:[\\/](?:Users[\\/]|Temp[\\/]|a[\\/])[^\s"'<>]+/gi,
  ];
}

export function sanitizePortableEvidenceText(text, repositoryRoot) {
  let sanitized = text;
  const repositoryRoots = [path.resolve(repositoryRoot), normalizePath(path.resolve(repositoryRoot))]
    .filter((root, index, values) => values.indexOf(root) === index)
    .sort((left, right) => right.length - left.length);
  for (const root of repositoryRoots) {
    sanitized = sanitized.split(root).join("<WORKSPACE>");
  }
  for (const pattern of machineLocalPathPatterns()) {
    sanitized = sanitized.replace(pattern, "<WORKSPACE>");
  }
  return sanitized;
}

function containsMachineLocalPath(text) {
  return machineLocalPathPatterns().some((pattern) => pattern.test(text));
}

function leakedSensitiveEnvironmentText(text, environment) {
  return Object.entries(environment ?? {})
    .filter(
      ([name, value]) =>
        SENSITIVE_KEY.test(name) &&
        typeof value === "string" &&
        value.length >= 8 &&
        text.includes(value),
    )
    .map(([name]) => name);
}

function sanitizeEvidenceValue(value, repositoryRoot) {
  if (typeof value === "string") {
    return sanitizePortableEvidenceText(value, repositoryRoot);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeEvidenceValue(entry, repositoryRoot));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sanitizeEvidenceValue(child, repositoryRoot),
      ]),
    );
  }
  return value;
}

function decodeInspectableText(relativePath, bytes) {
  if (
    BINARY_SIGNATURES.some(
      (signature) =>
        bytes.length >= signature.length &&
        signature.every((byte, index) => bytes[index] === byte),
    )
  ) {
    throw new Error(`retained evidence ${relativePath} has a binary or archive signature`);
  }
  if (
    bytes.some(
      (byte) => byte === 0 || (byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d),
    )
  ) {
    throw new Error(`retained evidence ${relativePath} contains binary control bytes`);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`retained evidence ${relativePath} is not valid UTF-8 text`);
  }
}

function assertRetainedTextSafe(relativePath, text, environment, parsedJson = null) {
  if (containsMachineLocalPath(text)) {
    throw new Error(`retained evidence ${relativePath} contains a machine-local path`);
  }
  if (PROHIBITED_ENVIRONMENT_OUTPUT.test(text)) {
    throw new Error(`retained evidence ${relativePath} contains prohibited environment output`);
  }
  if (SHAPED_SECRET_VALUE.test(text)) {
    throw new Error(`retained evidence ${relativePath} contains a shaped secret value`);
  }
  if (GENERIC_CREDENTIAL_VALUE.test(text)) {
    throw new Error(`retained evidence ${relativePath} contains a generic credential value`);
  }
  if (DATABASE_CONNECTION_VALUE.test(text)) {
    throw new Error(`retained evidence ${relativePath} contains a database connection value`);
  }
  const environmentLeaks = leakedSensitiveEnvironmentText(text, environment);
  if (environmentLeaks.length > 0) {
    throw new Error(
      `retained evidence ${relativePath} contains sensitive environment values: ${environmentLeaks.join(", ")}`,
    );
  }
  if (parsedJson) {
    const secretFields = sensitiveKeys(parsedJson);
    if (secretFields.length > 0) {
      throw new Error(
        `retained evidence ${relativePath} contains secret-bearing fields: ${secretFields.join(", ")}`,
      );
    }
  }
}

function listRetainedEvidenceFiles(root, relativeDirectory) {
  const directory = repositoryPath(root, relativeDirectory, "retained evidence directory");
  if (!existsSync(directory) || !statSync(directory).isDirectory()) {
    throw new Error(`retained evidence directory ${relativeDirectory} is missing`);
  }
  const files = [];
  const visit = (absoluteDirectory) => {
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true }).sort(
      (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
    )) {
      const absolutePath = path.join(absoluteDirectory, entry.name);
      const relativePath = normalizePath(path.relative(root, absolutePath));
      if (entry.isSymbolicLink()) {
        throw new Error(`retained evidence cannot contain symbolic link ${relativePath}`);
      }
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(relativePath);
      else throw new Error(`retained evidence contains unsupported entry ${relativePath}`);
    }
  };
  visit(directory);
  return files;
}

export function auditRetainedEvidenceDirectory({
  repositoryRoot,
  evidenceRoot = DEFAULT_REQUIRED_TEST_UPLOAD_ROOT,
  environment = process.env,
}) {
  const root = path.resolve(repositoryRoot);
  const files = listRetainedEvidenceFiles(root, evidenceRoot);
  if (files.length === 0) throw new Error("retained evidence upload is empty");
  for (const relativePath of files) {
    assertRetainedTextSafe("retained evidence path", relativePath, environment);
    if (!RETAINED_TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase())) {
      throw new Error(`retained evidence contains uninspectable file ${relativePath}`);
    }
    const text = decodeInspectableText(
      relativePath,
      readFileSync(path.join(root, relativePath)),
    );
    let parsedJson = null;
    if (path.extname(relativePath).toLowerCase() === ".json") {
      try {
        parsedJson = JSON.parse(text);
      } catch {
        throw new Error(`retained evidence ${relativePath} is malformed JSON`);
      }
    }
    assertRetainedTextSafe(relativePath, text, environment, parsedJson);
  }
  return files;
}

export function verifyRequiredTestEvidenceArchive({
  repositoryRoot,
  archiveRoot = DEFAULT_REQUIRED_TEST_UPLOAD_ROOT,
  environment = process.env,
}) {
  const root = path.resolve(repositoryRoot);
  const archiveAbsoluteRoot = repositoryPath(root, archiveRoot, "required-test archive root");
  const retainedFiles = auditRetainedEvidenceDirectory({
    repositoryRoot: root,
    evidenceRoot: archiveRoot,
    environment,
  });
  const archiveEntries = retainedFiles
    .map((relativePath) => normalizePath(path.relative(archiveAbsoluteRoot, path.join(root, relativePath))))
    .sort();
  if (archiveEntries.some(hasHiddenPathSegment)) {
    throw new Error("required-test archive contains a hidden path entry");
  }
  const inventoryPath = path.join(archiveAbsoluteRoot, "retained-evidence-inventory.json");
  const inventory = readJson(inventoryPath, "retained required-test evidence inventory");
  if (inventory.schema !== "interior-ai.retained-required-test-evidence.v1") {
    throw new Error("retained required-test evidence inventory schema is unsupported");
  }
  if (
    !Array.isArray(inventory.included) ||
    inventory.included.some((entry) => typeof entry !== "string" || hasHiddenPathSegment(entry))
  ) {
    throw new Error("retained required-test evidence inventory contains invalid archive entries");
  }
  const inventoryEntries = [...inventory.included].sort();
  if (new Set(inventoryEntries).size !== inventoryEntries.length) {
    throw new Error("retained required-test evidence inventory contains duplicate archive entries");
  }
  if (JSON.stringify(inventoryEntries) !== JSON.stringify(archiveEntries)) {
    throw new Error("retained required-test evidence inventory does not exactly match the archive tree");
  }
  return { inventory, archiveEntries };
}

function advisoryEvidenceClassification(relativePath) {
  const segments = relativePath.split("/");
  if (
    segments.length === 2 &&
    (segments[1] === "evidence.json" || segments[1] === "playwright.json")
  ) {
    return { category: "required-structured-evidence", gateId: segments[0] };
  }
  if (segments.length >= 3 && segments[1] === "playwright-output") {
    return {
      category: "optional-diagnostic-text",
      gateId: segments[0],
      diagnosticPath: segments.slice(2).join("/"),
    };
  }
  return { category: "prohibited-unclassified-evidence", gateId: segments[0] ?? "unknown" };
}

function optionalOmissionReason(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/binary or archive signature|binary control bytes|valid UTF-8/.test(message)) {
    return "optional-uninspectable-content";
  }
  if (/malformed JSON/.test(message)) return "optional-malformed-json";
  if (/machine-local path/.test(message)) return "optional-unportable-path";
  if (/prohibited environment output/.test(message)) return "optional-environment-output";
  if (/shaped secret value/.test(message)) return "optional-oauth-or-shaped-secret";
  if (/generic credential value/.test(message)) return "optional-credential-value";
  if (/database connection value/.test(message)) return "optional-database-url";
  if (/secret-bearing fields|sensitive environment values/.test(message)) {
    return "optional-sensitive-structure";
  }
  return "optional-policy-rejection";
}

function validateAdvisoryRequiredPair({
  repositoryRoot,
  gate,
  gateId,
  evidence,
  report,
  reportBytes,
  expectedSourceCommitSha,
  environment,
}) {
  if (
    evidence?.schema !== REQUIRED_TEST_EVIDENCE_SCHEMA ||
    evidence?.gateId !== gateId ||
    !/^[0-9a-f]{40,64}$/i.test(evidence?.sourceCommitSha ?? "") ||
    !Number.isSafeInteger(evidence?.processExitCode) ||
    evidence.processExitCode < 0 ||
    evidence.processExitCode > 255 ||
    !canonicalTimestamp(evidence?.startedAt) ||
    !canonicalTimestamp(evidence?.completedAt) ||
    Date.parse(evidence.startedAt) > Date.parse(evidence.completedAt) ||
    !["passed", "failed"].includes(evidence?.result) ||
    !Array.isArray(evidence?.diagnostics)
  ) {
    throw new Error(`required-test evidence ${gateId}/evidence.json is malformed`);
  }
  if (evidence.command !== gate.command) {
    throw new Error(`required-test evidence ${gateId} does not identify its canonical command`);
  }
  if (evidence.sourceCommitSha !== expectedSourceCommitSha) {
    throw new Error(`required-test evidence ${gateId} belongs to another source commit`);
  }
  if (evidence.artifactSha256 !== null) {
    throw new Error(`required-test evidence ${gateId} cannot claim an advisory artifact binding`);
  }
  const expectedReportPath =
    `.local/required-test-evidence/${gateId}/playwright.json`;
  if (
    evidence.report?.path !== expectedReportPath ||
    evidence.report?.sha256 !== sha256(reportBytes)
  ) {
    throw new Error(`required-test evidence ${gateId}/evidence.json does not bind playwright.json`);
  }
  const metadata = report?.config?.metadata?.requiredTestEvidence;
  const projects = report?.config?.projects;
  const stats = report?.stats;
  if (
    metadata?.schema !== REQUIRED_TEST_EVIDENCE_SCHEMA ||
    metadata?.gateId !== gateId ||
    metadata?.sourceCommitSha !== evidence.sourceCommitSha ||
    !Array.isArray(projects) ||
    projects.length === 0 ||
    projects.some((project) => typeof project?.name !== "string" || !project.name) ||
    !stats ||
    !canonicalTimestamp(stats.startTime) ||
    !Number.isFinite(stats.duration) ||
    stats.duration < 0 ||
    [stats.expected, stats.unexpected, stats.skipped, stats.flaky].some(
      (value) => !Number.isSafeInteger(value) || value < 0,
    )
  ) {
    throw new Error(`required-test evidence ${gateId}/playwright.json is structurally incomplete`);
  }
  const reportStartedAt = Date.parse(stats.startTime);
  const reportCompletedAt = reportStartedAt + stats.duration;
  const evidenceStartedAt = Date.parse(evidence.startedAt);
  const evidenceCompletedAt = Date.parse(evidence.completedAt);
  const freshnessWindowMs = Number.isFinite(gate.maxAgeMinutes)
    ? gate.maxAgeMinutes * 60 * 1_000
    : null;
  if (
    reportStartedAt < evidenceStartedAt - 1_000 ||
    reportCompletedAt > evidenceCompletedAt + 1_000
  ) {
    throw new Error(
      `required-test evidence ${gateId} report timing is outside the recorded process interval`,
    );
  }
  if (
    freshnessWindowMs !== null &&
    (Date.now() - evidenceCompletedAt > freshnessWindowMs ||
      evidenceCompletedAt - evidenceStartedAt > freshnessWindowMs ||
      Date.now() - reportCompletedAt > freshnessWindowMs)
  ) {
    throw new Error(`required-test evidence ${gateId} is stale`);
  }
  if (evidenceCompletedAt > Date.now() + 5 * 60 * 1_000) {
    throw new Error(`required-test evidence ${gateId} timestamp is in the future`);
  }
  if (
    metadata.artifactSha256 !== null ||
    metadata.releaseCandidateId !== null ||
    metadata.releaseEnvironment !== null ||
    report.config.metadata.gateA3ReleaseBaseURL !== null ||
    report.config.metadata.productionArtifactEvidence !== null
  ) {
    throw new Error(
      `required-test evidence ${gateId} cannot claim release or production-artifact identity`,
    );
  }
  const records = collectReportTests(report.suites);
  const configuredProjects = new Set(
    projects.map((project) => project.name ?? project.id).filter(Boolean),
  );
  if (
    records.some(
      (record) => !record.project || !configuredProjects.has(record.project),
    )
  ) {
    throw new Error(`required-test evidence ${gateId} contains an unexpected record project`);
  }
  const summary = {
    gateId,
    sourceCommitSha: evidence.sourceCommitSha,
    processExitCode: evidence.processExitCode,
    conclusion: evidence.result,
    discovered: records.length,
    passed: records.filter((record) => record.outcome === "passed").length,
    failed: records.filter((record) => record.outcome === "failed").length,
    skipped: records.filter((record) => record.outcome === "skipped").length,
    notRun: records.filter((record) => record.outcome === "not-run").length,
    flaky: records.filter((record) => record.outcome === "flaky").length,
    retries: records.reduce((total, record) => total + record.retries, 0),
    projects: [...new Set(records.map((record) => record.project).filter(Boolean))].sort(),
  };
  if (
    summary.passed !== stats.expected ||
    summary.skipped !== stats.skipped ||
    summary.failed !== stats.unexpected ||
    summary.flaky !== stats.flaky ||
    (evidence.processExitCode === 0 && (summary.failed > 0 || summary.notRun > 0))
  ) {
    throw new Error(`required-test evidence ${gateId} aggregate totals are contradictory`);
  }
  const truthfulness = validateRequiredTestReport({
    repositoryRoot,
    gateId,
    report,
    processExitCode: evidence.processExitCode,
    requireMetadata: true,
    expectedSourceCommitSha,
    environment,
  });
  const expectedConclusion = truthfulness.valid ? "passed" : "failed";
  if (
    evidence.result !== expectedConclusion ||
    JSON.stringify(evidence.diagnostics) !== JSON.stringify(truthfulness.issues)
  ) {
    throw new Error(
      `required-test evidence ${gateId} conclusion, process, report, or diagnostics are contradictory`,
    );
  }
  return summary;
}

export function prepareRequiredTestEvidenceUpload({
  repositoryRoot,
  evidenceRoot = DEFAULT_REQUIRED_TEST_EVIDENCE_ROOT,
  uploadRoot = DEFAULT_REQUIRED_TEST_UPLOAD_ROOT,
  environment = process.env,
  expectedSourceCommitSha,
}) {
  const root = path.resolve(repositoryRoot);
  const inputRoot = repositoryPath(root, evidenceRoot, "required-test evidence root");
  const outputRoot = repositoryPath(root, uploadRoot, "required-test upload root");
  const canonicalOutputRoot = path.join(root, DEFAULT_REQUIRED_TEST_UPLOAD_ROOT);
  if (
    normalizePath(uploadRoot) !== DEFAULT_REQUIRED_TEST_UPLOAD_ROOT ||
    outputRoot !== canonicalOutputRoot
  ) {
    throw new Error(
      `required-test upload root must be exactly ${DEFAULT_REQUIRED_TEST_UPLOAD_ROOT}`,
    );
  }
  if (inputRoot === outputRoot || outputRoot.startsWith(`${inputRoot}${path.sep}`)) {
    throw new Error("required-test upload root must be separate from raw Playwright output");
  }
  const sourceCommitSha = expectedSourceCommitSha ?? gitHead(root);
  if (!/^[0-9a-f]{40,64}$/i.test(sourceCommitSha)) {
    throw new Error("required-test upload source commit is malformed");
  }
  const manifest = loadRequiredTestManifest(root);
  const stagingUploadRoot = `${DEFAULT_REQUIRED_TEST_UPLOAD_ROOT}.staging`;
  const stagingRoot = path.join(root, stagingUploadRoot);
  rmSync(outputRoot, { recursive: true, force: true });
  rmSync(stagingRoot, { recursive: true, force: true });
  try {
    const inputFiles = listRetainedEvidenceFiles(root, evidenceRoot);
    const included = [];
    const omitted = [];
    const requiredJson = new Map();
    const requiredRawBytes = new Map();
    const requiredGateIds = new Set();
    for (const inputRelativePath of inputFiles) {
      const relativeWithinEvidence = normalizePath(
        path.relative(inputRoot, path.join(root, inputRelativePath)),
      );
      const classification = advisoryEvidenceClassification(relativeWithinEvidence);
      const rawBytes = readFileSync(path.join(root, inputRelativePath));
      const originalSha256 = sha256(rawBytes);
      const extension = path.extname(inputRelativePath).toLowerCase();
      const required = classification.category === "required-structured-evidence";
      if (/^[^/]+\/playwright-output\/\.last-run\.json$/.test(relativeWithinEvidence)) {
        omitted.push({
          path: relativeWithinEvidence,
          omissionCategory: "redundant-playwright-run-state",
          reasonCode: "redundant-with-hash-bound-playwright-report-and-evidence-envelope",
          originalSha256,
        });
        requiredGateIds.add(classification.gateId);
        continue;
      }
      if (hasHiddenPathSegment(relativeWithinEvidence)) {
        throw new Error(`required-test evidence contains unsupported hidden path ${relativeWithinEvidence}`);
      }
      try {
        assertRetainedTextSafe("retained evidence path", relativeWithinEvidence, environment);
      } catch (error) {
        if (required) throw error;
        omitted.push({
          path: `.omitted/optional-path-sha256-${sha256(Buffer.from(relativeWithinEvidence, "utf8"))}`,
          omissionCategory: "unsafe-optional-diagnostic",
          reasonCode: "optional-unsafe-path",
          originalSha256,
        });
        if (classification.category !== "prohibited-unclassified-evidence") {
          requiredGateIds.add(classification.gateId);
        }
        continue;
      }
      if (classification.category !== "prohibited-unclassified-evidence") {
        requiredGateIds.add(classification.gateId);
      }
      if (classification.category === "prohibited-unclassified-evidence") {
        omitted.push({
          path: relativeWithinEvidence,
          omissionCategory: classification.category,
          reasonCode: "unsupported-evidence-layout",
          originalSha256,
        });
        continue;
      }
      if (!RETAINED_TEXT_EXTENSIONS.has(extension)) {
        if (required) {
          throw new Error(`required-test evidence ${relativeWithinEvidence} is uninspectable`);
        }
        omitted.push({
          path: relativeWithinEvidence,
          omissionCategory: "prohibited-binary-or-uninspectable-evidence",
          reasonCode: "optional-uninspectable-extension",
          originalSha256,
        });
        continue;
      }
      let sanitizedText;
      let parsedJson = null;
      try {
        const rawText = decodeInspectableText(relativeWithinEvidence, rawBytes);
        if (extension === ".json") {
          let rawJson;
          try {
            rawJson = JSON.parse(rawText);
          } catch {
            throw new Error(`required-test evidence ${relativeWithinEvidence} is malformed JSON`);
          }
          parsedJson = sanitizeEvidenceValue(rawJson, root);
          sanitizedText = `${JSON.stringify(parsedJson, null, 2)}\n`;
        } else {
          sanitizedText = sanitizePortableEvidenceText(rawText, root);
        }
        assertRetainedTextSafe(
          relativeWithinEvidence,
          sanitizedText,
          environment,
          parsedJson,
        );
      } catch (error) {
        if (required) throw error;
        omitted.push({
          path: relativeWithinEvidence,
          omissionCategory: "unsafe-optional-diagnostic",
          reasonCode: optionalOmissionReason(error),
          originalSha256,
        });
        continue;
      }
      if (required) {
        requiredJson.set(relativeWithinEvidence, parsedJson);
        requiredRawBytes.set(relativeWithinEvidence, Buffer.from(sanitizedText, "utf8"));
      }
      const retainedWithinUpload = required
        ? path.posix.join("required-test-evidence", relativeWithinEvidence)
        : path.posix.join(
            "optional-diagnostics",
            classification.gateId,
            classification.diagnosticPath,
          );
      const outputRelativePath = normalizePath(
        path.posix.join(stagingUploadRoot, retainedWithinUpload),
      );
      const outputAbsolutePath = repositoryPath(
        root,
        outputRelativePath,
        "sanitized required-test evidence output",
      );
      mkdirSync(path.dirname(outputAbsolutePath), { recursive: true });
      writeFileSync(outputAbsolutePath, sanitizedText);
      included.push(retainedWithinUpload);
    }
    if (requiredGateIds.size === 0) {
      throw new Error("required-test evidence contains no mandatory structured evidence");
    }
    const summaries = [];
    for (const gateId of [...requiredGateIds].sort()) {
      const gate = manifest.gates.find((candidate) => candidate.id === gateId);
      if (
        !gate ||
        gate.cadence !== "advisory" ||
        gate.blocking !== false ||
        gate.runner !== "playwright" ||
        gate.artifactBinding !== "none" ||
        gate.reportPath !== `${DEFAULT_REQUIRED_TEST_EVIDENCE_ROOT}/${gateId}/evidence.json`
      ) {
        throw new Error(`required-test evidence ${gateId} is not a registered advisory gate`);
      }
      const evidencePath = `${gateId}/evidence.json`;
      const reportPath = `${gateId}/playwright.json`;
      const evidence = requiredJson.get(evidencePath);
      const report = requiredJson.get(reportPath);
      const reportBytes = requiredRawBytes.get(reportPath);
      if (!evidence || !report || !reportBytes) {
        throw new Error(`required-test evidence ${gateId} is missing evidence.json or playwright.json`);
      }
      summaries.push(
        validateAdvisoryRequiredPair({
          repositoryRoot: root,
          gate,
          gateId,
          evidence,
          report,
          reportBytes,
          expectedSourceCommitSha: sourceCommitSha,
          environment,
        }),
      );
    }
    included.push("retained-evidence-inventory.json");
    const inventory = {
      schema: "interior-ai.retained-required-test-evidence.v1",
      policy: {
        textPaths: "sanitized-to-<WORKSPACE>",
        mandatoryUnsafeOrMalformed: "bundle-rejected",
        optionalUnsafeOrUninspectable: "omitted-with-sha256-and-reason",
        rawPlaywrightDirectoriesUploaded: false,
        uploadRoot: DEFAULT_REQUIRED_TEST_UPLOAD_ROOT,
      },
      included: included.sort(),
      omitted: omitted.sort((left, right) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
      ),
      advisorySummaries: summaries,
      prohibitedContentScan: "passed",
    };
    mkdirSync(stagingRoot, { recursive: true });
    writeFileSync(
      path.join(stagingRoot, "retained-evidence-inventory.json"),
      `${JSON.stringify(inventory, null, 2)}\n`,
    );
    auditRetainedEvidenceDirectory({
      repositoryRoot: root,
      evidenceRoot: stagingUploadRoot,
      environment,
    });
    renameSync(stagingRoot, outputRoot);
    const { archiveEntries: retainedFiles } = verifyRequiredTestEvidenceArchive({
      repositoryRoot: root,
      archiveRoot: uploadRoot,
      environment,
    });
    return { included, omitted, retainedFiles };
  } catch (error) {
    rmSync(stagingRoot, { recursive: true, force: true });
    rmSync(outputRoot, { recursive: true, force: true });
    throw error;
  }
}

function repositoryPath(repositoryRoot, relativePath, description) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`${description} must be a non-empty repository-relative path`);
  }
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, relativePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${description} must remain inside the repository`);
  }
  return resolved;
}

function readJson(absolutePath, description) {
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    throw new Error(`${description} is missing`);
  }
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch {
    throw new Error(`${description} is malformed or truncated`);
  }
}

export function loadRequiredTestManifest(
  repositoryRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
) {
  const manifest = readJson(
    repositoryPath(repositoryRoot, manifestPath, "required-test manifest path"),
    "required-test manifest",
  );
  if (manifest.schema !== REQUIRED_TEST_MANIFEST_SCHEMA) {
    throw new Error("required-test manifest schema is unsupported");
  }
  if (!Array.isArray(manifest.gates) || !Array.isArray(manifest.sourceInventories)) {
    throw new Error("required-test manifest gate or source inventory is malformed");
  }
  return manifest;
}

function listFilesRecursively(root, relativeDirectory) {
  const absoluteDirectory = repositoryPath(root, relativeDirectory, "inventory root");
  if (!existsSync(absoluteDirectory) || !statSync(absoluteDirectory).isDirectory()) {
    throw new Error(`inventory root ${relativeDirectory} is missing`);
  }
  const files = [];
  const visit = (directory) => {
    const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
      left.name < right.name ? -1 : left.name > right.name ? 1 : 0,
    );
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolutePath);
      else if (entry.isFile()) files.push(normalizePath(path.relative(root, absolutePath)));
    }
  };
  visit(absoluteDirectory);
  return files;
}

export function inventoryFiles(repositoryRoot, inventory) {
  let pattern;
  try {
    pattern = new RegExp(inventory.filePattern);
  } catch {
    throw new Error(`source inventory ${inventory.id} has an invalid file pattern`);
  }
  return listFilesRecursively(repositoryRoot, inventory.root)
    .filter((file) => pattern.test(path.posix.basename(file)))
    .sort();
}

function inventoryPathSha256(files) {
  return sha256(`${files.join("\n")}\n`);
}

function packageScriptNames(gate) {
  if (typeof gate.packageScript === "string") return [gate.packageScript];
  return Array.isArray(gate.packageScripts) ? gate.packageScripts : [];
}

function packagePrerequisiteNames(gate) {
  return Array.isArray(gate.packagePrerequisites) ? gate.packagePrerequisites : [];
}

function scriptReferences(script) {
  return [...script.matchAll(/\bnpm run ([A-Za-z0-9:_-]+)/g)].map((match) => match[1]);
}

function scriptSources(script) {
  return [
    ...script.matchAll(
      /\b(?:scripts|tests)\/[A-Za-z0-9_./-]+\.(?:js|json|mjs|ts|tsx)\b/g,
    ),
  ].map((match) => match[0]);
}

function expandedPackageScriptEntries(packageScripts, rootScriptNames) {
  const entries = new Map();
  const visit = (scriptName, visiting = new Set()) => {
    if (visiting.has(scriptName)) {
      throw new Error(`package script cycle reaches ${scriptName}`);
    }
    if (entries.has(scriptName)) return;
    const script = packageScripts[scriptName];
    if (typeof script !== "string") throw new Error(`package script ${scriptName} is missing`);
    entries.set(scriptName, script);
    const nextVisiting = new Set(visiting).add(scriptName);
    for (const child of scriptReferences(script)) visit(child, nextVisiting);
  };
  for (const scriptName of rootScriptNames) visit(scriptName);
  return entries;
}

function packageClosureIdentity(entries) {
  const lines = [...entries.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([name, script]) => `${name}\u0000${script}`);
  return { expectedScriptCount: lines.length, expectedSha256: sha256(`${lines.join("\n")}\n`) };
}

function expandedPackageSources(entries) {
  const sources = new Set();
  for (const script of entries.values()) {
    for (const source of scriptSources(script)) sources.add(source);
  }
  return sources;
}

function extractWorkflowJob(workflow, jobName) {
  const jobPattern = /^  ([A-Za-z0-9_-]+):\s*$/gm;
  let match;
  while ((match = jobPattern.exec(workflow)) !== null) {
    if (match[1] !== jobName) continue;
    const start = match.index;
    const next = jobPattern.exec(workflow);
    return workflow.slice(start, next?.index ?? workflow.length);
  }
  return "";
}

function validatePlaywrightInvocation(gate, repositoryRoot, issues) {
  if (gate.runner !== "playwright") return;
  const config = gate.playwright?.config;
  const args = gate.playwright?.args;
  if (
    typeof config !== "string" ||
    config.length === 0 ||
    !Array.isArray(args) ||
    args.some((argument) => typeof argument !== "string") ||
    args[0] !== "playwright" ||
    args[1] !== "test"
  ) {
    issues.push(`gate ${gate.id} has a malformed Playwright invocation`);
    return;
  }
  let configPath;
  try {
    configPath = repositoryPath(repositoryRoot, config, `gate ${gate.id} Playwright config`);
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
    return;
  }
  if (!existsSync(configPath) || !statSync(configPath).isFile()) {
    issues.push(`gate ${gate.id} Playwright config ${config} is missing`);
  }
  if (
    gate.playwright.exactConfigOnly === true &&
    !(gate.requiredSources ?? []).includes(config)
  ) {
    issues.push(`gate ${gate.id} exact Playwright config is not a required source`);
  }
  const explicitConfigs = [];
  for (let index = 2; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "-c" || argument === "--config") {
      explicitConfigs.push(args[index + 1]);
      index += 1;
    } else if (argument.startsWith("--config=")) {
      explicitConfigs.push(argument.slice("--config=".length));
    }
  }
  if (
    explicitConfigs.some((candidate) => candidate !== config) ||
    (config !== "playwright.config.ts" && explicitConfigs.length !== 1)
  ) {
    issues.push(`gate ${gate.id} Playwright invocation does not use its exact config`);
  }
  if (gate.playwright.exactConfigOnly === true) {
    const allowedInvocations = [
      ["playwright", "test", "-c", config],
      ["playwright", "test", "--config", config],
      ["playwright", "test", `--config=${config}`],
    ];
    if (!allowedInvocations.some((allowed) => JSON.stringify(allowed) === JSON.stringify(args))) {
      issues.push(
        `gate ${gate.id} Playwright invocation must use only its exact config without filters or sharding`,
      );
    }
  }
}

function sourceContainsFocusedTest(source) {
  return /\b(?:describe|test)\.only\s*\(/.test(source);
}

function sourceContainsProhibitedSkip(source) {
  return /\b(?:describe|test)\.(?:fixme|skip)\s*\(/.test(source);
}

function skipQuotedLiteral(source, start) {
  const quote = source[start];
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  return source.length;
}

function skipComment(source, start) {
  if (source[start + 1] === "/") {
    const newline = source.indexOf("\n", start + 2);
    return newline === -1 ? source.length : newline + 1;
  }
  if (source[start + 1] === "*") {
    const end = source.indexOf("*/", start + 2);
    return end === -1 ? source.length : end + 2;
  }
  return start;
}

function slashStartsRegularExpression(source, index) {
  let cursor = index - 1;
  while (cursor >= 0 && /\s/.test(source[cursor])) cursor -= 1;
  if (cursor < 0) return true;
  if (/[({[=,:;!&|?+\-*%^~<>]/.test(source[cursor])) return true;
  if (/[A-Za-z0-9_$]/.test(source[cursor])) {
    const end = cursor + 1;
    while (cursor >= 0 && /[A-Za-z0-9_$]/.test(source[cursor])) cursor -= 1;
    return new Set([
      "await",
      "case",
      "delete",
      "in",
      "instanceof",
      "new",
      "of",
      "return",
      "throw",
      "typeof",
      "void",
      "yield",
    ]).has(source.slice(cursor + 1, end));
  }
  return false;
}

function skipRegularExpression(source, start) {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === "[") inCharacterClass = true;
    if (source[index] === "]") inCharacterClass = false;
    if (source[index] === "/" && !inCharacterClass) {
      index += 1;
      while (/[A-Za-z]/.test(source[index] ?? "")) index += 1;
      return index;
    }
    if (source[index] === "\n") return index;
    index += 1;
  }
  return source.length;
}

function assertionArgumentsEnd(source, openParen) {
  let depth = 1;
  let index = openParen + 1;
  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      index = skipQuotedLiteral(source, index);
      continue;
    }
    if (character === "/") {
      const afterComment = skipComment(source, index);
      if (afterComment !== index) {
        index = afterComment;
        continue;
      }
      if (slashStartsRegularExpression(source, index)) {
        index = skipRegularExpression(source, index);
        continue;
      }
    }
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

function assertionContainsLiteralMarker(source, start, end, marker) {
  let index = start;
  while (index < end) {
    const character = source[index];
    if (character === "/") {
      const afterComment = skipComment(source, index);
      if (afterComment !== index) {
        index = afterComment;
        continue;
      }
      if (slashStartsRegularExpression(source, index)) {
        index = skipRegularExpression(source, index);
        continue;
      }
    }
    if (character === '"' || character === "'" || character === "`") {
      const literalEnd = skipQuotedLiteral(source, index);
      if (source.slice(index + 1, literalEnd - 1).includes(marker)) return true;
      index = literalEnd;
      continue;
    }
    index += 1;
  }
  return false;
}

function sourceContainsExecutableContribution(source, marker) {
  const isIdentifierCharacter = (character) => /[A-Za-z0-9_$]/.test(character ?? "");
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === '"' || character === "'" || character === "`") {
      index = skipQuotedLiteral(source, index);
      continue;
    }
    if (character === "/") {
      const afterComment = skipComment(source, index);
      if (afterComment !== index) {
        index = afterComment;
        continue;
      }
      if (slashStartsRegularExpression(source, index)) {
        index = skipRegularExpression(source, index);
        continue;
      }
    }
    if (
      source.startsWith("assert", index) &&
      !isIdentifierCharacter(source[index - 1]) &&
      !isIdentifierCharacter(source[index + "assert".length])
    ) {
      let cursor = index + "assert".length;
      while (/\s/.test(source[cursor] ?? "")) cursor += 1;
      if (source[cursor] === ".") {
        cursor += 1;
        if (!/[A-Za-z_$]/.test(source[cursor] ?? "")) {
          index += 1;
          continue;
        }
        while (isIdentifierCharacter(source[cursor])) cursor += 1;
        while (/\s/.test(source[cursor] ?? "")) cursor += 1;
      }
      if (source[cursor] === "(") {
        const end = assertionArgumentsEnd(source, cursor);
        if (
          end !== -1 &&
          assertionContainsLiteralMarker(source, cursor + 1, end, marker)
        ) {
          return true;
        }
      }
    }
    index += 1;
  }
  return false;
}

function commandCanSwallowFailure(command) {
  return /\|\||;\s*(?:true|:|exit\s+0)(?:\s|$)/.test(command);
}

function validateGateShape(gate, issues) {
  if (!/^[a-z0-9][a-z0-9.-]+$/.test(gate.id ?? "")) {
    issues.push(`gate ${String(gate.id)} has an invalid stable requirement ID`);
  }
  if (typeof gate.invariant !== "string" || gate.invariant.trim().length === 0) {
    issues.push(`gate ${gate.id} is missing its protected invariant`);
  }
  if (!new Set(["merge-required", "release-blocking", "advisory"]).has(gate.cadence)) {
    issues.push(`gate ${gate.id} has an unknown cadence`);
  }
  if (gate.blocking !== (gate.cadence !== "advisory")) {
    issues.push(`gate ${gate.id} blocking status contradicts its cadence`);
  }
  if (typeof gate.command !== "string" || gate.command.trim().length === 0) {
    issues.push(`gate ${gate.id} is missing its canonical command`);
  }
  if (!Array.isArray(gate.requiredSources) || !Array.isArray(gate.requiredProjects)) {
    issues.push(`gate ${gate.id} has malformed required source or project coverage`);
  }
  if (
    gate.requiredCommandSources !== undefined &&
    (!Array.isArray(gate.requiredCommandSources) ||
      gate.requiredCommandSources.some((source) => typeof source !== "string" || source.length === 0))
  ) {
    issues.push(`gate ${gate.id} has malformed required command-source coverage`);
  }
  if (
    gate.forbiddenCommandFragments !== undefined &&
    (!Array.isArray(gate.forbiddenCommandFragments) ||
      gate.forbiddenCommandFragments.some(
        (fragment) => typeof fragment !== "string" || fragment.length === 0,
      ))
  ) {
    issues.push(`gate ${gate.id} has malformed forbidden command fragments`);
  }
  if (
    gate.forbidCommandFailureSwallowing !== undefined &&
    typeof gate.forbidCommandFailureSwallowing !== "boolean"
  ) {
    issues.push(`gate ${gate.id} has malformed command failure-swallowing policy`);
  }
  const contributionIds = new Set();
  for (const contribution of gate.requiredContributions ?? []) {
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(contribution.id ?? "")) {
      issues.push(`gate ${gate.id} has an invalid required contribution ID`);
    } else if (contributionIds.has(contribution.id)) {
      issues.push(`gate ${gate.id} duplicates required contribution ${contribution.id}`);
    }
    contributionIds.add(contribution.id);
    if (
      typeof contribution.source !== "string" ||
      contribution.source.length === 0 ||
      typeof contribution.marker !== "string" ||
      contribution.marker.length === 0
    ) {
      issues.push(`gate ${gate.id} has an incomplete required contribution ${contribution.id}`);
    }
  }
  if (
    gate.ci?.workflow !== undefined &&
    (typeof gate.ci.workflow !== "string" ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(gate.ci.workflow))
  ) {
    issues.push(`gate ${gate.id} has an invalid CI workflow owner`);
  }
  for (const [field, values] of [
    ["steps", gate.ci?.steps],
    ["afterSteps", gate.ci?.afterSteps],
    ["invocations", gate.ci?.invocations],
  ]) {
    if (
      values !== undefined &&
      (!Array.isArray(values) ||
        values.some((value) => typeof value !== "string" || value.length === 0))
    ) {
      issues.push(`gate ${gate.id} has malformed CI ${field}`);
    }
  }
  if (
    gate.ci?.stepInvocations !== undefined &&
    !Array.isArray(gate.ci.stepInvocations)
  ) {
    issues.push(`gate ${gate.id} has malformed CI step invocation bindings`);
  } else {
    for (const binding of gate.ci?.stepInvocations ?? []) {
      if (
        typeof binding?.step !== "string" ||
        binding.step.length === 0 ||
        typeof binding?.invocation !== "string" ||
        binding.invocation.length === 0
      ) {
        issues.push(`gate ${gate.id} has malformed CI step invocation binding`);
      }
    }
  }
  const requirementIds = new Set();
  for (const requirement of gate.requiredTests ?? []) {
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(requirement.id ?? "")) {
      issues.push(`gate ${gate.id} has an invalid test requirement ID`);
    } else if (requirementIds.has(requirement.id)) {
      issues.push(`gate ${gate.id} duplicates test requirement ${requirement.id}`);
    }
    requirementIds.add(requirement.id);
    if (!requirement.file || !requirement.title) {
      issues.push(`gate ${gate.id} has an incomplete required test identity`);
    }
  }
}

function resolveRegisteredModulePath(repositoryRoot, entryPath, modulePath) {
  const basePath = normalizePath(
    path.posix.join(path.posix.dirname(entryPath), modulePath),
  );
  const candidates = /\.[A-Za-z0-9]+$/.test(basePath)
    ? [basePath]
    : [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}.mjs`, `${basePath}.js`];
  return candidates.find((candidate) => {
    const absolutePath = path.join(repositoryRoot, candidate);
    return existsSync(absolutePath) && statSync(absolutePath).isFile();
  }) ?? null;
}

function reportOwnershipAliases(manifest, gate, inventories, repositoryRoot, issues) {
  const aliases = new Map();
  const runnableSources = new Set(expectedSources(manifest, gate, inventories));
  const supportingSources = new Set(
    (gate.supportingInventories ?? []).flatMap(
      (inventoryId) => inventories.get(inventoryId) ?? [],
    ),
  );
  const registrationGroups = new Map(
    (manifest.requiredRegistrations ?? []).map((group) => [group.id, group]),
  );
  const requiredOwnershipGroups = (manifest.requiredRegistrations ?? []).filter(
    (group) =>
      runnableSources.has(group.entry) &&
      group.entry.endsWith(".spec.ts") &&
      (group.registrations ?? []).length > 0,
  );
  const selectedGroupIds = gate.reportOwnershipRegistrations ?? [];
  const selectedGroupIdSet = new Set(selectedGroupIds);
  if (selectedGroupIdSet.size !== selectedGroupIds.length) {
    issues.push(`gate ${gate.id} duplicates an aggregator ownership registration group`);
  }
  for (const group of requiredOwnershipGroups) {
    if (!selectedGroupIdSet.has(group.id)) {
      issues.push(
        `gate ${gate.id} omits aggregator ownership registration group ${group.id}`,
      );
    }
  }
  for (const groupId of selectedGroupIds) {
    const group = registrationGroups.get(groupId);
    if (!group) {
      issues.push(`gate ${gate.id} references unknown aggregator ownership group ${groupId}`);
      continue;
    }
    if (!runnableSources.has(group.entry) || !group.entry.endsWith(".spec.ts")) {
      issues.push(
        `gate ${gate.id} aggregator owner ${group.entry} is not a runnable required spec`,
      );
    }
    for (const registration of group.registrations ?? []) {
      const source = resolveRegisteredModulePath(
        repositoryRoot,
        group.entry,
        registration.module,
      );
      if (!source) {
        issues.push(
          `required registration ${group.id} module ${registration.module} is missing`,
        );
        continue;
      }
      if (!supportingSources.has(source)) {
        issues.push(
          `gate ${gate.id} registered imported module ${source} is not classified by a supporting inventory`,
        );
      }
      if (aliases.has(source)) {
        issues.push(
          `gate ${gate.id} imported module ${source} has more than one aggregator owner`,
        );
      } else {
        aliases.set(source, group.entry);
      }
    }
  }
  return aliases;
}

export function validateRequiredTestRepository({
  repositoryRoot,
  manifestPath = DEFAULT_MANIFEST_PATH,
}) {
  const root = path.resolve(repositoryRoot);
  const issues = [];
  let manifest;
  try {
    manifest = loadRequiredTestManifest(root, manifestPath);
  } catch (error) {
    return { valid: false, issues: [error instanceof Error ? error.message : String(error)] };
  }
  const inventories = new Map();
  const inventoryIds = new Set();
  for (const inventory of manifest.sourceInventories) {
    if (!/^[a-z0-9][a-z0-9.-]+$/.test(inventory.id ?? "")) {
      issues.push(`source inventory ${String(inventory.id)} has an invalid ID`);
      continue;
    }
    if (inventoryIds.has(inventory.id)) {
      issues.push(`source inventory ${inventory.id} is duplicated`);
      continue;
    }
    inventoryIds.add(inventory.id);
    try {
      const files = inventoryFiles(root, inventory);
      inventories.set(inventory.id, files);
      const digest = inventoryPathSha256(files);
      if (files.length !== inventory.expectedFileCount || digest !== inventory.expectedPathSha256) {
        issues.push(
          `source inventory ${inventory.id} changed: expected ${inventory.expectedFileCount}/${inventory.expectedPathSha256}, found ${files.length}/${digest}`,
        );
      }
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
  }

  const packageJson = readJson(path.join(root, "package.json"), "package.json");
  const packageScripts = packageJson.scripts ?? {};
  const gateIds = new Set();
  const canonicalRunnableOwners = new Map();
  for (const gate of manifest.gates) {
    validateGateShape(gate, issues);
    if (gateIds.has(gate.id)) issues.push(`gate ${gate.id} is duplicated`);
    gateIds.add(gate.id);
    if (gate.requiredInventory && !inventories.has(gate.requiredInventory)) {
      issues.push(`gate ${gate.id} references missing source inventory ${gate.requiredInventory}`);
    }
    for (const inventoryId of gate.supportingInventories ?? []) {
      if (!inventories.has(inventoryId)) {
        issues.push(`gate ${gate.id} references missing supporting inventory ${inventoryId}`);
      }
    }
    validatePlaywrightInvocation(gate, root, issues);
    reportOwnershipAliases(manifest, gate, inventories, root, issues);
    const canonicalGateSources = new Set([
      ...(gate.requiredInventory ? inventories.get(gate.requiredInventory) ?? [] : []),
      ...(gate.requiredSources ?? []).filter(
        (source) =>
          /^scripts\/test-.*\.(?:js|mjs|ts)$/.test(source) ||
          /^tests\/e2e\/.*\.spec\.ts$/.test(source),
      ),
    ]);
    if (gate.cadence === "merge-required") {
      for (const source of canonicalGateSources) {
        const owners = canonicalRunnableOwners.get(source) ?? [];
        owners.push(gate.id);
        canonicalRunnableOwners.set(source, owners);
      }
    }
    for (const source of gate.requiredSources ?? []) {
      let absolutePath;
      try {
        absolutePath = repositoryPath(root, source, `gate ${gate.id} source`);
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
        continue;
      }
      if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
        issues.push(`gate ${gate.id} required source ${source} is missing`);
      }
    }
    for (const contribution of gate.requiredContributions ?? []) {
      if (!(gate.requiredSources ?? []).includes(contribution.source)) {
        issues.push(
          `gate ${gate.id} required contribution ${contribution.id} source ${contribution.source} is not a required source`,
        );
        continue;
      }
      const absolutePath = path.join(root, contribution.source);
      if (
        existsSync(absolutePath) &&
        statSync(absolutePath).isFile() &&
        !sourceContainsExecutableContribution(
          readFileSync(absolutePath, "utf8"),
          contribution.marker,
        )
      ) {
        issues.push(
          `gate ${gate.id} required contribution ${contribution.id} executable marker is missing from ${contribution.source}`,
        );
      }
    }
    const namedScripts = packageScriptNames(gate);
    const prerequisiteScripts = packagePrerequisiteNames(gate);
    for (const scriptName of [...namedScripts, ...prerequisiteScripts]) {
      if (typeof packageScripts[scriptName] !== "string") {
        issues.push(`gate ${gate.id} package script ${scriptName} is missing`);
      }
    }
    if (namedScripts.length > 0) {
      for (const scriptName of namedScripts) {
        if (!gate.command.includes(`npm run ${scriptName}`)) {
          issues.push(`gate ${gate.id} canonical command omits package script ${scriptName}`);
        }
      }
      for (const [name, value] of Object.entries(gate.requiredEnvironment ?? {})) {
        if (
          typeof value !== "string" ||
          !namedScripts.some((scriptName) => packageScripts[scriptName]?.includes(`${name}=${value}`))
        ) {
          issues.push(
            `gate ${gate.id} canonical package command does not set required environment ${name}`,
          );
        }
      }
      let expanded = new Set();
      try {
        const closure = expandedPackageScriptEntries(
          packageScripts,
          [...namedScripts, ...prerequisiteScripts],
        );
        expanded = expandedPackageSources(closure);
        const identity = packageClosureIdentity(closure);
        if (
          gate.packageClosure?.expectedScriptCount !== identity.expectedScriptCount ||
          gate.packageClosure?.expectedSha256 !== identity.expectedSha256
        ) {
          issues.push(
            `gate ${gate.id} package-script closure changed: expected ${gate.packageClosure?.expectedScriptCount ?? "missing"}/${gate.packageClosure?.expectedSha256 ?? "missing"}, found ${identity.expectedScriptCount}/${identity.expectedSha256}`,
          );
        }
        for (const [scriptName, command] of closure) {
          if (gate.forbidCommandFailureSwallowing && commandCanSwallowFailure(command)) {
            issues.push(
              `gate ${gate.id} package script ${scriptName} can swallow process failures`,
            );
          }
          for (const fragment of gate.forbiddenCommandFragments ?? []) {
            if (command.includes(fragment)) {
              issues.push(
                `gate ${gate.id} package script ${scriptName} contains forbidden command fragment ${fragment}`,
              );
            }
          }
        }
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
      }
      for (const source of gate.requiredSources ?? []) {
        if (/^scripts\/test-/.test(source) && !expanded.has(source)) {
          issues.push(
            `gate ${gate.id} does not execute required source ${source} through its package command`,
          );
        }
      }
      for (const source of gate.requiredCommandSources ?? []) {
        if (!(gate.requiredSources ?? []).includes(source)) {
          issues.push(`gate ${gate.id} command source ${source} is not a required source`);
        } else if (!expanded.has(source)) {
          issues.push(
            `gate ${gate.id} does not execute required command source ${source} through its package command`,
          );
        }
      }
    }
    if (gate.runner === "playwright" && !gate.allowSkips && !gate.requiredInventory) {
      for (const source of gate.requiredSources ?? []) {
        if (!source.endsWith(".spec.ts")) continue;
        const absolutePath = path.join(root, source);
        if (existsSync(absolutePath) && sourceContainsProhibitedSkip(readFileSync(absolutePath, "utf8"))) {
          issues.push(`gate ${gate.id} required spec ${source} contains a prohibited skip or fixme`);
        }
      }
    }
  }
  for (const [source, owners] of canonicalRunnableOwners) {
    if (owners.length > 1) {
      issues.push(
        `required source ${source} has more than one merge-required owner: ${owners.join(", ")}`,
      );
    }
  }

  const workflowCache = new Map();
  for (const gate of manifest.gates.filter((entry) => entry.ci)) {
    const workflowRelativePath = gate.ci.workflow ?? ".github/workflows/ci.yml";
    let workflow = workflowCache.get(workflowRelativePath);
    if (workflow === undefined) {
      let workflowPath;
      try {
        workflowPath = repositoryPath(
          root,
          workflowRelativePath,
          `gate ${gate.id} CI workflow`,
        );
      } catch (error) {
        issues.push(error instanceof Error ? error.message : String(error));
        workflowCache.set(workflowRelativePath, null);
        continue;
      }
      workflow = existsSync(workflowPath) && statSync(workflowPath).isFile()
        ? readFileSync(workflowPath, "utf8")
        : null;
      workflowCache.set(workflowRelativePath, workflow);
    }
    if (workflow === null) {
      issues.push(`CI workflow ${workflowRelativePath} for gate ${gate.id} is missing`);
      continue;
    }
    const job = extractWorkflowJob(workflow, gate.ci.job);
    if (!job) {
      issues.push(
        `CI job ${gate.ci.job} for gate ${gate.id} is missing from ${workflowRelativePath}`,
      );
      continue;
    }
    if (gate.blocking && /continue-on-error:\s*true/.test(job)) {
      issues.push(`blocking CI job ${gate.ci.job} for gate ${gate.id} cannot continue on error`);
    }
    if (gate.blocking && /\bnpm run [^\n]*\|\|\s*true\b/.test(job)) {
      issues.push(`blocking CI job ${gate.ci.job} for gate ${gate.id} cannot fail open`);
    }
    if (
      !gate.blocking &&
      workflowRelativePath === ".github/workflows/ci.yml" &&
      !/continue-on-error:\s*true/.test(job)
    ) {
      issues.push(
        `advisory CI job ${gate.ci.job} in required CI must remain explicitly non-blocking`,
      );
    }
    if (
      !gate.blocking &&
      workflowRelativePath !== ".github/workflows/ci.yml" &&
      /continue-on-error:\s*true/.test(job)
    ) {
      issues.push(
        `separate advisory CI job ${gate.ci.job} must preserve its real failure conclusion`,
      );
    }
    for (const scriptName of packageScriptNames(gate)) {
      if (!job.includes(`npm run ${scriptName}`)) {
        issues.push(`CI job ${gate.ci.job} does not invoke gate ${gate.id} (${scriptName})`);
      }
    }
    const requiredStepNames = [
      ...(typeof gate.ci.step === "string" ? [gate.ci.step] : []),
      ...(Array.isArray(gate.ci.steps) ? gate.ci.steps : []),
    ];
    const stepIndexes = requiredStepNames.map((stepName) => ({
      stepName,
      index: Math.max(
        job.indexOf(`- name: ${stepName}`),
        job.indexOf(`- uses: ${stepName}`),
      ),
    }));
    for (const { stepName, index } of stepIndexes) {
      if (index === -1) {
        issues.push(`CI job ${gate.ci.job} does not contain gate ${gate.id} step ${stepName}`);
      }
    }
    for (const prerequisiteStep of gate.ci.afterSteps ?? []) {
      const prerequisiteIndex = Math.max(
        job.indexOf(`- name: ${prerequisiteStep}`),
        job.indexOf(`- uses: ${prerequisiteStep}`),
      );
      if (prerequisiteIndex === -1) {
        issues.push(
          `CI job ${gate.ci.job} does not contain gate ${gate.id} prerequisite step ${prerequisiteStep}`,
        );
        continue;
      }
      for (const { stepName, index } of stepIndexes) {
        if (index !== -1 && index <= prerequisiteIndex) {
          issues.push(
            `CI gate ${gate.id} step ${stepName} must run after CI step ${prerequisiteStep}`,
          );
        }
      }
    }
    for (const binding of Array.isArray(gate.ci.stepInvocations)
      ? gate.ci.stepInvocations
      : []) {
      const step = stepIndexes.find((entry) => entry.stepName === binding.step);
      if (!step) {
        issues.push(
          `CI gate ${gate.id} binds an invocation to undeclared step ${binding.step}`,
        );
        continue;
      }
      if (step.index === -1) continue;
      const stepLineStart = job.lastIndexOf("\n", step.index) + 1;
      const stepIndent = job.slice(stepLineStart, step.index);
      const nextStepPattern = new RegExp(`^${stepIndent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}- (?:name|uses):`, "gm");
      nextStepPattern.lastIndex = stepLineStart + 1;
      const nextStep = nextStepPattern.exec(job);
      const stepBlock = job.slice(stepLineStart, nextStep?.index ?? job.length);
      if (!stepBlock.includes(binding.invocation)) {
        issues.push(
          `CI gate ${gate.id} step ${binding.step} does not contain its bound invocation`,
        );
      }
    }
    const requiredInvocations = Array.isArray(gate.ci.invocations)
      ? gate.ci.invocations
      : gate.ci.invocation
        ? [gate.ci.invocation]
        : [];
    for (const invocation of requiredInvocations) {
      if (!job.includes(invocation)) {
        issues.push(`CI job ${gate.ci.job} does not contain gate ${gate.id} invocation`);
      }
    }
  }

  for (const directory of manifest.staticPolicies?.forbidFocusedTestsIn ?? []) {
    let files = [];
    try {
      files = listFilesRecursively(root, directory).filter((file) =>
        /\.(?:js|mjs|ts|tsx)$/.test(file),
      );
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
    }
    for (const file of files) {
      if (sourceContainsFocusedTest(readFileSync(path.join(root, file), "utf8"))) {
        issues.push(`focused test execution is prohibited in ${file}`);
      }
    }
  }
  for (const file of manifest.staticPolicies?.failClosedPrerequisiteSources ?? []) {
    const absolutePath = path.join(root, file);
    if (!existsSync(absolutePath)) {
      issues.push(`fail-closed prerequisite source ${file} is missing`);
      continue;
    }
    const source = readFileSync(absolutePath, "utf8");
    if (/test\.info\(\)\.annotations\.push/.test(source)) {
      issues.push(`required prerequisite in ${file} can be annotated away`);
    }
    if (sourceContainsProhibitedSkip(source)) {
      issues.push(`required prerequisite in ${file} contains a prohibited skip or fixme`);
    }
  }
  for (const registrationGroup of manifest.requiredRegistrations ?? []) {
    let entrySource = "";
    try {
      const entryPath = repositoryPath(
        root,
        registrationGroup.entry,
        `required registration ${registrationGroup.id} entry`,
      );
      if (!existsSync(entryPath) || !statSync(entryPath).isFile()) {
        issues.push(`required registration entry ${registrationGroup.entry} is missing`);
        continue;
      }
      entrySource = readFileSync(entryPath, "utf8");
    } catch (error) {
      issues.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    for (const registration of registrationGroup.registrations ?? []) {
      const importText = `import { ${registration.symbol} } from "${registration.module}";`;
      if (!entrySource.includes(importText)) {
        issues.push(
          `required registration ${registrationGroup.id} does not import ${registration.symbol} from ${registration.module}`,
        );
      }
      const escapedSymbol = registration.symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (!new RegExp(`\\b${escapedSymbol}\\s*\\(\\s*\\)\\s*;`).test(entrySource)) {
        issues.push(`required registration ${registrationGroup.id} does not invoke ${registration.symbol}`);
      }
      if (
        !resolveRegisteredModulePath(
          root,
          registrationGroup.entry,
          registration.module,
        )
      ) {
        issues.push(
          `required registration ${registrationGroup.id} module ${registration.module} is missing`,
        );
      }
    }
  }
  return { valid: issues.length === 0, issues, manifest, inventories };
}

function reportFile(file) {
  const normalized = normalizePath(file ?? "").replace(/^<repository-root>\//, "");
  if (normalized.startsWith("tests/e2e/")) return normalized;
  const marker = "/tests/e2e/";
  const markerIndex = normalized.lastIndexOf(marker);
  return markerIndex >= 0
    ? normalized.slice(markerIndex + 1)
    : `tests/e2e/${normalized.replace(/^\/+/, "")}`;
}

function collectReportTests(suites, inheritedFile = "", result = []) {
  if (!Array.isArray(suites)) return result;
  for (const suite of suites) {
    if (!suite || typeof suite !== "object") continue;
    const suiteFile = typeof suite.file === "string" ? suite.file : inheritedFile;
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (!spec || typeof spec !== "object") continue;
      const file = reportFile(typeof spec.file === "string" ? spec.file : suiteFile);
      const tests = Array.isArray(spec.tests) ? spec.tests : [];
      if (tests.length === 0) {
        result.push({
          file,
          title: typeof spec.title === "string" ? spec.title : "",
          project: "",
          outcome: "not-run",
          retries: 0,
          annotations: [],
        });
      }
      for (const test of tests) {
        const results = Array.isArray(test?.results) ? test.results : [];
        const finalResult = results[results.length - 1];
        const finalStatus = typeof finalResult?.status === "string" ? finalResult.status : "";
        const retries = Math.max(
          0,
          ...results.map((entry) =>
            Number.isSafeInteger(entry?.retry) ? entry.retry : 0,
          ),
        );
        let outcome = "failed";
        if (results.length === 0) outcome = "not-run";
        else if (test.status === "skipped" || finalStatus === "skipped") outcome = "skipped";
        else if (retries > 0 || results.length > 1 || test.status === "flaky") outcome = "flaky";
        else if (spec.ok === true && test.status === "expected" && finalStatus === "passed") outcome = "passed";
        const annotations = [
          ...(Array.isArray(test.annotations) ? test.annotations : []),
          ...(Array.isArray(finalResult?.annotations) ? finalResult.annotations : []),
        ];
        result.push({
          file,
          title: typeof spec.title === "string" ? spec.title : "",
          project:
            typeof test.projectName === "string"
              ? test.projectName
              : typeof test.projectId === "string"
                ? test.projectId
                : "",
          outcome,
          retries,
          annotations,
        });
      }
    }
    collectReportTests(suite.suites, suiteFile, result);
  }
  return result;
}

function nonEmptyFilter(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return Boolean(value);
}

function sensitiveKeys(value, currentPath = "report", result = []) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => sensitiveKeys(entry, `${currentPath}[${index}]`, result));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${currentPath}.${key}`;
      if (SENSITIVE_KEY.test(key)) result.push(childPath);
      sensitiveKeys(child, childPath, result);
    }
  }
  return result;
}

function machineLocalValues(value, currentPath = "report", result = []) {
  if (typeof value === "string") {
    if (/(?:^|[\s"'(])(?:\/(?:Users|home)\/[^/\s]+\/|\/(?:tmp|var\/tmp)\/|\/private\/(?:tmp|var)\/|\/var\/folders\/|[A-Za-z]:[\\/](?:Users|Temp)[\\/])/i.test(value)) {
      result.push(currentPath);
    }
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => machineLocalValues(entry, `${currentPath}[${index}]`, result));
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      machineLocalValues(child, `${currentPath}.${key}`, result);
    }
  }
  return result;
}

function leakedSensitiveEnvironmentValues(value, environment) {
  const serialized = JSON.stringify(value);
  const leaks = [];
  for (const [name, candidate] of Object.entries(environment ?? {})) {
    if (
      SENSITIVE_KEY.test(name) &&
      typeof candidate === "string" &&
      candidate.length >= 8 &&
      serialized.includes(candidate)
    ) {
      leaks.push(name);
    }
  }
  return leaks;
}

function expectedSources(manifest, gate, inventories) {
  if (gate.requiredInventory) return inventories.get(gate.requiredInventory) ?? [];
  return (gate.requiredSources ?? []).filter((file) => file.endsWith(".spec.ts"));
}

export function validateRequiredTestReport({
  repositoryRoot,
  gateId,
  report,
  processExitCode,
  requireMetadata = true,
  validateRepository = true,
  expectedSourceCommitSha,
  expectedArtifactSha256,
  environment = process.env,
}) {
  let repository;
  if (validateRepository) {
    repository = validateRequiredTestRepository({ repositoryRoot });
  } else {
    try {
      const manifest = loadRequiredTestManifest(repositoryRoot);
      const gate = manifest.gates.find((entry) => entry.id === gateId);
      const issues = [];
      if (gate) validateGateShape(gate, issues);
      repository = { valid: issues.length === 0, issues, manifest, inventories: new Map() };
    } catch (error) {
      repository = {
        valid: false,
        issues: [error instanceof Error ? error.message : String(error)],
        manifest: null,
        inventories: new Map(),
      };
    }
  }
  const issues = [...repository.issues];
  const gate = repository.manifest?.gates.find((entry) => entry.id === gateId);
  if (!gate) return { valid: false, blocking: true, issues: [...issues, `unknown required-test gate ${gateId}`] };
  if (gate.runner !== "playwright") {
    issues.push(`gate ${gateId} does not use Playwright reporting`);
    return { valid: false, blocking: gate.blocking, issues };
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    issues.push(`gate ${gateId} report is malformed or truncated`);
    return { valid: false, blocking: gate.blocking, issues };
  }
  if (processExitCode !== 0) issues.push(`gate ${gateId} test process exited nonzero`);
  if (report.config?.forbidOnly !== true) {
    issues.push(`gate ${gateId} report does not prove focused .only execution is forbidden`);
  }
  if (
    nonEmptyFilter(report.config?.grep) ||
    nonEmptyFilter(report.config?.grepInvert) ||
    report.config?.shard !== null && report.config?.shard !== undefined
  ) {
    issues.push(`gate ${gateId} report contains an unapproved grep or shard filter`);
  }
  const configFile = normalizePath(report.config?.configFile ?? "").replace(
    /^<repository-root>\//,
    "",
  );
  const rootDir = normalizePath(report.config?.rootDir ?? "").replace(
    /^<repository-root>\//,
    "",
  );
  if (
    gate.playwright?.config &&
    configFile !== gate.playwright.config
  ) {
    issues.push(`gate ${gateId} report was produced by another Playwright configuration`);
  }
  if (rootDir !== "tests/e2e") {
    issues.push(`gate ${gateId} report uses an unexpected test root`);
  }
  const reportProjects = new Set(
    (Array.isArray(report.config?.projects) ? report.config.projects : [])
      .map((project) => project?.name ?? project?.id)
      .filter((name) => typeof name === "string"),
  );
  const requiredProjects = new Set(gate.requiredProjects);
  for (const project of requiredProjects) {
    if (!reportProjects.has(project)) issues.push(`gate ${gateId} required project ${project} is missing`);
  }
  for (const project of reportProjects) {
    if (!requiredProjects.has(project)) issues.push(`gate ${gateId} report includes unexpected project ${project}`);
  }
  if (!gate.allowRetries) {
    for (const project of Array.isArray(report.config?.projects) ? report.config.projects : []) {
      if (project?.retries !== 0) {
        issues.push(`gate ${gateId} project ${project?.name ?? project?.id ?? "unknown"} permits retries`);
      }
      if (project?.repeatEach !== 1) {
        issues.push(`gate ${gateId} project ${project?.name ?? project?.id ?? "unknown"} does not run exactly once`);
      }
    }
  }
  const ownershipIssues = [];
  const ownershipAliases = reportOwnershipAliases(
    repository.manifest,
    gate,
    repository.inventories,
    path.resolve(repositoryRoot),
    ownershipIssues,
  );
  issues.push(...ownershipIssues);
  const reportedRecords = collectReportTests(report.suites);
  for (const importedModule of ownershipAliases.keys()) {
    for (const project of requiredProjects) {
      if (
        !reportedRecords.some(
          (record) => record.file === importedModule && record.project === project,
        )
      ) {
        issues.push(
          `gate ${gateId} registered imported module ${importedModule} did not contribute test records in project ${project}`,
        );
      }
    }
  }
  const records = reportedRecords.map((record) => ({
    ...record,
    reportedFile: record.file,
    file: ownershipAliases.get(record.file) ?? record.file,
  }));
  const recordIdentities = records.map(
    (record) => `${record.file}\u0000${record.title}\u0000${record.project}`,
  );
  if (new Set(recordIdentities).size !== recordIdentities.length) {
    issues.push(`gate ${gateId} report duplicates a test identity`);
  }
  const discoveredFiles = new Set(records.map((record) => record.file));
  const requiredFiles = new Set(
    expectedSources(repository.manifest, gate, repository.inventories),
  );
  for (const file of requiredFiles) {
    if (!discoveredFiles.has(file)) issues.push(`gate ${gateId} required spec ${file} is missing from the report`);
    for (const project of requiredProjects) {
      if (!records.some((record) => record.file === file && record.project === project)) {
        issues.push(`gate ${gateId} required spec ${file} did not execute in project ${project}`);
      }
    }
  }
  for (const file of discoveredFiles) {
    if (!requiredFiles.has(file)) issues.push(`gate ${gateId} report contains out-of-scope spec ${file}`);
  }
  if (records.length === 0) issues.push(`gate ${gateId} discovered zero tests`);
  for (const record of records) {
    if (!requiredProjects.has(record.project)) {
      issues.push(
        `gate ${gateId} test record uses unexpected project ${record.project || "unknown"}: ${record.file} :: ${record.title}`,
      );
    }
  }
  for (const requirement of gate.requiredTests ?? []) {
    for (const project of gate.requiredProjects) {
      const matches = records.filter(
        (record) =>
          record.file === requirement.file &&
          record.title === requirement.title &&
          record.project === project,
      );
      if (matches.length !== 1) {
        issues.push(
          `gate ${gateId} requirement ${requirement.id} is missing or duplicated for project ${project}`,
        );
      }
    }
  }
  for (const record of records) {
    const identity = `${record.file} :: ${record.title} :: ${record.project || "unknown-project"}`;
    if (record.outcome === "skipped" && !gate.allowSkips) {
      issues.push(`gate ${gateId} required test was skipped: ${identity}`);
    } else if (record.outcome === "flaky" && !gate.allowRetries) {
      issues.push(`gate ${gateId} required test was flaky or retried: ${identity}`);
    } else if (record.outcome === "failed") {
      issues.push(`gate ${gateId} required test failed: ${identity}`);
    } else if (record.outcome === "not-run") {
      issues.push(`gate ${gateId} required test was not run: ${identity}`);
    }
    if (!gate.allowAnnotations && record.annotations.length > 0) {
      issues.push(`gate ${gateId} required test contains an unapproved annotation: ${identity}`);
    }
  }
  const stats = report.stats ?? {};
  const parsedStats = {
    expected: records.filter((record) => record.outcome === "passed").length,
    skipped: records.filter((record) => record.outcome === "skipped").length,
    unexpected: records.filter((record) => record.outcome === "failed" || record.outcome === "not-run").length,
    flaky: records.filter((record) => record.outcome === "flaky").length,
  };
  if (
    stats.expected !== parsedStats.expected ||
    stats.skipped !== parsedStats.skipped ||
    stats.unexpected !== parsedStats.unexpected ||
    stats.flaky !== parsedStats.flaky
  ) {
    issues.push(`gate ${gateId} aggregate counts do not match parsed test results`);
  }
  if (!Number.isSafeInteger(stats.expected) || stats.expected <= 0) {
    issues.push(`gate ${gateId} aggregate report contains zero passing tests`);
  }
  if (stats.unexpected !== 0) issues.push(`gate ${gateId} aggregate report contains failures`);
  if (!gate.allowSkips && stats.skipped !== 0) issues.push(`gate ${gateId} aggregate report contains skips`);
  if (!gate.allowRetries && stats.flaky !== 0) issues.push(`gate ${gateId} aggregate report contains flaky tests`);
  if (Array.isArray(report.errors) && report.errors.length > 0) {
    issues.push(`gate ${gateId} report contains top-level infrastructure errors`);
  }
  const metadata = report.config?.metadata?.requiredTestEvidence;
  if (requireMetadata) {
    if (metadata?.schema !== REQUIRED_TEST_EVIDENCE_SCHEMA || metadata?.gateId !== gateId) {
      issues.push(`gate ${gateId} report metadata does not identify the required gate`);
    }
    if (expectedSourceCommitSha && metadata?.sourceCommitSha !== expectedSourceCommitSha) {
      issues.push(`gate ${gateId} report belongs to another source commit`);
    }
    if (expectedArtifactSha256 && metadata?.artifactSha256 !== expectedArtifactSha256) {
      issues.push(`gate ${gateId} report belongs to another artifact`);
    }
  }
  const secretFields = sensitiveKeys(report);
  if (secretFields.length > 0) {
    issues.push(`gate ${gateId} report contains secret-bearing fields: ${secretFields.join(", ")}`);
  }
  const machineLocalFields = machineLocalValues(report);
  if (machineLocalFields.length > 0) {
    issues.push(`gate ${gateId} report contains machine-local paths: ${machineLocalFields.join(", ")}`);
  }
  const leakedEnvironmentValues = leakedSensitiveEnvironmentValues(report, environment);
  if (leakedEnvironmentValues.length > 0) {
    issues.push(
      `gate ${gateId} report contains sensitive environment values: ${leakedEnvironmentValues.join(", ")}`,
    );
  }
  return {
    valid: issues.length === 0,
    blocking: gate.blocking,
    issues,
    gate,
    records,
    stats,
  };
}

function canonicalizeReportValue(value, repositoryRoots) {
  if (typeof value === "string") {
    let result = value;
    for (const root of repositoryRoots) result = result.split(root).join("<repository-root>");
    return result;
  }
  if (Array.isArray(value)) return value.map((entry) => canonicalizeReportValue(entry, repositoryRoots));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        canonicalizeReportValue(child, repositoryRoots),
      ]),
    );
  }
  return value;
}

export function canonicalizeRequiredTestReport(repositoryRoot, reportPath) {
  const absolutePath = repositoryPath(repositoryRoot, reportPath, "required-test report path");
  const report = readJson(absolutePath, "required-test report");
  const roots = [path.resolve(repositoryRoot)];
  const canonical = canonicalizeReportValue(report, roots);
  writeFileSync(absolutePath, `${JSON.stringify(canonical, null, 2)}\n`);
  return canonical;
}

function canonicalTimestamp(value) {
  return UTC_TIMESTAMP.test(value ?? "") && !Number.isNaN(Date.parse(value));
}

export function validateRequiredTestEvidence({
  repositoryRoot,
  gateId,
  evidencePath,
  expectedSourceCommitSha,
  expectedArtifactSha256,
  expectedBaseURL,
}) {
  const root = path.resolve(repositoryRoot);
  const issues = [];
  let manifest;
  let gate;
  try {
    manifest = loadRequiredTestManifest(root);
    gate = manifest.gates.find((entry) => entry.id === gateId);
  } catch (error) {
    return { valid: false, blocking: true, issues: [error instanceof Error ? error.message : String(error)] };
  }
  if (!gate) return { valid: false, blocking: true, issues: [`unknown required-test gate ${gateId}`] };
  let evidence;
  try {
    evidence = readJson(
      repositoryPath(root, evidencePath, "required-test evidence path"),
      "required-test evidence",
    );
  } catch (error) {
    return { valid: false, blocking: gate.blocking, issues: [error instanceof Error ? error.message : String(error)] };
  }
  if (evidence.schema !== REQUIRED_TEST_EVIDENCE_SCHEMA || evidence.gateId !== gateId) {
    issues.push(`gate ${gateId} evidence schema or identity is invalid`);
  }
  if (!/^[a-f0-9]{40}$/.test(evidence.sourceCommitSha ?? "")) {
    issues.push(`gate ${gateId} evidence source commit identity is missing or invalid`);
  }
  if (
    gate.artifactBinding !== "none" &&
    !/^[a-f0-9]{64}$/.test(evidence.artifactSha256 ?? "")
  ) {
    issues.push(`gate ${gateId} evidence artifact identity is missing or invalid`);
  }
  if (evidence.command !== gate.command) {
    issues.push(`gate ${gateId} evidence command is not canonical`);
  }
  if (evidence.result !== "passed" || !Array.isArray(evidence.diagnostics) || evidence.diagnostics.length > 0) {
    issues.push(`gate ${gateId} evidence contains a failed or unknown result`);
  }
  if (!canonicalTimestamp(evidence.startedAt) || !canonicalTimestamp(evidence.completedAt)) {
    issues.push(`gate ${gateId} evidence timestamps are malformed`);
  } else if (Date.parse(evidence.completedAt) < Date.parse(evidence.startedAt)) {
    issues.push(`gate ${gateId} evidence timestamps are contradictory`);
  } else if (
    Number.isFinite(gate.maxAgeMinutes) &&
    Date.now() - Date.parse(evidence.completedAt) > gate.maxAgeMinutes * 60 * 1000
  ) {
    issues.push(`gate ${gateId} evidence is stale`);
  } else if (
    Number.isFinite(gate.maxAgeMinutes) &&
    Date.parse(evidence.completedAt) - Date.parse(evidence.startedAt) >
      gate.maxAgeMinutes * 60 * 1000
  ) {
    issues.push(`gate ${gateId} evidence process interval exceeds its freshness window`);
  }
  if (
    canonicalTimestamp(evidence.completedAt) &&
    Date.parse(evidence.completedAt) > Date.now() + 5 * 60 * 1000
  ) {
    issues.push(`gate ${gateId} evidence timestamp is in the future`);
  }
  if (expectedSourceCommitSha && evidence.sourceCommitSha !== expectedSourceCommitSha) {
    issues.push(`gate ${gateId} evidence belongs to another source commit`);
  }
  if (expectedArtifactSha256 && evidence.artifactSha256 !== expectedArtifactSha256) {
    issues.push(`gate ${gateId} evidence belongs to another artifact`);
  }
  let report = null;
  try {
    if (evidence.report?.path !== reportPathForGate(gate)) {
      issues.push(`gate ${gateId} evidence report path is not canonical`);
    }
    const reportAbsolutePath = repositoryPath(root, evidence.report?.path, "required-test report path");
    if (!existsSync(reportAbsolutePath) || !statSync(reportAbsolutePath).isFile()) {
      throw new Error(`gate ${gateId} required-test report is missing`);
    }
    const bytes = readFileSync(reportAbsolutePath);
    if (sha256(bytes) !== evidence.report?.sha256) {
      issues.push(`gate ${gateId} report SHA-256 mismatch`);
    }
    report = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    issues.push(
      error instanceof SyntaxError
        ? `gate ${gateId} report is malformed or truncated`
        : error instanceof Error
          ? error.message
          : String(error),
    );
  }
  if (report) {
    const reportResult = validateRequiredTestReport({
      repositoryRoot: root,
      gateId,
      report,
      processExitCode: evidence.processExitCode,
      requireMetadata: true,
      expectedSourceCommitSha: evidence.sourceCommitSha,
      expectedArtifactSha256: evidence.artifactSha256 ?? undefined,
    });
    issues.push(...reportResult.issues);
    const reportStartedAt = report.stats?.startTime;
    const duration = report.stats?.duration;
    if (!canonicalTimestamp(reportStartedAt) || typeof duration !== "number" || duration < 0) {
      issues.push(`gate ${gateId} report timing is missing or malformed`);
    } else {
      const reportStart = Date.parse(reportStartedAt);
      const reportEnd = reportStart + duration;
      if (
        reportStart < Date.parse(evidence.startedAt) - 1000 ||
        reportEnd > Date.parse(evidence.completedAt) + 1000
      ) {
        issues.push(`gate ${gateId} report is stale or outside the recorded process interval`);
      }
      if (
        Number.isFinite(gate.maxAgeMinutes) &&
        Date.now() - reportEnd > gate.maxAgeMinutes * 60 * 1000
      ) {
        issues.push(`gate ${gateId} report is stale even though its evidence envelope is fresh`);
      }
    }
    if (expectedBaseURL && report.config?.metadata?.gateA3ReleaseBaseURL !== expectedBaseURL) {
      issues.push(`gate ${gateId} report targets another staged deployment`);
    }
  }
  return { valid: issues.length === 0, blocking: gate.blocking, issues, evidence, report };
}

function gitHead(repositoryRoot) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error("unable to resolve source commit for required-test evidence");
  return result.stdout.trim();
}

function runRequiredPackagePrerequisites({ repositoryRoot, gate, environment }) {
  const executable = process.platform === "win32" ? "npm.cmd" : "npm";
  for (const scriptName of packagePrerequisiteNames(gate)) {
    const child = spawnSync(executable, ["run", scriptName], {
      cwd: repositoryRoot,
      env: environment,
      stdio: "inherit",
    });
    if (child.status !== 0) {
      throw new Error(
        `gate ${gate.id} prerequisite ${scriptName} exited nonzero`,
      );
    }
  }
}

export function assertCleanRequiredTestSource(repositoryRoot) {
  const result = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error("unable to inspect source cleanliness for required-test evidence");
  }
  if (result.stdout.trim().length > 0) {
    throw new Error("release-blocking required-test evidence requires a clean source checkout");
  }
}

function reportPathForGate(gate) {
  const evidenceDirectory = path.posix.dirname(gate.reportPath);
  return gate.id === "release.gate-a3"
    ? ".vercel/gate-a3-playwright.json"
    : `${evidenceDirectory}/playwright.json`;
}

export function removeUnsafeRequiredTestArtifacts({ repositoryRoot, gateId, reportPath }) {
  const reportAbsolutePath = repositoryPath(
    repositoryRoot,
    reportPath,
    "unsafe required-test report path",
  );
  if (existsSync(reportAbsolutePath)) rmSync(reportAbsolutePath);
  const outputPath = repositoryPath(
    repositoryRoot,
    `.local/required-test-evidence/${gateId}/playwright-output`,
    "unsafe required-test output path",
  );
  if (existsSync(outputPath)) rmSync(outputPath, { recursive: true, force: true });
}

export function requiredTestArtifactsAreUnsafe({ reportWasParsed, validationIssues }) {
  return (
    !reportWasParsed ||
    validationIssues.some((issue) =>
      /secret-bearing fields|sensitive environment values|machine-local paths/.test(issue),
    )
  );
}

export function runRequiredPlaywrightGate({
  repositoryRoot,
  gateId,
  environment = process.env,
}) {
  const root = path.resolve(repositoryRoot);
  const repository = validateRequiredTestRepository({ repositoryRoot: root });
  if (!repository.valid) throw new Error(repository.issues.join("; "));
  const gate = repository.manifest.gates.find((entry) => entry.id === gateId);
  if (!gate || gate.runner !== "playwright" || gate.reportType !== "required-test-evidence") {
    throw new Error(`gate ${gateId} is not a runnable required Playwright gate`);
  }
  for (const [name, value] of Object.entries(gate.requiredEnvironment ?? {})) {
    if (environment[name] !== value) {
      throw new Error(`gate ${gateId} requires ${name}=${value}`);
    }
  }
  if (gate.cadence === "release-blocking" || gate.requireCleanSource === true) {
    assertCleanRequiredTestSource(root);
  }
  runRequiredPackagePrerequisites({ repositoryRoot: root, gate, environment });
  if (gate.cadence === "release-blocking" || gate.requireCleanSource === true) {
    assertCleanRequiredTestSource(root);
  }
  const sourceCommitSha = gitHead(root);
  const artifactSha256 = environment.REQUIRED_TEST_ARTIFACT_SHA256?.trim() || null;
  if (gate.artifactBinding !== "none" && !/^[a-f0-9]{64}$/.test(artifactSha256 ?? "")) {
    throw new Error(`gate ${gateId} requires REQUIRED_TEST_ARTIFACT_SHA256`);
  }
  if (gate.cadence === "release-blocking" && !environment.PLAYWRIGHT_RELEASE_BASE_URL?.trim()) {
    throw new Error(`gate ${gate.id} requires PLAYWRIGHT_RELEASE_BASE_URL`);
  }
  if (
    gate.id === "release.cabinetry-browser" &&
    (!environment.REQUIRED_TEST_RELEASE_CANDIDATE_ID?.trim() ||
      !environment.REQUIRED_TEST_RELEASE_ENVIRONMENT?.trim())
  ) {
    throw new Error(
      "release.cabinetry-browser requires REQUIRED_TEST_RELEASE_CANDIDATE_ID and REQUIRED_TEST_RELEASE_ENVIRONMENT",
    );
  }
  const reportPath = reportPathForGate(gate);
  const reportAbsolutePath = repositoryPath(root, reportPath, "required-test report path");
  const evidenceAbsolutePath = repositoryPath(root, gate.reportPath, "required-test evidence path");
  mkdirSync(path.dirname(reportAbsolutePath), { recursive: true });
  if (existsSync(reportAbsolutePath)) rmSync(reportAbsolutePath);
  if (existsSync(evidenceAbsolutePath)) rmSync(evidenceAbsolutePath);
  const startedAt = new Date().toISOString();
  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const child = spawnSync(executable, gate.playwright.args, {
    cwd: root,
    env: {
      ...environment,
      REQUIRED_TEST_GATE_ID: gateId,
      REQUIRED_TEST_REPORT_PATH: reportPath,
      REQUIRED_TEST_SOURCE_COMMIT_SHA: sourceCommitSha,
      REQUIRED_TEST_ARTIFACT_SHA256: artifactSha256 ?? "",
    },
    stdio: "inherit",
  });
  const completedAt = new Date().toISOString();
  const processExitCode = Number.isInteger(child.status) ? child.status : 1;
  let report = null;
  let reportHash = null;
  let reportWasParsed = false;
  const validationIssues = [];
  if (!existsSync(reportAbsolutePath)) {
    validationIssues.push(`gate ${gateId} required report is missing`);
  } else {
    try {
      report = canonicalizeRequiredTestReport(root, reportPath);
      reportWasParsed = true;
      reportHash = sha256(readFileSync(reportAbsolutePath));
      const result = validateRequiredTestReport({
        repositoryRoot: root,
        gateId,
        report,
        processExitCode,
        requireMetadata: true,
        expectedSourceCommitSha: sourceCommitSha,
        expectedArtifactSha256: artifactSha256 ?? undefined,
        environment,
      });
      validationIssues.push(...result.issues);
    } catch (error) {
      validationIssues.push(error instanceof Error ? error.message : String(error));
    }
  }
  const unsafeReport = requiredTestArtifactsAreUnsafe({ reportWasParsed, validationIssues });
  if (unsafeReport) {
    removeUnsafeRequiredTestArtifacts({ repositoryRoot: root, gateId, reportPath });
    report = null;
    reportHash = null;
  }
  const evidence = {
    schema: REQUIRED_TEST_EVIDENCE_SCHEMA,
    gateId,
    command: gate.command,
    sourceCommitSha,
    artifactSha256,
    processExitCode,
    startedAt,
    completedAt,
    report: { path: reportPath, sha256: reportHash },
    result: validationIssues.length === 0 ? "passed" : "failed",
    diagnostics: validationIssues,
  };
  writeFileSync(evidenceAbsolutePath, `${JSON.stringify(evidence, null, 2)}\n`);
  if (validationIssues.length > 0) {
    throw new Error(validationIssues.join("; "));
  }
  return evidence;
}

async function cli() {
  const repositoryRoot = process.cwd();
  const command = process.argv[2];
  if (command === "check") {
    const result = validateRequiredTestRepository({ repositoryRoot });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log(
      `Required-test manifest valid: ${result.manifest.gates.length} gates, ${[...result.inventories.values()].reduce((total, files) => total + files.length, 0)} classified test sources.`,
    );
  } else if (command === "run" && process.argv[3]) {
    const evidence = runRequiredPlaywrightGate({ repositoryRoot, gateId: process.argv[3] });
    console.log(`Required-test gate ${evidence.gateId} passed truthfulness validation.`);
  } else if (command === "verify" && process.argv[3]) {
    const manifest = loadRequiredTestManifest(repositoryRoot);
    const gate = manifest.gates.find((entry) => entry.id === process.argv[3]);
    const evidencePath = process.argv[4] ?? gate?.reportPath;
    if (!evidencePath) throw new Error(`gate ${process.argv[3]} has no evidence path`);
    const result = validateRequiredTestEvidence({
      repositoryRoot,
      gateId: process.argv[3],
      evidencePath,
    });
    if (!result.valid) throw new Error(result.issues.join("; "));
    console.log(`Required-test evidence ${process.argv[3]} is valid.`);
  } else if (command === "prepare-upload") {
    const result = prepareRequiredTestEvidenceUpload({ repositoryRoot });
    console.log(
      `Prepared ${result.included.length} portable required-test evidence files; omitted ${result.omitted.length} uninspectable or binary files.`,
    );
  } else if (command === "verify-upload") {
    const result = verifyRequiredTestEvidenceArchive({
      repositoryRoot,
      archiveRoot: process.argv[3] ?? DEFAULT_REQUIRED_TEST_UPLOAD_ROOT,
    });
    console.log(`Verified ${result.archiveEntries.length} exact required-test archive entries.`);
  } else {
    throw new Error(
      "Usage: required-test-truthfulness.mjs check|run <gate-id>|verify <gate-id> [evidence-path]|prepare-upload|verify-upload [archive-root]",
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  cli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
