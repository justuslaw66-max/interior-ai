import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { runCaptured } from './process-capture.mjs';
import { createProjection, digest, LIMITS } from './projection.mjs';
import { hostObservation, requireMatchedHost, REFERENCE, browserObservation, sourceEnvironment, importAuthExports, authRegressionEnvironment, activeRunnerExecutable, activeRunnerCompanion, matchedRunnerVersion, fileHash } from './environment.mjs';
import { bootstrapDatabase } from './bootstrap-database.mjs';

const HERE = path.dirname(import.meta.filename);
const FAILURE_CODES = new Set(['campaign-context', 'workflow-identity', 'source-inventory', 'source-selection', 'source-delta', 'retention-delta', 'lockfile-delta', 'paired-lockfile-mismatch',
  'environment-mismatch', 'runner-version-unavailable', 'runner-version-mismatch', 'runner-ancestry-invalid', 'active-runner-unavailable', 'service-identity', 'service-config', 'file-password-mismatch', 'browser-lock-mismatch', 'browser-version-mismatch',
  'graphics-unavailable', 'browser-process-unavailable', 'paired-browser-mismatch', 'command-failed', 'pristine-next', 'pristine-source', 'pristine-ignored', 'manifest-identity', 'build-budget', 'runtime-budget',
  'bootstrap-name', 'bootstrap-admin', 'bootstrap-service-identity', 'bootstrap-service-changed', 'bootstrap-server', 'bootstrap-network-binding', 'bootstrap-collision',
  'bootstrap-acknowledgement', 'bootstrap-ownership-uncertain', 'bootstrap-identity-changed', 'bootstrap-sessions-remain', 'bootstrap-cleanup-unproven', 'bootstrap-close-failed', 'bootstrap-receipt-write-failed',
  'auth-export-cap', 'auth-export-shape', 'auth-export-inventory', 'auth-export-session']);
export const safeFailureCode = error => FAILURE_CODES.has(error?.message) ? error.message : 'unclassified-private-error';
export const FOUNDATIONS = Object.freeze([
  { id: 'C', foundation: 'd5deaba4874bb62278d4ec026f95f0ad4ef9d71c', foundationTree: 'f1a01d07a0c417ff6c0388f21369723dbe4b9dab' },
  { id: 'T', foundation: '87ba770d3f336553da7a9cbc2317b2b4a0c829d0', foundationTree: '81f7dacb61a73dba9c545fce14e76dc8dbfba56e' },
]);
export function validateSources(sources) {
  if (!Array.isArray(sources) || sources.length !== 2) throw new Error('source-inventory');
  for (let index = 0; index < 2; index++) {
    const source = sources[index];
    if (Object.entries(FOUNDATIONS[index]).some(([key, value]) => source[key] !== value) || !/^[a-f0-9]{40}$/.test(source.commit) || !/^[a-f0-9]{40}$/.test(source.tree) || source.commit === source.foundation) throw new Error('source-selection');
  }
}
export function mayStartSecond(first) {
  return first?.runtimeInvocations === 1 && first?.runtime?.safeForNextSource === true && first?.bootstrap?.absent === true && first?.bootstrap?.sessionCount === 0 && first?.bootstrapCleanupUnproven !== true && (first?.bootstrap?.closeFailures ?? 0) === 0 && first?.observerErrors === 0;
}
export async function serialPair(sources, execute) {
  validateSources(sources); const results = [];
  results.push(await execute(sources[0]));
  if (mayStartSecond(results[0])) results.push(await execute(sources[1]));
  return results;
}
function readCommand(command, args, cwd, environment = process.env) {
  return execFileSync(command, args, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: LIMITS.document, encoding: 'utf8' }).trim();
}
export function verifySourceDelta(workflow, source) {
  const show = ref => execFileSync('git', ['show', ref], { cwd: workflow, maxBuffer: LIMITS.document, stdio: ['ignore', 'pipe', 'pipe'] });
  if (readCommand('git', ['rev-parse', `${source.commit}^`], workflow) !== source.foundation ||
      readCommand('git', ['rev-parse', `${source.commit}^{tree}`], workflow) !== source.tree ||
      readCommand('git', ['rev-parse', `${source.foundation}^{tree}`], workflow) !== source.foundationTree ||
      readCommand('git', ['diff', '--name-only', source.foundation, source.commit], workflow) !== 'scripts/stable-runtime-smoke.mjs') throw new Error('source-delta');
  const before = show(`${source.foundation}:scripts/stable-runtime-smoke.mjs`).toString('utf8');
  const needle = '  await createAndVerifyBundle({ ...context, runtime });\n';
  const insertion = '  context.testHooks?.beforeSuccessfulRootRemoval?.({\n    roots: context.roots,\n    paths,\n    lifecycleEnvironment: context.lifecycleEnvironment,\n    finalDatabase: finalization.finalDatabase,\n  });\n';
  if (before.split(needle).length !== 2 || !show(`${source.commit}:scripts/stable-runtime-smoke.mjs`).equals(Buffer.from(before.replace(needle, needle + insertion)))) throw new Error('retention-delta');
  const lock = show(`${source.commit}:package-lock.json`);
  if (!lock.equals(show(`${source.foundation}:package-lock.json`))) throw new Error('lockfile-delta');
  return digest(lock);
}
function json(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); }
function assertPristine(source) {
  if (fs.existsSync(path.join(source, '.next'))) throw new Error('pristine-next');
  if (readCommand('git', ['status', '--porcelain=v1', '--untracked-files=all'], source)) throw new Error('pristine-source');
  const ignored = readCommand('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '--directory'], source).split('\n').filter(Boolean);
  if (ignored.some(file => file !== 'node_modules/')) throw new Error('pristine-ignored');
}

export function sealPublication(publication) {
  // No raw tree, report, transport or arbitrary path is selected for upload.
  const files = [];
  for (const entry of fs.readdirSync(publication, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'campaign.json') files.push(entry.name);
    else if (entry.isDirectory() && ['C', 'T'].includes(entry.name)) for (const name of fs.readdirSync(path.join(publication, entry.name))) {
      if (!['runtime-report.json', 'phase-timings.json', 'retention.json'].includes(name)) throw new Error('artifact-inventory');
      files.push(`${entry.name}/${name}`);
    } else throw new Error('artifact-inventory');
  }
  let total = 0;
  const inventory = files.map(name => { const file = path.join(publication, name); const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('artifact-entry'); total += stat.size; if (total > LIMITS.artifact) throw new Error('artifact-size'); return { name, bytes: stat.size, sha256: digest(fs.readFileSync(file)) }; });
  const indexBytes = Buffer.from(JSON.stringify({ classification: 'DIAGNOSTIC_ONLY', files: inventory }, null, 2) + '\n');
  if (inventory.reduce((total, file) => total + file.bytes, indexBytes.length) > LIMITS.artifact) throw new Error('artifact-size');
  fs.writeFileSync(path.join(publication, 'inventory.json'), indexBytes, { flag: 'wx', mode: 0o600 });
}

export async function campaign() {
  const workflow = fs.realpathSync(path.join(HERE, '../../..'));
  const root = path.join(process.env.RUNNER_TEMP, 'window-linux-7b5f1b26');
  const publication = path.join(root, 'sanitized'); const privateRoot = path.join(root, 'private');
  fs.mkdirSync(root, { mode: 0o700 }); fs.mkdirSync(publication, { mode: 0o700 }); fs.mkdirSync(privateRoot, { mode: 0o700 });
  const record = { schema: 'window-linux-comparison.v1', classification: 'DIAGNOSTIC_ONLY', acceptedAsRequiredCI: false,
    reference: REFERENCE, campaignLimit: 1, runtimeLimit: 2, strictBuildLimit: 2, runtimeInvocations: 0, strictBuilds: 0, cases: [], host: null, preflight: 'incomplete', stop: null };
  const persist = () => json(path.join(publication, 'campaign.json'), record);
  let sequence = 0;
  async function command(id, args, cwd, environment, result, executable = 'npm', project) {
    const outcome = await runCaptured({ command: executable, args, cwd, environment, privateLog: path.join(privateRoot, `${++sequence}.log`), project });
    result.commands.push({ id, ...outcome }); persist();
    if (outcome.observerIoErrors) result.observerErrors += outcome.observerIoErrors;
    return outcome;
  }
  const requireSuccess = outcome => { if (outcome.exitCode !== 0 || outcome.signal || outcome.spawnFailed) throw new Error('command-failed'); };
  try {
    const base = process.env;
    if (base.GITHUB_ACTIONS !== 'true' || base.GITHUB_EVENT_NAME !== 'workflow_dispatch' || base.GITHUB_REPOSITORY !== 'justuslaw66-max/interior-ai' ||
        base.GITHUB_REF !== 'refs/heads/diagnostic/window-idle-linux-d5deaba-87ba770' || base.GITHUB_RUN_ATTEMPT !== '1' || !/^[1-9][0-9]*$/.test(base.GITHUB_RUN_ID)) throw new Error('campaign-context');
    const workflowCommit = readCommand('git', ['rev-parse', 'HEAD'], workflow);
    if (workflowCommit !== base.GITHUB_SHA) throw new Error('workflow-identity');
    record.workflowCommit = workflowCommit; record.runId = base.GITHUB_RUN_ID; record.attempt = base.GITHUB_RUN_ATTEMPT;
    const sources = JSON.parse(fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8')); validateSources(sources);
    const patchSha256 = digest(fs.readFileSync(path.join(HERE, 'success-retention.patch')));
    if (patchSha256 !== '4e34f31f0028c7ba9ad495259f60046a25232e5b59019ce94c6a7b1e207cfb58') throw new Error('retention-delta');
    record.retentionPatchSha256 = patchSha256;
    const lockHashes = sources.map(source => verifySourceDelta(workflow, source));
    if (lockHashes[0] !== lockHashes[1]) throw new Error('paired-lockfile-mismatch');
    record.lockfileSha256 = lockHashes[0];
    record.sources = sources.map(source => Object.fromEntries(['id', 'foundation', 'foundationTree', 'commit', 'tree'].map(key => [key, source[key]])));
    record.host = hostObservation(); persist(); requireMatchedHost(record.host);
    const activeRunner = activeRunnerExecutable();
    record.host.runnerWorkerPid = activeRunner.pid;
    record.host.actualRunnerPathVersion = /^\/home\/runner\/runners\/([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})\/bin\/Runner.Worker$/.exec(activeRunner.executable)?.[1] ?? null;
    record.host.runnerExecutablePathSha256 = digest(activeRunner.executable); persist();
    // Installation layout is observation only. Use the physical companion of
    // the Worker in this job's ancestry, with no search for another bundle.
    const listener = activeRunnerCompanion(activeRunner);
    record.host.runnerWorkerSha256 = await fileHash(activeRunner.executable);
    const runnerVersion = readCommand(listener, ['--version'], workflow);
    record.host.actualRunnerVersion = /^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(runnerVersion) ? runnerVersion : null;
    record.host.runnerMatches = runnerVersion === REFERENCE.runner; record.host.runner = record.host.runnerMatches ? REFERENCE.runner : null; persist();
    matchedRunnerVersion(runnerVersion);
    const serviceId = base.WINDOW_POSTGRES_SERVICE_ID;
    if (!/^[a-f0-9]{64}$/.test(serviceId)) throw new Error('service-identity');
    const inspection = JSON.parse(readCommand('docker', ['inspect', serviceId], workflow));
    const service = inspection[0];
    if (inspection.length !== 1 || service.Id !== serviceId || service.Config.Image !== 'postgres:15' || service.State.Health.Status !== 'healthy' ||
        service.HostConfig.LogConfig.Type !== 'none' || !service.Config.Env.includes('POSTGRES_PASSWORD_FILE=/proc/sys/kernel/random/boot_id') ||
        service.Config.Env.some(value => value.startsWith('POSTGRES_PASSWORD='))) throw new Error('service-config');
    const password = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(password) || readCommand('docker', ['exec', serviceId, 'cat', '/proc/sys/kernel/random/boot_id'], workflow) !== password) throw new Error('file-password-mismatch');
    const adminUrl = `postgresql://test:${password}@127.0.0.1:5432/postgres`;
    record.service = { image: 'postgres:15', containerId: serviceId, imageDigest: /^sha256:[a-f0-9]{64}$/.test(service.Image) ? service.Image : null,
      healthy: true, passwordFileMatched: true, rawServerLogs: 'disabled-to-prevent-private-query-disclosure' }; persist();
    const contexts = new Map();
    // Set up and check both environments before spending either strict build/runtime.
    for (const identity of sources) {
      const ownRoot = path.join(privateRoot, identity.id); fs.mkdirSync(ownRoot, { mode: 0o700 });
      const source = path.join(ownRoot, 'source');
      const result = { id: identity.id, commands: [], observerErrors: 0, strictBuilds: 0, runtimeInvocations: 0, runtime: null, bootstrap: null, stage: 'source-preflight' };
      record.cases.push(result);
      const setupEnv = { ...base, GIT_LFS_SKIP_SMUDGE: '1' };
      requireSuccess(await command('source-clone', ['clone', '--no-local', '--no-checkout', workflow, source], workflow, setupEnv, result, 'git'));
      requireSuccess(await command('source-checkout', ['checkout', '--detach', identity.commit], source, setupEnv, result, 'git'));
      requireSuccess(await command('source-origin', ['remote', 'set-url', 'origin', 'https://github.com/justuslaw66-max/interior-ai.git'], source, setupEnv, result, 'git'));
      requireSuccess(await command('source-lfs', ['lfs', 'pull'], source, base, result, 'git'));
      if (readCommand('git', ['rev-parse', 'HEAD'], source) !== identity.commit || readCommand('git', ['rev-parse', 'HEAD^{tree}'], source) !== identity.tree ||
          readCommand('git', ['rev-parse', 'HEAD^'], source) !== identity.foundation || readCommand('git', ['diff', '--name-only', identity.foundation, 'HEAD'], source) !== 'scripts/stable-runtime-smoke.mjs') throw new Error('source-delta');
      const databaseName = `window_linux_test_${identity.id}_${base.GITHUB_RUN_ID}_1`;
      const environment = sourceEnvironment(source, ownRoot, identity, adminUrl, databaseName);
      requireSuccess(await command('dependencies', ['ci'], source, environment, result));
      requireSuccess(await command('browser-install', ['playwright', 'install', '--with-deps', 'chromium'], source, environment, result, 'npx'));
      result.browser = await browserObservation(source);
      contexts.set(identity.id, { identity, source, ownRoot, environment, databaseName, result }); persist();
    }
    if (record.cases[0].browser.executableSha256 !== record.cases[1].browser.executableSha256 || JSON.stringify(record.cases[0].browser.graphics) !== JSON.stringify(record.cases[1].browser.graphics)) throw new Error('paired-browser-mismatch');
    record.preflight = 'passed'; persist();
    await serialPair(sources, async identity => {
      const context = contexts.get(identity.id); const { source, ownRoot, environment, databaseName, result } = context;
      const bootstrap = await bootstrapDatabase({ source, adminUrl, name: databaseName, serviceId, persist: receipt => { result.bootstrap = structuredClone(receipt); persist(); } });
      try {
        result.stage = 'auth-preconditions'; persist();
        for (const [label, script, mode] of [['export', 'ci:auth-fixture:export', 'provider-fixture-export'], ['validate', 'ci:auth-fixture:validate-existing', 'auth-environment-validation'], ['production-misuse', 'ci:auth-fixture:production-misuse-existing', 'production-misuse-validation']]) {
          const authEnv = { ...environment, CI_AUTH_FIXTURE_RESULT_PATH: path.join(environment.CI_AUTH_FIXTURE_RESULT_ROOT, `${label}.json`), CI_AUTH_FIXTURE_RESULT_NONCE: `${base.GITHUB_RUN_ID}-1-${identity.id}-${label}`,
            CI_AUTH_FIXTURE_EXPECTED_COMMAND_ID: script, CI_AUTH_FIXTURE_EXPECTED_MODE: mode };
          const actual = await command(`auth-${label}`, ['run', script], source, authEnv, result);
          requireSuccess(await command(`auth-${label}-result`, ['run', 'ci:auth-fixture:result:validate'], source, { ...authEnv, CI_AUTH_FIXTURE_ACTUAL_EXIT_STATUS: String(actual.exitCode) }, result));
          requireSuccess(actual);
          if (label === 'export') importAuthExports(environment.GITHUB_ENV, environment);
        }
        result.stage = 'build-preconditions'; persist(); await bootstrap.create();
        requireSuccess(await command('migrations', ['run', 'gate:a3:db'], source, { ...environment, GATE_A3_DATABASE_URL: environment.DATABASE_URL }, result));
        for (const script of ['test:auth-env-hardening', 'check:code-quality', 'test:required-test-truthfulness', 'test:production-artifact-evidence']) {
          const childEnvironment = script === 'test:auth-env-hardening' ? await authRegressionEnvironment(source, environment) : environment;
          requireSuccess(await command(script, ['run', script], source, childEnvironment, result));
        }
        assertPristine(source);
        result.stage = 'strict-build'; result.strictBuilds++; record.strictBuilds++; persist();
        if (record.strictBuilds > 2) throw new Error('build-budget');
        requireSuccess(await command('strict-build', ['run', 'evidence:production:build'], source, { ...environment, APP_ENV: 'staging', CATALOG_STRICT_VALIDATION: 'true' }, result));
        const manifestBytes = fs.readFileSync(path.join(source, '.local/production-artifact-evidence/manifest.json')); const manifest = JSON.parse(manifestBytes);
        if (manifest.source.commitSha !== identity.commit || manifest.source.treeSha !== identity.tree || manifest.candidateIdentifier !== environment.PRODUCTION_EVIDENCE_CANDIDATE_ID || !/^[a-f0-9]{64}$/.test(manifest.artifact.sha256) || !/^[A-Za-z0-9_-]{1,100}$/.test(manifest.build.nextBuildId)) throw new Error('manifest-identity');
        const expected = { ...identity, workflowCommit, runId: base.GITHUB_RUN_ID, attempt: '1', candidateId: manifest.candidateIdentifier,
          sourceRoot: source, artifactSha256: manifest.artifact.sha256, buildId: manifest.build.nextBuildId, manifestSha256: digest(manifestBytes) };
        result.artifact = { sha256: expected.artifactSha256, buildId: expected.buildId, manifestSha256: expected.manifestSha256 };
        requireSuccess(await command('frameloop-prerequisite', ['run', 'test:design-scene-loading-frameloop'], source, environment, result));
        requireSuccess(await command('render-idle-prerequisite', ['scripts/test-runtime-smoke-render-idle.mjs'], source, environment, result, 'node'));
        const config = { expected, environment, privateOutput: path.join(ownRoot, 'retained-raw'), publicOutput: path.join(publication, identity.id), privateResult: path.join(ownRoot, 'runtime-result.json') };
        const configPath = path.join(ownRoot, 'runtime-config.json'); json(configPath, config);
        const { FURNISHED_TEMPLATE_PHASE_CONTRACTS } = await import(pathToFileURL(path.join(source, 'scripts/runtime-smoke-operation-contracts.mjs')).href);
        const validators = await import(pathToFileURL(path.join(source, 'scripts/runtime-smoke-browser-diagnostics.mjs')).href);
        const projection = createProjection(FURNISHED_TEMPLATE_PHASE_CONTRACTS, [], validators);
        result.stage = 'runtime'; result.runtimeInvocations++; record.runtimeInvocations++; persist();
        if (record.runtimeInvocations > 2) throw new Error('runtime-budget');
        const outcome = await command('stable-runtime-owner-with-retention', [path.join(HERE, 'runtime-worker.mjs'), configPath], source, environment, result, 'node', projection.event);
        if (fs.existsSync(config.privateResult)) {
          const received = JSON.parse(fs.readFileSync(config.privateResult, 'utf8'));
          result.runtime = { exitCode: outcome.exitCode, signal: outcome.signal, originalOwnerExitCode: Number.isInteger(received.exitCode) ? received.exitCode : null,
            safeForNextSource: received.safeForNextSource === true && received.observerErrorCount === 0 && outcome.signal === null && !outcome.spawnFailed && outcome.observerIoErrors === 0,
            observerErrorCount: Number.isSafeInteger(received.observerErrorCount) ? received.observerErrorCount : null };
        } else result.runtime = { exitCode: outcome.exitCode, signal: outcome.signal, safeForNextSource: false, unavailable: true };
        result.stage = outcome.exitCode === 0 ? 'runtime-passed' : 'runtime-failed';
      } catch (error) { result.failedStage = result.stage; result.stage = 'case-precondition-or-observation-failed'; result.failureCode = safeFailureCode(error); }
      finally {
        try { await bootstrap.cleanup(); } catch (error) { result.bootstrapCleanupUnproven = true; result.bootstrapCleanupFailureCode = safeFailureCode(error); }
        persist();
      }
      return result;
    });
    record.stop = record.cases[1].runtimeInvocations === 1 ? 'pair-complete' : 'first-source-precondition-or-cleanup-stop';
  } catch (error) { record.stop = record.preflight === 'passed' ? 'campaign-failed' : 'preflight-rejected'; record.failureCode = safeFailureCode(error); }
  persist();
  sealPublication(publication);
  fs.writeFileSync(path.join(root, 'upload-ready'), 'ALLOWLISTED\n', { flag: 'wx', mode: 0o600 });
  return record.stop === 'pair-complete' && record.cases.every(item => item.runtime?.exitCode === 0 && mayStartSecond(item)) ? 0 : 1;
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try { process.exitCode = await campaign(); } catch { process.exitCode = 2; }
}
