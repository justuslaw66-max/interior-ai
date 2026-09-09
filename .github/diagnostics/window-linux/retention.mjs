import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { LIMITS, digest, projectCleanup } from './projection.mjs';

function pinDirectory(directory) {
  let cursor = path.parse(path.resolve(directory)).root; const entries = [];
  for (const part of path.resolve(directory).slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part); const stat = fs.lstatSync(cursor);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('physical-directory');
    entries.push({ file: cursor, dev: stat.dev, ino: stat.ino });
  }
  return () => {
    for (const entry of entries) {
      const stat = fs.lstatSync(entry.file);
      if (!stat.isDirectory() || stat.isSymbolicLink() || stat.dev !== entry.dev || stat.ino !== entry.ino) throw new Error('directory-replaced');
    }
  };
}

function physical(root, candidate, maximum = LIMITS.document) {
  const base = path.resolve(root); const resolved = path.resolve(candidate);
  const relative = path.relative(base, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('containment');
  let cursor = path.parse(resolved).root; const pinned = [];
  for (const part of resolved.slice(cursor.length).split(path.sep)) {
    cursor = path.join(cursor, part);
    const stat = fs.lstatSync(cursor);
    if (stat.isSymbolicLink()) throw new Error('symlink');
    pinned.push({ file: cursor, stat });
  }
  const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    const initial = pinned.at(-1).stat;
    if (!before.isFile() || before.size > maximum || before.ino !== initial.ino || before.dev !== initial.dev) throw new Error('document-cap-or-replacement');
    const buffer = Buffer.alloc(Math.min(before.size + 1, maximum + 1)); let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(fd, buffer, length, buffer.length - length, length);
      if (!count) break;
      length += count;
    }
    const bytes = buffer.subarray(0, length); const after = fs.fstatSync(fd);
    if (bytes.length > maximum || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw new Error('document-changed');
    for (const entry of pinned) {
      const stat = fs.lstatSync(entry.file);
      if (stat.isSymbolicLink() || stat.ino !== entry.stat.ino || stat.dev !== entry.stat.dev) throw new Error('path-replaced');
    }
    if (bytes.length !== before.size) throw new Error('document-size-changed');
    return bytes;
  } finally { fs.closeSync(fd); }
}

export function createRetention({ expected, projection, privateOutput, publicOutput, readLifecycle, write = fs.writeFileSync }) {
  const identity = {};
  for (const key of ['commit', 'tree', 'foundation', 'foundationTree', 'workflowCommit']) {
    if (!/^[a-f0-9]{40}$/.test(expected[key])) throw new Error('identity-sha');
    identity[key] = expected[key];
  }
  for (const key of ['artifactSha256', 'manifestSha256']) {
    if (!/^[a-f0-9]{64}$/.test(expected[key])) throw new Error('artifact-sha');
    identity[key] = expected[key];
  }
  if (!['C', 'T'].includes(expected.id) || !/^[1-9][0-9]*$/.test(expected.runId) || expected.attempt !== '1' ||
      expected.candidateId !== `github-${expected.runId}-${expected.attempt}` || !/^[A-Za-z0-9_-]{1,100}$/.test(expected.buildId) || typeof readLifecycle !== 'function') throw new Error('identity-or-validator');
  for (const key of ['id', 'runId', 'attempt', 'candidateId', 'buildId']) identity[key] = expected[key];
  fs.mkdirSync(privateOutput, { mode: 0o700 }); fs.mkdirSync(publicOutput, { mode: 0o700 });
  const checkPrivate = pinDirectory(privateOutput); const checkPublic = pinDirectory(publicOutput); let checkEvidence = null;
  const record = { classification: 'DIAGNOSTIC_ONLY', identity, observerErrors: [], observerElapsedMs: 0,
    documents: [], captures: [], cleanup: null, canonicalCleanupIssues: null, rootRemoved: null, publicBytes: 0, privateBytes: 0 };
  let binding = null; let roots = null; let lifecyclePath = null; let ownerBytes = null; let captured = false; let lifecycleEnvironment = null;
  function safe(callback, category) {
    const start = performance.now();
    try { callback(); } catch { record.observerErrors.push(category); }
    record.observerElapsedMs += performance.now() - start;
  }
  function publish(name, value) {
    checkPublic();
    const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
    if (record.publicBytes + bytes.length > 48 * 1024 * 1024) throw new Error('artifact-cap');
    write(path.join(publicOutput, name + '.json'), bytes, { flag: 'wx', mode: 0o600 });
    record.publicBytes += bytes.length;
  }
  function assertOwner() {
    checkEvidence?.();
    const actual = physical(roots.taskRoot, roots.ownerPath);
    if (!actual.equals(ownerBytes)) throw new Error('owner-changed');
    const owner = JSON.parse(actual);
    if (owner.candidateId !== expected.candidateId || owner.runId !== expected.runId || owner.runAttempt !== Number(expected.attempt) || owner.sourceCommitSha !== expected.commit || owner.sourceTreeSha !== expected.tree ||
        owner.certificationId !== `stable-runtime-smoke:${expected.runId}:${expected.attempt}:${expected.commit.slice(0, 12)}`) throw new Error('owner-identity');
  }
  function retainPrivate(id, bytes) {
    checkPrivate();
    if (record.privateBytes + bytes.length > 256 * 1024 * 1024) throw new Error('private-cap');
    write(path.join(privateOutput, id + '.raw'), bytes, { flag: 'wx', mode: 0o600 }); record.privateBytes += bytes.length;
  }
  function lifecycle() {
    const bytes = physical(roots.evidenceRoot, lifecyclePath);
    const validated = readLifecycle({ repositoryRoot: expected.sourceRoot, environment: lifecycleEnvironment });
    if (validated.descriptor.sha256 !== digest(bytes) || JSON.stringify(validated.evidence) !== JSON.stringify(JSON.parse(bytes))) throw new Error('lifecycle-validation-binding');
    return { bytes, evidence: validated.evidence };
  }
  function captureDocument(id, filePath, root, project) {
    const item = { id, available: false, bytes: null, sha256: null, content: 'omitted', projectionAvailable: false };
    record.documents.push(item);
    try {
      const bytes = physical(root, filePath); item.available = true; item.bytes = bytes.length; item.sha256 = digest(bytes);
      retainPrivate(id, bytes);
      if (project) { publish(id, project(JSON.parse(bytes))); item.projectionAvailable = true; item.content = 'allowlisted-projection'; }
    } catch (error) {
      item.unavailableReason = error?.code === 'ENOENT' ? 'missing' : 'read-copy-or-projection-rejected';
      if (error?.code !== 'ENOENT') record.observerErrors.push('document-capture');
    }
  }
  function captureRuntime(paths, category) {
    assertOwner();
    if (captured) return;
    captured = true; record.captures.push(category);
    captureDocument('runtime-report', paths.report, roots.evidenceRoot, projection.report);
    captureDocument('phase-timings', paths.timings, roots.evidenceRoot, projection.timings);
    captureDocument('product-start', paths.marker, roots.evidenceRoot, null);
    // DOM text never enters public output. The actual report supplies only an owned attachment path.
    try {
      const report = JSON.parse(physical(roots.evidenceRoot, paths.report));
      const stack = [...(report.suites ?? [])]; let selected = 0; let visited = 0;
      while (stack.length && visited++ < 1000) {
        const suite = stack.pop(); stack.push(...(suite.suites ?? []).slice(0, 100));
        for (const spec of (suite.specs ?? []).slice(0, 100)) for (const test of (spec.tests ?? []).slice(0, 10)) for (const result of (test.results ?? []).slice(0, 10)) {
          for (const attachment of (result.attachments ?? []).slice(0, 100)) {
            if (selected >= 2 || attachment.name !== 'error-context' || typeof attachment.path !== 'string') continue;
            selected++;
            captureDocument('error-context-' + selected, path.resolve(expected.sourceRoot, attachment.path), path.join(expected.sourceRoot, '.local/production-artifact-evidence/playwright-output'), null);
          }
        }
      }
      if (!selected) record.documents.push({ id: 'error-context', available: false, unavailableReason: 'not-referenced', content: 'omitted' });
    } catch (error) { if (error?.code !== 'ENOENT') record.observerErrors.push('error-context-discovery'); }
  }
  function captureCleanup(category) {
    assertOwner();
    const { bytes, evidence } = lifecycle();
    const projected = projectCleanup(evidence, binding);
    retainPrivate(category + '-lifecycle', bytes);
    record.cleanup = { ...projected, receiptSha256: digest(bytes), capture: category };
    record.captures.push(category);
  }
  const hooks = {
    afterDatabasePrepared(value) { safe(() => {
      roots = { ...value.roots }; lifecycleEnvironment = { ...value.lifecycleEnvironment }; lifecyclePath = lifecycleEnvironment.CERTIFICATION_DATABASE_LIFECYCLE_PATH;
      checkEvidence = pinDirectory(roots.evidenceRoot);
      if (lifecyclePath !== path.join(roots.evidenceRoot, 'database/lifecycle.json')) throw new Error('lifecycle-path');
      ownerBytes = physical(roots.taskRoot, roots.ownerPath); assertOwner();
      const { evidence } = lifecycle();
      if (evidence.lifecycleProfile?.classification !== 'STABLE_RUNTIME_SMOKE_ONLY') throw new Error('lifecycle-profile');
      const suffix = evidence?.database?.identitySha256?.slice(0, 32);
      const databaseName = evidence.database.name; const role = evidence.privateBinding.roleCreation;
      const match = /^interior_ai_gate_a3_test_cert_([a-f0-9]{32})$/.exec(databaseName);
      if (!match || (suffix && suffix !== match[1]) || role.roleName !== `interior_ai_cert_stage_${match[1]}` ||
          evidence.provisioning.outcome !== 'created' || role.outcome !== 'created' ||
          evidence.provisioning.ownershipRecoverable !== true || role.ownershipRecoverable !== true ||
          !Number.isSafeInteger(evidence.provisioning.databaseOid) || evidence.provisioning.databaseOid <= 0 || !Number.isSafeInteger(role.roleOid) || role.roleOid <= 0) throw new Error('acknowledged-binding');
      binding = { databaseName, databaseOid: evidence.provisioning.databaseOid, roleName: role.roleName, roleOid: role.roleOid };
      record.captures.push('database-prepared');
    }, 'prepared-capture'); },
    afterFailureAttribution(value) { safe(() => {
      const identity = value.attribution.identity;
      if (identity.sourceCommitSha !== expected.commit || identity.sourceTreeSha !== expected.tree) throw new Error('failure-source');
      if (identity.artifactSha256 !== expected.artifactSha256 || identity.buildId !== expected.buildId) throw new Error('failure-artifact');
      record.artifact = { sha256: expected.artifactSha256, buildId: expected.buildId };
      record.failure = projection.attribution(value.attribution);
      const directory = path.join(roots.evidenceRoot, 'runtime-smoke');
      captureRuntime({ report: path.join(directory, 'playwright-report.json'), timings: path.join(directory, 'phase-timings.json'), marker: path.join(directory, 'product-test-start.json') }, 'before-abort');
      captureCleanup('before-abort');
    }, 'failure-capture'); },
    afterDatabaseAbort() { safe(() => {
      const directory = path.join(roots.evidenceRoot, 'runtime-smoke');
      captureRuntime({ report: path.join(directory, 'playwright-report.json'), timings: path.join(directory, 'phase-timings.json'), marker: path.join(directory, 'product-test-start.json') }, 'after-abort-before-removal');
      captureCleanup('after-abort');
    }, 'abort-capture'); },
    afterFailedCleanup(value) { safe(() => {
      record.rootRemoved = value.roots === null;
      record.canonicalCleanupIssues = Array.isArray(value.cleanupIssues) ? value.cleanupIssues.length : null;
    }, 'failed-cleanup-capture'); },
    beforeSuccessfulRootRemoval(value) { safe(() => {
      const validated = lifecycle();
      if (JSON.stringify(value.finalDatabase.evidence) !== JSON.stringify(validated.evidence)) throw new Error('success-receipt-changed');
      captureRuntime(value.paths, 'before-successful-removal'); captureCleanup('successful-cleanup'); record.canonicalCleanupIssues = 0;
    }, 'successful-capture'); },
  };
  function finish({ exitCode, error = null }) {
    safe(() => {
      record.originalExitCode = Number.isInteger(exitCode) ? exitCode : null;
      record.originalFailureObserved = error !== null;
      record.artifact = { sha256: expected.artifactSha256, buildId: expected.buildId };
      record.ownerFailure = error === null ? null : projection.ownerError(error);
      if (exitCode === 0) record.rootRemoved = roots !== null && !fs.existsSync(roots.taskRoot);
      record.safeForNextSource = record.cleanup?.terminalEventObserved === true && ['stable-absence-verified', 'abort-absence-verified'].includes(record.cleanup?.state) && record.cleanup?.targetAbsent === true && record.cleanup?.roleAbsent === true && record.cleanup?.sessionCount === 0 && record.cleanup?.roleSessionCount === 0 && record.rootRemoved === true && record.canonicalCleanupIssues === 0 && record.observerErrors.length === 0;
      const publicRecord = structuredClone(record);
      publish('retention', publicRecord);
    }, 'final-retention-write');
    if (record.observerErrors.length) record.safeForNextSource = false;
    return structuredClone(record);
  }
  return { hooks, finish, snapshot: () => structuredClone(record) };
}

export { physical as readOwnedPhysicalFile };
