import test from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createRetention, readOwnedPhysicalFile } from './retention.mjs';
import { createProjection, digest, LIMITS, projectCleanup } from './projection.mjs';
import { createStreamProjection, runCaptured } from './process-capture.mjs';
import { verifyRetainedParent, verifyVariantTree, OBSERVATION_FILES, MATERIAL_FILE } from './source-variants.mjs';
import { FOUNDATIONS, serialPair, mayStartSecond, verifySourceDelta, sealPublication, safeFailureCode } from './campaign.mjs';
import { requireMatchedHost, importAuthExports, authRegressionEnvironment, activeRunnerExecutable, activeRunnerCompanion, matchedRunnerVersion, defaultHeadlessExecutable } from './environment.mjs';
import { verifyUpload } from './verify-upload.mjs';
import { finishBootstrapConnection } from './bootstrap-database.mjs';

const comparisonRoot = path.resolve(path.dirname(import.meta.filename), '../../../..');
const source = path.join(comparisonRoot, 'a-source');
const load = file => import(pathToFileURL(path.join(source, 'scripts', file)).href);
const { FURNISHED_TEMPLATE_PHASE_CONTRACTS: contracts } = await load('runtime-smoke-operation-contracts.mjs');
const validators = await load('runtime-smoke-browser-diagnostics.mjs');
const project = createProjection(contracts, ['phase-start', 'phase-complete'], validators);
const sensitive = 'PRIVATE_SENTINEL_TOKEN_COOKIE_DOM';
const temporary = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'window-retention-unit-')));
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function fixture(t, write) {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const taskRoot = path.join(root, 'owner'); const evidenceRoot = path.join(taskRoot, 'evidence');
  fs.mkdirSync(path.join(evidenceRoot, 'database'), { recursive: true }); fs.mkdirSync(path.join(evidenceRoot, 'runtime-smoke'));
  const roots = { taskRoot, evidenceRoot, ownerPath: path.join(taskRoot, 'owner.json') };
  const expected = { ...FOUNDATIONS[0], commit: '1'.repeat(40), tree: '2'.repeat(40), workflowCommit: '3'.repeat(40), runId: '123', attempt: '1', candidateId: 'github-123-1',
    artifactSha256: '4'.repeat(64), manifestSha256: '5'.repeat(64), buildId: 'unit-build', sourceRoot: root, secretUnexpected: sensitive };
  fs.writeFileSync(roots.ownerPath, JSON.stringify({ candidateId: expected.candidateId, runId: expected.runId, runAttempt: 1, sourceCommitSha: expected.commit, sourceTreeSha: expected.tree, certificationId: `stable-runtime-smoke:123:1:${expected.commit.slice(0, 12)}` }));
  const lifecyclePath = path.join(evidenceRoot, 'database/lifecycle.json');
  const lifecycleEnvironment = { CERTIFICATION_DATABASE_LIFECYCLE_PATH: lifecyclePath };
  const suffix = 'a'.repeat(32); const roleName = `interior_ai_cert_stage_${suffix}`;
  const evidence = { lifecycleProfile: { classification: 'STABLE_RUNTIME_SMOKE_ONLY' }, database: { name: `interior_ai_gate_a3_test_cert_${suffix}`, identitySha256: 'a'.repeat(64) },
    provisioning: { outcome: 'created', ownershipRecoverable: true, databaseOid: 1234 }, privateBinding: { roleName, roleCreation: { roleName, roleOid: 1235, outcome: 'created', ownershipRecoverable: true } },
    currentState: 'stage-active', events: [], cleanup: {} };
  const persist = () => fs.writeFileSync(lifecyclePath, JSON.stringify(evidence)); persist();
  // An explicit unit fixture reader, never passed to runStableRuntimeSmoke or
  // used as actual database evidence. Production imports the real sealed reader.
  const readLifecycle = () => { const bytes = fs.readFileSync(lifecyclePath); return { evidence: JSON.parse(bytes), descriptor: { sha256: digest(bytes) } }; };
  const paths = Object.fromEntries([['report', 'playwright-report.json'], ['timings', 'phase-timings.json'], ['marker', 'product-test-start.json']].map(([key, file]) => [key, path.join(evidenceRoot, 'runtime-smoke', file)]));
  const report = { suites: [{ specs: [...['furnished template remains stable without a render loop', 'health and catalog endpoints report ready'].map(title => ({ title, tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, workerIndex: 0, parallelIndex: 0, duration: 7, errors: [], attachments: [] }] }] }))] }], stats: { expected: 2, unexpected: 0, flaky: 0, skipped: 0 }, errors: [] };
  fs.writeFileSync(paths.report, JSON.stringify(report)); fs.writeFileSync(paths.timings, JSON.stringify({ schema: 'interior-ai.runtime-smoke-phase-timings.v3', phases: [], complete: true })); fs.writeFileSync(paths.marker, '{}');
  const adapter = createRetention({ expected, projection: project, readLifecycle, privateOutput: path.join(root, 'raw'), publicOutput: path.join(root, 'public'), ...(write ? { write } : {}) });
  const prepared = freeze({ roots: { ...roots }, lifecycleEnvironment: { ...lifecycleEnvironment } }); adapter.hooks.afterDatabasePrepared(prepared);
  function terminal(kind = 'stable-absence-verified') {
    evidence.currentState = kind; evidence.events.push({ state: kind, details: { targetAbsent: true, roleAbsent: true, sessionCount: 0, roleSessionCount: 0 } });
    evidence.cleanup = { targetAbsent: true, stageRole: { verifiedAbsent: true }, roleAbsent: true, sessionCount: 0, roleSessionCount: 0, originalFailureRetained: kind === 'abort-absence-verified' }; persist();
  }
  return { root, roots, paths, expected, evidence, persist, terminal, adapter, prepared, lifecycleEnvironment };
}
function completeFixture(f) {
  f.terminal();
  f.adapter.hooks.beforeSuccessfulRootRemoval(freeze({ roots: { ...f.roots }, paths: { ...f.paths }, lifecycleEnvironment: { ...f.lifecycleEnvironment }, finalDatabase: { evidence: structuredClone(f.evidence) } }));
  fs.rmSync(f.roots.taskRoot, { recursive: true }); return f.adapter.finish({ exitCode: 0 });
}

test('success captures physical report and terminal receipt before root removal without mutation', t => {
  const f = fixture(t); const before = JSON.stringify(f.prepared); const result = completeFixture(f);
  assert.equal(result.safeForNextSource, true); assert.equal(result.observerErrors.length, 0); assert.equal(JSON.stringify(f.prepared), before);
  assert.equal(result.cleanup.databaseOid, 1234); assert.equal(result.cleanup.roleOid, 1235);
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.root, 'public/runtime-report.json'))).inventoryValid, true);
  assert.equal(fs.readFileSync(path.join(f.root, 'public/retention.json'), 'utf8').includes(sensitive), false);
});
test('failure attribution keeps child exit and signal, captures before abort, and preserves original failure', t => {
  const f = fixture(t);
  f.adapter.hooks.afterFailureAttribution(freeze({ attribution: { identity: { sourceCommitSha: f.expected.commit, sourceTreeSha: f.expected.tree, artifactSha256: f.expected.artifactSha256, buildId: f.expected.buildId },
    failure: { classification: 'INFRASTRUCTURE_TRANSIENT', consumedSubstantiveGate: true }, child: { status: null, signal: 'SIGKILL', spawnErrorClassification: null, secret: sensitive } } }));
  f.terminal('abort-absence-verified'); f.adapter.hooks.afterDatabaseAbort(); fs.rmSync(f.roots.taskRoot, { recursive: true });
  f.adapter.hooks.afterFailedCleanup(freeze({ roots: null, cleanupIssues: [], databaseAbsent: true }));
  const result = f.adapter.finish({ exitCode: 1, error: Object.assign(new Error(sensitive), { childSignal: 'SIGKILL', classification: 'INFRASTRUCTURE_TRANSIENT' }) });
  assert.equal(result.originalExitCode, 1); assert.equal(result.failure.childSignal, 'SIGKILL'); assert.equal(result.safeForNextSource, true); assert.equal(JSON.stringify(result).includes(sensitive), false);
});
test('failure after completed cleanup still captures report without attribution callback', t => {
  const f = fixture(t); f.terminal(); f.adapter.hooks.afterDatabaseAbort();
  assert.equal(f.adapter.snapshot().documents.find(item => item.id === 'runtime-report').projectionAvailable, true);
});
test('observer write failure cannot throw into canonical removal or authorize B', t => {
  const f = fixture(t, (file, ...args) => { if (file.endsWith('retention.json')) throw new Error(sensitive); return fs.writeFileSync(file, ...args); });
  const result = completeFixture(f); assert.equal(result.originalExitCode, 0); assert.equal(result.safeForNextSource, false); assert.equal(fs.existsSync(f.roots.taskRoot), false);
  assert.deepEqual(result.observerErrors, ['final-retention-write']);
});
test('copy failure is nonthrowing and reports unavailable evidence', t => {
  const f = fixture(t, () => { throw new Error(sensitive); }); const result = completeFixture(f);
  assert.equal(result.originalExitCode, 0); assert.equal(result.safeForNextSource, false); assert.ok(result.observerErrors.length > 0);
});
test('missing documents are explicitly unavailable, never reconstructed', t => {
  const f = fixture(t); fs.unlinkSync(f.paths.report); const result = completeFixture(f);
  assert.equal(result.documents.find(item => item.id === 'runtime-report').unavailableReason, 'missing'); assert.equal(fs.existsSync(path.join(f.root, 'public/runtime-report.json')), false);
});
test('changed evidence root and output root are rejected with cleanup unaffected', t => {
  const f = fixture(t); fs.renameSync(path.join(f.root, 'public'), path.join(f.root, 'old-public')); fs.mkdirSync(path.join(f.root, 'public'));
  const result = completeFixture(f); assert.equal(result.safeForNextSource, false); assert.equal(result.originalExitCode, 0);
});
test('owner replacement prevents a safe continuation', t => {
  const f = fixture(t); fs.writeFileSync(f.roots.ownerPath, '{}'); const result = completeFixture(f); assert.equal(result.safeForNextSource, false);
});
test('physical leaf replacement and file growth are rejected before any bytes are retained', t => {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const file = path.join(root, 'evidence'); fs.writeFileSync(file, 'old');
  const originalOpen = fs.openSync;
  try {
    fs.openSync = (name, ...args) => { if (name === file) { fs.renameSync(file, path.join(root, 'old')); fs.writeFileSync(file, sensitive); } return originalOpen(name, ...args); };
    assert.throws(() => readOwnedPhysicalFile(root, file));
  } finally { fs.openSync = originalOpen; }
  fs.writeFileSync(file, 'old'); const originalRead = fs.readSync; let appended = false;
  try {
    fs.readSync = (...args) => { if (!appended) { appended = true; fs.appendFileSync(file, sensitive); } return originalRead(...args); };
    assert.throws(() => readOwnedPhysicalFile(root, file));
  } finally { fs.readSync = originalRead; }
});
test('persistent evidence-root replacement is rejected and only approved observers are exposed', t => {
  const f = fixture(t); const before = f.adapter.snapshot(); assert.equal(before.observerErrors.length, 0);
  assert.deepEqual(Object.keys(f.adapter.hooks).sort(), ['afterDatabaseAbort', 'afterDatabasePrepared', 'afterFailedCleanup', 'afterFailureAttribution', 'beforeSuccessfulRootRemoval']);
  f.terminal(); fs.renameSync(f.roots.evidenceRoot, path.join(f.roots.taskRoot, 'old-evidence')); fs.mkdirSync(f.roots.evidenceRoot);
  f.adapter.hooks.afterDatabaseAbort(); assert.ok(f.adapter.snapshot().observerErrors.includes('abort-capture'));
});
test('cleanup requires matching OIDs, role identity, and coherent terminal chronology', () => {
  const binding = { databaseName: 'owned', databaseOid: 1, roleName: 'role', roleOid: 2 };
  const receipt = { database: { name: 'owned' }, provisioning: { databaseOid: 1 }, privateBinding: { roleName: 'role', roleCreation: { roleOid: 2 } }, currentState: 'failed', events: [{ state: 'stable-absence-verified' }] };
  assert.throws(() => projectCleanup(receipt, binding)); receipt.currentState = 'stable-absence-verified'; receipt.provisioning.databaseOid = 3; assert.throws(() => projectCleanup(receipt, binding));
});
test('physical containment rejects traversal, symlinks, nonregular entries, and oversize files', t => {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); fs.mkdirSync(path.join(root, 'owned')); fs.writeFileSync(path.join(root, 'outside'), sensitive);
  fs.symlinkSync(path.join(root, 'outside'), path.join(root, 'owned/link'));
  assert.throws(() => readOwnedPhysicalFile(path.join(root, 'owned'), path.join(root, 'outside')));
  assert.throws(() => readOwnedPhysicalFile(root, path.join(root, 'owned/link'))); assert.throws(() => readOwnedPhysicalFile(root, path.join(root, 'owned')));
  assert.throws(() => readOwnedPhysicalFile(root, path.join(root, 'outside'), 2));
});
test('report, timing and error projections omit arbitrary DOM, credentials and config', () => {
  const report = project.report({ config: { secret: sensitive }, suites: [{ specs: [{ title: sensitive }] }], errors: [{ message: sensitive }], runtimeSmokeFailure: { phaseId: sensitive, originalCause: { message: sensitive } } });
  assert.equal(JSON.stringify(report).includes(sensitive), false); assert.equal(report.inventoryValid, false); assert.equal(report.omitted, 1);
  assert.throws(() => project.timings({ schema: sensitive }));
  assert.equal(JSON.stringify(project.timings({ schema: 'interior-ai.runtime-smoke-phase-timings.v3', phases: [{ name: sensitive }], failure: { lastSafeCheckpoint: sensitive } })).includes(sensitive), false);
});
test('callback exact keys reject forged markers and preserve only host-relative observed time', () => {
  const value = { schema: 'interior-ai.runtime-smoke-browser-callback.v2', phaseName: 'reload-1', operationName: 'navigation', requestId: 1, stage: 'entered-browser', hostObservedAfterMs: 20 };
  assert.equal(project.event(value)?.hostObservedAfterMs, 20); assert.equal(project.event({ ...value, secret: sensitive }), null);
  assert.equal(project.event({ ...value, phaseName: sensitive }), null); assert.equal(project.event({ ...value, requestId: 1.5 }), null);
});
test('actual heartbeat validator accepts pointer activity and rejects malformed counters/keys', () => {
  const heartbeat = { schema: 'interior-ai.runtime-smoke-browser-heartbeat.v2', kind: 'interval', sequence: 1, observedAtMs: 100, eventLoopDelayMs: 30, maximumEventLoopDelayMs: 30,
    lastAnimationFrameDelayMs: null, maximumAnimationFrameDelayMs: 0, lastAnimationFrameCadenceMs: null, visibilityState: 'visible', documentReadyState: 'complete', lifecycleState: 'active',
    rendererCalls: 5, rendererCallDelta: 2, rendererCallRateHz: 2, activeAnimationCount: 0, controlActivity: 'pointer-active', controlEventCount: 1, webglContextLostCount: 0, webglContextRestoredCount: 0 };
  assert.equal(project.event(heartbeat).control, 'pointer-active'); assert.equal(project.event({ ...heartbeat, rendererCalls: 1.2 }), null);
  assert.equal(project.event({ ...heartbeat, maximumEventLoopDelayMs: 1 }), null); assert.equal(project.event({ ...heartbeat, secret: sensitive }), null);
});
test('actual installed Playwright registry resolves default headless executable without launching a browser', () => {
  const executable = defaultHeadlessExecutable(source); assert.ok(path.isAbsolute(executable)); assert.match(executable, /chromium_headless_shell-1223/); assert.match(path.basename(executable), /headless/);
});
test('stream framing handles split lines, sentinel text, malformed JSON and caps', () => {
  const stream = createStreamProjection(project.event); const line = '[runtime-smoke-browser-callback-requested] ' + JSON.stringify({ schema: 'interior-ai.runtime-smoke-browser-callback-request.v1', phaseName: 'reload-1', operationName: 'navigation', requestId: 1 }) + '\n';
  stream.consume(Buffer.from(line.slice(0, 20))); stream.consume(Buffer.from(line.slice(20) + sensitive + '\n[ runtime ] {bad}\n'));
  stream.consume(Buffer.alloc(LIMITS.line + 1, 65)); stream.consume(Buffer.from('\n'));
  const output = stream.finish(); assert.equal(output.events.length, 1); assert.equal(output.counters.capped, 1); assert.equal(JSON.stringify(output).includes(sensitive), false);
});
test('private process capture preserves nonzero exit and raw checksum without printing sentinel', async t => {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const result = await runCaptured({ command: process.execPath, args: ['-e', `process.stdout.write('${sensitive}\\n');process.stderr.write('${sensitive}\\n');process.exitCode=7`], cwd: root, environment: {}, privateLog: path.join(root, 'log') });
  assert.equal(result.exitCode, 7); assert.equal(result.rawSha256, digest(fs.readFileSync(path.join(root, 'log')))); assert.equal(JSON.stringify(result).includes(sensitive), false);
});
test('serial pair preserves A failure while allowing B only after proven cleanup', async () => {
  const sources = FOUNDATIONS.map((value, index) => ({ ...value, commit: String(index + 1).repeat(40), tree: '4'.repeat(40) })); const calls = [];
  const result = await serialPair(sources, async source => { calls.push(source.id); return { runtimeInvocations: 1, runtime: { exitCode: source.id === 'A' ? 1 : 0, safeForNextSource: true }, bootstrap: { absent: true, sessionCount: 0 }, observerErrors: 0, attribution: { meaningful: true } }; });
  assert.deepEqual(calls, ['A', 'B']); assert.equal(result[0].runtime.exitCode, 1);
  for (const change of [{ runtime: { safeForNextSource: false } }, { bootstrap: { absent: true, sessionCount: 1 } }, { observerErrors: 1 }]) {
    const started = []; await serialPair(sources, async source => { started.push(source.id); return { ...result[0], ...change }; }); assert.deepEqual(started, ['A']);
  }
  await assert.rejects(() => serialPair(sources.toReversed(), async () => null)); assert.equal(mayStartSecond(null), false);
});
test('environment mismatch remains a mandatory stop', () => {
  assert.throws(() => requireMatchedHost({ linux: true, x64: true, imageMatches: false, osMatches: true, nodeMatches: true }));
});
for (const id of ['A', 'B']) test(`${id} auth import consumes the real source session contract and exact export without partial mutation`, t => {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repositoryRoot = path.join(comparisonRoot, `${id.toLowerCase()}-source`);
  const session = createRequire(path.join(repositoryRoot, 'package.json'))('./scripts/ci-auth-fixture-session.cjs');
  const identities = JSON.parse(fs.readFileSync(path.join(path.dirname(import.meta.filename), 'sources.json')));
  const identity = identities.find(item => item.id === id);
  const base = { GITHUB_WORKSPACE: repositoryRoot, CI_AUTH_FIXTURE_SESSION_ROOT: path.join(root, 'session'),
    CI_AUTH_FIXTURE_SESSION_ID: `diagnostic-unit-${id}-session`, CI_AUTH_FIXTURE_SESSION_NONCE: `diagnostic-unit-${id}-nonce`,
    CI_AUTH_FIXTURE_SESSION_CLASSIFICATION: session.FIXTURE_SESSION_CLASSIFICATION,
    CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: identity.commit, CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: identity.tree };
  // Canonical publisher + consumer operate only on disposable local fixture files.
  const published = session.publishFixtureSession({ repositoryRoot, environment: base,
    fixture: { googleClientId: `123456789012345-gate-a3-ci-${'b'.repeat(32)}.apps.googleusercontent.com`, googleClientSecret: `GOCSPX-gate-a3-ci-${'b'.repeat(32)}` } });
  const file = path.join(root, 'env'); fs.writeFileSync(file, published.transportBytes, { mode: 0o600 });
  const environment = { ...base }; importAuthExports(file, environment);
  assert.equal(session.EXPORTED_VARIABLE_NAMES.length, 10);
  assert.ok(session.EXPORTED_VARIABLE_NAMES.every(name => environment[name] === published.assignments[name]));
  assert.equal(environment.CI_AUTH_FIXTURE_NO_REGENERATION, '1');
  assert.doesNotThrow(() => session.consumeFixtureSession({ repositoryRoot, environment }));
  const rejectsUnchanged = (bytes, override = {}, code = 'auth-export-session') => {
    fs.writeFileSync(file, bytes); const target = { ...base, ...override }; const before = JSON.stringify(target);
    assert.throws(() => importAuthExports(file, target), error => error.message === code);
    assert.equal(JSON.stringify(target), before);
  };
  const original = published.transportBytes.toString('utf8');
  rejectsUnchanged(`GOOGLE_CLIENT_ID=${sensitive}\nGOOGLE_CLIENT_SECRET=${sensitive}\nCI_AUTH_FIXTURE_ACTIVE=1\n`);
  rejectsUnchanged(original + `UNEXPECTED=${sensitive}\n`);
  rejectsUnchanged(original + 'CI_AUTH_FIXTURE_ACTIVE=1\n');
  rejectsUnchanged(original.replace('CI_AUTH_FIXTURE_ACTIVE=1', 'CI_AUTH_FIXTURE_ACTIVE=0'));
  rejectsUnchanged(original.replaceAll('\n', '\r\n'));
  rejectsUnchanged(Buffer.alloc(16385), {}, 'auth-export-cap');
  rejectsUnchanged(original, { GOOGLE_CLIENT_ID: sensitive });
  rejectsUnchanged(original, { CI_AUTH_FIXTURE_SESSION_NONCE: 'foreign-unit-session' });
  rejectsUnchanged(original, { CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: 'f'.repeat(40) });
  const transport = path.join(base.CI_AUTH_FIXTURE_SESSION_ROOT, `${base.CI_AUTH_FIXTURE_SESSION_ID}.transport.env`);
  fs.writeFileSync(transport, original + `UNEXPECTED=${sensitive}\n`); rejectsUnchanged(original);
  fs.writeFileSync(transport, published.transportBytes);
  const manifest = path.join(base.CI_AUTH_FIXTURE_SESSION_ROOT, `${base.CI_AUTH_FIXTURE_SESSION_ID}.session.json`);
  fs.unlinkSync(manifest); rejectsUnchanged(original);
});
test('prepared A/B retain the exact parent hook and one material delta, with matching locked dependencies', () => {
  const workflow = path.resolve(path.dirname(import.meta.filename), '../../..');
  verifyRetainedParent(workflow);
  const a = path.join(comparisonRoot, 'a-source'); const b = path.join(comparisonRoot, 'b-source');
  for (const id of ['A','B']) {
    const cwd=path.join(comparisonRoot,`${id.toLowerCase()}-source`);
    const tree=execFileSync('git',['write-tree'],{cwd,encoding:'utf8'}).trim();
    assert.equal(verifyVariantTree(workflow,tree,id),digest(fs.readFileSync(path.join(cwd,'package-lock.json'))));
    assert.throws(()=>verifyVariantTree(workflow,tree,id==='A'?'B':'A'));
  }
  for (const name of OBSERVATION_FILES) assert.deepEqual(fs.readFileSync(path.join(a,name)),fs.readFileSync(path.join(b,name)));
  const before = fs.readFileSync(path.join(a,MATERIAL_FILE),'utf8');
  assert.equal(before.split('transmission={0.5}').length,2);
  assert.equal(fs.readFileSync(path.join(b,MATERIAL_FILE),'utf8'),before.replace('transmission={0.5}','transmission={0}'));
  assert.deepEqual(fs.readFileSync(path.join(a,'package-lock.json')),fs.readFileSync(path.join(b,'package-lock.json')));
  assert.equal(digest(fs.readFileSync(path.join(path.dirname(import.meta.filename), 'success-retention.patch'))), '4e34f31f0028c7ba9ad495259f60046a25232e5b59019ce94c6a7b1e207cfb58');
});
test('artifact seal allows only projected filenames and enforces aggregate 100 MiB before upload', t => {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'campaign.json'), '{}'); fs.mkdirSync(path.join(root, 'A')); fs.writeFileSync(path.join(root, 'A/retention.json'), '{}');
  sealPublication(root); assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'inventory.json'))).files.length, 2); fs.unlinkSync(path.join(root, 'inventory.json'));
  fs.writeFileSync(path.join(root, 'raw.log'), sensitive); assert.throws(() => sealPublication(root)); fs.unlinkSync(path.join(root, 'raw.log'));
  const fd = fs.openSync(path.join(root, 'A/retention.json'), 'w'); fs.ftruncateSync(fd, LIMITS.artifact + 1); fs.closeSync(fd); assert.throws(() => sealPublication(root));
});
test('workflow has one manual-only bounded standard-runner job and one allowlisted seven-day upload', () => {
  const yaml = createRequire(path.join(source, 'package.json'))('yaml');
  const workflow = yaml.parse(fs.readFileSync(path.resolve(path.dirname(import.meta.filename), '../../workflows/ci.yml'), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']); assert.equal(Object.keys(workflow.jobs).length, 1);
  const job = workflow.jobs['window-linux-comparison']; assert.equal(job['runs-on'], 'ubuntu-24.04'); assert.equal(job['timeout-minutes'], 120);
  assert.ok(job.if.includes('github.run_attempt == 1')); assert.ok(job.if.includes('diagnostic/window-idle-linux-d5deaba-87ba770'));
  assert.equal(job.services.postgres.env.POSTGRES_PASSWORD, undefined); assert.ok(job.services.postgres.options.includes('--log-driver none'));
  const uploads = job.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@')); assert.equal(uploads.length, 1); assert.equal(uploads[0].with['retention-days'], 7);
  assert.equal(uploads[0].with.path, '${{ runner.temp }}/window-linux-attribution-4d1479c9/sanitized/');
  const execute = job.steps.find(step => step.id === 'comparison'); assert.ok(execute.run.includes('> "$RUNNER_TEMP/window-linux-driver.raw" 2>&1')); assert.equal(execute['continue-on-error'], undefined);
});
test('failure codes do not print private exceptions and late bootstrap close failure stops B', () => {
  assert.equal(safeFailureCode(new Error(sensitive)), 'unclassified-private-error'); assert.equal(safeFailureCode(new Error('environment-mismatch')), 'environment-mismatch');
  assert.equal(mayStartSecond({ runtimeInvocations: 1, runtime: { safeForNextSource: true }, bootstrap: { absent: true, sessionCount: 0, closeFailures: 1 }, observerErrors: 0 }), false);
});
test('post-seal verification rejects changed content, extra files and symlinks before upload', t => {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true })); const file = path.join(root, 'campaign.json');
  fs.writeFileSync(file, '{}'); sealPublication(root); assert.equal(verifyUpload(root).files, 2);
  fs.writeFileSync(file, '[]'); assert.throws(() => verifyUpload(root)); fs.writeFileSync(file, '{}');
  fs.writeFileSync(path.join(root, 'private.json'), sensitive); assert.throws(() => verifyUpload(root)); fs.unlinkSync(path.join(root, 'private.json'));
  fs.renameSync(file, path.join(root, 'original')); fs.symlinkSync(path.join(root, 'original'), file); assert.throws(() => verifyUpload(root));
});
test('active runner version is bound to current process ancestry, not an installed bundle', t => {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [pid, parent, executable] of [[100, 99, '/usr/bin/node'], [99, 98, '/bin/bash'], [98, 1, '/home/runner/runners/9.9.9/bin/Runner.Worker']]) {
    const directory = path.join(root, String(pid)); fs.mkdirSync(directory); fs.writeFileSync(path.join(directory, 'status'), `Name:\tfixture\nPPid:\t${parent}\n`); fs.symlinkSync(executable, path.join(directory, 'exe'));
  }
  assert.equal(activeRunnerExecutable(100, root).executable, '/home/runner/runners/9.9.9/bin/Runner.Worker');
  fs.writeFileSync(path.join(root, '99/status'), 'PPid:\t100\n'); assert.throws(() => activeRunnerExecutable(100, root));
});
test('current runner physical companion supports a layout without a version directory and rejects replacement/version mismatch', t => {
  const root = temporary(); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, 'active-bundle/bin'); fs.mkdirSync(directory, { recursive: true });
  const worker = path.join(directory, 'Runner.Worker'); const listener = path.join(directory, 'Runner.Listener'); fs.writeFileSync(worker, 'unit-worker'); fs.writeFileSync(listener, 'unit-listener');
  assert.equal(activeRunnerCompanion({ executable: worker }), listener); assert.equal(matchedRunnerVersion('2.337.0'), '2.337.0');
  assert.throws(() => matchedRunnerVersion('2.338.0'), /runner-version-mismatch/); assert.throws(() => matchedRunnerVersion(sensitive));
  fs.unlinkSync(listener); assert.throws(() => activeRunnerCompanion({ executable: worker }), /runner-version-unavailable/);
  fs.writeFileSync(path.join(root, 'other-listener'), 'unit'); fs.symlinkSync(path.join(root, 'other-listener'), listener); assert.throws(() => activeRunnerCompanion({ executable: worker }), /runner-version-unavailable/);
  fs.unlinkSync(worker); assert.throws(() => activeRunnerCompanion({ executable: worker }), /runner-ancestry-invalid/);
});
test('actual bootstrap close handler preserves primary errors and records secondary close/write failures', async () => {
  const primary = new Error(sensitive); const receipt = { closeFailures: 0, persistenceFailures: 0 };
  await assert.rejects(() => finishBootstrapConnection({ client: { end: async () => { throw new Error('secondary'); } }, receipt, persist: () => { throw new Error('write'); }, primaryError: primary }), error => error === primary);
  assert.deepEqual(receipt, { closeFailures: 1, persistenceFailures: 1 });
  await assert.rejects(() => finishBootstrapConnection({ client: { end: async () => { throw new Error(sensitive); } }, receipt, persist: () => {} }), /bootstrap-close-failed/);
});

// Extract the actual lexical owner function for isolated control-flow checks.
// All operation stand-ins below are unit fixtures: no DB, build or browser runs.
const ts = createRequire(path.join(source, 'package.json'))('typescript');
function sourceFunction(file, name) {
  const text = fs.readFileSync(file, 'utf8'); const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name); assert.ok(node);
  return node.getText(ast).replace(/^export /, '');
}
for (const id of ['A', 'B']) test(`${id} actual success owner keeps callback after bundle verification and before root removal; absence unchanged`, async () => {
  const file = path.join(comparisonRoot, `${id.toLowerCase()}-source/scripts/stable-runtime-smoke.mjs`);
  for (const supplied of [false, true]) {
    const events = []; const context = { repositoryRoot: '/unit', roots: { evidenceRoot: '/unit/evidence' }, manifest: { candidateIdentifier: 'unit', artifact: { sha256: 'unit' } }, testHooks: supplied ? { beforeSuccessfulRootRemoval: () => events.push('capture') } : null };
    const globals = { path, console: { log() {} }, stableRuntimePaths: () => ({}), createLifecycleEnvironment: () => ({}), configureStableRuntimeDatabaseTransport: () => ({}),
      prepareStableDatabase: async () => ({ database: { environment: {} }, active: { binding: {} } }), readFileSync: () => '{}', STABLE_JOURNAL_PATH: 'journal',
      createStableRuntimeProjection: () => ({}), executeRuntimeSmoke: async () => ({ consumed: true, validation: { report: { stats: {} } } }),
      finalizeStableEvidence: async () => ({ finalDatabase: { evidence: {} } }), writeStableRuntimeSummary: () => events.push('summary'),
      createAndVerifyBundle: async () => events.push('bundle-verified'), removeStableRuntimeRoot: () => events.push('root-removed') };
    const complete = vm.runInNewContext(sourceFunction(file, 'completeStableRuntimeSmoke') + '\ncompleteStableRuntimeSmoke', globals);
    await complete(context); assert.deepEqual(events, supplied ? ['summary', 'bundle-verified', 'capture', 'root-removed'] : ['summary', 'bundle-verified', 'root-removed']); assert.equal(context.roots, null);
  }
});

test('actual bootstrap owner records never-attempted cleanup without a connection or fabricated absence, preserving uncertain attempts', async () => {
  const file = path.join(path.dirname(import.meta.filename), 'bootstrap-database.mjs');
  const events = []; const receipts = []; const serviceId = 'a'.repeat(64);
  const snapshot = { containerIdentitySha256: digest(serviceId) };
  const globals = { path, URL, digest, finishBootstrapConnection,
    createRequire: () => () => ({ Client: class { constructor() { events.push('client'); throw new Error('unit must not connect'); } } }),
    loadTransport: async () => ({ inspectGithubPostgresServiceContainer: () => snapshot }) };
  // Only the dynamic module loader is a unit stand-in; execute actual create/cleanup bodies.
  const body = sourceFunction(file, 'bootstrapDatabase').replace(/await import\(pathToFileURL\(path.join\(source, 'scripts\/production-certification-database-transport.mjs'\)\).href\)/,
    'await loadTransport()');
  assert.ok(body.includes('await loadTransport()'));
  const make = vm.runInNewContext(body + '\nbootstrapDatabase', globals);
  const owner = await make({ source: '/unit', adminUrl: 'postgresql://test:unit@127.0.0.1:5432/postgres', name: 'window_linux_test_A_123_1', serviceId,
    persist: receipt => receipts.push(JSON.parse(JSON.stringify(receipt))) });
  assert.equal(receipts[0].creation, 'not-attempted'); assert.equal(receipts[0].cleanup, 'not-attempted');
  assert.equal(await owner.cleanup(), false); assert.equal(events.length, 0);
  const terminal = receipts.at(-1); assert.equal(terminal.cleanup, 'not-required-no-create-attempt');
  assert.equal(terminal.oid, null); assert.equal(terminal.absent, false); assert.equal(terminal.sessionCount, null);
  assert.equal(mayStartSecond({ runtimeInvocations: 0, bootstrap: terminal, observerErrors: 0 }), false);
  for (const creation of ['unacknowledged', 'collision-preserved', 'created']) {
    owner.receipt.creation = creation;
    await assert.rejects(() => owner.cleanup(), /bootstrap-ownership-uncertain/);
  }
  assert.equal(events.length, 0);
});

test('actual source regression projection removes child auth capabilities without changing the parent or database environment', async () => {
  for (const id of ['A', 'B']) {
    const repositoryRoot = path.join(comparisonRoot, `${id.toLowerCase()}-source`);
    const { authFixtureRegressionCapabilityNames } = await import(pathToFileURL(path.join(repositoryRoot, 'scripts/ci-auth-fixture-regression-environment.mjs')).href);
    const names = authFixtureRegressionCapabilityNames(repositoryRoot);
    const parent = freeze({ ...Object.fromEntries(names.map(name => [name, sensitive])), PATH: '/unit/bin', GITHUB_ACTIONS: 'true',
      GITHUB_WORKSPACE: repositoryRoot, DATABASE_URL: 'postgresql://unit@127.0.0.1:5432/unit', CERTIFICATION_DATABASE_ADMIN_URL: 'private-unit-admin',
      PRODUCTION_EVIDENCE_CANDIDATE_ID: 'unit-candidate' });
    const before = JSON.stringify(parent); const child = await authRegressionEnvironment(repositoryRoot, parent);
    assert.ok(names.every(name => !Object.hasOwn(child, name))); assert.equal(JSON.stringify(parent), before);
    for (const name of ['PATH', 'GITHUB_ACTIONS', 'GITHUB_WORKSPACE', 'DATABASE_URL', 'CERTIFICATION_DATABASE_ADMIN_URL', 'PRODUCTION_EVIDENCE_CANDIDATE_ID']) assert.equal(child[name], parent[name]);
  }
});
