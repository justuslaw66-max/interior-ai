import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { assertIgnoredBuildOutputObservation } from "./window-opening-ignored-build-outputs.mjs";

const execFileAsync = promisify(execFile);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

async function git(root, args, encoding = "utf8") {
  const { stdout } = await execFileAsync("git", args, {
    cwd: root, encoding, maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

export async function buildUntrackedFileRecord(root, relativePath) {
  const absolutePath = path.join(root, relativePath);
  const stat = await fs.lstat(absolutePath);
  const type = stat.isSymbolicLink() ? "symlink" : stat.isFile() ? "file" : "other";
  const content = stat.isSymbolicLink()
    ? Buffer.from(await fs.readlink(absolutePath))
    : await fs.readFile(absolutePath);
  return {
    path: relativePath,
    type,
    mode: (stat.mode & 0o7777).toString(8).padStart(4, "0"),
    bytes: content.byteLength,
    sha256: sha256(content),
  };
}

export async function collectUntrackedInventory(root) {
  const raw = await git(root, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const paths = raw.split("\0").filter(Boolean).sort();
  const records = await Promise.all(paths.map((entry) => buildUntrackedFileRecord(root, entry)));
  return { records, sha256: sha256(JSON.stringify(records)) };
}

function pathInside(root, candidate, label) {
  if (typeof candidate !== "string" || !candidate) {
    throw new Error(`${label} path is missing.`);
  }
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${label} path escapes its allowed root.`);
  }
  return resolved;
}

export function assertCanonicalPathInventory(records) {
  const paths = records.map((record) => record.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Inventory contains duplicate path records.");
  }
  for (const recordPath of paths) {
    if (path.isAbsolute(recordPath)) throw new Error("Inventory paths must be repository-relative.");
    pathInside("/repository-root", recordPath, "Repository inventory");
  }
  const sorted = [...records].sort((left, right) =>
    left.path === right.path ? 0 : left.path < right.path ? -1 : 1);
  if (JSON.stringify(records) !== JSON.stringify(sorted)) {
    throw new Error("Inventory is not in canonical path order.");
  }
}

async function physicalRecord(filePath, relativePath) {
  const stat = await fs.lstat(filePath);
  const type = stat.isSymbolicLink() ? "symlink" : stat.isFile() ? "file" : "other";
  const content = stat.isSymbolicLink()
    ? Buffer.from(await fs.readlink(filePath))
    : await fs.readFile(filePath);
  return {
    path: relativePath,
    type,
    mode: (stat.mode & 0o7777).toString(8).padStart(4, "0"),
    bytes: content.byteLength,
    sha256: sha256(content),
  };
}

export async function assertPhysicalFileRecord(root, expected, label = "Evidence file") {
  const absolutePath = pathInside(root, expected.path, label);
  let actual;
  try {
    actual = await physicalRecord(absolutePath, expected.path);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : "unavailable";
    throw new Error(`${label} is missing or unreadable: ${reason}`);
  }
  for (const key of ["type", "mode", "bytes", "sha256"]) {
    if (actual[key] !== expected[key]) {
      throw new Error(`${label} ${key} does not match the recorded value.`);
    }
  }
  return actual;
}

export async function collectWorkingTreeIdentity(root) {
  const [head, branch, diff, status, untracked, changedRaw, stagedRaw] = await Promise.all([
    git(root, ["rev-parse", "HEAD"]),
    git(root, ["branch", "--show-current"]),
    git(root, ["diff", "--binary", "HEAD"], "buffer"),
    git(root, ["status", "--short"]),
    collectUntrackedInventory(root),
    git(root, ["diff", "--name-only", "-z", "HEAD"]),
    git(root, ["diff", "--cached", "--name-only", "-z"]),
  ]);
  const trackedDiffSha256 = sha256(diff);
  const completeState = {
    head: head.trim(), trackedDiffSha256, untracked: untracked.records,
  };
  const changedPaths = [...new Set([
    ...changedRaw.split("\0").filter(Boolean), ...untracked.records.map((entry) => entry.path),
  ])];
  const mtimes = await Promise.all(changedPaths.map(async (entry) =>
    (await fs.lstat(path.join(root, entry))).mtimeMs));
  return {
    worktreePath: root,
    repositoryRoot: (await git(root, ["rev-parse", "--show-toplevel"])).trim(),
    branch: branch.trim(),
    head: head.trim(),
    gitStatusShort: status,
    stagedFileCount: stagedRaw.split("\0").filter(Boolean).length,
    trackedDiffSha256,
    untrackedFiles: untracked.records,
    untrackedInventorySha256: untracked.sha256,
    completeStateIdentitySha256: sha256(JSON.stringify(completeState)),
    sourceLatestModificationTime: mtimes.length
      ? new Date(Math.max(...mtimes)).toISOString() : null,
  };
}

export async function assertWorkingTreeIdentityMatches(root, expected) {
  assertCanonicalPathInventory(expected.untrackedFiles);
  const actual = await collectWorkingTreeIdentity(root);
  for (const key of [
    "worktreePath", "repositoryRoot", "branch", "head", "trackedDiffSha256",
    "untrackedInventorySha256", "completeStateIdentitySha256",
  ]) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Working-tree ${key} does not match the recorded contract.`);
    }
  }
  if (JSON.stringify(actual.untrackedFiles) !== JSON.stringify(expected.untrackedFiles)) {
    throw new Error("Working-tree untracked inventory does not match the recorded contract.");
  }
  return actual;
}

export async function assertUntrackedInventoryUnchanged(root, expectedRecords) {
  const current = await collectUntrackedInventory(root);
  if (JSON.stringify(current.records) !== JSON.stringify(expectedRecords)) {
    throw new Error("Untracked inventory changed after evidence capture.");
  }
}

export function assertCommandReplayMatches(record, replay) {
  for (const key of ["argv", "workingDirectory", "exitCode", "signal"]) {
    if (JSON.stringify(record[key]) !== JSON.stringify(replay[key])) {
      throw new Error(`Recorded command ${key} does not match the replay.`);
    }
  }
  for (const [label, recorded, replayed] of [
    ["launcher version", record.launcher?.version, replay.launcher?.version],
    ["runner version", record.runner?.version, replay.runner?.version],
  ]) {
    if (recorded !== replayed) throw new Error(`Recorded command ${label} does not match the replay.`);
  }
}

export async function assertCommandAttemptIntegrity(evidenceRoot, record, replay = record) {
  assertCommandReplayMatches(record, replay);
  const expectedPrefix = path.join("commands", record.logicalCommandId, record.attemptId);
  for (const [label, log] of [["stdout log", record.stdout], ["stderr log", record.stderr]]) {
    const relative = path.normalize(log.path);
    if (relative !== expectedPrefix && !relative.startsWith(`${expectedPrefix}${path.sep}`)) {
      throw new Error(`${label} path does not belong to its immutable attempt.`);
    }
    await assertPhysicalFileRecord(evidenceRoot, log, label);
  }
}

export async function assertScreenshotIntegrity(evidenceRoot, screenshot) {
  return assertPhysicalFileRecord(evidenceRoot, screenshot, "Screenshot");
}

export async function verifyWindowOpeningScreenshotEvidence(
  evidenceRoot, relativePath, sourceIdentity, mountedRun
) {
  const filePath = pathInside(evidenceRoot, relativePath, "Screenshot");
  if (path.extname(filePath).toLowerCase() !== ".png") {
    throw new Error("Screenshot extension contradicts the required PNG MIME contract.");
  }
  const content = await fs.readFile(filePath);
  if (content.length < 24 || content.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`${relativePath} is not a valid PNG evidence file.`);
  }
  const sidecarPath = filePath.replace(/\.png$/, ".capture.json");
  const capture = JSON.parse(await fs.readFile(sidecarPath, "utf8"));
  const tracePath = pathInside(
    evidenceRoot, capture.trace?.evidenceRootRelativePath, "Capture trace"
  );
  const trace = await physicalRecord(
    tracePath, path.relative(evidenceRoot, tracePath)
  );
  const mountedTest = mountedRun.suite.executed.find(
    (entry) => entry.id === capture.test?.id
  );
  const serverContextPath = pathInside(
    evidenceRoot, capture.serverContext?.evidenceRootRelativePath, "Server context"
  );
  const serverContextRelative = path.relative(evidenceRoot, serverContextPath);
  const serverContextRecord = await physicalRecord(serverContextPath, serverContextRelative);
  const serverContext = JSON.parse(await fs.readFile(serverContextPath, "utf8"));
  if (capture.serverContext?.sha256 !== serverContextRecord.sha256 ||
      capture.serverContext?.absolutePath !== serverContextPath ||
      serverContext.runId !== mountedRun.runId ||
      serverContext.repositoryRoot !== mountedRun.repositoryRoot ||
      serverContext.port !== mountedRun.port ||
      serverContext.listenerPid !== mountedRun.server.listenerPid ||
      serverContext.launcherPid !== mountedRun.server.launcherPid ||
      serverContext.serverCwd !== mountedRun.server.listenerCwd ||
      serverContext.sourceCompleteStateIdentitySha256 !== sourceIdentity) {
    throw new Error(`Screenshot server context is invalid: ${relativePath}.`);
  }
  const listenerPath = pathInside(
    evidenceRoot, capture.listenerOwnership?.record?.evidenceRootRelativePath,
    "Listener observation"
  );
  const listenerRelative = path.relative(evidenceRoot, listenerPath);
  const listenerRecord = await physicalRecord(listenerPath, listenerRelative);
  const listenerObservation = JSON.parse(await fs.readFile(listenerPath, "utf8"));
  if (capture.listenerOwnership?.record?.sha256 !== listenerRecord.sha256 ||
      capture.listenerOwnership?.record?.bytes !== listenerRecord.bytes ||
      capture.listenerOwnership?.record?.absolutePath !== listenerPath) {
    throw new Error(`Screenshot listener observation record is invalid: ${relativePath}.`);
  }
  assertWindowOpeningListenerObservation(listenerObservation, {
    screenshotId: capture.screenshotId,
    serverContextSha256: serverContextRecord.sha256,
    pid: mountedRun.server.listenerPid,
    port: mountedRun.port,
    cwd: mountedRun.server.listenerCwd,
  });
  assertWindowOpeningScreenshotCaptureContext(capture, {
    screenshotId: path.basename(filePath, ".png"),
    absolutePath: filePath,
    relativePath: path.relative(evidenceRoot, filePath),
    sourceIdentity,
    runId: mountedRun.runId,
    route: "/design",
    mountedTest,
    server: { ...mountedRun.server, port: mountedRun.port },
    trace: { absolutePath: tracePath, relativePath: trace.path },
    serverContext: {
      absolutePath: serverContextPath,
      relativePath: serverContextRecord.path,
      sha256: serverContextRecord.sha256,
    },
    listenerRecord: {
      absolutePath: listenerPath,
      relativePath: listenerRecord.path,
      sha256: listenerRecord.sha256,
    },
    listenerObservation,
    image: {
      mime: "image/png",
      extension: ".png",
      bytes: content.byteLength,
      sha256: sha256(content),
      width: content.readUInt32BE(16),
      height: content.readUInt32BE(20),
    },
  });
  return {
    ...await physicalRecord(filePath, path.relative(evidenceRoot, filePath)),
    mime: "image/png",
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20),
    capture,
    captureRecord: await physicalRecord(
      sidecarPath, path.relative(evidenceRoot, sidecarPath)
    ),
    trace,
    serverContextRecord,
    listenerObservationRecord: listenerRecord,
  };
}

export function assertWindowOpeningScreenshotSet(screenshots, expectedCount) {
  if (!Array.isArray(screenshots) || screenshots.length !== expectedCount) {
    throw new Error(`The final evidence must contain ${expectedCount} contextual screenshots.`);
  }
  const ids = screenshots.map((entry) => entry.capture?.screenshotId);
  if (ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
    throw new Error("Screenshot records contain a duplicate or missing screenshot ID.");
  }
  const paths = screenshots.map((entry) => entry.path);
  if (paths.some((entry) => typeof entry !== "string") ||
      new Set(paths).size !== paths.length) {
    throw new Error("Different screenshot IDs reuse the same physical screenshot path.");
  }
  return screenshots;
}

export function manifestSha256(manifest) {
  const { manifestSha256: _excluded, ...withoutSelf } = manifest;
  return sha256(JSON.stringify(withoutSelf));
}

export function assertManifestDigest(manifest) {
  if (!manifest.manifestSha256 || manifest.manifestSha256 !== manifestSha256(manifest)) {
    throw new Error("Manifest non-circular digest does not match.");
  }
}

export async function assertPhysicalManifestDigest(manifestPath, digestPath) {
  const expected = (await fs.readFile(digestPath, "utf8")).trim();
  const actual = sha256(await fs.readFile(manifestPath));
  if (actual !== expected) throw new Error("Physical manifest-file digest does not match.");
  return actual;
}

const SOURCE_IDENTITY_FIELDS = [
  "worktreePath", "repositoryRoot", "branch", "head", "gitStatusShort",
  "stagedFileCount", "trackedDiffSha256", "untrackedInventorySha256",
  "completeStateIdentitySha256", "untrackedFiles",
];
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

export function assertSourceIdentityEquals(actual, expected, label = "Source identity") {
  for (const field of SOURCE_IDENTITY_FIELDS) {
    if (JSON.stringify(actual?.[field]) !== JSON.stringify(expected?.[field])) {
      throw new Error(`${label} ${field} does not match the frozen source state.`);
    }
  }
  assertCanonicalPathInventory(actual.untrackedFiles);
  return actual;
}

export function assertWindowOpeningBuildSourceBinding(
  buildRun, frozenIdentity, actualIgnoredPostInventory = null
) {
  if (buildRun?.schemaVersion !== "window-opening-isolated-build/v3" ||
      buildRun.sourceState?.expectation?.kind !== "external-frozen-identity" ||
      buildRun.sourceState?.taskSourceUnchanged !== true) {
    throw new Error("Build result source-binding metadata is incomplete.");
  }
  assertSourceIdentityEquals(buildRun.sourceState.expectation.identity, frozenIdentity,
    "Build expected source identity");
  assertSourceIdentityEquals(buildRun.sourceState.beforeBuild, frozenIdentity,
    "Build pre-build source identity");
  assertSourceIdentityEquals(buildRun.sourceState.afterBuild, frozenIdentity,
    "Build post-build source identity");
  assertIgnoredBuildOutputObservation(
    buildRun.sourceState.allowedIgnoredBuildOutputs, actualIgnoredPostInventory
  );
  return buildRun.sourceState;
}

export function inspectIntegrityTestInventory(expectedTestIds, executedTestIds) {
  const expected = [...expectedTestIds];
  const executed = [...executedTestIds];
  const duplicateValues = executed.filter((id, index) => executed.indexOf(id) !== index);
  const duplicates = [...new Set(duplicateValues)].sort();
  const expectedSet = new Set(expected);
  const executedSet = new Set(executed);
  const missing = expected.filter((id) => !executedSet.has(id));
  const unexpected = [...executedSet].filter((id) => !expectedSet.has(id)).sort();
  return {
    schemaVersion: "window-opening-evidence-integrity-result/v1",
    expectedCount: expected.length,
    executedCount: executed.length,
    expectedIds: expected,
    executedIds: executed,
    missingIds: missing,
    unexpectedIds: unexpected,
    duplicateIds: duplicates,
    cases: expected.map((id) => ({ id, status: executedSet.has(id) ? "passed" : "missing" })),
    valid: new Set(expected).size === expected.length &&
      missing.length === 0 && unexpected.length === 0 && duplicates.length === 0,
  };
}

export function assertIntegrityTestInventory(expectedTestIds, executedTestIds) {
  const result = inspectIntegrityTestInventory(expectedTestIds, executedTestIds);
  if (!result.valid) {
    throw Object.assign(new Error(
      `Integrity inventory mismatch: missing=${result.missingIds.join(",") || "none"}; ` +
      `unexpected=${result.unexpectedIds.join(",") || "none"}; ` +
      `duplicates=${result.duplicateIds.join(",") || "none"}.`
    ), { inventoryResult: result });
  }
  return result;
}

export function assertRequiredHistoricalCommandReferences(entries, requiredEntries) {
  if (!Array.isArray(entries)) throw new Error("Historical command references must be an array.");
  for (const required of requiredEntries) {
    const matches = entries.filter((entry) => entry.evidenceRoot === required.evidenceRoot &&
      entry.logicalCommandId === required.logicalCommandId && entry.attemptId === required.attemptId);
    if (matches.length !== 1) throw new Error("A required known historical command is omitted or duplicated.");
    const entry = matches[0];
    const expectedPath = path.join("commands", entry.logicalCommandId, entry.attemptId, "record.json");
    const normalizedPath = path.normalize(entry.recordPath ?? "");
    if (normalizedPath !== expectedPath || path.isAbsolute(normalizedPath) ||
        normalizedPath === ".." || normalizedPath.startsWith(`..${path.sep}`)) {
      throw new Error("Historical command record path escapes or contradicts its approved root.");
    }
    if (entry.requiredFinalSuccess !== false ||
        entry.classification !== "historical-required-failure") {
      throw new Error("Historical failed command is incorrectly counted as a required final success.");
    }
  }
  return entries;
}

function cameraVector(value, length, label) {
  if (!Array.isArray(value) || value.length !== length ||
      value.some((component) => !Number.isFinite(component))) {
    throw new Error(`Screenshot camera ${label} must contain ${length} finite components.`);
  }
  return value;
}

function assertCameraState(camera, mode) {
  if (!camera || typeof camera !== "object") throw new Error("Screenshot camera state is missing.");
  const position = cameraVector(camera.position, 3, "position");
  const quaternion = cameraVector(camera.quaternion, 4, "quaternion");
  const target = cameraVector(camera.target, 3, "target");
  const quaternionNorm = Math.hypot(...quaternion);
  if (quaternionNorm < 1e-8 || Math.abs(quaternionNorm - 1) > 1e-3) {
    throw new Error("Screenshot camera quaternion is not normalized within tolerance.");
  }
  for (const field of ["zoom", "near", "far"]) {
    if (!Number.isFinite(camera[field])) throw new Error(`Screenshot camera ${field} must be finite.`);
  }
  if (camera.zoom <= 0 || camera.near <= 0 || camera.far <= camera.near) {
    throw new Error("Screenshot camera zoom/near/far relationship is invalid.");
  }
  if (Math.hypot(...position.map((component, index) => component - target[index])) < 1e-6) {
    throw new Error("Screenshot camera position and target are degenerate.");
  }
  if (mode === "2d") {
    if (camera.projection !== "orthographic" || camera.fov !== null) {
      throw new Error("2D screenshot camera must be orthographic without a perspective fov.");
    }
  } else if (camera.projection !== "perspective" ||
      !Number.isFinite(camera.fov) || camera.fov <= 0 || camera.fov >= 180) {
    throw new Error("3D screenshot camera must be a valid perspective camera.");
  }
}

function strictUtc(value, label) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`${label} must be a canonical UTC instant.`);
  }
  return Date.parse(value);
}

function safeIdList(value, label) {
  if (!Array.isArray(value) || new Set(value).size !== value.length ||
      value.some((id) => typeof id !== "string" || !SAFE_ID.test(id))) {
    throw new Error(`${label} must contain unique safe IDs.`);
  }
}

export function cameraDirectionMetrics(first, second) {
  const direction = (camera) => {
    const vector = camera.target.map((value, index) => value - camera.position[index]);
    const length = Math.hypot(...vector);
    return vector.map((value) => value / length);
  };
  const firstDirection = direction(first);
  const secondDirection = direction(second);
  const cosine = Math.max(-1, Math.min(1,
    firstDirection.reduce((sum, value, index) => sum + value * secondDirection[index], 0)));
  return {
    angleDeg: Math.acos(cosine) * 180 / Math.PI,
    positionDistance: Math.hypot(...first.position.map(
      (value, index) => value - second.position[index])),
    targetDrift: Math.hypot(...first.target.map((value, index) => value - second.target[index])),
  };
}

export function assertWindowOpeningCameraTransition(first, second, options = {}) {
  assertCameraState(first, "3d");
  assertCameraState(second, "3d");
  const minimumAngleDeg = options.minimumAngleDeg ?? 10;
  const minimumPositionDistance = options.minimumPositionDistance ?? 0.75;
  const maximumTargetDrift = options.maximumTargetDrift ?? 0.5;
  const metrics = cameraDirectionMetrics(first, second);
  if (JSON.stringify(first) === JSON.stringify(second) ||
      metrics.angleDeg < minimumAngleDeg ||
      metrics.positionDistance < minimumPositionDistance ||
      metrics.targetDrift > maximumTargetDrift) {
    throw new Error("3D camera direction B is not a material, target-stable orbit from direction A.");
  }
  return { ...metrics, minimumAngleDeg, minimumPositionDistance, maximumTargetDrift };
}

export function assertWindowOpeningListenerObservation(observation, expected) {
  if (observation?.schemaVersion !== "window-opening-listener-observation/v1" ||
      observation.screenshotId !== expected.screenshotId ||
      observation.serverContextSha256 !== expected.serverContextSha256 ||
      observation.pid !== expected.pid || observation.port !== expected.port ||
      observation.cwd !== expected.cwd || typeof observation.listenerOutput !== "string" ||
      typeof observation.cwdOutput !== "string" ||
      observation.listenerOutputSha256 !== sha256(observation.listenerOutput)) {
    throw new Error("Listener observation record does not match its server context.");
  }
  strictUtc(observation.observedAt, "Listener observation timestamp");
  const pids = observation.listenerOutput.split("\n")
    .filter((line) => line.startsWith("p")).map((line) => Number(line.slice(1)));
  const cwd = observation.cwdOutput.split("\n")
    .find((line) => line.startsWith("n"))?.slice(1);
  if (JSON.stringify(pids) !== JSON.stringify([expected.pid]) || cwd !== expected.cwd) {
    throw new Error("Listener observation raw lsof output contradicts its parsed ownership.");
  }
  const binding = sha256(JSON.stringify({
    screenshotId: observation.screenshotId,
    serverContextSha256: observation.serverContextSha256,
    observedAt: observation.observedAt,
    pid: observation.pid,
    port: observation.port,
    cwd: observation.cwd,
    listenerOutputSha256: observation.listenerOutputSha256,
  }));
  if (observation.bindingSha256 !== binding) {
    throw new Error("Listener observation binding digest does not match its physical fields.");
  }
  return observation;
}

export function assertWindowOpeningScreenshotCaptureContext(capture, expected) {
  if (capture?.schemaVersion !== "window-opening-screenshot-capture/v2") {
    throw new Error("Screenshot capture schema version is invalid.");
  }
  if (!SAFE_ID.test(capture.screenshotId) || capture.screenshotId !== expected.screenshotId) {
    throw new Error("Screenshot ID does not match its canonical filename stem.");
  }
  if (!SAFE_ID.test(capture.test?.id) || !SAFE_ID.test(capture.fixture?.id)) {
    throw new Error("Screenshot test or fixture ID is unsafe.");
  }
  if (capture.mode !== "2d" && capture.mode !== "3d") throw new Error("Screenshot mode is invalid.");
  if (capture.focus !== "full_plan" && capture.focus !== "focused_room") {
    throw new Error("Screenshot focus state is invalid.");
  }
  assertCameraState(capture.cameraState, capture.mode);
  if (!Number.isSafeInteger(capture.viewport?.width) || capture.viewport.width <= 0 ||
      !Number.isSafeInteger(capture.viewport?.height) || capture.viewport.height <= 0 ||
      !Number.isFinite(capture.viewport?.deviceScaleFactor) ||
      capture.viewport.deviceScaleFactor < 0.5 || capture.viewport.deviceScaleFactor > 4) {
    throw new Error("Screenshot viewport or DPR is outside the supported range 0.5..4.");
  }
  if (!Number.isSafeInteger(capture.serverPort) || capture.serverPort < 1 || capture.serverPort > 65535) {
    throw new Error("Screenshot server port is invalid.");
  }
  for (const [label, ids] of [["Fixture rooms", capture.fixture?.roomIds],
    ["Fixture openings", capture.fixture?.openingIds],
    ["Logical rooms", capture.logicalRoomIds], ["Logical openings", capture.logicalOpeningIds]]) {
    safeIdList(ids, label);
  }
  if (!SHA256.test(capture.fixture?.sha256) ||
      capture.fixture.id !== `${capture.test?.id}:${capture.fixture.sha256.slice(0, 16)}` ||
      JSON.stringify(capture.logicalRoomIds) !== JSON.stringify(capture.fixture.roomIds) ||
      JSON.stringify(capture.logicalOpeningIds) !== JSON.stringify(capture.fixture.openingIds)) {
    throw new Error("Screenshot fixture identity or logical IDs are inconsistent.");
  }
  if (capture.focus === "focused_room") {
    if (!capture.fixture.roomIds.includes(capture.focusedRoomId)) {
      throw new Error("Focused screenshot room does not belong to its fixture.");
    }
  } else if (capture.focusedRoomId !== null) {
    throw new Error("Full-plan screenshot must not claim a focused room.");
  }
  const startedAt = strictUtc(capture.captureStartedAt, "Screenshot capture start");
  const capturedAt = strictUtc(capture.captureTimestamp, "Screenshot capture timestamp");
  const observedAt = strictUtc(capture.listenerOwnership?.observedAt, "Listener observation timestamp");
  const readyAt = strictUtc(expected.server.readyAt, "Server ready timestamp");
  const endedAt = strictUtc(expected.server.endedAt, "Server teardown timestamp");
  if (startedAt < readyAt || capturedAt < startedAt || capturedAt > endedAt ||
      observedAt < startedAt || observedAt > capturedAt) {
    throw new Error("Screenshot timestamp lies outside the owned server lifetime.");
  }
  if (capture.route !== "/design" || capture.route !== expected.route ||
      !isRecord(capture.query)) throw new Error("Screenshot route or query context is invalid.");
  const mountedTest = expected.mountedTest;
  if (!mountedTest || capture.test?.id !== mountedTest.id ||
      capture.test.title !== mountedTest.title || capture.test.project !== mountedTest.project ||
      capture.trace?.testId !== mountedTest.id || capture.trace.absolutePath !== expected.trace.absolutePath ||
      capture.trace.evidenceRootRelativePath !== expected.trace.relativePath) {
    throw new Error("Screenshot test and trace identities do not match the mounted record.");
  }
  if (capture.runId !== expected.runId || capture.absolutePath !== expected.absolutePath ||
      capture.evidenceRootRelativePath !== expected.relativePath ||
      capture.sourceCompleteStateIdentitySha256 !== expected.sourceIdentity ||
      capture.logicalDesignId !== "interior-ai:v1:livingroom-design") {
    throw new Error("Screenshot run, path, design, or source identity is invalid.");
  }
  if (capture.listenerPid !== expected.server.listenerPid ||
      capture.launcherPid !== expected.server.launcherPid ||
      capture.serverCwd !== expected.server.listenerCwd ||
      capture.serverExecutable !== expected.server.listenerExecutable ||
      capture.serverPort !== expected.server.port ||
      capture.listenerOwnership.pid !== expected.server.listenerPid ||
      capture.listenerOwnership.port !== expected.server.port ||
      capture.listenerOwnership.cwd !== expected.server.listenerCwd) {
    throw new Error("Screenshot listener ownership context does not match the mounted server.");
  }
  if (capture.serverContext?.absolutePath !== expected.serverContext.absolutePath ||
      capture.serverContext.evidenceRootRelativePath !== expected.serverContext.relativePath ||
      capture.serverContext.sha256 !== expected.serverContext.sha256 ||
      capture.listenerOwnership.record?.absolutePath !== expected.listenerRecord.absolutePath ||
      capture.listenerOwnership.record.evidenceRootRelativePath !== expected.listenerRecord.relativePath ||
      capture.listenerOwnership.record.sha256 !== expected.listenerRecord.sha256 ||
      capture.listenerOwnership.listenerOutputSha256 !== expected.listenerObservation.listenerOutputSha256 ||
      capture.listenerOwnership.bindingSha256 !== expected.listenerObservation.bindingSha256) {
    throw new Error("Screenshot listener/server-context digest binding is invalid.");
  }
  if (expected.image.extension !== ".png" || capture.mime !== expected.image.mime ||
      capture.mime !== "image/png" || capture.bytes !== expected.image.bytes ||
      capture.sha256 !== expected.image.sha256 || capture.width !== expected.image.width ||
      capture.height !== expected.image.height ||
      capture.width !== capture.viewport.width * capture.viewport.deviceScaleFactor ||
      capture.height !== capture.viewport.height * capture.viewport.deviceScaleFactor) {
    throw new Error("Screenshot image metadata does not match the physical PNG.");
  }
  return capture;
}
