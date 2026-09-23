import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const canonicalOwners = new Set(["release.gate-a3", "advisory.full-e2e"]);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const runIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

export const isCanonicalWindowOpeningOwner = (owner) => canonicalOwners.has(owner);

// Release evidence belongs beside its .vercel report, outside the hashed
// .vercel/output artifact and within the existing clean-source output policy.
// For canonical owners this is only a parent, never a Playwright/cleanup target.
export function requiredBrowserOutputDirectory(gateId) {
  return gateId === "release.gate-a3" ? ".vercel/gate-a3-playwright-output" :
    `.local/required-test-evidence/${gateId}/playwright-output`;
}

function canonicalRunPaths(repositoryRoot, owner, runId) {
  if (!canonicalOwners.has(owner) || !runIdPattern.test(runId ?? "")) {
    throw windowOpeningPrerequisite("canonical output requires its owner and run ID.");
  }
  const relativeRoot = `${requiredBrowserOutputDirectory(owner)}/${runId}`;
  return { runRoot: path.resolve(repositoryRoot, relativeRoot),
    outputPath: path.resolve(repositoryRoot, relativeRoot, "test-results"),
    reportPath: `${relativeRoot}/playwright.json`, evidencePath: `${relativeRoot}/evidence.json`,
    contextPath: `${relativeRoot}/context.json` };
}

// Check every component below the repository, including existing leaf entries.
// A missing output leaf is allowed before startup and after unsafe-output removal.
function assertPhysicalRunPath(repositoryRoot, file, allowMissing = false) {
  const root = path.resolve(repositoryRoot);
  inside(root, file);
  if (lstatSync(root, { throwIfNoEntry: false })?.isSymbolicLink()) {
    throw windowOpeningPrerequisite("canonical output cannot traverse a symlink.");
  }
  let current = root;
  for (const segment of path.relative(root, file).split(path.sep)) {
    current = path.join(current, segment);
    let entry;
    try { entry = lstatSync(current); }
    catch (error) { if (allowMissing && error.code === "ENOENT") return; throw error; }
    if (entry.isSymbolicLink() || (current !== file && !entry.isDirectory())) {
      throw windowOpeningPrerequisite("canonical output cannot traverse a symlink or non-directory.");
    }
  }
}

function createCanonicalParent(repositoryRoot, parent) {
  let current = path.resolve(repositoryRoot);
  for (const segment of path.relative(current, parent).split(path.sep)) {
    current = path.join(current, segment);
    try { mkdirSync(current); } catch (error) { if (error.code !== "EEXIST") throw error; }
    assertPhysicalRunPath(repositoryRoot, current);
    if (!lstatSync(current).isDirectory()) throw windowOpeningPrerequisite("output parent must be a physical directory.");
  }
}

export function readCanonicalWindowOpeningRun(repositoryRoot, owner, runId) {
  const locations = canonicalRunPaths(repositoryRoot, owner, runId);
  for (const file of Object.values(locations)) {
    assertPhysicalRunPath(repositoryRoot, path.resolve(repositoryRoot, file), true);
  }
  if (!lstatSync(locations.runRoot).isDirectory()) throw windowOpeningPrerequisite("run directory is missing.");
  const context = readJson(path.resolve(repositoryRoot, locations.contextPath));
  if (context.schemaVersion !== "window-opening-canonical-context/v2" || context.owner !== owner ||
      context.runId !== runId || Object.entries(locations).some(([key, value]) => context[key] !== value) ||
      !/^[a-f0-9]{40}$/.test(context.sourceCommitSha ?? "") || !/^[a-f0-9]{40}$/.test(context.sourceTreeSha ?? "")) {
    throw windowOpeningPrerequisite("run ID, owner, output, or report disagrees with its allocated context.");
  }
  return context;
}

const portableContext = (value, repositoryRoot) =>
  JSON.stringify(value ?? null).split(path.resolve(repositoryRoot)).join("<repository-root>");

function assertRecordedContext(context, repositoryRoot) {
  const recorded = readCanonicalWindowOpeningRun(repositoryRoot, context?.owner, context?.runId);
  if (portableContext(context, repositoryRoot) !== portableContext(recorded, repositoryRoot)) {
    throw windowOpeningPrerequisite("run ID, owner, output, or report disagrees with its allocated context.");
  }
  return recorded;
}

export function assertCanonicalWindowOpeningConfiguration(context, config, environment = process.env, argv = process.argv) {
  if (!context) return;
  assertRecordedContext(context, process.cwd());
  if (argv.some((argument) => /^--(?:output|reporter)(?:=|$)/.test(argument)) ||
      environment.PW_TEST_REPORTER !== undefined ||
      Object.keys(environment).some((name) => /^PLAYWRIGHT_(?:(?:JSON|HTML|BLOB|JUNIT)_(?:OUTPUT_(?:FILE|DIR|NAME)|REPORT)|TEST_REPORTER)$/.test(name))) {
    throw windowOpeningPrerequisite("canonical output and reporters cannot be overridden by CLI or environment.");
  }
  const expectedReporters = [["list"], ["json", { outputFile: context.reportPath }]];
  if (path.resolve(config.outputDir ?? "") !== context.outputPath ||
      (config.projects ?? []).some((project) => project.outputDir !== undefined && path.resolve(project.outputDir) !== context.outputPath) ||
      JSON.stringify(config.reporter) !== JSON.stringify(expectedReporters)) {
    throw windowOpeningPrerequisite("Playwright output, project output, and reporters must use the allocated run.");
  }
}

export function windowOpeningPrerequisite(message) {
  return new Error(`Window-opening execution prerequisite: ${message}`);
}

export function windowOpeningTarget(value) {
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
        url.search || url.hash || url.pathname !== "/") throw new Error();
    return url.origin;
  } catch {
    throw windowOpeningPrerequisite("select an HTTP(S) origin without credentials, query, or path.");
  }
}

function inside(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw windowOpeningPrerequisite("capture files must belong to their owner's output directory.");
  }
  return file;
}

export function localWindowOpeningContext(environment) {
  try {
    if (environment.REQUIRED_TEST_GATE_ID || environment.WINDOW_OPENING_CANONICAL_CONTEXT) {
      throw new Error("local mounted configuration cannot consume a canonical gate context.");
    }
    const fields = {
      runRoot: "WINDOW_OPENING_RUN_ROOT",
      evidenceRoot: "WINDOW_OPENING_EVIDENCE_ROOT",
      screenshotRoot: "WINDOW_OPENING_SCREENSHOT_DIR",
      networkRoot: "WINDOW_OPENING_NETWORK_EVIDENCE_PATH",
      runtimeRoot: "WINDOW_OPENING_RUNTIME_EVIDENCE_PATH",
      serverContextPath: "WINDOW_OPENING_SERVER_CONTEXT_PATH",
    };
    const locations = Object.fromEntries(Object.entries(fields).map(([field, name]) => {
      if (!environment[name] || !path.isAbsolute(environment[name])) throw new Error(`${name} is required and must be absolute.`);
      return [field, environment[name]];
    }));
    const baseURL = windowOpeningTarget(environment.WINDOW_OPENING_BASE_URL);
    if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(baseURL)) throw new Error("local mounted target must use its dedicated 127.0.0.1 port.");
    const server = readJson(locations.serverContextPath);
    if (server.schemaVersion !== "window-opening-server-context/v1" || !server.runId ||
        server.runRoot !== locations.runRoot || server.evidenceRoot !== locations.evidenceRoot ||
        server.baseUrl !== baseURL || server.port !== Number(new URL(baseURL).port) ||
        !Number.isInteger(server.listenerPid) || !Number.isInteger(server.launcherPid) ||
        !server.serverCwd || server.repositoryRoot !== server.serverCwd ||
        !/^[a-f0-9]{64}$/.test(environment.WINDOW_OPENING_SOURCE_IDENTITY ?? "") ||
        server.sourceCompleteStateIdentitySha256 !== environment.WINDOW_OPENING_SOURCE_IDENTITY) {
      throw new Error("local server, source, target, or run identity is missing or contradictory.");
    }
    for (const key of ["screenshotRoot", "networkRoot", "runtimeRoot", "serverContextPath"]) inside(locations.runRoot, locations[key]);
    if (locations.runRoot !== locations.evidenceRoot) inside(locations.evidenceRoot, locations.runRoot);
    return { owner: "local-mounted", baseURL, runId: server.runId, ...locations,
      sourceIdentity: environment.WINDOW_OPENING_SOURCE_IDENTITY,
      serverContextSha256: hash(readFileSync(locations.serverContextPath)) };
  } catch (error) {
    throw windowOpeningPrerequisite(`run test:window-opening-mounted with its complete owned context. ${error.message}`);
  }
}

// Reuses the physical output verifier used by stage/certify/promote. The staged
// record is produced by that existing deployment owner, never by this test runner.
function verifiedReleaseTarget(repositoryRoot, baseURL, sourceCommitSha, artifactSha256) {
  const verified = spawnSync(process.execPath, [
    "--input-type=module", "-e",
    "const verifier = await import(process.argv[1]); const manifest = await verifier.verifyVercelOutputManifest(); const { readFile } = await import('node:fs/promises'); const staged = JSON.parse(await readFile('.vercel/staged-deployment.json', 'utf8')); verifier.validateStagedVercelIdentity({ manifest, staged, certifiedDeploymentUrl: process.argv[2] });",
    pathToFileURL(path.join(repositoryRoot, "scripts/vercel-output-manifest.mjs")).href,
    baseURL,
  ], { cwd: repositoryRoot, encoding: "utf8" });
  if (verified.status !== 0) throw new Error("run release:vercel:verify on the clean, committed staged candidate; its prebuilt output is unavailable or invalid.");
  const manifestPath = path.join(repositoryRoot, ".vercel/prebuilt-manifest.json");
  const stagedPath = path.join(repositoryRoot, ".vercel/staged-deployment.json");
  const manifest = readJson(manifestPath);
  const staged = readJson(stagedPath);
  if (staged.schema !== "interior-ai.vercel-staged-deployment.v1" ||
      !Number.isFinite(Date.parse(staged.stagedAt))) throw new Error("the existing staged-deployment record is missing or invalid.");
  if (!baseURL.startsWith("https://") || manifest.gitCommit !== sourceCommitSha ||
      manifest.artifactSha256 !== artifactSha256) throw new Error("the canonical target/source/artifact disagrees with the verified staged deployment.");
  return { artifactSha256, stagedAt: staged.stagedAt,
    manifestSha256: hash(readFileSync(manifestPath)), stagedRecordSha256: hash(readFileSync(stagedPath)) };
}

export function prepareCanonicalWindowOpeningContext({
  repositoryRoot, gateId, environment, sourceCommitSha, sourceTreeSha, runId = randomUUID(),
}) {
  if (!canonicalOwners.has(gateId)) return null;
  try {
    if (![sourceCommitSha, sourceTreeSha].every((value) => /^[a-f0-9]{40}$/.test(value ?? ""))) {
      throw new Error("canonical output requires the source commit and tree.");
    }
    if (Object.keys(environment).some((name) => name.startsWith("WINDOW_OPENING_"))) {
      throw new Error("remove inherited WINDOW_OPENING_* inputs; the canonical execution owner creates its own context.");
    }
    if (environment.CERTIFICATION_EVIDENCE_ROOT || environment.PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT) {
      throw new Error("canonical full-suite output must use its repository-owned generated parent.");
    }
    const release = gateId === "release.gate-a3";
    if ((release && environment.PLAYWRIGHT_ADVISORY_BASE_URL) ||
        (!release && (environment.PLAYWRIGHT_RELEASE_BASE_URL || environment.REQUIRED_TEST_ARTIFACT_SHA256))) {
      throw new Error("release and advisory target/artifact inputs cannot be mixed.");
    }
    const baseURL = windowOpeningTarget(release ? environment.PLAYWRIGHT_RELEASE_BASE_URL :
      environment.PLAYWRIGHT_ADVISORY_BASE_URL || "http://127.0.0.1:3000");
    const deployment = release ? verifiedReleaseTarget(repositoryRoot, baseURL, sourceCommitSha,
      environment.REQUIRED_TEST_ARTIFACT_SHA256) : null;
    const locations = canonicalRunPaths(repositoryRoot, gateId, runId);
    const context = { schemaVersion: "window-opening-canonical-context/v2", owner: gateId,
      baseURL, runId, sourceCommitSha, sourceTreeSha, ...locations, deployment };
    createCanonicalParent(repositoryRoot, path.dirname(locations.runRoot));
    // Never catch EEXIST to reuse/delete a run. Only this runner allocates;
    // configuration evaluation and later verification read the frozen record.
    mkdirSync(locations.runRoot);
    writeFileSync(path.resolve(repositoryRoot, locations.contextPath), `${JSON.stringify(context, null, 2)}\n`, { flag: "wx" });
    return context;
  } catch (error) {
    throw windowOpeningPrerequisite(error.message);
  }
}

export function canonicalWindowOpeningContext(environment, baseURL, reportPath, outputPath) {
  const owner = environment.REQUIRED_TEST_GATE_ID;
  if (!canonicalOwners.has(owner)) {
    if (environment.WINDOW_OPENING_CANONICAL_CONTEXT) throw windowOpeningPrerequisite("canonical context has the wrong execution owner.");
    return null;
  }
  try {
    const context = JSON.parse(environment.WINDOW_OPENING_CANONICAL_CONTEXT ?? "null");
    if (!context || context.owner !== owner || context.baseURL !== windowOpeningTarget(baseURL) ||
        context.reportPath !== reportPath || (outputPath !== undefined && context.outputPath !== outputPath) || !path.isAbsolute(context.outputPath ?? "") ||
        !/^[a-f0-9-]{36}$/.test(context.runId) ||
        context.sourceCommitSha !== environment.REQUIRED_TEST_SOURCE_COMMIT_SHA ||
        context.sourceTreeSha !== environment.REQUIRED_TEST_SOURCE_TREE_SHA ||
        !/^[a-f0-9]{40}$/.test(context.sourceCommitSha) || !/^[a-f0-9]{40}$/.test(context.sourceTreeSha)) {
      throw new Error("run the canonical test:e2e:release or test:e2e:advisory owner; its target/report/source/run context is missing or contradictory.");
    }
    assertRecordedContext(context, process.cwd());
    if (owner === "release.gate-a3") {
      const verified = verifiedReleaseTarget(process.cwd(), context.baseURL,
        context.sourceCommitSha, environment.REQUIRED_TEST_ARTIFACT_SHA256);
      if (JSON.stringify(verified) !== JSON.stringify(context.deployment)) throw new Error("the verified staged deployment changed after runner setup.");
    } else if (context.deployment !== null || environment.REQUIRED_TEST_ARTIFACT_SHA256) {
      throw new Error("advisory context cannot carry release authority.");
    }
    return context;
  } catch (error) {
    throw windowOpeningPrerequisite(error.message);
  }
}

export function assertWindowOpeningTestOwner(context, { baseURL, configFile, project }) {
  if (!context || !["local-mounted", ...canonicalOwners].includes(context.owner)) {
    throw windowOpeningPrerequisite("select test:window-opening-mounted, test:e2e:release, or test:e2e:advisory explicitly.");
  }
  const expectedConfig = context.owner === "local-mounted" ? "playwright.window-opening.config.ts" : "playwright.config.ts";
  if (path.basename(configFile) !== expectedConfig || context.baseURL !== windowOpeningTarget(baseURL) || !project) {
    throw windowOpeningPrerequisite("the spec's configured owner, browser project, or target differs from its capture context.");
  }
}

export function assertWindowOpeningReportContext(metadata, gateId, {
  repositoryRoot = process.cwd(), config, expectedRunId,
} = {}) {
  if (!canonicalOwners.has(gateId)) return;
  const context = metadata?.windowOpeningExecution;
  const identity = metadata?.requiredTestEvidence;
  if (!context || context.owner !== gateId || identity?.gateId !== gateId ||
      context.sourceCommitSha !== identity.sourceCommitSha ||
      !/^[a-f0-9-]{36}$/.test(context.runId) ||
      context.baseURL !== metadata.windowOpeningTargetBaseURL ||
      (gateId === "release.gate-a3" && (context.baseURL !== metadata.gateA3ReleaseBaseURL ||
        !context.deployment || context.deployment.artifactSha256 !== identity.artifactSha256)) ||
      (gateId === "advisory.full-e2e" && (context.deployment !== null || identity.artifactSha256 !== null))) {
    throw windowOpeningPrerequisite("capture owner/run/target/artifact disagrees with the canonical report.");
  }
  const recorded = assertRecordedContext(context, repositoryRoot);
  if ((expectedRunId !== undefined && context.runId !== expectedRunId) ||
      (config?.projects ?? []).some((project) => portableContext(project.outputDir, repositoryRoot) !== portableContext(recorded.outputPath, repositoryRoot))) {
    throw windowOpeningPrerequisite("canonical report belongs to another run or output directory.");
  }
}

export function windowOpeningCapturePaths(context, { outputDir, testId, project, screenshotId }) {
  for (const value of [testId, screenshotId]) if (!/^[a-zA-Z0-9-]+$/.test(value)) throw windowOpeningPrerequisite("capture identity is invalid.");
  if (!project || !path.isAbsolute(outputDir)) throw windowOpeningPrerequisite("capture requires its actual test/project output directory.");
  const root = context.owner === "local-mounted" ? context.screenshotRoot :
    path.join(outputDir, `window-opening-${context.runId}`, hash(`${project}\0${testId}`).slice(0, 16));
  const captures = { screenshotPath: inside(root, path.join(root, `${screenshotId}.png`)),
    sidecarPath: inside(root, path.join(root, `${screenshotId}.capture.json`)),
    tracePath: path.join(outputDir, "trace.zip") };
  if (context.owner !== "local-mounted") {
    for (const file of Object.values(captures)) assertPhysicalRunPath(context.outputPath, file, true);
  }
  return captures;
}
