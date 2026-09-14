// Cart failure diagnostics only; transformed copies are never required-gate evidence.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { constants, openSync, closeSync, fstatSync, readFileSync, lstatSync, mkdtempSync, renameSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditRetainedEvidenceDirectory, sanitizePortableEvidenceText, validateRequiredTestReport, REQUIRED_TEST_EVIDENCE_SCHEMA } from "../../scripts/required-test-truthfulness.mjs";

export const GATE = "ci.cart-overlay-accessibility";
export const INPUT = `.local/required-test-evidence/${GATE}`;
export const OUTPUT = ".local/cart-diagnostics-upload";
const SPEC = "tests/required/cart-overlay-accessibility.spec.ts";
const MAX_BYTES = 2 * 1024 * 1024; // Stricter than the existing Pro 128 MiB/file bound.
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const git = (root, ref) => execFileSync("git", ["rev-parse", ref], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + "\n");
const demand = value => { if (!value) throw new Error("ineligible"); };
const number = value => Number.isFinite(value) && value >= 0 ? value : null;
const timestamp = value => typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;

function physical(root, relative, missingLeaf = false) {
  demand(typeof relative === "string" && !path.isAbsolute(relative) && !relative.includes("\\"));
  const parts = relative.split("/");
  demand(parts.every(part => part && part !== "." && part !== ".."));
  let current = root;
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (missingLeaf && i === parts.length - 1 && error.code === "ENOENT") return current;
      throw error;
    }
    demand(!stat.isSymbolicLink());
    demand(i === parts.length - 1 ? stat.isFile() || stat.isDirectory() : stat.isDirectory());
  }
  return current;
}

function readOwned(root, relative) {
  demand(relative === `${INPUT}/evidence.json` || relative === `${INPUT}/playwright.json` ||
    new RegExp(`^${INPUT.replaceAll(".", "\\.")}/playwright-output/[a-zA-Z0-9_-]+/error-context\\.md$`).test(relative));
  const file = physical(root, relative);
  const fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    demand(stat.isFile() && stat.nlink === 1 && stat.size <= MAX_BYTES);
    const bytes = readFileSync(fd); demand(bytes.length <= MAX_BYTES);
    return bytes;
  } finally { closeSync(fd); }
}

function inspectText(root, scratch, bytes, environment, json = false) {
  const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const text = sanitizePortableEvidenceText(decoded, root);
  // Extra restriction from the existing Pro text policy; the shared audit remains mandatory.
  demand(!/[\w.+-]+@(?!example\.test\b)[\w.-]+\.[A-Za-z]{2,}/.test(text));
  const file = path.join(scratch, json ? "audit.json" : "audit.txt");
  writeFileSync(file, text, { flag: "wx" });
  try { auditRetainedEvidenceDirectory({ repositoryRoot: root, evidenceRoot: path.relative(root, scratch), environment }); }
  finally { rmSync(file); }
  return text;
}

function boundShape(value, depth = 0, budget = { nodes: 0 }) {
  demand(depth <= 30 && ++budget.nodes <= 10000);
  if (value && typeof value === "object") for (const child of Object.values(value)) boundShape(child, depth + 1, budget);
}

function bindReports(root, evidence, report, original, environment) {
  const sourceCommitSha = git(root, "HEAD"), sourceTreeSha = git(root, "HEAD^{tree}");
  const metadata = report.config?.metadata?.requiredTestEvidence;
  for (const record of [evidence, metadata]) demand(record?.schema === REQUIRED_TEST_EVIDENCE_SCHEMA &&
    record.gateId === GATE && record.sourceCommitSha === sourceCommitSha && record.sourceTreeSha === sourceTreeSha);
  demand(evidence.command === "npm run test:cart-overlay-accessibility-required" && evidence.executionClass === "repository-gate");
  demand(evidence.result === "failed" && evidence.complete === false && Number.isInteger(evidence.processExitCode) && evidence.processExitCode > 0);
  demand(evidence.report?.path === `${INPUT}/playwright.json` && evidence.report.sha256 === hash(original));
  demand(timestamp(evidence.startedAt) && timestamp(evidence.completedAt) && Date.parse(evidence.startedAt) <= Date.parse(evidence.completedAt));
  demand(timestamp(report.stats?.startTime) && Date.parse(report.stats.startTime) >= Date.parse(evidence.startedAt) && Date.parse(report.stats.startTime) <= Date.parse(evidence.completedAt));
  demand(number(report.stats.duration) !== null);
  demand(Date.parse(report.stats.startTime) + report.stats.duration <= Date.parse(evidence.completedAt) + 1000);
  const validation = validateRequiredTestReport({ repositoryRoot: root, gateId: GATE, report,
    processExitCode: evidence.processExitCode, expectedSourceCommitSha: sourceCommitSha, environment });
  const allowed = new Set([`gate ${GATE} test process exited nonzero`, `gate ${GATE} aggregate report contains failures`]);
  for (const record of validation.records ?? []) if (record.outcome === "failed")
    allowed.add(`gate ${GATE} required test failed: ${record.file} :: ${record.title} :: ${record.project}`);
  demand(validation.records?.some(record => record.outcome === "failed") && validation.issues.every(issue => allowed.has(issue)));
  demand(JSON.stringify(evidence.diagnostics) === JSON.stringify(validation.issues));
  demand(JSON.stringify(evidence.report.stats) === JSON.stringify(report.stats));
  demand(Date.now() - Date.parse(evidence.completedAt) >= 0 && Date.now() - Date.parse(evidence.startedAt) <= validation.gate.maxAgeMinutes * 60_000);
  demand(validation.records.length === validation.gate.requiredTests.length * validation.gate.requiredProjects.length);
  demand(validation.records.every(record => validation.gate.requiredTests.some(test => test.title === record.title)));
  const identities = validation.records.map(record => ({ file: record.file, title: record.title, project: record.project, outcome: record.outcome, retries: record.retries }));
  demand(JSON.stringify(evidence.report.testIdentities) === JSON.stringify(identities));
  // Existing producer has no GitHub run/attempt fields: check them if supplied, never invent them.
  for (const record of [evidence, metadata]) for (const [field, env] of [["workflowRunId", "GITHUB_RUN_ID"], ["workflowAttempt", "GITHUB_RUN_ATTEMPT"]])
    if (record[field] !== undefined) demand(String(record[field]) === environment[env]);
  return { sourceCommitSha, sourceTreeSha, validation };
}

function location(value) {
  if (!value || typeof value !== "object") return null;
  const file = value.file?.replace(/^<repository-root>\//, "");
  return file === SPEC ? { file, line: number(value.line), column: number(value.column) } : null;
}

function errors(values, counts) {
  if (!Array.isArray(values)) return [];
  return values.map(value => {
    const message = value?.message?.replace(/\x1b\[[0-9;]*m/g, "");
    const permitted = message === "Test timeout of 30000ms exceeded.";
    if (!permitted || value?.stack || value?.snippet || value?.value) counts.freeTextOmitted++;
    return { message: permitted ? message : null, location: location(value?.location), detailsOmitted: !permitted || Boolean(value?.stack || value?.snippet || value?.value) };
  });
}

function steps(values, counts) {
  if (!Array.isArray(values)) return [];
  return values.map(value => ({ duration: number(value.duration), location: location(value.location),
    errors: errors(value.error ? [value.error] : [], counts), steps: steps(value.steps, counts), titleOmitted: true }));
}

function projectResults(report, validation, counts, contexts) {
  const tests = [];
  const visit = suites => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
        const identity = validation.records.find(record => record.title === spec.title && record.project === test.projectName);
        demand(identity);
        tests.push({ file: SPEC, title: identity.title, browser: identity.project, outcome: identity.outcome,
          results: (test.results ?? []).map(result => {
            demand(["passed", "failed", "timedOut"].includes(result.status));
            for (const attachment of result.attachments ?? []) {
              if (attachment.name === "error-context" && attachment.contentType === "text/markdown" && !Object.hasOwn(attachment, "body") && ["failed", "timedOut"].includes(result.status)) contexts.push({ path: attachment.path, test: { file: SPEC, title: identity.title, browser: identity.project, retry: number(result.retry) } });
              else counts.attachmentsOmitted++;
            }
            if (result.stdout?.length || result.stderr?.length) counts.streamsOmitted++;
            return { status: result.status, duration: number(result.duration), retry: number(result.retry), startTime: timestamp(result.startTime),
              errors: errors(result.errors, counts), steps: steps(result.steps, counts) };
          }) });
      }
      visit(suite.suites);
    }
  };
  visit(report.suites);
  return tests;
}

function safeContext(text) {
  // Reject opaque page/user text. This deliberately retains only a tiny static Cart vocabulary.
  const lines = new Set(["", "# Page snapshot", "```yaml", "```", '- dialog "Selection Tray":',
    '- button "Close"', '- button "Clear"', '- button "Add all"', '- heading "Selection Tray"']);
  return text.split("\n").every(line => lines.has(line.trim()));
}

function collect(root, scratch, environment) {
  const reportBytes = readOwned(root, `${INPUT}/playwright.json`), evidenceBytes = readOwned(root, `${INPUT}/evidence.json`);
  const report = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(reportBytes));
  const evidence = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(evidenceBytes));
  boundShape(report); boundShape(evidence);
  inspectText(root, scratch, reportBytes, environment, true); inspectText(root, scratch, evidenceBytes, environment, true);
  const { sourceCommitSha, sourceTreeSha, validation } = bindReports(root, evidence, report, reportBytes, environment);
  const counts = { attachmentsOmitted: 0, contextsOmitted: 0, freeTextOmitted: 0, streamsOmitted: 0 };
  const contexts = [], included = [];
  const tests = projectResults(report, validation, counts, contexts);
  demand(contexts.length <= 16);
  const retain = (name, original, value, test) => {
    const bytes = Buffer.isBuffer(value) ? value : jsonBytes(value);
    const portable = Buffer.from(inspectText(root, scratch, bytes, environment, name.endsWith(".json")));
    writeFileSync(path.join(scratch, name), portable, { flag: "wx" });
    included.push({ path: name, originalSha256: hash(original), publishedSha256: hash(portable), transformed: true, ...(test ? { test } : {}) });
  };
  for (const context of contexts) {
    try {
      const bytes = readOwned(root, context.path?.replace(/^<repository-root>\//, ""));
      const text = inspectText(root, scratch, bytes, environment);
      demand(safeContext(text));
      retain(`context-${included.length + 1}.md`, bytes, Buffer.from(text), context.test);
    } catch { counts.contextsOmitted++; }
  }
  retain("playwright.json", reportBytes, { schema: "interior-ai.cart-diagnostic-report.v1", gateId: GATE, sourceCommitSha, sourceTreeSha,
    canonicalReport: false, tests, totals: { expected: report.stats.expected, unexpected: report.stats.unexpected, skipped: report.stats.skipped, flaky: report.stats.flaky } });
  retain("evidence.json", evidenceBytes, { schema: "interior-ai.cart-diagnostic-evidence.v1", gateId: GATE, sourceCommitSha, sourceTreeSha,
    canonicalEvidence: false, matrixOutcome: "failure", originalResult: evidence.result, originalComplete: evidence.complete,
    processExitCode: evidence.processExitCode, startedAt: evidence.startedAt, completedAt: evidence.completedAt, originalReportSha256: hash(reportBytes) });
  const inventory = { schema: "interior-ai.cart-diagnostics.v1", gateId: GATE, sourceCommitSha, sourceTreeSha, matrixOutcome: "failure",
    workflowRunId: environment.GITHUB_RUN_ID, workflowAttempt: environment.GITHUB_RUN_ATTEMPT,
    runBinding: "Collector context; original producer has no workflow run/attempt binding unless explicitly present and checked.",
    transformation: "Portable diagnostic projections, not canonical gate evidence. Arbitrary text, streams and inline attachments omitted; no step-start instrumentation.",
    included, omissions: counts, contextAvailable: included.some(file => file.path.endsWith(".md")) };
  const bytes = inspectText(root, scratch, jsonBytes(inventory), environment, true);
  writeFileSync(path.join(scratch, "diagnostic-inventory.json"), bytes, { flag: "wx" });
  auditRetainedEvidenceDirectory({ repositoryRoot: root, evidenceRoot: path.relative(root, scratch), environment });
  return inventory;
}

export function prepareCartDiagnostics({ repositoryRoot = process.cwd(), environment = process.env } = {}) {
  const root = path.resolve(repositoryRoot);
  if (environment.GITHUB_OUTPUT) appendFileSync(environment.GITHUB_OUTPUT, "has_payload=false\n");
  let scratch;
  try {
    demand(environment.CART_MATRIX_OUTCOME === "failure");
    demand(/^\d+$/.test(environment.GITHUB_RUN_ID ?? "") && /^[1-9]\d*$/.test(environment.GITHUB_RUN_ATTEMPT ?? ""));
    physical(root, ".local");
    const destination = physical(root, OUTPUT, true);
    try { lstatSync(destination); return { payload: false, reason: "stale-output" }; } catch (error) { if (error.code !== "ENOENT") throw error; }
    scratch = mkdtempSync(path.join(root, ".local/cart-diagnostics-inspection-"));
    const inventory = collect(root, scratch, environment);
    renameSync(scratch, destination); scratch = null;
    if (environment.GITHUB_OUTPUT) appendFileSync(environment.GITHUB_OUTPUT, "has_payload=true\n");
    return { payload: true, inventory };
  } catch { return { payload: false, reason: "missing-unbound-malformed-or-unsafe" }; }
  finally { if (scratch) rmSync(scratch, { recursive: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = prepareCartDiagnostics();
  const summary = `Cart diagnostics: ${result.payload ? "safe payload prepared" : "no eligible payload"}. Original Cart failure remains authoritative.\n`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary.trim());
}
