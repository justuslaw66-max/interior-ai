import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  assertCommandAttemptIntegrity,
  assertManifestDigest,
  assertPhysicalManifestDigest,
  assertRequiredHistoricalCommandReferences,
  assertWindowOpeningBuildSourceBinding,
  assertWindowOpeningCameraTransition,
  assertWindowOpeningScreenshotSet,
  assertWorkingTreeIdentityMatches,
  collectWorkingTreeIdentity,
  manifestSha256,
  verifyHistoricalCommandAttempt,
  verifyWindowOpeningScreenshotEvidence,
} from "./window-opening-evidence-manifest.mjs";
import { physicalFileRecord } from "./window-opening-evidence-command.mjs";
import { collectIgnoredStateInventory } from "./window-opening-ignored-build-outputs.mjs";
import { verifyWindowOpeningMountedReport } from "./window-opening-mounted-test-contract.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function parseOptions(args) {
  const allowed = new Set(["--root", "--metadata"]);
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if (!allowed.has(name)) throw new Error(`Unknown option: ${name ?? "<missing>"}.`);
    if (values.has(name)) throw new Error(`Duplicate option: ${name}.`);
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
    values.set(name, value);
  }
  if (args.length % 2 !== 0) throw new Error("Every finalizer option requires a value.");
  for (const name of allowed) {
    if (!values.has(name)) throw new Error(`${name} is required.`);
  }
  return {
    evidenceRoot: path.resolve(values.get("--root")),
    metadataPath: path.resolve(values.get("--metadata")),
  };
}

function inside(root, candidate, label) {
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} escapes the evidence root.`);
  }
  return resolved;
}

async function walkFiles(root, current = root) {
  const entries = await fs.readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(root, absolute));
    else if (entry.isFile()) files.push(path.relative(root, absolute));
    else throw new Error(`Evidence contains unsupported file type: ${path.relative(root, absolute)}.`);
  }
  return files;
}

async function commandAttempts(evidenceRoot) {
  const commandRoot = path.join(evidenceRoot, "commands");
  const records = [];
  for (const commandId of (await fs.readdir(commandRoot)).sort()) {
    const logicalRoot = path.join(commandRoot, commandId);
    if (!(await fs.lstat(logicalRoot)).isDirectory()) {
      throw new Error(`Command path is not a directory: ${commandId}.`);
    }
    for (const attemptId of (await fs.readdir(logicalRoot)).sort()) {
      const attemptRoot = path.join(logicalRoot, attemptId);
      if (!(await fs.lstat(attemptRoot)).isDirectory()) {
        throw new Error(`Attempt path is not a directory: ${commandId}/${attemptId}.`);
      }
      const recordPath = path.join(attemptRoot, "record.json");
      const record = JSON.parse(await fs.readFile(recordPath, "utf8"));
      if (record.logicalCommandId !== commandId || record.attemptId !== attemptId) {
        throw new Error(`Command record identity mismatch: ${commandId}/${attemptId}.`);
      }
      await assertCommandAttemptIntegrity(evidenceRoot, record);
      records.push({
        ...record,
        recordFile: await physicalFileRecord(recordPath, evidenceRoot),
      });
    }
  }
  records.sort((left, right) =>
    left.logicalCommandId.localeCompare(right.logicalCommandId) ||
    left.attemptId.localeCompare(right.attemptId));
  return records;
}

function assertEnvironmentRecords(actual, expectedNames, label) {
  const canonicalNames = (names) => [...names].sort((left, right) => left.localeCompare(right));
  if (!Array.isArray(actual) || JSON.stringify(canonicalNames(
    actual.map((entry) => entry.name)
  )) !== JSON.stringify(canonicalNames(expectedNames))) {
    throw new Error(`${label} child environment names do not match the exact allowlist.`);
  }
  if (actual.some((entry) => !entry.classification || !entry.source ||
      Object.hasOwn(entry, "value"))) {
    throw new Error(`${label} child environment metadata is incomplete or exposes a value.`);
  }
}

function assertChildEnvironments(mountedRun, buildRun) {
  const core = ["HOME", "PATH", "TMPDIR"];
  assertEnvironmentRecords(mountedRun.childEnvironments?.databaseProvision,
    [...core, "GATE_A3_DATABASE_URL"], "Mounted database provision");
  assertEnvironmentRecords(mountedRun.childEnvironments?.server, [...core,
    "APP_ENV", "APP_ORIGIN", "AUTH_SECRET", "AUTH_URL", "CI_AUTH_FIXTURE_ACTIVE",
    "CI_AUTH_FIXTURE_LOCAL_TEST", "DATABASE_URL", "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET", "NEXTAUTH_SECRET", "NEXTAUTH_URL",
    "NEXT_PUBLIC_APP_ENV", "NEXT_PUBLIC_ENABLE_QA_HOOKS", "NEXT_TELEMETRY_DISABLED",
  ], "Mounted server");
  assertEnvironmentRecords(mountedRun.childEnvironments?.browser, [...core,
    "CI", "WINDOW_OPENING_BASE_URL", "WINDOW_OPENING_EVIDENCE_ROOT",
    "WINDOW_OPENING_NETWORK_EVIDENCE_PATH", "WINDOW_OPENING_RUN_ROOT",
    "WINDOW_OPENING_RUNTIME_EVIDENCE_PATH", "WINDOW_OPENING_SCREENSHOT_DIR",
    "WINDOW_OPENING_SERVER_CONTEXT_PATH", "WINDOW_OPENING_SOURCE_IDENTITY",
  ], "Mounted browser");
  assertEnvironmentRecords(buildRun.childEnvironments?.databaseProvision,
    [...core, "GATE_A3_DATABASE_URL"], "Build database provision");
  assertEnvironmentRecords(buildRun.childEnvironments?.build, [...core,
    "APP_ENV", "APP_ORIGIN", "AUTH_SECRET", "AUTH_URL", "CI_AUTH_FIXTURE_ACTIVE",
    "CI_AUTH_FIXTURE_LOCAL_TEST", "DATABASE_URL", "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET", "NEXTAUTH_SECRET", "NEXTAUTH_URL",
    "NEXT_PUBLIC_APP_ENV", "NEXT_TELEMETRY_DISABLED",
  ], "Build");
}

async function externalAttemptRecord(entry) {
  const filePath = path.resolve(entry.resultPath);
  const stat = await fs.lstat(filePath);
  if (!stat.isFile()) throw new Error(`Historical attempt result is not a file: ${filePath}.`);
  const content = await fs.readFile(filePath);
  const parsed = JSON.parse(content.toString("utf8"));
  if (entry.expectedStatus && parsed.status !== entry.expectedStatus) {
    throw new Error(`Historical attempt status mismatch for ${filePath}.`);
  }
  return {
    label: entry.label,
    resultPath: filePath,
    status: parsed.status,
    failure: parsed.failure ?? null,
    bytes: content.byteLength,
    mode: (stat.mode & 0o7777).toString(8).padStart(4, "0"),
    sha256: sha256(content),
  };
}

async function historicalSealingAttemptRecord(entry) {
  if (entry.stage !== "finalization/sealing" || entry.terminalResult !== "failed" ||
      entry.acceptedManifestProduced !== false || !entry.knownFailureReason ||
      typeof entry.exactFailedArgvKnown !== "boolean" ||
      typeof entry.exactFailedLogsAvailable !== "boolean") {
    throw new Error("Historical sealing-attempt metadata is incomplete or inaccurate.");
  }
  const mounted = await externalAttemptRecord({
    label: "mounted subrun", resultPath: entry.mountedResultPath, expectedStatus: "passed",
  });
  const build = await externalAttemptRecord({
    label: "build subrun", resultPath: entry.buildResultPath, expectedStatus: "passed",
  });
  let manifestPresent = false;
  try { manifestPresent = (await fs.lstat(path.join(entry.evidenceRoot, "manifest.json"))).isFile(); }
  catch { manifestPresent = false; }
  if (manifestPresent) throw new Error("Failed historical seal unexpectedly contains a manifest.");
  if (entry.exactFailedArgvKnown || entry.exactFailedLogsAvailable) {
    if (!entry.exactFailedArgvKnown || !entry.exactFailedLogsAvailable ||
        !entry.terminalRecordPath) {
      throw new Error("Preserved failed-seal details must include argv, logs, and terminal record.");
    }
    const terminalPath = inside(entry.evidenceRoot, entry.terminalRecordPath,
      "Historical seal terminal record");
    const terminal = JSON.parse(await fs.readFile(terminalPath, "utf8"));
    const stdoutPath = inside(
      entry.evidenceRoot, terminal.stdout?.path, "Historical seal stdout"
    );
    const stderrPath = inside(
      entry.evidenceRoot, terminal.stderr?.path, "Historical seal stderr"
    );
    const stdout = await physicalFileRecord(stdoutPath, entry.evidenceRoot);
    const stderr = await physicalFileRecord(stderrPath, entry.evidenceRoot);
    if (terminal.event !== "seal_failed" || terminal.evidenceRoot !== entry.evidenceRoot ||
        terminal.manifestProduced !== false || !Array.isArray(terminal.finalizerArgv) ||
        (terminal.exitCode === 0 && terminal.signal === null) ||
        stdout.sha256 !== terminal.stdout.sha256 || stderr.sha256 !== terminal.stderr.sha256 ||
        !(await fs.readFile(stderrPath, "utf8")).includes(entry.knownFailureReason)) {
      throw new Error("Preserved failed-seal terminal evidence is invalid.");
    }
    return {
      evidenceRoot: entry.evidenceRoot,
      stage: entry.stage,
      terminalResult: entry.terminalResult,
      acceptedManifestProduced: false,
      knownFailureReason: entry.knownFailureReason,
      exactFailedArgv: { known: true, value: terminal.finalizerArgv },
      exactFailedLogs: { available: true, stdout, stderr },
      timestampRange: {
        start: terminal.startedAt,
        end: terminal.endedAt,
        support: "immutable terminal record",
      },
      terminalRecord: await physicalFileRecord(terminalPath, entry.evidenceRoot),
      recordedFailureReason: terminal.failureReason,
      mountedSubrun: mounted,
      buildSubrun: build,
    };
  }
  if (entry.knownFailureReason !==
      "capture and verification used different path comparators") {
    throw new Error("Historical failed seal without preserved details has an unknown reason.");
  }
  return {
    evidenceRoot: entry.evidenceRoot,
    stage: entry.stage,
    terminalResult: entry.terminalResult,
    acceptedManifestProduced: false,
    knownFailureReason: entry.knownFailureReason,
    exactFailedArgv: { known: false, value: null },
    exactFailedLogs: { available: false, stdout: null, stderr: null },
    timestampRange: entry.timestampRange ?? { start: null, end: null, support: "unavailable" },
    mountedSubrun: mounted,
    buildSubrun: build,
  };
}

const REQUIRED_HISTORICAL_COMMAND = {
  evidenceRoot: "/private/tmp/window-opening-final-evidence-20260901-G04KIK",
  logicalCommandId: "lint",
  attemptId: "20260901T105640324Z-72243604-b43c-4bdf-9234-905ef6fd615d",
};

async function historicalCommandAttemptRecord(entry) {
  const { record, recordFile } = await verifyHistoricalCommandAttempt(
    entry, REQUIRED_HISTORICAL_COMMAND
  );
  const rootFiles = (await walkFiles(entry.evidenceRoot)).sort();
  const rootInventory = await Promise.all(rootFiles.map((relativePath) =>
    physicalFileRecord(inside(entry.evidenceRoot, relativePath, "Historical root artifact"),
      entry.evidenceRoot)));
  return {
    historicalRootIdentity: {
      evidenceRoot: entry.evidenceRoot,
      artifactCount: rootInventory.length,
      artifactInventorySha256: sha256(JSON.stringify(rootInventory)),
    },
    logicalCommandId: record.logicalCommandId,
    attemptId: record.attemptId,
    stage: entry.stage,
    classification: entry.classification,
    terminalResult: { exitCode: record.exitCode, signal: record.signal },
    requiredFinalSuccess: false,
    reason: entry.reason,
    recordPath: recordFile.path,
    recordSha256: recordFile.sha256,
    stdout: record.stdout,
    stderr: record.stderr,
    argv: { known: entry.argvKnown, value: entry.argvKnown ? record.argv : null },
    timestamps: { known: entry.timestampsKnown,
      value: entry.timestampsKnown ? { startedAt: record.startedAt, endedAt: record.endedAt } : null },
    runnerMetadata: { known: entry.runnerMetadataKnown,
      value: entry.runnerMetadataKnown ? { launcher: record.launcher, runner: record.runner,
        nodeVersion: record.nodeVersion, npmVersion: record.npmVersion } : null },
    verification: { status: "physical-artifacts-match-record" },
  };
}

async function assertResultSidecar(resultPath) {
  const expected = (await fs.readFile(`${resultPath}.sha256`, "utf8")).trim();
  const actual = sha256(await fs.readFile(resultPath));
  if (expected !== actual) throw new Error(`Result digest sidecar mismatch: ${resultPath}.`);
}

const { evidenceRoot, metadataPath } = parseOptions(process.argv.slice(2));
const repositoryRoot = process.cwd();
const manifestPath = path.join(evidenceRoot, "manifest.json");
const physicalDigestPath = `${manifestPath}.sha256`;
for (const candidate of [manifestPath, physicalDigestPath]) {
  try {
    await fs.lstat(candidate);
    throw new Error(`Refusing to overwrite immutable evidence file: ${candidate}.`);
  } catch (cause) {
    if (cause?.code !== "ENOENT") throw cause;
  }
}

const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
const frozenIdentityPath = inside(evidenceRoot, metadata.frozenIdentityPath, "Frozen identity");
const frozenIdentity = JSON.parse(await fs.readFile(frozenIdentityPath, "utf8"));
await assertWorkingTreeIdentityMatches(repositoryRoot, frozenIdentity);
const identity = await collectWorkingTreeIdentity(repositoryRoot);
const commands = await commandAttempts(evidenceRoot);
const failedRequired = commands.filter((command) => command.required && command.exitCode !== 0);
if (failedRequired.length) throw new Error("A required evidence command did not exit successfully.");

const mountedResultPath = inside(evidenceRoot, metadata.mountedResultPath, "Mounted result");
const buildResultPath = inside(evidenceRoot, metadata.buildResultPath, "Build result");
const mountedRun = JSON.parse(await fs.readFile(mountedResultPath, "utf8"));
const buildRun = JSON.parse(await fs.readFile(buildResultPath, "utf8"));
await Promise.all([
  assertResultSidecar(mountedResultPath),
  assertResultSidecar(buildResultPath),
]);
if (mountedRun.status !== "passed" || mountedRun.repositoryRoot !== repositoryRoot ||
    mountedRun.server?.portStopped !== true || mountedRun.database?.dropped !== true ||
    mountedRun.server?.listenerStopped !== true ||
    !Number.isSafeInteger(mountedRun.server?.launcherPid) ||
    !Number.isSafeInteger(mountedRun.server?.listenerPid) ||
    mountedRun.server.launcherPid === mountedRun.server.listenerPid ||
    mountedRun.server.listenerCwd !== repositoryRoot ||
    mountedRun.analytics?.appEventRowDelta !== 0 || mountedRun.analytics?.requestCount < 1 ||
    mountedRun.browser?.argv?.join("\0") !== [
      "node_modules/.bin/playwright", "test", "--config=playwright.window-opening.config.ts",
    ].join("\0") ||
    mountedRun.runtimeEvents?.rejectedEvents?.length !== 0 ||
    Object.values(mountedRun.runtimeEvents?.rejectedCounts ?? {}).some((count) => count !== 0) ||
    typeof mountedRun.database?.preBrowser?.schemaSha256 !== "string" ||
    typeof mountedRun.database?.preBrowser?.dataSha256 !== "string" ||
    mountedRun.database?.preBrowser?.schemaSha256 !== mountedRun.database?.postBrowser?.schemaSha256 ||
    mountedRun.database?.preBrowser?.dataSha256 !== mountedRun.database?.postBrowser?.dataSha256 ||
    mountedRun.database?.tableDeltas?.some((entry) => entry.delta !== 0)) {
  throw new Error("Mounted result does not satisfy the final evidence contract.");
}
if (buildRun.status !== "passed" || buildRun.repositoryRoot !== repositoryRoot ||
    buildRun.database?.dropped !== true || buildRun.build?.exitCode !== 0 ||
    buildRun.build?.argv?.join("\0") !== ["npm", "run", "build"].join("\0") ||
    typeof buildRun.database?.preBuild?.schemaSha256 !== "string" ||
    typeof buildRun.database?.preBuild?.dataSha256 !== "string" ||
    buildRun.database?.preBuild?.schemaSha256 !== buildRun.database?.postBuild?.schemaSha256 ||
    buildRun.database?.preBuild?.dataSha256 !== buildRun.database?.postBuild?.dataSha256) {
  throw new Error("Build result does not satisfy the isolated build evidence contract.");
}
const currentIgnoredState = await collectIgnoredStateInventory(repositoryRoot);
assertWindowOpeningBuildSourceBinding(buildRun, frozenIdentity, currentIgnoredState);
assertChildEnvironments(mountedRun, buildRun);
const reportPath = path.join(path.dirname(mountedResultPath), "playwright-report.json");
const verifiedSuite = await verifyWindowOpeningMountedReport(
  JSON.parse(await fs.readFile(reportPath, "utf8")),
  { sealable: mountedRun.suite?.sealable, filters: mountedRun.suite?.filters }
);
if (JSON.stringify(verifiedSuite.expectedIds) !== JSON.stringify(mountedRun.suite.expectedIds) ||
    JSON.stringify(verifiedSuite.executedIds) !== JSON.stringify(mountedRun.suite.executedIds)) {
  throw new Error("Mounted result suite inventory differs from the physical Playwright report.");
}

const excluded = new Set([
  "manifest.json", "manifest.json.sha256", "seal-attempt-journal.ndjson",
]);
const artifactPaths = (await walkFiles(evidenceRoot))
  .filter((entry) => !excluded.has(entry) && !/(^|\/)sealing\/[^/]+\/(stdout|stderr|terminal)\.log$/.test(entry))
  .sort();
const artifacts = await Promise.all(artifactPaths.map((entry) =>
  physicalFileRecord(inside(evidenceRoot, entry, "Artifact"), evidenceRoot)));
const screenshots = await Promise.all(artifactPaths
  .filter((entry) => entry.endsWith(".png"))
  .map((entry) => verifyWindowOpeningScreenshotEvidence(
    evidenceRoot, entry, identity.completeStateIdentitySha256, mountedRun
  )));
const traces = artifacts.filter((entry) => /(^|\/)trace[^/]*\.zip$/.test(entry.path));
assertWindowOpeningScreenshotSet(screenshots, 19);
const cameraA = screenshots.find((entry) =>
  entry.capture.screenshotId === "02-full-plan-3d-direction-a-standard-window");
const cameraB = screenshots.find((entry) =>
  entry.capture.screenshotId === "03-full-plan-3d-direction-b-full-height-window");
const transition = cameraB?.capture.cameraTransitionProof;
if (!cameraA || !cameraB || transition?.fromScreenshotId !== cameraA.capture.screenshotId ||
    JSON.stringify(transition.fromCameraState) !== JSON.stringify(cameraA.capture.cameraState) ||
    JSON.stringify(transition.toCameraState) !== JSON.stringify(cameraB.capture.cameraState)) {
  throw new Error("The required direction-A/direction-B screenshot camera binding is missing.");
}
const cameraDirectionProof = assertWindowOpeningCameraTransition(
  cameraA.capture.cameraState,
  cameraB.capture.cameraState,
  {
    minimumAngleDeg: transition.minimumAngleDeg,
    minimumPositionDistance: transition.minimumPositionDistance,
    maximumTargetDrift: transition.maximumTargetDrift,
  }
);
for (const [label, recorded, actual] of [
  ["angle", transition.observedAngleDeg, cameraDirectionProof.angleDeg],
  ["position distance", transition.observedPositionDistance, cameraDirectionProof.positionDistance],
  ["target drift", transition.observedTargetDrift, cameraDirectionProof.targetDrift],
]) {
  if (!Number.isFinite(recorded) || Math.abs(recorded - actual) > 1e-9) {
    throw new Error(`Recorded camera ${label} does not match the two physical sidecars.`);
  }
}
if (traces.length !== verifiedSuite.expectedCount) {
  throw new Error("The final evidence must contain one trace for each mounted test.");
}
const historicalAttempts = await Promise.all(
  (metadata.historicalAttempts ?? []).map(externalAttemptRecord)
);
const historicalSealingAttempts = await Promise.all(
  (metadata.historicalSealingAttempts ?? []).map(historicalSealingAttemptRecord)
);
assertRequiredHistoricalCommandReferences(
  metadata.historicalCommandAttempts,
  [REQUIRED_HISTORICAL_COMMAND]
);
const historicalCommandAttempts = await Promise.all(
  metadata.historicalCommandAttempts.map(historicalCommandAttemptRecord)
);
if (historicalCommandAttempts.length !== 1 ||
    historicalCommandAttempts[0].logicalCommandId !== REQUIRED_HISTORICAL_COMMAND.logicalCommandId ||
    historicalCommandAttempts[0].attemptId !== REQUIRED_HISTORICAL_COMMAND.attemptId) {
  throw new Error("The required historical G04KIK failed lint attempt is omitted.");
}
const sealStartedPaths = artifactPaths.filter((entry) =>
  /(^|\/)sealing\/[^/]+\/started\.json$/.test(entry));
if (sealStartedPaths.length !== 1) {
  throw new Error("Exactly one immutable seal_attempt_started record is required.");
}
const currentSealAttemptStarted = JSON.parse(await fs.readFile(
  inside(evidenceRoot, sealStartedPaths[0], "Seal start record"), "utf8"
));
if (currentSealAttemptStarted.event !== "seal_attempt_started" ||
    currentSealAttemptStarted.evidenceRoot !== evidenceRoot ||
    currentSealAttemptStarted.sourceCompleteStateIdentitySha256 !==
      identity.completeStateIdentitySha256) {
  throw new Error("The current seal_attempt_started record is invalid.");
}

const manifest = {
  schemaVersion: "window-opening-final-evidence/v4",
  generatedAt: new Date().toISOString(),
  ...identity,
  frozenSourceIdentity: frozenIdentity,
  sourceIdentityReverifiedAfterCommands: true,
  supersedes: metadata.supersedes,
  validationClassification: metadata.validationClassification,
  commands,
  failedCommandAttempts: commands.filter((command) => command.exitCode !== 0),
  historicalAttempts,
  historicalSealingAttempts,
  historicalCommandAttempts,
  currentSealAttemptStarted,
  mountedRun,
  buildRun,
  cameraDirectionProof,
  screenshots,
  traces,
  artifacts,
  physicalManifestDigestSidecar: path.basename(physicalDigestPath),
};
manifest.manifestSha256 = manifestSha256(manifest);
await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
  flag: "wx", mode: 0o644,
});
await fs.writeFile(physicalDigestPath, `${sha256(await fs.readFile(manifestPath))}\n`, {
  flag: "wx", mode: 0o644,
});
assertManifestDigest(manifest);
const physicalManifestFileSha256 = await assertPhysicalManifestDigest(
  manifestPath, physicalDigestPath
);
await assertWorkingTreeIdentityMatches(repositoryRoot, frozenIdentity);
console.log(JSON.stringify({
  manifestPath,
  nonCircularManifestSha256: manifest.manifestSha256,
  physicalManifestFileSha256,
  completeStateIdentitySha256: identity.completeStateIdentitySha256,
  commandAttemptCount: commands.length,
  screenshotCount: screenshots.length,
  traceCount: traces.length,
}, null, 2));
