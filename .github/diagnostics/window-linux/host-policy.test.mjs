import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { APPROVED_HOST_PAIRS, REFERENCE, requireMatchedHost, matchedRunnerVersion } from './environment.mjs';
const source = path.resolve(path.dirname(import.meta.filename), '../../../../a-source');
const ts = createRequire(path.join(source, 'package.json'))('typescript');
const file = new URL('./environment.mjs', import.meta.url);
const ast = ts.createSourceFile(file.pathname, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
function owner(name) {
  const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node); return node.getText(ast).replace(/^export /, '');
}
// Actual reader with only OS/process boundary inputs replaced. No real browser,
// database or runner is launched by these fixtures.
function observed(pair, override = {}) {
  const input = { pretty: pair.os, image: pair.image, platform: 'linux', arch: 'x64', node: REFERENCE.node, ...override };
  const fn = vm.runInNewContext(owner('hostObservation') + '\nhostObservation', {
    APPROVED_HOST_PAIRS, REFERENCE, createHash,
    process: { platform: input.platform, arch: input.arch, version: input.node },
    fs: { readFileSync: name => { assert.equal(name, '/etc/os-release'); return input.pretty === undefined ? '' : `PRETTY_NAME="${input.pretty}"\n`; } },
    os: { cpus: () => [{ model: 'CPU_FIXTURE_ONLY' }], totalmem: () => 1024 },
  });
  return fn(input.image === undefined ? {} : { ImageVersion: input.image });
}
test('finite policy has exactly two authorized immutable OS/image pairs', () => {
  assert.deepEqual(APPROVED_HOST_PAIRS, [
    { os: 'Ubuntu 24.04.4 LTS', image: '20260831.293.1' },
    { os: 'Ubuntu 24.04.5 LTS', image: '20260907.300.1' },
  ]);
  assert.ok(Object.isFrozen(APPROVED_HOST_PAIRS) && APPROVED_HOST_PAIRS.every(Object.isFrozen));
  assert.equal(REFERENCE.hostPairs, APPROVED_HOST_PAIRS);
});
for (const pair of APPROVED_HOST_PAIRS) test(`actual reader accepts ${pair.os} / ${pair.image} only as a pair`, () => {
  const result = observed(pair); requireMatchedHost(result);
  assert.equal(result.os, pair.os); assert.equal(result.image, pair.image);
  assert.equal(result.actualImageVersion, pair.image); assert.equal(result.actualOsVersion, pair.os.split(' ')[1]);
  for (const override of [
    { image: APPROVED_HOST_PAIRS.find(other => other !== pair).image },
    { image: undefined }, { image: '' }, { image: '20260908.301.1' }, { image: 'private\nvalue' },
    { pretty: undefined }, { pretty: '' }, { pretty: 'Ubuntu 24.04 LTS' }, { pretty: 'private\nvalue' },
    { platform: 'darwin' }, { arch: 'arm64' }, { node: undefined }, { node: '' }, { node: 'v24.14.0' },
  ]) assert.throws(() => requireMatchedHost(observed(pair, override)), /environment-mismatch/);
  assert.throws(() => requireMatchedHost({ ...result, image: APPROVED_HOST_PAIRS.find(other => other !== pair).image }), /environment-mismatch/);
});
test('missing observations and false remaining host conditions reject', () => {
  for (const value of [null, undefined, {}]) assert.throws(() => requireMatchedHost(value), /environment-mismatch/);
  const result = observed(APPROVED_HOST_PAIRS[0]);
  for (const key of ['linux','x64','imageMatches','osMatches','hostPairMatches','nodeMatches']) {
    for (const value of [false, undefined, 'true']) assert.throws(() => requireMatchedHost({ ...result, [key]: value }), /environment-mismatch/);
  }
});
test('remaining exact runner requirement is unchanged', () => {
  assert.equal(matchedRunnerVersion('2.337.0'), '2.337.0');
  for (const value of ['2.338.0', '', undefined]) assert.throws(() => matchedRunnerVersion(value), /runner-version-mismatch/);
});
for (const [label, metadata, runtimeVersion, expected, launches] of [
  ['browser-lock-version', { revision:'1223', browserVersion:'149.0.0.0' }, null, 'browser-lock-mismatch', 0],
  ['browser-lock-revision', { revision:'1224', browserVersion:'148.0.7778.96' }, null, 'browser-lock-mismatch', 0],
  ['browser-lock-missing', null, null, 'browser-lock-mismatch', 0],
  ['browser-runtime-version', { revision:'1223', browserVersion:'148.0.7778.96' }, '149.0.0.0', 'browser-version-mismatch', 1],
]) test(`actual unchanged ${label} rejection owner`, async () => {
  let launched=0, closed=0, hashed=0;
  const requireFixture = () => ({ chromium: { launch: async () => { launched++; return { version: () => runtimeVersion, close: async () => { closed++; } }; } } });
  requireFixture.resolve = () => '/LOCAL_FIXTURE/playwright-core/package.json';
  const fn = vm.runInNewContext(owner('browserObservation')+'\nbrowserObservation', {
    path, REFERENCE, createRequire: () => requireFixture,
    fs: { readFileSync: () => JSON.stringify({ browsers: metadata ? [{ name:'chromium-headless-shell', ...metadata }] : [] }) },
    defaultHeadlessExecutable: () => '/LOCAL_FIXTURE/headless_shell', fileHash: async () => { hashed++; return 'f'.repeat(64); },
  });
  await assert.rejects(() => fn('/LOCAL_FIXTURE/source'), error => error.message === expected);
  assert.equal(launched, launches); assert.equal(closed, launches); assert.equal(hashed, launches);
});
