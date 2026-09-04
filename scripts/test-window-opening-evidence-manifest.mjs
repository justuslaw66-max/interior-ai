import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import {
  assertCanonicalPathInventory,
  assertCommandAttemptIntegrity,
  assertIntegrityTestInventory,
  assertManifestDigest,
  assertPhysicalManifestDigest,
  assertRequiredHistoricalCommandReferences,
  assertScreenshotIntegrity,
  assertWindowOpeningBuildSourceBinding,
  assertWindowOpeningCameraTransition,
  assertWindowOpeningListenerObservation,
  assertWindowOpeningScreenshotCaptureContext,
  assertWindowOpeningScreenshotSet,
  assertWorkingTreeIdentityMatches,
  collectWorkingTreeIdentity,
  manifestSha256,
  verifyHistoricalCommandAttempt,
  verifyWindowOpeningScreenshotEvidence,
} from "./window-opening-evidence-manifest.mjs";
import {
  parseEvidenceCommandArguments,
  physicalFileRecord,
  sha256,
} from "./window-opening-evidence-command.mjs";
import { buildWindowOpeningChildEnvironment } from "./window-opening-child-environment.mjs";
import {
  loadWindowOpeningMountedTestInventory,
  verifyWindowOpeningMountedReport,
} from "./window-opening-mounted-test-contract.mjs";
import {
  assertPortHasNoListener,
  parseLsofListenerOutput,
  resolveOwnedPortListener,
} from "./window-opening-process-ownership.mjs";
import {
  assertIgnoredBuildOutputObservation,
  collectIgnoredStateInventory,
  createIgnoredBuildOutputObservation,
  WINDOW_OPENING_IGNORED_DISCOVERY,
} from "./window-opening-ignored-build-outputs.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const runnerPath = path.join(repositoryRoot, "scripts/run-window-opening-evidence-command.mjs");
const inventoryContract = JSON.parse(await fs.readFile(
  path.join(repositoryRoot, "scripts/window-opening-evidence-integrity-tests.json"), "utf8"
));
if (inventoryContract.schema !== "window-opening-evidence-integrity-tests/v1" ||
    inventoryContract.ordering !== "non-authoritative" ||
    !Array.isArray(inventoryContract.expectedTestIds) ||
    new Set(inventoryContract.expectedTestIds).size !== inventoryContract.expectedTestIds.length) {
  throw new Error("The fixed evidence-integrity test inventory is malformed.");
}
const fixedExpectedCaseIds = inventoryContract.expectedTestIds;
const covered = [];
const cover = (name) => {
  if (!fixedExpectedCaseIds.includes(name)) throw new Error(`Unknown integrity test ID: ${name}.`);
  if (covered.includes(name)) throw new Error(`Duplicate integrity test execution: ${name}.`);
  covered.push(name);
};

async function git(root, args) {
  return execFileAsync("git", args, { cwd: root });
}

async function temporaryRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-identity-"));
  await git(root, ["init", "--quiet"]);
  await git(root, ["config", "user.email", "evidence@example.invalid"]);
  await git(root, ["config", "user.name", "Evidence Test"]);
  await fs.writeFile(path.join(root, "tracked.txt"), "tracked-base\n");
  await git(root, ["add", "tracked.txt"]);
  await git(root, ["commit", "--quiet", "-m", "fixture"]);
  await fs.writeFile(path.join(root, "tracked.txt"), "tracked-before\n");
  await fs.writeFile(path.join(root, "untracked.txt"), "before");
  return root;
}

function rebindIdentity(identity) {
  const untrackedInventorySha256 = sha256(JSON.stringify(identity.untrackedFiles));
  return {
    ...identity,
    untrackedInventorySha256,
    completeStateIdentitySha256: sha256(JSON.stringify({
      head: identity.head,
      trackedDiffSha256: identity.trackedDiffSha256,
      untracked: identity.untrackedFiles,
    })),
  };
}

async function expectIdentityRejection(name, mutate, pattern = /does not match|inventory|path/i) {
  const root = await temporaryRepository();
  let expected = await collectWorkingTreeIdentity(root);
  await mutate({ root, expected, replaceExpected: (next) => { expected = next; } });
  await assert.rejects(() => assertWorkingTreeIdentityMatches(root, expected), pattern);
  cover(name);
}

await expectIdentityRejection("untracked content change", async ({ root }) => {
  await fs.writeFile(path.join(root, "untracked.txt"), "aft_er");
});
await expectIdentityRejection("untracked file type change", async ({ root }) => {
  await fs.unlink(path.join(root, "untracked.txt"));
  try { await fs.symlink("before", path.join(root, "untracked.txt")); }
  catch (cause) { throw new Error(`UNSUPPORTED symlink coverage: ${cause.message}`); }
});
await expectIdentityRejection("untracked mode change", async ({ root }) => {
  await fs.chmod(path.join(root, "untracked.txt"), 0o755);
});
await expectIdentityRejection("byte-length change", async ({ root }) => {
  await fs.writeFile(path.join(root, "untracked.txt"), "longer-content");
});
await expectIdentityRejection("missing expected untracked path", async ({ root }) => {
  await fs.unlink(path.join(root, "untracked.txt"));
});
await expectIdentityRejection("unexpected extra untracked path", async ({ root }) => {
  await fs.writeFile(path.join(root, "extra.txt"), "extra");
});
await expectIdentityRejection("untracked path rename", async ({ root }) => {
  await fs.rename(path.join(root, "untracked.txt"), path.join(root, "renamed.txt"));
});
await expectIdentityRejection("untracked hash mismatch", async ({ expected, replaceExpected }) => {
  const corrupted = structuredClone(expected);
  corrupted.untrackedFiles[0].sha256 = "0".repeat(64);
  replaceExpected(rebindIdentity(corrupted));
});
await expectIdentityRejection("tracked working-tree diff change", async ({ root }) => {
  await fs.writeFile(path.join(root, "tracked.txt"), "tracked-after\n");
});
await expectIdentityRejection("HEAD change", async ({ root }) => {
  await fs.writeFile(path.join(root, "head-change.txt"), "next\n");
  await git(root, ["add", "head-change.txt"]);
  await git(root, ["commit", "--quiet", "-m", "head change"]);
});
await expectIdentityRejection("branch mismatch", async ({ expected, replaceExpected }) => {
  replaceExpected({ ...expected, branch: `${expected.branch}-wrong` });
});
await expectIdentityRejection("repository-root mismatch", async ({ expected, replaceExpected }) => {
  replaceExpected({ ...expected, repositoryRoot: `${expected.repositoryRoot}-wrong` });
});
await expectIdentityRejection("repository path escape", async ({ expected, replaceExpected }) => {
  const corrupted = structuredClone(expected);
  corrupted.untrackedFiles[0].path = "../escape.txt";
  replaceExpected(rebindIdentity(corrupted));
}, /path/i);

const parserBase = ["--root", "/tmp/evidence", "--id", "command", "--", "node", "--version"];
assert.deepEqual(parseEvidenceCommandArguments(parserBase).environmentNames, []);
cover("missing --env-names becomes []");
assert.equal(parseEvidenceCommandArguments(parserBase).evidenceRoot, "/tmp/evidence");
cover("--root is not an environment name");
for (const malformed of [
  ["--root", "/tmp/evidence", "--id", "command", "--unknown", "x", "--", "node"],
  ["--root", "/tmp/evidence", "--id", "command", "--id", "again", "--", "node"],
  ["--root", "/tmp/evidence", "--id", "command", "--env-names", "BAD-NAME", "--", "node"],
  ["--root", "/tmp/evidence", "--id", "command", "--env-names", "--", "node"],
]) assert.throws(() => parseEvidenceCommandArguments(malformed));
cover("malformed options fail");

const scrubbedEvidence = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-scrubbed-"));
await runRunner(scrubbedEvidence, [
  "--id", "scrubbed-environment", "--",
  "node", "-e", "process.stdout.write(JSON.stringify(Object.keys(process.env).sort()))",
], { env: {
  WINDOW_OPENING_AMBIENT_SENTINEL: "must-not-propagate",
  AWS_SECRET_ACCESS_KEY: "must-not-propagate-either",
} });
const scrubbedRecord = (await attemptRecords(scrubbedEvidence, "scrubbed-environment"))[0];
const scrubbedKeys = JSON.parse(await fs.readFile(
  path.join(scrubbedEvidence, scrubbedRecord.stdout.path), "utf8"
));
assert.deepEqual(
  scrubbedKeys.filter((name) => name !== "__CF_USER_TEXT_ENCODING"),
  ["HOME", "PATH", "TMPDIR"]
);
cover("unrelated ambient sentinel is scrubbed");
assert.ok(!scrubbedKeys.includes("AWS_SECRET_ACCESS_KEY"));
cover("credential-like ambient variable is scrubbed");
assert.deepEqual(scrubbedRecord.environmentNames, ["HOME", "PATH", "TMPDIR"]);
cover("exact child environment names are recorded");
assert.ok(scrubbedKeys.includes("PATH") && scrubbedKeys.includes("HOME") && scrubbedKeys.includes("TMPDIR"));
cover("required allowlisted host variables reach child");
assert.throws(() => buildWindowOpeningChildEnvironment({
  hostEnvironment: { PATH: "/bin", HOME: "/tmp" },
}), /TMPDIR/);
cover("missing required allowlisted host variable fails closed");
for (const scriptName of [
  "run-window-opening-mounted.mjs",
  "run-window-opening-build.mjs",
  "run-window-opening-evidence-command.mjs",
]) {
  const source = await fs.readFile(path.join(repositoryRoot, "scripts", scriptName), "utf8");
  assert.doesNotMatch(source, /\.\.\.process\.env/);
}
cover("evidence orchestrators contain no process environment spread");
const finalizerSource = await fs.readFile(
  path.join(repositoryRoot, "scripts/finalize-window-opening-evidence-manifest.mjs"), "utf8"
);
assert.match(
  finalizerSource,
  /canonicalNames[\s\S]*?localeCompare[\s\S]*?child environment names do not match/
);
cover("child environment exact-set verification is order independent");
const rejectedMountedParent = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-grep-reject-"));
await assert.rejects(async () => {
  try {
    await execFileAsync(process.execPath, [
      path.join(repositoryRoot, "scripts/run-window-opening-mounted.mjs"),
    ], {
      cwd: repositoryRoot,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        WINDOW_OPENING_MOUNTED_PARENT: rejectedMountedParent,
        WINDOW_OPENING_PLAYWRIGHT_GREP: "one test",
      },
    });
  } catch (cause) {
    assert.match(cause.stdout, /WINDOW_OPENING_PLAYWRIGHT_GREP is forbidden/);
    throw cause;
  }
});
cover("sealable mounted runner rejects grep environment filtering");
const failedSealRoot = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-failed-seal-"));
const failedSealMetadata = path.join(failedSealRoot, "metadata.json");
await fs.writeFile(failedSealMetadata, "{}\n");
await assert.rejects(() => execFileAsync(process.execPath, [
  path.join(repositoryRoot, "scripts/seal-window-opening-evidence.mjs"),
  "--root", failedSealRoot,
  "--metadata", failedSealMetadata,
], { cwd: repositoryRoot, maxBuffer: 16 * 1024 * 1024 }));
const failedSealJournal = (await fs.readFile(
  path.join(failedSealRoot, "seal-attempt-journal.ndjson"), "utf8"
)).trim().split("\n").map((line) => JSON.parse(line));
assert.equal(failedSealJournal.length, 2);
assert.equal(failedSealJournal[0].event, "seal_attempt_started");
assert.equal(failedSealJournal[1].event, "seal_failed");
assert.equal(failedSealJournal[0].attemptId, failedSealJournal[1].attemptId);
assert.equal(failedSealJournal[1].manifestProduced, false);
cover("failed finalizer remains discoverable in append-only seal journal");
assert.match(failedSealJournal[1].failureReason, /^(?:Error|[A-Za-z]+Error(?: \[[^\]]+\])?):/);
assert.doesNotMatch(failedSealJournal[1].failureReason, /^Node\.js /);
cover("failed finalizer retains the actionable error reason");

async function runRunner(evidenceRoot, args, options = {}) {
  return execFileAsync(process.execPath, [runnerPath, "--root", evidenceRoot, ...args], {
    cwd: options.cwd ?? repositoryRoot,
    env: { ...process.env, ...options.env },
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function attemptRecords(evidenceRoot, id) {
  const commandRoot = path.join(evidenceRoot, "commands", id);
  const attempts = (await fs.readdir(commandRoot)).sort();
  return Promise.all(attempts.map(async (attemptId) => JSON.parse(
    await fs.readFile(path.join(commandRoot, attemptId, "record.json"), "utf8")
  )));
}

const runnerEvidence = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-runner-"));
await assert.rejects(() => runRunner(runnerEvidence, [
  "--id", "repeat", "--required", "--attempt-id", "attempt-one", "--",
  "node", "-e", "process.stderr.write('failed'); process.exit(7)",
]));
const firstRecord = (await attemptRecords(runnerEvidence, "repeat"))[0];
assert.equal(firstRecord.exitCode, 7);
const firstStdoutHash = firstRecord.stdout.sha256;
const firstStderrHash = firstRecord.stderr.sha256;
await runRunner(runnerEvidence, [
  "--id", "repeat", "--required", "--attempt-id", "attempt-two", "--",
  "node", "-e", "process.stdout.write('passed')",
]);
const repeatRecords = await attemptRecords(runnerEvidence, "repeat");
assert.equal(repeatRecords.length, 2);
await assertCommandAttemptIntegrity(runnerEvidence, repeatRecords[0]);
await assertCommandAttemptIntegrity(runnerEvidence, repeatRecords[1]);
assert.equal(repeatRecords[0].stdout.sha256, firstStdoutHash);
assert.equal(repeatRecords[0].stderr.sha256, firstStderrHash);
cover("immutable repeated attempts and preserved failed hashes");
await assert.rejects(() => runRunner(runnerEvidence, [
  "--id", "repeat", "--attempt-id", "attempt-two", "--", "node", "--version",
]));
await assertCommandAttemptIntegrity(runnerEvidence, repeatRecords[1]);
cover("attempt-path collision fails closed");

await runRunner(runnerEvidence, [
  "--id", "ts-node-metadata", "--required", "--", "npx", "ts-node", "--version",
]);
const tsNodeRecord = (await attemptRecords(runnerEvidence, "ts-node-metadata"))[0];
assert.equal(tsNodeRecord.launcher.name, "npx");
assert.match(tsNodeRecord.launcher.version, /^11\./);
assert.equal(tsNodeRecord.runner.name, "ts-node");
assert.match(tsNodeRecord.runner.version, /^v10\.9\.2/);
assert.notEqual(tsNodeRecord.launcher.version, tsNodeRecord.runner.version);
cover("truthful npx and ts-node versions");

const npmCwd = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-npm-script-"));
await fs.writeFile(path.join(npmCwd, "package.json"), JSON.stringify({
  name: "evidence-fixture", version: "1.2.3",
  scripts: { smoke: "node -e \"process.stdout.write('npm-script')\"" },
}));
const npmEvidence = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-npm-evidence-"));
await runRunner(npmEvidence, ["--id", "npm-script", "--", "npm", "run", "smoke"], { cwd: npmCwd });
const npmRecord = (await attemptRecords(npmEvidence, "npm-script"))[0];
assert.equal(npmRecord.launcher.name, "npm");
assert.equal(npmRecord.runner.invokedScript, "smoke");
assert.equal(npmRecord.runner.version, "evidence-fixture@1.2.3");
cover("npm launcher and invoked script metadata");

const secret = "window-opening-secret-value";
await runRunner(runnerEvidence, [
  "--id", "secret-redaction", "--env-names", "WINDOW_TEST_SECRET", "--",
  "node", "-e", "process.stdout.write(process.env.WINDOW_TEST_SECRET)",
], { env: { WINDOW_TEST_SECRET: secret } });
const secretRecord = (await attemptRecords(runnerEvidence, "secret-redaction"))[0];
const secretLog = await fs.readFile(path.join(runnerEvidence, secretRecord.stdout.path), "utf8");
assert.equal(secretLog, "<redacted>");
assert.equal(secretRecord.environment.find(
  (entry) => entry.name === "WINDOW_TEST_SECRET"
)?.classification, "secret");
assert.deepEqual(secretRecord.environmentNames,
  ["HOME", "PATH", "TMPDIR", "WINDOW_TEST_SECRET"]);
assert.doesNotMatch(JSON.stringify(secretRecord), new RegExp(secret));
cover("secret values are redacted");

await assert.rejects(() => runRunner(runnerEvidence, [
  "--id", "signal", "--", "node", "-e", "process.kill(process.pid, 'SIGTERM')",
]));
const signalRecord = (await attemptRecords(runnerEvidence, "signal"))[0];
assert.equal(signalRecord.exitCode, 1);
assert.equal(signalRecord.signal, "SIGTERM");
cover("exit codes and signals retained");

async function commandFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-command-integrity-"));
  const attemptRoot = path.join(root, "commands", "command", "attempt");
  await fs.mkdir(attemptRoot, { recursive: true });
  await fs.writeFile(path.join(attemptRoot, "stdout.log"), "stdout");
  await fs.writeFile(path.join(attemptRoot, "stderr.log"), "stderr");
  return {
    root,
    record: {
      logicalCommandId: "command", attemptId: "attempt",
      argv: ["node", "script.mjs"], workingDirectory: "/repo",
      launcher: { version: "v24" }, runner: { version: "runner-v1" },
      exitCode: 0, signal: null,
      stdout: await physicalFileRecord(path.join(attemptRoot, "stdout.log"), root),
      stderr: await physicalFileRecord(path.join(attemptRoot, "stderr.log"), root),
    },
  };
}

async function replayRejection(name, mutate) {
  const fixture = await commandFixture();
  const replay = structuredClone(fixture.record);
  await mutate({ ...fixture, replay });
  await assert.rejects(
    () => assertCommandAttemptIntegrity(fixture.root, fixture.record, replay),
    /does not match|missing|attempt|recorded/i
  );
  cover(name);
}

await replayRejection("command argv change", async ({ replay }) => { replay.argv = ["node", "other.mjs"]; });
await replayRejection("working-directory change", async ({ replay }) => { replay.workingDirectory = "/other"; });
await replayRejection("launcher-version change", async ({ replay }) => { replay.launcher.version = "v25"; });
await replayRejection("actual runner-version change", async ({ replay }) => { replay.runner.version = "runner-v2"; });
await replayRejection("exit-code change", async ({ replay }) => { replay.exitCode = 2; });
await replayRejection("stdout-log substitution", async ({ root, record }) => {
  await fs.writeFile(path.join(root, record.stdout.path), "replaced");
});
await replayRejection("stderr-log substitution", async ({ root, record }) => {
  await fs.writeFile(path.join(root, record.stderr.path), "replaced");
});
await replayRejection("missing stdout log", async ({ root, record }) => {
  await fs.unlink(path.join(root, record.stdout.path));
});
await replayRejection("missing stderr log", async ({ root, record }) => {
  await fs.unlink(path.join(root, record.stderr.path));
});
await replayRejection("null signal substitution", async ({ replay }) => {
  replay.signal = "SIGTERM";
});
{
  const fixture = await commandFixture();
  const recorded = { ...fixture.record, signal: "SIGTERM" };
  const replay = { ...recorded, signal: "SIGKILL" };
  await assert.rejects(
    () => assertCommandAttemptIntegrity(fixture.root, recorded, replay),
    /signal does not match/i
  );
  cover("non-null signal substitution");
}
await replayRejection("log mode substitution", async ({ root, record }) => {
  await fs.chmod(path.join(root, record.stdout.path), 0o755);
});
await replayRejection("log type substitution", async ({ root, record }) => {
  const target = path.join(root, record.stdout.path);
  await fs.unlink(target);
  try { await fs.symlink("stderr.log", target); }
  catch (cause) { throw new Error(`UNSUPPORTED symlink coverage: ${cause.message}`); }
});

const mountedInventory = await loadWindowOpeningMountedTestInventory();
function mountedReport(entries = mountedInventory) {
  return {
    suites: [{
      title: "window-opening-corrections.spec.ts",
      file: "window-opening-corrections.spec.ts",
      specs: entries.map((entry) => ({
        title: entry.title,
        id: entry.playwrightId,
        ok: true,
        tests: [{
          projectName: entry.project,
          status: "expected",
          results: [{ status: "passed", retry: 0 }],
        }],
      })),
    }],
  };
}
await assert.doesNotReject(() => verifyWindowOpeningMountedReport(
  mountedReport(), { sealable: true, filters: [] }
));
cover("exact 12-test mounted inventory passes");
await assert.rejects(() => verifyWindowOpeningMountedReport(
  mountedReport(mountedInventory.slice(0, 11)), { sealable: true, filters: [] }
), /11 tests/);
cover("11 of 12 mounted tests fails");
{
  const report = mountedReport();
  report.suites[0].specs[0].id = "wrong-playwright-id";
  await assert.rejects(() => verifyWindowOpeningMountedReport(
    report, { sealable: true, filters: [] }
  ), /unexpected or replaced/);
  cover("12 tests with one wrong ID fails");
}
{
  const report = mountedReport();
  report.suites[0].specs[0].tests[0].status = "skipped";
  report.suites[0].specs[0].tests[0].results = [{ status: "skipped", retry: 0 }];
  await assert.rejects(() => verifyWindowOpeningMountedReport(
    report, { sealable: true, filters: [] }
  ), /skipped, flaky, failed/);
  cover("skipped mounted test fails");
}
{
  const report = mountedReport();
  report.suites[0].specs.splice(3, 1, {
    ...structuredClone(report.suites[0].specs[0]),
    id: "unexpected-replacement",
    title: "unexpected replacement",
  });
  await assert.rejects(() => verifyWindowOpeningMountedReport(
    report, { sealable: true, filters: [] }
  ), /unexpected or replaced/);
  cover("unexpected replacement cannot conceal a missing mounted test");
}
await assert.rejects(() => verifyWindowOpeningMountedReport(
  mountedReport(), { sealable: false, filters: ["debug-only"] }
), /not sealable/);
cover("advisory filtered mounted run is non-sealable");

assert.deepEqual(parseLsofListenerOutput("p222\ncnode\nnTCP 127.0.0.1:45123\n"), [{
  pid: 222, command: "node", endpoint: "TCP 127.0.0.1:45123",
}]);
cover("listener lsof output preserves actual PID");
function ownedProcessFixture(listenerCwd = "/fixture/repository", includeListener = true) {
  return async (command, args) => {
    if (command === "lsof" && args.includes("-iTCP:45123")) return {
      code: includeListener ? 0 : 1,
      stdout: includeListener ? "p222\ncnode\nnTCP 127.0.0.1:45123\n" : "",
      stderr: "",
    };
    if (command === "lsof" && args.includes("cwd")) return {
      code: 0, stdout: `p222\nn${listenerCwd}\n`, stderr: "",
    };
    if (command === "lsof" && args.includes("txt")) return {
      code: 0, stdout: "p222\nn/usr/local/bin/node\n", stderr: "",
    };
    if (command === "ps") return {
      code: 0, stdout: args[1] === "222" ? "111\n" : "1\n", stderr: "",
    };
    throw new Error(`Unexpected fixture command: ${command} ${args.join(" ")}`);
  };
}
const ownership = await resolveOwnedPortListener({
  port: 45123, launcherPid: 111, repositoryRoot: "/fixture/repository",
  run: ownedProcessFixture(),
});
assert.equal(ownership.launcherPid, 111);
assert.equal(ownership.listenerPid, 222);
assert.notEqual(ownership.launcherPid, ownership.listenerPid);
cover("launcher and actual listener PIDs are distinct and owned");
await assert.rejects(() => resolveOwnedPortListener({
  port: 45123, launcherPid: 111, repositoryRoot: "/fixture/repository",
  run: ownedProcessFixture("/different/worktree"),
}), /cwd mismatch/);
cover("listener from another cwd fails");
await assert.rejects(() => assertPortHasNoListener(45123, ownedProcessFixture()), /already has listener/);
cover("pre-existing listener fails");
await assert.rejects(() => resolveOwnedPortListener({
  port: 45123, launcherPid: 111, repositoryRoot: "/fixture/repository",
  run: ownedProcessFixture("/fixture/repository", false),
}), /found 0/);
cover("missing listener after readiness fails");
await assert.doesNotReject(() => assertPortHasNoListener(
  45123, ownedProcessFixture("/fixture/repository", false)
));
cover("listener absence verifies teardown");

async function screenshotFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-screenshot-"));
  const screenshotPath = path.join(root, "screenshots", "capture.png");
  await fs.mkdir(path.dirname(screenshotPath), { recursive: true });
  await fs.writeFile(screenshotPath, "png-fixture");
  return { root, record: await physicalFileRecord(screenshotPath, root) };
}
{
  const fixture = await screenshotFixture();
  await fs.writeFile(path.join(fixture.root, fixture.record.path), "substitution");
  await assert.rejects(() => assertScreenshotIntegrity(fixture.root, fixture.record), /does not match/);
  cover("screenshot substitution");
}
{
  const fixture = await screenshotFixture();
  await assert.rejects(
    () => assertScreenshotIntegrity(fixture.root, { ...fixture.record, path: "../escape.png" }),
    /escapes/
  );
  cover("screenshot path escape");
}

function sourceIdentityFixture() {
  return {
    worktreePath: "/fixture/repository",
    repositoryRoot: "/fixture/repository",
    branch: "fix/window-openings-2d-3d",
    head: "a".repeat(40),
    gitStatusShort: " M tracked.ts\n?? untracked.ts\n",
    stagedFileCount: 0,
    trackedDiffSha256: "b".repeat(64),
    untrackedFiles: [{
      path: "untracked.ts", type: "file", mode: "0644", bytes: 1, sha256: "c".repeat(64),
    }],
    untrackedInventorySha256: "d".repeat(64),
    completeStateIdentitySha256: "e".repeat(64),
  };
}

function buildSourceFixture() {
  const identity = sourceIdentityFixture();
  const entry = {
    path: ".next/", type: "directory", mode: "0755", bytes: 1,
    modifiedTimeNs: "1", sha256: "f".repeat(64), treeEntryCount: 1,
    ignoredByGit: true,
    ignoreRule: { source: ".gitignore", line: 1, pattern: ".next/" },
  };
  const ignoredInventory = {
    schemaVersion: "window-opening-ignored-state-inventory/v1",
    discovery: WINDOW_OPENING_IGNORED_DISCOVERY,
    entries: [entry],
    inventorySha256: sha256(JSON.stringify([entry])),
  };
  const ignoredObservation = createIgnoredBuildOutputObservation(
    ignoredInventory, structuredClone(ignoredInventory)
  );
  return {
    identity,
    result: {
      schemaVersion: "window-opening-isolated-build/v3",
      sourceState: {
        expectation: { kind: "external-frozen-identity", identityPath: "/evidence/source.json",
          identity: structuredClone(identity) },
        beforeBuild: structuredClone(identity),
        afterBuild: structuredClone(identity),
        taskSourceUnchanged: true,
        allowedIgnoredBuildOutputs: ignoredObservation,
      },
    },
  };
}

{
  const fixture = buildSourceFixture();
  assert.doesNotThrow(() => assertWindowOpeningBuildSourceBinding(fixture.result, fixture.identity));
  cover("build source binding passes");
}
for (const [field, id, replacement] of [
  ["worktreePath", "build worktree-path corruption fails", "/other/worktree"],
  ["repositoryRoot", "build repository-root corruption fails", "/other/repository"],
  ["branch", "build branch corruption fails", "other-branch"],
  ["head", "build HEAD corruption fails", "f".repeat(40)],
  ["gitStatusShort", "build git-status corruption fails", ""],
  ["stagedFileCount", "build staged-count corruption fails", 1],
  ["trackedDiffSha256", "build tracked-diff corruption fails", "0".repeat(64)],
  ["untrackedInventorySha256", "build untracked-inventory corruption fails", "1".repeat(64)],
  ["completeStateIdentitySha256", "build complete-state corruption fails", "2".repeat(64)],
]) {
  const fixture = buildSourceFixture();
  fixture.result.sourceState.beforeBuild[field] = replacement;
  assert.throws(() => assertWindowOpeningBuildSourceBinding(fixture.result, fixture.identity),
    new RegExp(field, "i"));
  cover(id);
}
{
  const fixture = buildSourceFixture();
  fixture.result.sourceState.beforeBuild.untrackedFiles[0].sha256 = "0".repeat(64);
  assert.throws(() => assertWindowOpeningBuildSourceBinding(fixture.result, fixture.identity),
    /untrackedFiles/);
  cover("build untracked-record corruption fails");
}
{
  const fixture = buildSourceFixture();
  fixture.result.sourceState.afterBuild.trackedDiffSha256 = "0".repeat(64);
  assert.throws(() => assertWindowOpeningBuildSourceBinding(fixture.result, fixture.identity),
    /post-build.*trackedDiffSha256/i);
  cover("source change during build fails");
}
{
  const fixture = buildSourceFixture();
  const otherFrozen = structuredClone(fixture.identity);
  otherFrozen.completeStateIdentitySha256 = "0".repeat(64);
  assert.throws(() => assertWindowOpeningBuildSourceBinding(fixture.result, otherFrozen),
    /completeStateIdentitySha256/);
  cover("copied build from another source fails");
}
{
  const fixture = buildSourceFixture();
  fixture.result.sourceState.allowedIgnoredBuildOutputs.contract = {
    schemaVersion: "corrupted-contract/v1", version: "v1", rules: [],
  };
  assert.throws(() => assertWindowOpeningBuildSourceBinding(fixture.result, fixture.identity),
    /ignored-output/);
  cover("build ignored-output allowlist corruption fails");
}

async function ignoredRepositoryTemplate() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-ignored-template-"));
  await git(root, ["init", "--quiet"]);
  await fs.writeFile(path.join(root, ".gitignore"), [
    ".next/", "next-env.d.ts", "*.tsbuildinfo", "test-results/",
    "ignored-source.ts", "ignored-script.js", ".env*", "unexpected-output/",
    "removed.txt", "type-change.txt", "mode-change.txt", "byte-change.txt",
    "node_modules/", "",
  ].join("\n"));
  const files = new Map([
    [".next/base.js", "next-before"],
    ["next-env.d.ts", "next-env-before"],
    ["tsconfig.tsbuildinfo", "tsbuild-before"],
    ["ignored-script.js", "script-before"],
    ["removed.txt", "remove-me"],
    ["type-change.txt", "regular-before"],
    ["mode-change.txt", "mode-before"],
    ["byte-change.txt", "x"],
    ["node_modules/package/index.js", "dependency-before"],
  ]);
  for (const [relativePath, contents] of files) {
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, contents);
  }
  return root;
}

const ignoredTemplate = await ignoredRepositoryTemplate();
async function copiedIgnoredRepository() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-ignored-copy-"));
  await fs.cp(ignoredTemplate, root, { recursive: true, preserveTimestamps: true });
  return root;
}

async function ignoredBuildFixture(mutate) {
  const root = await copiedIgnoredRepository();
  const before = await collectIgnoredStateInventory(root);
  await mutate(root);
  const after = await collectIgnoredStateInventory(root);
  const fixture = buildSourceFixture();
  fixture.result.sourceState.allowedIgnoredBuildOutputs =
    createIgnoredBuildOutputObservation(before, after);
  return { ...fixture, root, before, after };
}

async function rejectIgnoredBuild(id, mutate, corrupt = null) {
  const fixture = await ignoredBuildFixture(mutate);
  if (corrupt) corrupt(fixture.result.sourceState.allowedIgnoredBuildOutputs, fixture);
  assert.throws(() => assertWindowOpeningBuildSourceBinding(
    fixture.result, fixture.identity, fixture.after
  ));
  cover(id);
}

{
  const fixture = await ignoredBuildFixture(async (root) => {
    await fs.writeFile(path.join(root, ".next/base.js"), "next-after");
  });
  const observation = assertIgnoredBuildOutputObservation(
    fixture.result.sourceState.allowedIgnoredBuildOutputs, fixture.after
  );
  assert.deepEqual(observation.changedPaths, [".next/**"]);
  assert.equal(observation.classification, "Only .next/** changed.");
  cover("ignored build .next-only change accepted");
}
{
  const fixture = await ignoredBuildFixture(async (root) => {
    await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
  });
  const observation = assertIgnoredBuildOutputObservation(
    fixture.result.sourceState.allowedIgnoredBuildOutputs, fixture.after
  );
  assert.deepEqual(observation.changedPaths, ["next-env.d.ts"]);
  assert.match(observation.classification, /^next-env\.d\.ts changed;/);
  cover("ignored build next-env change recorded accurately");
}
{
  const fixture = await ignoredBuildFixture(async (root) => {
    await fs.writeFile(path.join(root, "tsconfig.tsbuildinfo"), "tsbuild-after");
  });
  const observation = assertIgnoredBuildOutputObservation(
    fixture.result.sourceState.allowedIgnoredBuildOutputs, fixture.after
  );
  assert.deepEqual(observation.changedPaths, ["tsconfig.tsbuildinfo"]);
  cover("ignored build tsbuildinfo change recorded accurately");
}
{
  const fixture = await ignoredBuildFixture(async (root) => {
    await fs.writeFile(path.join(root, ".next/base.js"), "next-after");
    await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
    await fs.writeFile(path.join(root, "tsconfig.tsbuildinfo"), "tsbuild-after");
  });
  const observation = assertIgnoredBuildOutputObservation(
    fixture.result.sourceState.allowedIgnoredBuildOutputs, fixture.after
  );
  assert.deepEqual(observation.changedPaths,
    [".next/**", "next-env.d.ts", "tsconfig.tsbuildinfo"]);
  assert.equal(observation.classification,
    ".next/**, next-env.d.ts, and tsconfig.tsbuildinfo changed; " +
    "all are allowed by build-output contract v1.");
  cover("ignored build allowed multi-path change reported accurately");
}
await rejectIgnoredBuild("ignored build next-env omission rejected", async (root) => {
  await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
}, (observation) => {
  observation.changeRecords = observation.changeRecords.filter(
    (record) => record.path !== "next-env.d.ts"
  );
});
await rejectIgnoredBuild("ignored build tsbuildinfo omission rejected", async (root) => {
  await fs.writeFile(path.join(root, "tsconfig.tsbuildinfo"), "tsbuild-after");
}, (observation) => {
  observation.changeRecords = observation.changeRecords.filter(
    (record) => record.path !== "tsconfig.tsbuildinfo"
  );
});
await rejectIgnoredBuild("ignored build test-results change rejected", async (root) => {
  await fs.mkdir(path.join(root, "test-results"));
  await fs.writeFile(path.join(root, "test-results/result.json"), "{}");
});
await rejectIgnoredBuild("ignored build TypeScript source addition rejected", async (root) => {
  await fs.writeFile(path.join(root, "ignored-source.ts"), "export const hidden = true;");
});
await rejectIgnoredBuild("ignored build JavaScript source modification rejected", async (root) => {
  await fs.writeFile(path.join(root, "ignored-script.js"), "script-after");
});
await rejectIgnoredBuild("ignored build environment addition rejected", async (root) => {
  await fs.writeFile(path.join(root, ".env.secret"), "SECRET=not-logged");
});
await rejectIgnoredBuild("ignored build unexpected directory rejected", async (root) => {
  await fs.mkdir(path.join(root, "unexpected-output"));
  await fs.writeFile(path.join(root, "unexpected-output/file.txt"), "unexpected");
});
await rejectIgnoredBuild("ignored build removed file rejected", async (root) => {
  await fs.unlink(path.join(root, "removed.txt"));
});
await rejectIgnoredBuild("ignored build file-to-symlink change rejected", async (root) => {
  await fs.unlink(path.join(root, "type-change.txt"));
  await fs.symlink("removed.txt", path.join(root, "type-change.txt"));
});
await rejectIgnoredBuild("ignored build file mode change rejected", async (root) => {
  await fs.chmod(path.join(root, "mode-change.txt"), 0o755);
});
await rejectIgnoredBuild("ignored build byte-length change rejected", async (root) => {
  await fs.writeFile(path.join(root, "byte-change.txt"), "longer");
});
await rejectIgnoredBuild("ignored build node_modules change rejected", async (root) => {
  await fs.writeFile(path.join(root, "node_modules/package/index.js"), "dependency-after");
});
await rejectIgnoredBuild("ignored build wrong pre-hash rejected", async (root) => {
  await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
}, (observation) => {
  observation.changeRecords.find((record) => record.path === "next-env.d.ts")
    .preBuild.sha256 = "0".repeat(64);
});
await rejectIgnoredBuild("ignored build wrong post-hash rejected", async (root) => {
  await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
}, (observation) => {
  observation.changeRecords.find((record) => record.path === "next-env.d.ts")
    .postBuild.sha256 = "0".repeat(64);
});
await rejectIgnoredBuild("ignored build unmatched claimed rule rejected", async (root) => {
  await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
}, (observation) => {
  observation.changeRecords.find((record) => record.path === "next-env.d.ts")
    .matchedAllowlistRule = { id: "next-build-directory", path: ".next/" };
});
await rejectIgnoredBuild("ignored build true boolean with rejected record rejected", async (root) => {
  await fs.writeFile(path.join(root, "ignored-script.js"), "script-after");
}, (observation) => { observation.allObservedChangesAllowed = true; });
await rejectIgnoredBuild("ignored build false .next-only claim rejected", async (root) => {
  await fs.writeFile(path.join(root, ".next/base.js"), "next-after");
  await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
}, (observation) => { observation.classification = "Only .next/** changed."; });
await rejectIgnoredBuild("ignored build pre-inventory digest mismatch rejected", async (root) => {
  await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
}, (observation) => { observation.preBuildInventory.inventorySha256 = "0".repeat(64); });
await rejectIgnoredBuild("ignored build post-inventory digest mismatch rejected", async (root) => {
  await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
}, (observation) => { observation.postBuildInventory.inventorySha256 = "0".repeat(64); });
await rejectIgnoredBuild("ignored build missing inventory rejected", async (root) => {
  await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
}, (observation) => { delete observation.preBuildInventory; });
{
  const fixture = await ignoredBuildFixture(async (root) => {
    await fs.writeFile(path.join(root, "next-env.d.ts"), "next-env-after");
  });
  const otherRoot = await copiedIgnoredRepository();
  const otherPost = await collectIgnoredStateInventory(otherRoot);
  assert.throws(() => assertWindowOpeningBuildSourceBinding(
    fixture.result, fixture.identity, otherPost
  ), /another ignored post-build state identity/);
  cover("ignored build copied state identity rejected");
}

assert.throws(() => assertIntegrityTestInventory(
  fixedExpectedCaseIds, fixedExpectedCaseIds.slice(0, -1)
), /missing=/);
cover("missing executed registration fails inventory");
assert.throws(() => assertIntegrityTestInventory(
  fixedExpectedCaseIds, fixedExpectedCaseIds.filter((_, index) => index !== 3)
), /missing=/);
cover("missing test body fails inventory");
assert.throws(() => assertIntegrityTestInventory(
  fixedExpectedCaseIds.slice(1), fixedExpectedCaseIds
), /unexpected=/);
cover("removed expected ID makes execution unexpected");
assert.throws(() => assertIntegrityTestInventory(
  fixedExpectedCaseIds, [...fixedExpectedCaseIds, "fake executed case"]
), /unexpected=/);
cover("fake executed ID fails inventory");
assert.throws(() => assertIntegrityTestInventory(
  fixedExpectedCaseIds, [...fixedExpectedCaseIds, fixedExpectedCaseIds[0]]
), /duplicates=/);
cover("duplicate executed ID fails inventory");
assert.doesNotThrow(() => assertIntegrityTestInventory(
  fixedExpectedCaseIds, [...fixedExpectedCaseIds].reverse()
));
cover("reordered execution passes inventory");
assert.throws(() => assertIntegrityTestInventory(
  fixedExpectedCaseIds, ["replacement case", ...fixedExpectedCaseIds.slice(1)]
), /missing=.*unexpected=/);
cover("same-count replacement fails inventory");

function strictScreenshotFixture() {
  const fixtureSha256 = "a".repeat(64);
  const listenerOutput = "p222\ncnode\nnTCP 127.0.0.1:45123\n";
  const listenerBinding = {
    screenshotId: "capture-01", serverContextSha256: "b".repeat(64),
    observedAt: "2026-09-02T00:00:02.000Z", pid: 222, port: 45123,
    cwd: "/fixture/repository", listenerOutputSha256: sha256(listenerOutput),
  };
  const listenerObservation = {
    schemaVersion: "window-opening-listener-observation/v1",
    ...listenerBinding,
    listenerOutput,
    cwdOutput: "p222\nn/fixture/repository\n",
    bindingSha256: sha256(JSON.stringify(listenerBinding)),
  };
  const cameraState = {
    projection: "perspective", position: [5, 4, 6],
    quaternion: [0, 0, 0, 1], target: [0, 1, 0], zoom: 1,
    fov: 46, near: 0.1, far: 300,
  };
  const capture = {
    schemaVersion: "window-opening-screenshot-capture/v2",
    screenshotId: "capture-01",
    test: { id: "mounted-test", title: "Mounted test", project: "chromium" },
    runId: "run-1",
    absolutePath: "/evidence/screenshots/capture-01.png",
    evidenceRootRelativePath: "screenshots/capture-01.png",
    captureStartedAt: "2026-09-02T00:00:01.000Z",
    captureTimestamp: "2026-09-02T00:00:03.000Z",
    route: "/design", query: { debug_layout: "1" },
    fixture: { id: `mounted-test:${fixtureSha256.slice(0, 16)}`, sha256: fixtureSha256,
      roomIds: ["room-1"], openingIds: ["opening-1"] },
    logicalDesignId: "interior-ai:v1:livingroom-design",
    logicalRoomIds: ["room-1"], logicalOpeningIds: ["opening-1"],
    viewport: { width: 800, height: 600, deviceScaleFactor: 2 },
    mode: "3d", focus: "full_plan", focusedRoomId: null, cameraState,
    listenerPid: 222, launcherPid: 111, serverCwd: "/fixture/repository",
    serverExecutable: "/usr/local/bin/node", serverPort: 45123,
    serverContext: { absolutePath: "/evidence/server-context.json",
      evidenceRootRelativePath: "server-context.json", sha256: "b".repeat(64) },
    sourceCompleteStateIdentitySha256: "c".repeat(64),
    mime: "image/png", width: 1600, height: 1200, bytes: 100, sha256: "d".repeat(64),
    listenerOwnership: {
      observedAt: listenerObservation.observedAt, pid: 222, port: 45123,
      cwd: "/fixture/repository", listenerOutputSha256: listenerObservation.listenerOutputSha256,
      bindingSha256: listenerObservation.bindingSha256,
      record: { absolutePath: "/evidence/listener.json",
        evidenceRootRelativePath: "listener.json", bytes: 200, sha256: "e".repeat(64) },
    },
    trace: { testId: "mounted-test", absolutePath: "/evidence/trace.zip",
      evidenceRootRelativePath: "trace.zip" },
  };
  const expected = {
    screenshotId: "capture-01", absolutePath: capture.absolutePath,
    relativePath: capture.evidenceRootRelativePath,
    sourceIdentity: capture.sourceCompleteStateIdentitySha256, runId: capture.runId,
    route: "/design", mountedTest: capture.test,
    server: { readyAt: "2026-09-02T00:00:00.000Z",
      endedAt: "2026-09-02T00:00:04.000Z", listenerPid: 222,
      launcherPid: 111, listenerCwd: "/fixture/repository",
      listenerExecutable: "/usr/local/bin/node", port: 45123 },
    trace: { absolutePath: capture.trace.absolutePath, relativePath: capture.trace.evidenceRootRelativePath },
    serverContext: { absolutePath: capture.serverContext.absolutePath,
      relativePath: capture.serverContext.evidenceRootRelativePath, sha256: capture.serverContext.sha256 },
    listenerRecord: { absolutePath: capture.listenerOwnership.record.absolutePath,
      relativePath: capture.listenerOwnership.record.evidenceRootRelativePath,
      sha256: capture.listenerOwnership.record.sha256 },
    listenerObservation,
    image: { mime: "image/png", extension: ".png", bytes: capture.bytes,
      sha256: capture.sha256, width: capture.width, height: capture.height },
  };
  return { capture, expected, listenerObservation };
}

{
  const fixture = strictScreenshotFixture();
  assert.doesNotThrow(() => assertWindowOpeningListenerObservation(
    fixture.listenerObservation, { screenshotId: "capture-01",
      serverContextSha256: "b".repeat(64), pid: 222, port: 45123, cwd: "/fixture/repository" }
  ));
  assert.doesNotThrow(() => assertWindowOpeningScreenshotCaptureContext(
    fixture.capture, fixture.expected
  ));
  cover("strict screenshot context passes");
}

function rejectScreenshot(id, mutate) {
  const fixture = strictScreenshotFixture();
  mutate(fixture);
  assert.throws(() => assertWindowOpeningScreenshotCaptureContext(
    fixture.capture, fixture.expected
  ));
  cover(id);
}
rejectScreenshot("invalid screenshot mode fails", ({ capture }) => { capture.mode = "plan"; });
rejectScreenshot("invalid screenshot focus state fails", ({ capture }) => { capture.focus = "room"; });
rejectScreenshot("2D mode with 3D projection fails", ({ capture }) => { capture.mode = "2d"; });
rejectScreenshot("3D mode with 2D projection fails", ({ capture }) => {
  capture.cameraState.projection = "orthographic"; capture.cameraState.fov = null;
});
rejectScreenshot("missing camera vector component fails", ({ capture }) => {
  capture.cameraState.position.pop();
});
rejectScreenshot("non-finite camera scalar fails", ({ capture }) => { capture.cameraState.near = NaN; });
rejectScreenshot("zero camera quaternion fails", ({ capture }) => {
  capture.cameraState.quaternion = [0, 0, 0, 0];
});
rejectScreenshot("invalid camera near-far fails", ({ capture }) => {
  capture.cameraState.near = 10; capture.cameraState.far = 1;
});
rejectScreenshot("fixture logical-ID mismatch fails", ({ capture }) => {
  capture.logicalOpeningIds = ["different-opening"];
});
rejectScreenshot("focused room outside fixture fails", ({ capture }) => {
  capture.focus = "focused_room"; capture.focusedRoomId = "outside-room";
});
rejectScreenshot("full plan with focused room fails", ({ capture }) => {
  capture.focusedRoomId = "room-1";
});
rejectScreenshot("screenshot ID filename mismatch fails", ({ expected }) => {
  expected.screenshotId = "different-filename";
});
rejectScreenshot("screenshot test-trace mismatch fails", ({ capture }) => {
  capture.trace.testId = "other-test";
});
rejectScreenshot("screenshot listener PID mismatch fails", ({ capture }) => {
  capture.listenerPid = 333;
});
{
  const fixture = strictScreenshotFixture();
  fixture.listenerObservation.listenerOutput += "p333\n";
  assert.throws(() => assertWindowOpeningListenerObservation(
    fixture.listenerObservation, { screenshotId: "capture-01",
      serverContextSha256: "b".repeat(64), pid: 222, port: 45123, cwd: "/fixture/repository" }
  ), /listener/i);
  cover("listener-output digest mismatch fails");
}
rejectScreenshot("screenshot route mismatch fails", ({ capture }) => { capture.route = "/other"; });
rejectScreenshot("screenshot timestamp outside server lifetime fails", ({ capture }) => {
  capture.captureTimestamp = "2026-09-02T00:00:05.000Z";
});
rejectScreenshot("screenshot source identity mismatch fails", ({ capture }) => {
  capture.sourceCompleteStateIdentitySha256 = "0".repeat(64);
});
rejectScreenshot("screenshot physical image metadata mismatch fails", ({ expected }) => {
  expected.image.bytes += 1;
});

await rejectPhysicalScreenshot("screenshot viewport width zero rejected", async (fixture) => {
  fixture.capture.viewport.width = 0;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot viewport height zero rejected", async (fixture) => {
  fixture.capture.viewport.height = 0;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot viewport negative dimension rejected", async (fixture) => {
  fixture.capture.viewport.width = -1;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot viewport non-integer dimension rejected", async (fixture) => {
  fixture.capture.viewport.height = 599.5;
  await fixture.writeCapture();
});
rejectScreenshot("screenshot viewport non-finite dimension rejected", ({ capture }) => {
  capture.viewport.width = Number.POSITIVE_INFINITY;
});
await rejectPhysicalScreenshot("screenshot DPR zero rejected", async (fixture) => {
  fixture.capture.viewport.deviceScaleFactor = 0;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot DPR negative rejected", async (fixture) => {
  fixture.capture.viewport.deviceScaleFactor = -1;
  await fixture.writeCapture();
});
rejectScreenshot("screenshot DPR non-finite rejected", ({ capture }) => {
  capture.viewport.deviceScaleFactor = Number.NaN;
});
await rejectPhysicalScreenshot("screenshot DPR outside supported range rejected", async (fixture) => {
  fixture.capture.viewport.deviceScaleFactor = 4.1;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot port zero rejected", async (fixture) => {
  fixture.capture.serverPort = 0;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot port negative rejected", async (fixture) => {
  fixture.capture.serverPort = -1;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot port non-integer rejected", async (fixture) => {
  fixture.capture.serverPort = 45123.5;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot port above 65535 rejected", async (fixture) => {
  fixture.capture.serverPort = 65536;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot malformed timestamp rejected", async (fixture) => {
  fixture.capture.captureTimestamp = "not-a-timestamp";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot non-UTC timestamp rejected", async (fixture) => {
  fixture.capture.captureTimestamp = "2026-09-02T08:00:03.000+08:00";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot impossible timestamp rejected", async (fixture) => {
  fixture.capture.captureTimestamp = "2026-02-30T00:00:03.000Z";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot capture outside listener interval rejected",
  async (fixture) => {
    fixture.capture.captureTimestamp = "2026-09-02T00:00:05.000Z";
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot non-normalized quaternion rejected",
  async (fixture) => {
    fixture.capture.cameraState.quaternion = [0, 0, 0, 2];
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot zero quaternion explicitly rejected",
  async (fixture) => {
    fixture.capture.cameraState.quaternion = [0, 0, 0, 0];
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot missing quaternion component rejected",
  async (fixture) => {
    fixture.capture.cameraState.quaternion.pop();
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot degenerate camera position target rejected",
  async (fixture) => {
    fixture.capture.cameraState.target = [...fixture.capture.cameraState.position];
    await fixture.writeCapture();
  });
rejectScreenshot("screenshot non-finite camera scalar explicitly rejected", ({ capture }) => {
  capture.cameraState.zoom = Number.POSITIVE_INFINITY;
});
await rejectPhysicalScreenshot("screenshot invalid near-far relationship explicitly rejected",
  async (fixture) => {
    fixture.capture.cameraState.far = fixture.capture.cameraState.near;
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot mode projection mismatch explicitly rejected",
  async (fixture) => {
    fixture.capture.mode = "2d";
    await fixture.writeCapture();
  });

function minimalPng(width = 1600, height = 1200) {
  const bytes = Buffer.alloc(32);
  bytes[0] = 137;
  bytes.write("PNG", 1, "ascii");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function physicalScreenshotFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-finalizer-screenshot-"));
  const sourceIdentity = "c".repeat(64);
  const imageRelativePath = "screenshots/capture-01.png";
  const imagePath = path.join(root, imageRelativePath);
  const tracePath = path.join(root, "traces/mounted-test.zip");
  const serverContextPath = path.join(root, "server-context.json");
  const listenerPath = path.join(root, "listener.json");
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.mkdir(path.dirname(tracePath), { recursive: true });
  await fs.writeFile(imagePath, minimalPng());
  await fs.writeFile(tracePath, "trace");
  const serverContext = {
    runId: "run-1", repositoryRoot: "/fixture/repository", port: 45123,
    listenerPid: 222, launcherPid: 111, serverCwd: "/fixture/repository",
    sourceCompleteStateIdentitySha256: sourceIdentity,
  };
  await fs.writeFile(serverContextPath, `${JSON.stringify(serverContext, null, 2)}\n`);
  const serverContextRecord = await physicalFileRecord(serverContextPath, root);
  const listenerOutput = "p222\ncnode\nnTCP 127.0.0.1:45123\n";
  const listenerBinding = {
    screenshotId: "capture-01", serverContextSha256: serverContextRecord.sha256,
    observedAt: "2026-09-02T00:00:02.000Z", pid: 222, port: 45123,
    cwd: "/fixture/repository", listenerOutputSha256: sha256(listenerOutput),
  };
  const listenerObservation = {
    schemaVersion: "window-opening-listener-observation/v1",
    ...listenerBinding,
    listenerOutput,
    cwdOutput: "p222\nn/fixture/repository\n",
    bindingSha256: sha256(JSON.stringify(listenerBinding)),
  };
  await fs.writeFile(listenerPath, `${JSON.stringify(listenerObservation, null, 2)}\n`);
  const listenerRecord = await physicalFileRecord(listenerPath, root);
  const image = await physicalFileRecord(imagePath, root);
  const capture = structuredClone(strictScreenshotFixture().capture);
  Object.assign(capture, {
    absolutePath: imagePath,
    evidenceRootRelativePath: imageRelativePath,
    bytes: image.bytes,
    sha256: image.sha256,
  });
  capture.trace.absolutePath = tracePath;
  capture.trace.evidenceRootRelativePath = path.relative(root, tracePath);
  capture.serverContext = {
    absolutePath: serverContextPath,
    evidenceRootRelativePath: serverContextRecord.path,
    sha256: serverContextRecord.sha256,
  };
  capture.listenerOwnership = {
    observedAt: listenerObservation.observedAt,
    pid: listenerObservation.pid,
    port: listenerObservation.port,
    cwd: listenerObservation.cwd,
    listenerOutputSha256: listenerObservation.listenerOutputSha256,
    bindingSha256: listenerObservation.bindingSha256,
    record: {
      absolutePath: listenerPath,
      evidenceRootRelativePath: listenerRecord.path,
      bytes: listenerRecord.bytes,
      sha256: listenerRecord.sha256,
    },
  };
  const sidecarPath = imagePath.replace(/\.png$/, ".capture.json");
  const mountedRun = {
    runId: capture.runId,
    repositoryRoot: "/fixture/repository",
    port: 45123,
    server: {
      readyAt: "2026-09-02T00:00:00.000Z",
      endedAt: "2026-09-02T00:00:04.000Z",
      listenerPid: 222,
      launcherPid: 111,
      listenerCwd: "/fixture/repository",
      listenerExecutable: "/usr/local/bin/node",
    },
    suite: { executed: [capture.test] },
  };
  const writeCapture = () => fs.writeFile(sidecarPath, `${JSON.stringify(capture, null, 2)}\n`);
  await writeCapture();
  await assert.doesNotReject(() => verifyWindowOpeningScreenshotEvidence(
    root, imageRelativePath, sourceIdentity, mountedRun
  ));
  return {
    root, sourceIdentity, imageRelativePath, imagePath, sidecarPath,
    listenerPath, capture, mountedRun, writeCapture,
  };
}

async function rejectPhysicalScreenshot(id, mutate, invoke = null) {
  const fixture = await physicalScreenshotFixture();
  await mutate(fixture);
  await assert.rejects(invoke
    ? () => invoke(fixture)
    : () => verifyWindowOpeningScreenshotEvidence(
      fixture.root, fixture.imageRelativePath, fixture.sourceIdentity, fixture.mountedRun
    ));
  cover(id);
}

await rejectPhysicalScreenshot("screenshot run ID mismatch rejected", async (fixture) => {
  fixture.capture.runId = "different-run";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot listener PID mismatch explicitly rejected", async (fixture) => {
  fixture.capture.listenerPid = 333;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot listener CWD mismatch rejected", async (fixture) => {
  fixture.capture.serverCwd = "/other/repository";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot listener port mismatch rejected", async (fixture) => {
  fixture.capture.serverPort = 45124;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot listener executable mismatch rejected", async (fixture) => {
  fixture.capture.serverExecutable = "/other/node";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot listener-output digest mismatch explicitly rejected",
  async (fixture) => {
    fixture.capture.listenerOwnership.listenerOutputSha256 = "0".repeat(64);
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot ownership-binding digest mismatch rejected",
  async (fixture) => {
    fixture.capture.listenerOwnership.bindingSha256 = "0".repeat(64);
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot source complete-state mismatch explicitly rejected",
  async (fixture) => {
    fixture.capture.sourceCompleteStateIdentitySha256 = "0".repeat(64);
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot unsafe screenshot ID rejected", async (fixture) => {
  fixture.capture.screenshotId = "../unsafe";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot unsafe test ID rejected", async (fixture) => {
  fixture.capture.test.id = "unsafe/test";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot unsafe fixture ID rejected", async (fixture) => {
  fixture.capture.fixture.id = "unsafe/fixture";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot relative path traversal rejected", async (fixture) => {
  fixture.capture.evidenceRootRelativePath = "../capture-01.png";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot filename stem mismatch explicitly rejected",
  async (fixture) => {
    fixture.capture.screenshotId = "capture-02";
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot evidence-root escape rejected", async () => {},
  (fixture) => verifyWindowOpeningScreenshotEvidence(
    fixture.root, "../capture-01.png", fixture.sourceIdentity, fixture.mountedRun
  ));
await rejectPhysicalScreenshot("screenshot MIME-only mismatch rejected", async (fixture) => {
  fixture.capture.mime = "image/jpeg";
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot SHA-only mismatch rejected", async (fixture) => {
  fixture.capture.sha256 = "0".repeat(64);
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot physical width-only mismatch rejected", async (fixture) => {
  const image = await fs.readFile(fixture.imagePath);
  image.writeUInt32BE(1599, 16);
  await fs.writeFile(fixture.imagePath, image);
  fixture.capture.sha256 = sha256(image);
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot physical height-only mismatch rejected", async (fixture) => {
  const image = await fs.readFile(fixture.imagePath);
  image.writeUInt32BE(1199, 20);
  await fs.writeFile(fixture.imagePath, image);
  fixture.capture.sha256 = sha256(image);
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot physical byte-length-only mismatch rejected",
  async (fixture) => {
    const image = Buffer.concat([await fs.readFile(fixture.imagePath), Buffer.from([0])]);
    await fs.writeFile(fixture.imagePath, image);
    fixture.capture.sha256 = sha256(image);
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot extension-MIME contradiction rejected",
  async (fixture) => {
    const jpegPath = fixture.imagePath.replace(/\.png$/, ".jpg");
    await fs.rename(fixture.imagePath, jpegPath);
    fixture.jpegRelativePath = fixture.imageRelativePath.replace(/\.png$/, ".jpg");
  }, (fixture) => verifyWindowOpeningScreenshotEvidence(
    fixture.root, fixture.jpegRelativePath, fixture.sourceIdentity, fixture.mountedRun
  ));
await rejectPhysicalScreenshot("screenshot test versus trace ID mismatch explicitly rejected",
  async (fixture) => {
    fixture.capture.trace.testId = "other-test";
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot trace ID absent rejected", async (fixture) => {
  delete fixture.capture.trace.testId;
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot fixture logical-ID mismatch explicitly rejected",
  async (fixture) => {
    fixture.capture.fixture.id = `mounted-test:${"0".repeat(16)}`;
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot opening logical-ID mismatch rejected", async (fixture) => {
  fixture.capture.logicalOpeningIds = ["other-opening"];
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot room logical-ID mismatch rejected", async (fixture) => {
  fixture.capture.logicalRoomIds = ["other-room"];
  await fixture.writeCapture();
});
await rejectPhysicalScreenshot("screenshot full-plan focused-room contradiction rejected",
  async (fixture) => {
    fixture.capture.focusedRoomId = "room-1";
    await fixture.writeCapture();
  });
await rejectPhysicalScreenshot("screenshot focused room absent from fixture rejected",
  async (fixture) => {
    fixture.capture.focus = "focused_room";
    fixture.capture.focusedRoomId = "outside-room";
    await fixture.writeCapture();
  });

{
  const fixture = await physicalScreenshotFixture();
  const record = await verifyWindowOpeningScreenshotEvidence(
    fixture.root, fixture.imageRelativePath, fixture.sourceIdentity, fixture.mountedRun
  );
  assert.throws(() => assertWindowOpeningScreenshotSet([record, structuredClone(record)], 2),
    /duplicate/);
  cover("duplicate screenshot ID with identical record rejected");
}
{
  const fixture = await physicalScreenshotFixture();
  const record = await verifyWindowOpeningScreenshotEvidence(
    fixture.root, fixture.imageRelativePath, fixture.sourceIdentity, fixture.mountedRun
  );
  const conflicting = structuredClone(record);
  conflicting.capture.width += 1;
  assert.throws(() => assertWindowOpeningScreenshotSet([record, conflicting], 2), /duplicate/);
  cover("duplicate screenshot ID with conflicting record rejected");
}
{
  const fixture = await physicalScreenshotFixture();
  const record = await verifyWindowOpeningScreenshotEvidence(
    fixture.root, fixture.imageRelativePath, fixture.sourceIdentity, fixture.mountedRun
  );
  const reused = structuredClone(record);
  reused.capture.screenshotId = "capture-02";
  assert.throws(() => assertWindowOpeningScreenshotSet([record, reused], 2), /physical/);
  cover("duplicate physical screenshot path across IDs rejected");
}

const cameraA = strictScreenshotFixture().capture.cameraState;
assert.throws(() => assertWindowOpeningCameraTransition(cameraA, structuredClone(cameraA)),
  /not a material/);
cover("old identical camera direction fails");
const cameraB = structuredClone(cameraA);
cameraB.position = [-5, 4, 6];
assert.doesNotThrow(() => assertWindowOpeningCameraTransition(cameraA, cameraB, {
  minimumAngleDeg: 10, minimumPositionDistance: 0.75, maximumTargetDrift: 0.5,
}));
cover("material camera direction transition passes");

function historicalReference(evidenceRoot, attemptId) {
  return {
    evidenceRoot,
    logicalCommandId: "lint",
    attemptId,
    recordPath: path.join("commands", "lint", attemptId, "record.json"),
    stage: "source-safe-validation",
    classification: "historical-required-failure",
    requiredFinalSuccess: false,
    reason: "Synthetic historical required lint failure.",
    argvKnown: true,
    timestampsKnown: true,
    runnerMetadataKnown: true,
  };
}

async function historicalCommandFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-historical-command-"));
  const attemptId = "synthetic-failed-attempt";
  const reference = historicalReference(root, attemptId);
  const attemptRoot = path.dirname(path.join(root, reference.recordPath));
  const stdoutPath = path.join(attemptRoot, "stdout.log");
  const stderrPath = path.join(attemptRoot, "stderr.log");
  const recordPath = path.join(root, reference.recordPath);
  await fs.mkdir(attemptRoot, { recursive: true });
  await fs.writeFile(stdoutPath, "synthetic historical stdout\n");
  await fs.writeFile(stderrPath, "synthetic historical stderr\n");
  const record = {
    logicalCommandId: reference.logicalCommandId,
    attemptId,
    argv: ["npm", "run", "lint"],
    workingDirectory: "/synthetic/repository",
    launcher: { version: "synthetic-npm" },
    runner: { version: "synthetic-eslint" },
    startedAt: "2026-09-01T00:00:00.000Z",
    endedAt: "2026-09-01T00:00:01.000Z",
    exitCode: 1,
    signal: null,
    required: true,
    classification: "required",
    stdout: await physicalFileRecord(stdoutPath, root),
    stderr: await physicalFileRecord(stderrPath, root),
  };
  const writeRecord = () => fs.writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  await writeRecord();
  return {
    root,
    reference,
    required: {
      evidenceRoot: root,
      logicalCommandId: reference.logicalCommandId,
      attemptId,
    },
    record,
    recordPath,
    stdoutPath,
    stderrPath,
    writeRecord,
  };
}

async function withHistoricalCommandFixture(assertion) {
  const fixture = await historicalCommandFixture();
  try {
    await assertion(fixture);
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true });
  }
}

await withHistoricalCommandFixture(async (fixture) => {
  const verified = await verifyHistoricalCommandAttempt(fixture.reference, fixture.required);
  assert.equal(verified.record.exitCode, 1);
  assert.equal(verified.record.signal, null);
  assert.equal(fixture.reference.requiredFinalSuccess, false);
});
cover("synthetic historical failed command accepted and excluded from required success");

await withHistoricalCommandFixture(async (fixture) => {
  await fs.unlink(fixture.recordPath);
  await assert.rejects(() => verifyHistoricalCommandAttempt(
    fixture.reference, fixture.required
  ), /ENOENT|no such file/i);
});
cover("historical missing record rejected");

for (const [label, fileName, coverageId] of [
  ["stdout", "stdoutPath", "historical missing stdout rejected"],
  ["stderr", "stderrPath", "historical missing stderr rejected"],
]) {
  await withHistoricalCommandFixture(async (fixture) => {
    await fs.unlink(fixture[fileName]);
    await assert.rejects(() => verifyHistoricalCommandAttempt(
      fixture.reference, fixture.required
    ), new RegExp(`${label} log is missing`, "i"));
  });
  cover(coverageId);
}

for (const [label, fileName, coverageId] of [
  ["stdout", "stdoutPath", "historical modified stdout rejected"],
  ["stderr", "stderrPath", "historical modified stderr rejected"],
]) {
  await withHistoricalCommandFixture(async (fixture) => {
    await fs.appendFile(fixture[fileName], `modified ${label}\n`);
    await assert.rejects(() => verifyHistoricalCommandAttempt(
      fixture.reference, fixture.required
    ), new RegExp(`${label} log (?:bytes|sha256) does not match`, "i"));
  });
  cover(coverageId);
}

await withHistoricalCommandFixture(async (fixture) => {
  fixture.record.stdout.sha256 = "0".repeat(64);
  await fixture.writeRecord();
  await assert.rejects(() => verifyHistoricalCommandAttempt(
    fixture.reference, fixture.required
  ), /stdout log sha256 does not match/i);
});
cover("historical record hash mismatch rejected");

await withHistoricalCommandFixture(async (fixture) => {
  fixture.record.exitCode = 0;
  await fixture.writeRecord();
  await assert.rejects(() => verifyHistoricalCommandAttempt(
    fixture.reference, fixture.required
  ), /terminal result contradicts/i);
});
cover("historical exit result contradiction rejected");

await withHistoricalCommandFixture(async (fixture) => {
  const countedAsSuccess = { ...fixture.reference, requiredFinalSuccess: true };
  await assert.rejects(() => verifyHistoricalCommandAttempt(
    countedAsSuccess, fixture.required
  ), /required final success/);
});
cover("historical required success classification rejected");

await withHistoricalCommandFixture(async (fixture) => {
  const escaped = { ...fixture.reference, recordPath: "../escape.json" };
  await assert.rejects(() => verifyHistoricalCommandAttempt(
    escaped, fixture.required
  ), /escapes/);
});
cover("historical record path escape rejected");

await withHistoricalCommandFixture(async (fixture) => {
  assert.throws(() => assertRequiredHistoricalCommandReferences([], [fixture.required]), /omitted/);
});
cover("historical required reference omission rejected");

const absentHistoricalRoot = await fs.mkdtemp(
  path.join(os.tmpdir(), "window-opening-absent-historical-root-")
);
await fs.rm(absentHistoricalRoot, { recursive: true });
const absentHistoricalReference = historicalReference(absentHistoricalRoot, "declared-absent-attempt");
await assert.rejects(() => verifyHistoricalCommandAttempt(absentHistoricalReference, {
  evidenceRoot: absentHistoricalRoot,
  logicalCommandId: absentHistoricalReference.logicalCommandId,
  attemptId: absentHistoricalReference.attemptId,
}), /ENOENT|no such file/i);
cover("declared absent real historical root rejected");

const realHistoricalRoot = process.env.WINDOW_OPENING_HISTORICAL_EVIDENCE_ROOT;
let realHistoricalCustody = "not-requested";
if (realHistoricalRoot) {
  const realAttemptId = "20260901T105640324Z-72243604-b43c-4bdf-9234-905ef6fd615d";
  const realReference = historicalReference(path.resolve(realHistoricalRoot), realAttemptId);
  await verifyHistoricalCommandAttempt(realReference, {
    evidenceRoot: realReference.evidenceRoot,
    logicalCommandId: realReference.logicalCommandId,
    attemptId: realReference.attemptId,
  });
  realHistoricalCustody = "verified";
}

const canonicalRecords = [
  { path: "a", type: "file", mode: "0644", bytes: 1, sha256: "a".repeat(64) },
  { path: "b", type: "file", mode: "0644", bytes: 1, sha256: "b".repeat(64) },
];
const mixedCaseCanonicalRecords = [
  { path: "B", type: "file", mode: "0644", bytes: 1, sha256: "b".repeat(64) },
  { path: "a", type: "file", mode: "0644", bytes: 1, sha256: "a".repeat(64) },
];
assert.doesNotThrow(() => assertCanonicalPathInventory(mixedCaseCanonicalRecords));
assert.throws(() => assertCanonicalPathInventory([canonicalRecords[0], canonicalRecords[0]]), /duplicate/);
cover("duplicate path records");
assert.throws(() => assertCanonicalPathInventory([...canonicalRecords].reverse()), /canonical/);
cover("non-canonical inventory ordering");

const validManifest = { schemaVersion: "test", payload: { value: 1 } };
validManifest.manifestSha256 = manifestSha256(validManifest);
assert.doesNotThrow(() => assertManifestDigest(validManifest));
cover("non-circular manifest digest verification");
const selfIncluded = { schemaVersion: "test", payload: { value: 1 }, manifestSha256: "placeholder" };
selfIncluded.manifestSha256 = sha256(JSON.stringify(selfIncluded));
assert.throws(() => assertManifestDigest(selfIncluded), /non-circular/);
cover("incorrect manifest self-inclusion");

const manifestRoot = await fs.mkdtemp(path.join(os.tmpdir(), "window-opening-physical-manifest-"));
const manifestPath = path.join(manifestRoot, "manifest.json");
const digestPath = path.join(manifestRoot, "manifest.json.sha256");
await fs.writeFile(manifestPath, `${JSON.stringify(validManifest, null, 2)}\n`);
await fs.writeFile(digestPath, `${sha256(await fs.readFile(manifestPath))}\n`);
await assert.doesNotReject(() => assertPhysicalManifestDigest(manifestPath, digestPath));
await fs.appendFile(manifestPath, " ");
await assert.rejects(() => assertPhysicalManifestDigest(manifestPath, digestPath), /physical/i);
cover("physical manifest-file digest verification");

const inventoryResult = assertIntegrityTestInventory(fixedExpectedCaseIds, covered);
console.log(JSON.stringify({
  result: "Window-opening evidence manifest integrity checks passed.",
  expectedCaseCount: inventoryResult.expectedCount,
  executedCaseCount: inventoryResult.executedCount,
  expectedCaseIds: inventoryResult.expectedIds,
  executedCaseIds: inventoryResult.executedIds,
  missingCaseIds: inventoryResult.missingIds,
  unexpectedCaseIds: inventoryResult.unexpectedIds,
  duplicateCaseIds: inventoryResult.duplicateIds,
  realHistoricalCustody,
  cases: inventoryResult.cases,
}, null, 2));
