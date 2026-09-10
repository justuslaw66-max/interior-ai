import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const REFERENCE = Object.freeze({ image: '20260907.300.1', os: 'Ubuntu 24.04.5 LTS', runner: '2.337.0', node: 'v24.13.0', browser: '148.0.7778.96', revision: '1223' });
export function hostObservation(environment = process.env) {
  const release = fs.readFileSync('/etc/os-release', 'utf8');
  const pretty = /^PRETTY_NAME="([^"]+)"$/m.exec(release)?.[1];
  const observed = { linux: process.platform === 'linux', x64: process.arch === 'x64', imageMatches: environment.ImageVersion === REFERENCE.image,
    osMatches: pretty === REFERENCE.os, nodeMatches: process.version === REFERENCE.node,
    cpuCount: os.cpus().length, memoryBytes: os.totalmem(), cpuModelSha256: createHash('sha256').update(os.cpus().map(cpu => cpu.model).join('\n')).digest('hex'),
    osReleaseSha256: createHash('sha256').update(release).digest('hex'),
    actualImageVersion: /^[0-9]{8}\.[0-9]{1,5}\.[0-9]{1,5}$/.test(environment.ImageVersion ?? '') ? environment.ImageVersion : null,
    actualNodeVersion: /^v[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$/.test(process.version) ? process.version : null,
    actualOsVersion: /^Ubuntu ([0-9]{2}\.[0-9]{2}\.[0-9]{1,2}) LTS$/.exec(pretty ?? '')?.[1] ?? null,
    image: environment.ImageVersion === REFERENCE.image ? REFERENCE.image : null,
    os: pretty === REFERENCE.os ? REFERENCE.os : null, node: process.version === REFERENCE.node ? REFERENCE.node : null };
  return observed;
}
export function requireMatchedHost(observed) {
  if (![observed.linux, observed.x64, observed.imageMatches, observed.osMatches, observed.nodeMatches].every(value => value === true)) throw new Error('environment-mismatch');
}
export async function fileHash(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
export function activeRunnerExecutable(startPid = process.pid, procRoot = '/proc') {
  let pid = startPid; const seen = new Set();
  for (let depth = 0; depth < 12 && pid > 1; depth++) {
    if (!Number.isSafeInteger(pid) || seen.has(pid)) throw new Error('runner-ancestry-invalid');
    seen.add(pid);
    const statusFile = path.join(procRoot, String(pid), 'status');
    const fd = fs.openSync(statusFile, 'r'); const bytes = Buffer.alloc(16384); let size;
    try { size = fs.readSync(fd, bytes, 0, bytes.length, 0); } finally { fs.closeSync(fd); }
    if (size === bytes.length) throw new Error('runner-ancestry-invalid');
    const parent = Number(/^PPid:\s+([0-9]+)$/m.exec(bytes.subarray(0, size).toString('utf8'))?.[1]);
    const executable = fs.readlinkSync(path.join(procRoot, String(pid), 'exe'));
    if (path.basename(executable) === 'Runner.Worker') return { pid, parentPid: parent, executable };
    pid = parent;
  }
  throw new Error('active-runner-unavailable');
}
export function activeRunnerCompanion(activeRunner) {
  const executable = activeRunner.executable;
  try {
    if (!path.isAbsolute(executable) || path.basename(executable) !== 'Runner.Worker' || fs.realpathSync(executable) !== executable || !fs.lstatSync(executable).isFile()) throw new Error();
  } catch { throw new Error('runner-ancestry-invalid'); }
  const directory = path.dirname(executable);
  const listener = path.join(directory, 'Runner.Listener');
  try {
    if (fs.realpathSync(listener) !== listener || !fs.lstatSync(listener).isFile()) throw new Error();
  } catch { throw new Error('runner-version-unavailable'); }
  return listener;
}
export function matchedRunnerVersion(rawVersion) {
  if (rawVersion !== REFERENCE.runner) throw new Error('runner-version-mismatch');
  return rawVersion;
}
export function defaultHeadlessExecutable(source) {
  const require = createRequire(path.join(source, 'package.json'));
  const coreRoot = path.dirname(require.resolve('playwright-core/package.json'));
  return require(path.join(coreRoot, 'lib/coreBundle.js')).registry.registry.findExecutable('chromium-headless-shell').executablePath();
}
export async function browserObservation(source) {
  const require = createRequire(path.join(source, 'package.json'));
  const { chromium } = require('playwright');
  const coreRoot = path.dirname(require.resolve('playwright-core/package.json'));
  const metadata = JSON.parse(fs.readFileSync(path.join(coreRoot, 'browsers.json'), 'utf8')).browsers.find(item => item.name === 'chromium-headless-shell');
  if (metadata?.revision !== REFERENCE.revision || metadata.browserVersion !== REFERENCE.browser) throw new Error('browser-lock-mismatch');
  // This unchanged Playwright version selects headless-shell for channel-less,
  // default headless launch. chromium.executablePath() names the headed binary.
  const executable = defaultHeadlessExecutable(source);
  const executableSha256 = await fileHash(executable);
  // A blank-page preflight; no changed launch arguments or product/test invocation.
  const browser = await chromium.launch();
  try {
    if (browser.version() !== REFERENCE.browser) throw new Error('browser-version-mismatch');
    const children = fs.readFileSync(`/proc/${process.pid}/task/${process.pid}/children`, 'utf8').trim();
    if (children.length > 4096 || (children && !/^[0-9 ]+$/.test(children))) throw new Error('browser-process-unavailable');
    const matching = children.split(' ').filter(Boolean).map(Number).filter(pid => {
      try { return fs.readlinkSync(`/proc/${pid}/exe`) === fs.realpathSync(executable); } catch { return false; }
    });
    if (matching.length !== 1) throw new Error('browser-process-unavailable');
    const page = await browser.newPage();
    const graphics = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const extension = gl.getExtension('WEBGL_debug_renderer_info');
      return extension ? { vendor: gl.getParameter(extension.UNMASKED_VENDOR_WEBGL), renderer: gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) } : null;
    });
    if (!graphics || typeof graphics.renderer !== 'string' || typeof graphics.vendor !== 'string') throw new Error('graphics-unavailable');
    return { version: REFERENCE.browser, revision: REFERENCE.revision, selectedExecutable: 'chromium-headless-shell', browserPid: matching[0], executableObservedAsOwnedChild: true, executableSha256,
      executablePathSha256: createHash('sha256').update(executable).digest('hex'),
      graphics: { backend: graphics.renderer.includes('SwiftShader') ? 'swiftshader' : graphics.renderer.includes('llvmpipe') ? 'llvmpipe' : 'other-observed',
        rendererSha256: createHash('sha256').update(graphics.renderer).digest('hex'), vendorSha256: createHash('sha256').update(graphics.vendor).digest('hex') } };
  } finally { await browser.close(); }
}

export function sourceEnvironment(source, root, identity, adminUrl, databaseName, base = process.env) {
  // Authentication values stay in this private process tree; no GitHub env export.
  const environment = { ...base, GITHUB_WORKSPACE: source, RUNNER_TEMP: path.join(root, 'runner-temp'), GITHUB_ENV: path.join(root, 'auth-exports'),
    CI: 'true', CI_AUTH_FIXTURE_MODE: '1', CI_AUTH_FIXTURE_SESSION_ID: `${base.GITHUB_RUN_ID}-${base.GITHUB_RUN_ATTEMPT}-${identity.id}-auth-session`,
    CI_AUTH_FIXTURE_SESSION_NONCE: `${base.GITHUB_RUN_ID}-${base.GITHUB_RUN_ATTEMPT}-${identity.id}-auth-nonce`,
    CI_AUTH_FIXTURE_SESSION_CLASSIFICATION: 'PRODUCTION_INELIGIBLE_SYNTHETIC_AUTH', CI_AUTH_FIXTURE_SESSION_ROOT: path.join(root, 'auth-session'),
    CI_AUTH_FIXTURE_RESULT_ROOT: path.join(root, 'auth-results'), CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: identity.commit, CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: identity.tree,
    APP_ENV: 'development', AUTH_SECRET: 'ci-only-auth-secret-at-least-32-characters', NEXTAUTH_SECRET: 'ci-only-auth-secret-at-least-32-characters',
    NEXTAUTH_URL: 'http://127.0.0.1:3000', APP_ORIGIN: 'http://127.0.0.1:3000', AUTH_TRUST_HOST: 'true',
    ADMIN_EMAILS: 'gate-a3-admin@example.test', PLAYWRIGHT_ADMIN_EMAIL: 'gate-a3-admin@example.test',
    OPENAI_API_KEY: 'gate-a3-ci-openai-placeholder', SHOPIFY_STORE_DOMAIN: 'gate-a3-ci.myshopify.com', SHOPIFY_STOREFRONT_TOKEN: 'gate-a3-ci-shopify-placeholder',
    POSTHOG_KEY: 'gate-a3-ci-posthog-placeholder', STRIPE_SECRET_KEY: 'sk_test_gate_a3_ci_placeholder', STRIPE_WEBHOOK_SECRET: 'whsec_gate_a3_ci_placeholder',
    STRIPE_PRICE_PRO_MONTHLY: 'price_gate_a3_ci_monthly', STRIPE_PRICE_PRO_YEARLY: 'price_gate_a3_ci_yearly',
    CERTIFICATION_DATABASE_ADMIN_URL: adminUrl, DATABASE_URL: new URL(databaseName, adminUrl).href,
    STABLE_RUNTIME_SMOKE_EXPECTED_SOURCE_SHA: identity.commit, CODE_QUALITY_BASE_REF: identity.foundation,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: `github-${base.GITHUB_RUN_ID}-${base.GITHUB_RUN_ATTEMPT}` };
  for (const key of ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'CI_AUTH_FIXTURE_ACTIVE', 'NODE_OPTIONS', 'PLAYWRIGHT_USE_PRODUCTION_SERVER']) delete environment[key];
  fs.mkdirSync(environment.RUNNER_TEMP, { mode: 0o700 }); fs.mkdirSync(environment.CI_AUTH_FIXTURE_RESULT_ROOT, { mode: 0o700 });
  fs.writeFileSync(environment.GITHUB_ENV, '', { flag: 'wx', mode: 0o600 });
  return environment;
}

export function importAuthExports(file, environment) {
  const bytes = fs.readFileSync(file);
  if (bytes.length > 16384) throw new Error('auth-export-cap');
  // The source's canonical exporter includes session continuity and digest
  // controls. Consume that same physical session before importing any value.
  try {
    const repositoryRoot = environment.GITHUB_WORKSPACE;
    const session = createRequire(path.join(repositoryRoot, 'package.json'))('./scripts/ci-auth-fixture-session.cjs');
    const consumed = session.consumeFixtureSession({ repositoryRoot, environment, requireAmbientProviderValues: false,
      sourceCommand: 'ci:auth-fixture:export', sourceMode: 'export-github-env' });
    if (!bytes.equals(Buffer.from(session.serializeAssignments(consumed.assignments)))) throw new Error();
    Object.assign(environment, consumed.assignments);
  } catch { throw new Error('auth-export-session'); }
}

export async function authRegressionEnvironment(source, environment) {
  const { isolatedAuthFixtureRegressionEnvironment } = await import(pathToFileURL(path.join(source, 'scripts/ci-auth-fixture-regression-environment.mjs')).href);
  return isolatedAuthFixtureRegressionEnvironment({ repositoryRoot: source, parentEnvironment: environment });
}
