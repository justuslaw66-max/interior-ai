import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRetention, readOwnedPhysicalFile } from './retention.mjs';
import { createProjection, digest } from './projection.mjs';

export async function runtimeWorker(config) {
  const source = config.expected.sourceRoot;
  const manifestBytes = readOwnedPhysicalFile(source, path.join(source, '.local/production-artifact-evidence/manifest.json'));
  if (digest(manifestBytes) !== config.expected.manifestSha256) throw new Error('runtime-manifest-changed');
  const manifest = JSON.parse(manifestBytes);
  if (manifest.source.commitSha !== config.expected.commit || manifest.source.treeSha !== config.expected.tree || manifest.artifact.sha256 !== config.expected.artifactSha256 || manifest.build.nextBuildId !== config.expected.buildId || manifest.candidateIdentifier !== config.expected.candidateId) throw new Error('runtime-manifest-identity');
  const load = file => import(pathToFileURL(path.join(source, 'scripts', file)).href);
  const { FURNISHED_TEMPLATE_PHASE_CONTRACTS } = await load('runtime-smoke-operation-contracts.mjs');
  const spec = fs.readFileSync(path.join(source, 'tests/e2e/00-runtime-smoke.spec.ts'), 'utf8');
  const checkpoints = [...new Set(['phase-start', 'phase-complete', ...Array.from(spec.matchAll(/checkpoint(?:\?\.)?\(\s*["']([a-z0-9-]+)["']/g), match => match[1])])];
  const validators = { ...await load('runtime-smoke-browser-diagnostics.mjs'), ...await load('window-rendering-attribution.mjs') };
  const projection = createProjection(FURNISHED_TEMPLATE_PHASE_CONTRACTS, checkpoints, validators);
  const { readCertificationDatabaseLifecycle } = await load('production-certification-database-lifecycle.mjs');
  const retention = createRetention({ ...config, projection, readLifecycle: readCertificationDatabaseLifecycle });
  const { runStableRuntimeSmoke } = await load('stable-runtime-smoke.mjs');
  let exitCode = 0; let failed = null;
  try {
    await runStableRuntimeSmoke({ repositoryRoot: source, environment: config.environment, testHooks: retention.hooks });
  } catch (error) { exitCode = 1; failed = error; }
  const result = retention.finish({ exitCode, error: failed, artifact: { sha256: config.expected.artifactSha256, buildId: config.expected.buildId } });
  fs.writeFileSync(config.privateResult, JSON.stringify({ exitCode, safeForNextSource: result.safeForNextSource === true, observerErrorCount: result.observerErrors.length }) + '\n', { mode: 0o600, flag: 'wx' });
  return exitCode;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  try { process.exitCode = await runtimeWorker(JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))); }
  catch { console.error('WINDOW_DIAGNOSTIC_WORKER_PRECONDITION_FAILED'); process.exitCode = 2; }
}
