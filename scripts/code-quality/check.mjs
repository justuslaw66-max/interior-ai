#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareBaselineMonotonicity,
  createBaseline,
  evaluateScan,
  scanRepository,
  summarizeScan,
  updateBaseline,
} from "./policy.mjs";
import { inspectTrackedArtifactHygiene } from "./tracked-artifact-policy.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const baselinePath = join(repositoryRoot, "scripts/code-quality/baseline.json");
const exceptionsPath = join(repositoryRoot, "scripts/code-quality/exceptions.json");
const initialize = process.argv.includes("--initialize-baseline");
const update = process.argv.includes("--update-baseline");
const baselineRepositoryPath = "scripts/code-quality/baseline.json";

function gitOutput(arguments_) {
  return execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function comparisonBaseline() {
  const status = gitOutput(["status", "--porcelain", "--", baselineRepositoryPath]);
  const reference = status.trim()
    ? "HEAD"
    : process.env.CODE_QUALITY_BASE_REF || "HEAD^1";
  try {
    gitOutput(["cat-file", "-e", reference]);
  } catch {
    throw new Error(
      `Cannot inspect ${reference}; fetch at least two commits so baseline increases cannot be hidden.`
    );
  }
  try {
    const previousSource = gitOutput(["show", `${reference}:${baselineRepositoryPath}`]);
    return JSON.parse(previousSource);
  } catch {
    try {
      gitOutput(["cat-file", "-e", `${reference}:${baselineRepositoryPath}`]);
    } catch {
      return null;
    }
    throw new Error(`The comparison baseline at ${reference} is not valid JSON.`);
  }
}

if (initialize && update) {
  console.error("Choose either --initialize-baseline or --update-baseline, not both.");
  process.exit(1);
}

const scan = scanRepository(repositoryRoot);
const exceptions = JSON.parse(readFileSync(exceptionsPath, "utf8"));

if (initialize) {
  try {
    readFileSync(baselinePath, "utf8");
    console.error("Refusing to initialize: baseline.json already exists.");
    process.exit(1);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const baseline = createBaseline(scan);
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`Initialized code-quality baseline: ${summarizeScan(scan, baseline)}`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
let historyFailures;
try {
  historyFailures = compareBaselineMonotonicity(comparisonBaseline(), baseline);
} catch (error) {
  historyFailures = [{ code: "BASELINE_HISTORY_UNAVAILABLE", message: error.message }];
}
const failures = [
  ...historyFailures,
  ...inspectTrackedArtifactHygiene(repositoryRoot),
  ...evaluateScan(scan, baseline, exceptions),
];
const blockingFailures = update
  ? failures.filter((failure) => failure.code !== "BASELINE_CAN_DECREASE")
  : failures;

if (blockingFailures.length > 0) {
  console.error(`Code-quality guardrail failed with ${blockingFailures.length} issue${blockingFailures.length === 1 ? "" : "s"}:`);
  for (const failure of blockingFailures) {
    console.error(`- [${failure.code}]${failure.path ? ` ${failure.path}:` : ""} ${failure.message}`);
  }
  console.error("Fix the regression, or add a narrow reviewed entry to scripts/code-quality/exceptions.json when a cohesion-based exception is unavoidable.");
  process.exit(1);
}

if (update) {
  const nextBaseline = updateBaseline(scan, baseline);
  writeFileSync(baselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`);
  console.log(`Lowered code-quality baseline: ${summarizeScan(scan, nextBaseline)}`);
} else {
  console.log(`Code-quality guardrail passed: ${summarizeScan(scan, baseline)}`);
}
