import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Reporter from "./runtime-smoke-direct-attempt-reporter.mjs";

function createReporter(root) {
  return new Reporter({ outputRoot: path.join(root, "results"), timingRoot: path.join(root, "timings") });
}
function writeAttempt(reporter, repeatEachIndex = 0, status = "passed") {
  const attemptIdentity = {
    schema: "interior-ai.runtime-smoke-direct-attempt.v1",
    invocationId: reporter.invocationId,
    repeatEachIndex, retry: 0, workerIndex: 0, parallelIndex: 0,
    processId: process.pid, projectName: "chromium", testId: "template",
    candidateCommitSha: "a".repeat(40), candidateTreeSha: "b".repeat(40),
    buildIdentity: "next-development-server",
  };
  const timingPath = path.join(reporter.timingRoot, reporter.invocationId,
    `repeat-${repeatEachIndex}`, `phase-timings-${process.pid}.json`);
  mkdirSync(path.dirname(timingPath), { recursive: true });
  writeFileSync(timingPath, JSON.stringify({ attemptIdentity }), { flag: "wx", mode: 0o600 });
  const test = { title: "furnished template remains stable without a render loop",
    repeatEachIndex, id: "template", parent: { project: () => ({ name: "chromium" }) },
    annotations: [{ type: "runtime-smoke-direct-timing-path", description: timingPath }] };
  const result = { retry: 0, workerIndex: 0, parallelIndex: 0, status };
  reporter.onTestEnd(test, result);
  return { ...reporter.records.at(-1), test, result, attemptIdentity };
}

if (process.argv[2] === "child") {
  const reporter = createReporter(process.argv[3]);
  const record = writeAttempt(reporter);
  process.send({ outputPath: record.outputPath, invocationId: reporter.invocationId });
  process.once("message", () => { reporter.onEnd(); process.disconnect(); });
} else {
  const root = mkdtempSync(path.join(tmpdir(), "runtime-reporter-overlap-"));
  try {
    mkdirSync(path.join(root, "results"));
    const sentinel = path.join(root, "results", "unrelated.bin");
    writeFileSync(sentinel, Buffer.from([0, 11, 255, 17]), { mode: 0o640 });
    const sentinelBytes = readFileSync(sentinel);
    const metadata = statSync(sentinel);
    for (const [first, failure] of [[0, false], [1, false], [0, true], [1, true]]) {
      const reporters = [createReporter(root), createReporter(root)];
      const records = reporters.map((reporter, index) => writeAttempt(reporter, 0,
        failure && index === first ? "failed" : "passed"));
      const other = 1 - first;
      const bytes = readFileSync(records[other].outputPath);
      reporters[first].onEnd();
      assert.deepEqual(readFileSync(records[other].outputPath), bytes);
      reporters[other].onEnd();
      for (const reporter of reporters) assert.equal(existsSync(reporter.outputDirectory), false);
    }
    const reporter = createReporter(root);
    const repeats = Array.from({ length: 20 }, (_, index) => writeAttempt(reporter, index));
    assert.equal(new Set(repeats.map((record) => record.outputPath)).size, 20);
    assert.equal(new Set(repeats.map((record) => record.timingPath)).size, 20);
    for (const record of repeats) assert.deepEqual(JSON.parse(readFileSync(record.outputPath)), record.identity);
    const outsider = createReporter(root);
    const foreign = repeats[0];
    writeFileSync(foreign.timingPath, JSON.stringify({ attemptIdentity: foreign.attemptIdentity }));
    assert.throws(() => outsider.onTestEnd(foreign.test, foreign.result), /identity is inconsistent/);
    assert.equal(existsSync(foreign.timingPath), true, "another invocation cannot consume timing bytes");
    reporter.onEnd();

    const start = () => {
      const child = fork(import.meta.filename, ["child", root], { stdio: ["ignore", "ignore", "inherit", "ipc"] });
      const ready = new Promise((resolve, reject) => { child.once("message", resolve); child.once("error", reject); });
      const ended = new Promise((resolve, reject) => child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`child exit ${code}`))));
      return { child, ready, ended };
    };
    const a = start(); const b = start();
    const [aRecord, bRecord] = await Promise.all([a.ready, b.ready]);
    assert.notEqual(aRecord.invocationId, bRecord.invocationId);
    const bBytes = readFileSync(bRecord.outputPath);
    a.child.send("end"); await a.ended;
    assert.deepEqual(readFileSync(bRecord.outputPath), bBytes);
    b.child.send("end"); await b.ended;
    assert.deepEqual(readFileSync(sentinel), sentinelBytes);
    const after = statSync(sentinel);
    for (const key of ["ino", "mode", "mtimeMs", "ctimeMs", "size"]) assert.equal(after[key], metadata[key], key);
    console.log("Reporter ownership B1-B6 passed: both orders, failure, sentinel, repeats, independent processes.");
  } finally { rmSync(root, { recursive: true, force: true }); }
}
