// Synthetic filesystem/control-flow checks only; no browser, server or GitHub execution.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync, truncateSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { prepareCartDiagnostics, INPUT, OUTPUT, GATE } from "./cart-diagnostics-upload.mjs";
import { validateRequiredTestReport, REQUIRED_TEST_EVIDENCE_SCHEMA } from "../../scripts/required-test-truthfulness.mjs";
const root = process.cwd(), hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sha = ref => execFileSync("git", ["rev-parse", ref], { encoding: "utf8" }).trim();
const sourceCommitSha = sha("HEAD"), sourceTreeSha = sha("HEAD^{tree}");
const gate = JSON.parse(readFileSync("scripts/required-test-manifest.json")).gates.find(g => g.id === GATE);
const bytes = value => JSON.stringify(value, null, 2) + "\n";
mkdirSync("test-results", { recursive: true });
let count = 0;
function fixture() {
  const directory = mkdtempSync(path.join(root, "test-results/cart-collector-synthetic-"));
  for (const name of readdirSync(root)) if (![".git", ".local", "test-results", "node_modules"].includes(name))
    symlinkSync(path.join(root, name), path.join(directory, name));
  mkdirSync(path.join(directory, INPUT, "playwright-output/failure"), { recursive: true });
  const environment = { CART_MATRIX_OUTCOME: "failure", GITHUB_RUN_ID: "123456", GITHUB_RUN_ATTEMPT: "3", GITHUB_OUTPUT: path.join(directory, "output.txt") };
  const metadata = { schema: REQUIRED_TEST_EVIDENCE_SCHEMA, gateId: GATE, sourceCommitSha, sourceTreeSha, artifactSha256: null };
  const report = { config: { configFile: "<repository-root>/playwright.cart-overlay.config.ts", rootDir: "<repository-root>/tests/required", forbidOnly: true, projects: gate.requiredProjects.map(name => ({ name, retries: 0, repeatEach: 1 })), metadata: { requiredTestEvidence: metadata } }, errors: [],
    suites: [{ file: "cart-overlay-accessibility.spec.ts", specs: gate.requiredTests.flatMap((identity, i) => gate.requiredProjects.map(projectName => {
      const failed = i === 6 && projectName === "chromium";
      return { title: identity.title, file: "cart-overlay-accessibility.spec.ts", ok: !failed, tests: [{ projectName, status: failed ? "unexpected" : "expected", annotations: [], results: [{ status: failed ? "timedOut" : "passed", retry: 0, duration: failed ? 30200 : 100, startTime: new Date(Date.now() - 350000).toISOString(), errors: failed ? [{ message: "Test timeout of 30000ms exceeded.", location: { file: identity.file, line: 679, column: 5 } }] : [], steps: failed ? [{ duration: 1900, location: { file: identity.file, line: 420, column: 25 }, title: "opaque original step label" }] : [], attachments: failed ? [{ name: "error-context", contentType: "text/markdown", path: `${INPUT}/playwright-output/failure/error-context.md` }] : [] }] }] };
    })) }], stats: { startTime: new Date(Date.now() - 350000).toISOString(), duration: 340000, expected: 15, unexpected: 1, skipped: 0, flaky: 0 } };
  const evidence = { ...metadata, command: gate.command, executionClass: "repository-gate", result: "failed", complete: false, processExitCode: 1, startedAt: new Date(Date.now() - 351000).toISOString(), completedAt: new Date(Date.now() - 1000).toISOString(), report: {} };
  const failure = report.suites[0].specs[12].tests[0].results[0];
  writeFileSync(path.join(directory, INPUT, "playwright-output/failure/error-context.md"), '# Page snapshot\n\n```yaml\n- dialog "Selection Tray":\n  - button "Close"\n```\n');
  const write = () => {
    const validation = validateRequiredTestReport({ repositoryRoot: directory, gateId: GATE, report, processExitCode: 1, expectedSourceCommitSha: sourceCommitSha, environment });
    evidence.diagnostics = validation.issues;
    evidence.report = { path: `${INPUT}/playwright.json`, sha256: hash(bytes(report)), stats: report.stats, testIdentities: validation.records?.map(r => ({ file: r.file, title: r.title, project: r.project, outcome: r.outcome, retries: r.retries })) };
    writeFileSync(path.join(directory, INPUT, "playwright.json"), bytes(report));
    writeFileSync(path.join(directory, INPUT, "evidence.json"), bytes(evidence));
  };
  return { directory, environment, report, evidence, failure, write };
}
function check(name, change, expected, after = () => {}) {
  const f = fixture();
  try {
    change(f); f.write();
    if (f.afterWrite) f.afterWrite();
    const originals = ["playwright.json", "evidence.json"].map(n => { try { return hash(readFileSync(path.join(f.directory, INPUT, n))); } catch { return null; } });
    const result = prepareCartDiagnostics({ repositoryRoot: f.directory, environment: f.environment });
    assert.equal(result.payload, expected, name);
    const output = readFileSync(f.environment.GITHUB_OUTPUT, "utf8");
    assert.equal(output.includes("has_payload=true"), expected, name);
    if (!expected && name !== "stale stage") assert.equal(existsSync(path.join(f.directory, OUTPUT)), false, name);
    const staged = expected ? readdirSync(path.join(f.directory, OUTPUT)).map(n => readFileSync(path.join(f.directory, OUTPUT, n), "utf8")).join("\n") : "";
    assert.ok(!staged.includes("PLANTED_PRIVATE_CUSTOMER") && !staged.includes("ghp_syntheticSensitiveValue12345"));
    after(f, result, staged);
    ["playwright.json", "evidence.json"].forEach((n, i) => { if (originals[i]) assert.equal(hash(readFileSync(path.join(f.directory, INPUT, n))), originals[i]); });
    count++;
  } finally { rmSync(f.directory, { recursive: true }); }
}
check("bound failed report with safe context", () => {}, true, (f, r, staged) => {
  assert.ok(staged.includes('"status": "timedOut"') && staged.includes('"duration": 30200') && staged.includes("Test timeout of 30000ms exceeded."));
  assert.ok(staged.includes('"line": 420')); assert.equal(r.inventory.contextAvailable, true);
  assert.ok(r.inventory.included.every(i => i.originalSha256 && i.publishedSha256 && i.transformed));
});
check("negative report duration", f => { f.report.stats.duration = -1; }, false);
check("malformed report duration", f => { f.report.stats.duration = "340000"; }, false);
check("missing report duration", f => { delete f.report.stats.duration; }, false);
check("report end outside process interval", f => { f.report.stats.duration = 360000; }, false);
check("two contexts retain browser attribution", f => {
  const spec = f.report.suites[0].specs[13]; spec.ok = false; spec.tests[0].status = "unexpected";
  spec.tests[0].results = [structuredClone(f.failure)];
  const relative = `${INPUT}/playwright-output/second/error-context.md`;
  spec.tests[0].results[0].attachments[0].path = relative;
  mkdirSync(path.dirname(path.join(f.directory, relative)));
  writeFileSync(path.join(f.directory, relative), '# Page snapshot\n\n```yaml\n- button "Clear"\n```\n');
  f.report.stats.expected = 14; f.report.stats.unexpected = 2;
}, true, (f, r) => {
  const contexts = r.inventory.included.filter(item => item.path.endsWith(".md"));
  assert.equal(contexts.length, 2);
  assert.deepEqual(contexts.map(item => item.test.browser), ["chromium", "webkit"]);
  assert.ok(contexts.every(item => item.test.title === gate.requiredTests[6].title && item.test.retry === 0));
  assert.notEqual(contexts[0].path, contexts[1].path);
  assert.notEqual(contexts[0].originalSha256, contexts[1].originalSha256);
});
check("foreign gate", f => { f.report.config.metadata.requiredTestEvidence.gateId = "ci.foreign"; }, false);
check("foreign source", f => { f.evidence.sourceCommitSha = "0".repeat(40); }, false);
check("foreign tree", f => { f.evidence.sourceTreeSha = "0".repeat(40); }, false);
check("wrong schema", f => { f.evidence.schema = "foreign"; }, false);
check("wrong run", f => { f.evidence.workflowAttempt = "2"; }, false);
check("stale input", f => { f.evidence.startedAt = "2020-01-01T00:00:00.000Z"; }, false);
check("no successful gate bypass", f => { f.evidence.result = "passed"; }, false);
check("retries remain prohibited", f => { f.report.config.projects[0].retries = 1; }, false);
check("missing input", f => { f.afterWrite = () => rmSync(path.join(f.directory, INPUT, "playwright.json")); }, false);
check("malformed input", f => { f.afterWrite = () => writeFileSync(path.join(f.directory, INPUT, "playwright.json"), "{"); }, false);
check("hash mismatch", f => { f.afterWrite = () => writeFileSync(path.join(f.directory, INPUT, "playwright.json"), bytes(f.report) + " "); }, false);
check("report symlink", f => { f.afterWrite = () => { const file = path.join(f.directory, INPUT, "playwright.json"); rmSync(file); symlinkSync(path.join(root, "package.json"), file); }; }, false);
check("nonregular input", f => { f.afterWrite = () => { const file = path.join(f.directory, INPUT, "playwright.json"); rmSync(file); mkdirSync(file); }; }, false);
check("oversized input", f => { f.afterWrite = () => truncateSync(path.join(f.directory, INPUT, "playwright.json"), 2 * 1024 * 1024 + 1); }, false);
check("secret in errors", f => { f.failure.errors[0].message = "ghp_syntheticSensitiveValue12345"; }, false);
check("secret in nested field", f => { f.failure.nested = { cookies: "PLANTED_PRIVATE_CUSTOMER" }; }, false);
check("unexpected inline attachment", f => { f.failure.attachments.push({ name: "unknown", body: Buffer.from("PLANTED_PRIVATE_CUSTOMER").toString("base64") }); }, true, (f, r) => assert.equal(r.inventory.omissions.attachmentsOmitted, 1));
check("private free text omitted", f => { f.failure.errors[0].message = "PLANTED_PRIVATE_CUSTOMER"; f.failure.stdout = [{ text: "PLANTED_PRIVATE_CUSTOMER" }]; }, true);
check("unknown context omitted", f => { writeFileSync(path.join(f.directory, INPUT, "playwright-output/failure/error-context.md"), "PLANTED_PRIVATE_CUSTOMER"); }, true, (f, r) => assert.equal(r.inventory.contextAvailable, false));
check("context traversal", f => { f.failure.attachments[0].path = `${INPUT}/../private/error-context.md`; }, true, (f, r) => assert.equal(r.inventory.contextAvailable, false));
check("context symlink", f => { const file = path.join(f.directory, INPUT, "playwright-output/failure/error-context.md"); rmSync(file); symlinkSync(path.join(root, "package.json"), file); }, true, (f, r) => assert.equal(r.inventory.contextAvailable, false));
check("stale stage", f => { mkdirSync(path.join(f.directory, OUTPUT)); writeFileSync(path.join(f.directory, OUTPUT, "old.json"), "{}"); }, false);
check("Cart skipped", f => { f.environment.CART_MATRIX_OUTCOME = "skipped"; }, false);
const workflow = parse(readFileSync(".github/workflows/ci.yml", "utf8"));
const list = workflow.jobs["stable-checks"].steps;
const cart = list.find(s => s.id === "cart-overlay"), prep = list.find(s => s.id === "cart-diagnostics");
const upload = list.find(s => s.name === "Upload Cart failure diagnostics");
assert.equal(cart.run, gate.command); assert.equal(cart["continue-on-error"], undefined);
assert.equal(prep.if, "failure() && steps.cart-overlay.outcome == 'failure'");
assert.equal(upload.if, "failure() && steps.cart-overlay.outcome == 'failure' && steps.cart-diagnostics.outcome == 'success' && steps.cart-diagnostics.outputs.has_payload == 'true'");
assert.ok(list.indexOf(cart) < list.indexOf(prep) && list.indexOf(prep) < list.indexOf(upload));
function evaluate(condition, outcome, prepared, payload) {
  const fields = { 'cart-overlay.outcome': outcome, 'cart-diagnostics.outcome': prepared, 'cart-diagnostics.outputs.has_payload': payload };
  return condition.split(' && ').every(part => {
    if (part === 'failure()') return outcome === 'failure' || prepared === 'failure';
    const match = /^steps\.([a-z._-]+) == '(success|failure|true)'$/.exec(part);
    assert.ok(match); return fields[match[1]] === match[2];
  });
}
for (const outcome of ["success", "failure", "skipped", "cancelled"]) for (const prepared of ["success", "failure", "skipped"]) for (const payload of ["true", "false"]) {
  const collect = evaluate(prep.if, outcome, prepared, payload), eligible = evaluate(upload.if, outcome, prepared, payload);
  assert.equal(collect, outcome === "failure");
  assert.equal(eligible, outcome === "failure" && prepared === "success" && payload === "true");
  assert.equal(eligible && outcome !== "failure", false); assert.equal(collect && outcome === "skipped", false);

}
assert.equal(upload.uses, "actions/upload-artifact@v4"); assert.equal(upload.with.path, OUTPUT + "/"); assert.equal(upload.with["retention-days"], 14);
assert.equal(list.find(s => s.name?.includes("required Retailer Confirmation")).if, undefined);
const before = parse(execFileSync("git", ["show", "HEAD:.github/workflows/ci.yml"], { encoding: "utf8" }));
const restored = structuredClone(workflow);
restored.jobs['stable-checks'].steps = restored.jobs['stable-checks'].steps.filter(s => !['Prepare Cart failure diagnostics', 'Upload Cart failure diagnostics'].includes(s.name));
delete restored.jobs['stable-checks'].steps.find(s => s.id === 'cart-overlay').id;
assert.deepEqual(restored, before, 'all original workflow semantics, commands, permissions, gates and later steps unchanged');
console.log(`${count} synthetic collector cases and workflow structure/control conditions passed; no browser or GitHub execution.`);
