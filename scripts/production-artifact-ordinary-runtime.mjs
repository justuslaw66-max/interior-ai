// Source-only ordinary execution owner. Never loaded by a cold build or portable verifier.
import { createHash, randomBytes } from "node:crypto";
import { closeSync, fsyncSync, ftruncateSync, lstatSync, mkdtempSync, openSync,
  readFileSync, realpathSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import authFixtureSession from "./ci-auth-fixture-session.cjs";
import { assertNoCertificationContext, ordinaryRuntimeIdentity, runtimeFailureText } from "./production-artifact-runtime-binding.mjs";
import { assertOrdinaryDatabaseObservation, createOrdinaryRuntimeRole, dropOrdinaryRuntimeRole,
  inspectOrdinaryPostgresService, observeOrdinaryDatabase, withOrdinaryDatabase } from "./production-artifact-ordinary-database.mjs";
import { redactCertificationStageResultDiagnosticOutput } from "./production-certification-stage-result-contract.mjs";

export const ORDINARY_ARTIFACT_SERVICE_CONFIGURATION = Object.freeze({
  OPENAI_API_KEY: "gate-a3-ci-openai-placeholder", SHOPIFY_STORE_DOMAIN: "gate-a3-ci.myshopify.com",
  SHOPIFY_STOREFRONT_TOKEN: "gate-a3-ci-shopify-placeholder", POSTHOG_KEY: "gate-a3-ci-posthog-placeholder",
  STRIPE_SECRET_KEY: "sk_test_gate_a3_ci_placeholder", STRIPE_WEBHOOK_SECRET: "whsec_gate_a3_ci_placeholder",
  STRIPE_PRICE_PRO_MONTHLY: "price_gate_a3_ci_monthly", STRIPE_PRICE_PRO_YEARLY: "price_gate_a3_ci_yearly",
});
function ordinaryServiceConfiguration(environment) {
  if (Object.entries(ORDINARY_ARTIFACT_SERVICE_CONFIGURATION).some(([name, value]) => environment[name] !== value)) {
    throw new Error("Ordinary artifact requires the isolated workflow's synthetic staging service configuration");
  }
  return ORDINARY_ARTIFACT_SERVICE_CONFIGURATION;
}

const digest = (value) => createHash("sha256").update(value).digest("hex");
function privateJson(filePath) {
  if (!path.isAbsolute(filePath ?? "")) throw new Error("Ordinary private binding requires an absolute physical path");
  const entry = lstatSync(filePath);
  if (!entry.isFile() || entry.isSymbolicLink() || (entry.mode & 0o077) !== 0 ||
      realpathSync(filePath) !== path.resolve(filePath)) {
    throw new Error("Ordinary private binding must be a physical owner-only file");
  }
  return JSON.parse(readFileSync(filePath, "utf8"));
}

export function ordinaryFixtureProjection({ repositoryRoot, environment, manifest }) {
  assertNoCertificationContext(environment);
  for (const [name, expected] of [["CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA", manifest.source.commitSha],
    ["CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA", manifest.source.treeSha]]) {
    if (environment[name] !== undefined && environment[name] !== expected) {
      throw new Error("Ordinary fixture candidate differs from the artifact");
    }
  }
  const consumed = authFixtureSession.consumeFixtureSession({ repositoryRoot,
    environment: { ...environment, CI_AUTH_FIXTURE_CANDIDATE_COMMIT_SHA: manifest.source.commitSha,
      CI_AUTH_FIXTURE_CANDIDATE_TREE_SHA: manifest.source.treeSha },
    sourceCommand: "evidence:production:smoke", sourceMode: "ordinary-artifact-runtime" });
  const projection = { ...authFixtureSession.projectedFixtureEnvironment(consumed) };
  if (manifest.build.authFixtureContinuity?.activationScope === "github-actions") {
    if (environment.CI !== "true" || environment.GITHUB_ACTIONS !== "true") {
      throw new Error("Ordinary hosted fixture lacks its original activation scope");
    }
    delete projection.CI_AUTH_FIXTURE_LOCAL_TEST;
    projection.CI = "true";
    projection.GITHUB_ACTIONS = "true";
  }
  const continuity = authFixtureSession.validateProjectedFixtureEnvironment(projection, manifest.source);
  if (JSON.stringify(continuity) !== JSON.stringify(manifest.build.authFixtureContinuity) ||
      manifest.build.applicationEnvironment !== "staging") {
    throw new Error("Ordinary artifact auth continuity or non-production scope is mismatched");
  }
  return { projection, sessionSha256: consumed.manifest.aggregateSha256 };
}

export function ordinaryDatabaseTarget(environment, manifest, { inspectService = inspectOrdinaryPostgresService } = {}) {
  assertNoCertificationContext(environment);
  const url = new URL(environment.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.port !== "5432" || url.search || url.hash) {
    throw new Error("Ordinary database URL is malformed or outside the isolated contract");
  }
  if (environment.ORDINARY_ARTIFACT_DATABASE_RECEIPT) {
    const receipt = privateJson(environment.ORDINARY_ARTIFACT_DATABASE_RECEIPT);
    if (environment.GITHUB_ACTIONS === "true" || url.hostname !== "127.0.0.1" ||
        url.username !== "justus" || url.password ||
        !/^interior_ai_window_opening_evidence_test_[a-z0-9_]+$/.test(database) || database.length > 63 ||
        receipt.schema !== "window-opening-database-creation/v1" || receipt.created !== true ||
        receipt.outcome !== "created" || receipt.databaseName !== database || receipt.host !== "127.0.0.1" ||
        receipt.port !== 5432 || receipt.role !== "justus" ||
        !environment.ORDINARY_ARTIFACT_DATABASE_OWNER || receipt.ownerId !== environment.ORDINARY_ARTIFACT_DATABASE_OWNER ||
        !Number.isSafeInteger(receipt.databaseOid) || receipt.databaseOid <= 0) {
      throw new Error("Ordinary local database lacks its acknowledged WINDOW ownership");
    }
    return { database, role: "justus", databaseOid: receipt.databaseOid, resourceOwner: "window-local-receipt", serverAddress: "127.0.0.1",
      creationReceiptPath: environment.ORDINARY_ARTIFACT_DATABASE_RECEIPT,
      creationReceiptSha256: digest(readFileSync(environment.ORDINARY_ARTIFACT_DATABASE_RECEIPT)), ownerId: receipt.ownerId };
  }
  const run = `${environment.GITHUB_RUN_ID}-${environment.GITHUB_RUN_ATTEMPT}`;
  if (environment.CI !== "true" || environment.GITHUB_ACTIONS !== "true" ||
      environment.GITHUB_REPOSITORY !== "justuslaw66-max/interior-ai" || environment.GITHUB_JOB !== "stable-checks" ||
      !/^\d+-\d+$/.test(run) || manifest.candidateIdentifier !== `github-${run}` ||
      environment.CI_AUTH_FIXTURE_SESSION_ID !== `${run}-stable-auth-session` ||
      environment.CI_AUTH_FIXTURE_SESSION_NONCE !== `${run}-stable-auth-nonce` ||
      url.hostname !== "localhost" || url.username !== "test" || url.password !== "test" || database !== "interior_ai_test") {
    throw new Error("Ordinary hosted database lacks its exact stable workflow/run/session ownership");
  }
  return { database, role: "test", ...inspectService(environment), resourceOwner: "github-stable-service", githubRun: run, githubRepository: environment.GITHUB_REPOSITORY, githubJob: environment.GITHUB_JOB };
}

function persistPrivate(fd, value) {
  const bytes = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
  ftruncateSync(fd, 0); writeSync(fd, bytes, 0, bytes.length, 0); fsyncSync(fd);
}

export async function withOrdinaryArtifactRuntime({ repositoryRoot, manifestPath, manifest, environment, execute }) {
  assertNoCertificationContext(environment);
  if (environment.NODE_OPTIONS || environment.NODE_PATH) throw new Error("Ordinary owner rejects module-loading influence");
  if (Object.keys(environment).some((name) => /^ORDINARY_ARTIFACT_(CONTEXT_PATH|RUN_ID|BINDING_SHA256|RUNTIME)$/.test(name))) {
    throw new Error("Ordinary smoke requires a fresh source-owned run");
  }
  ordinaryServiceConfiguration(environment);
  const fixture = ordinaryFixtureProjection({ repositoryRoot, environment, manifest });
  const selected = ordinaryDatabaseTarget(environment, manifest);
  const target = await withOrdinaryDatabase(environment.DATABASE_URL, async (client) => {
    const observed = await observeOrdinaryDatabase(client);
    assertOrdinaryDatabaseObservation(observed, selected);
    return { ...selected, serverAddress: observed.host, databaseOid: observed.databaseOid, roleOid: observed.roleOid };
  });
  const runId = randomBytes(16).toString("hex");
  const root = mkdtempSync(path.join(realpathSync(environment.CI_AUTH_FIXTURE_SESSION_ROOT), "ordinary-runtime-"));
  const contextPath = path.join(root, "context.json");
  const receipt = { schema: "ordinary-artifact-role/v1", runId, target, outcome: "not-attempted", roleOid: null };
  const fd = openSync(path.join(root, "role.json"), "wx", 0o600);
  const persist = () => persistPrivate(fd, receipt);
  const sensitive = [...Object.values(environment), environment.DATABASE_URL];
  const failures = [];
  try {
    persist();
    const runtime = await createOrdinaryRuntimeRole({ adminUrl: environment.DATABASE_URL, target, runId,
      receipt, persist, rememberSecret: (value) => sensitive.push(value) });
    sensitive.push(runtime.runtimeUrl, runtime.password);
    const context = { identity: ordinaryRuntimeIdentity(manifest, runId), repositoryRoot: realpathSync(repositoryRoot),
      manifestSha256: digest(readFileSync(path.resolve(repositoryRoot, manifestPath))),
      sessionSha256: fixture.sessionSha256, target: runtime.runtimeTarget,
      runtimeUrlSha256: digest(runtime.runtimeUrl), ownerPid: process.pid };
    const bytes = `${JSON.stringify(context, null, 2)}\n`;
    writeFileSync(contextPath, bytes, { flag: "wx", mode: 0o600 });
    await execute({ ...ordinaryTestEnvironment(environment), ...fixture.projection, DATABASE_URL: runtime.runtimeUrl,
      ORDINARY_ARTIFACT_CONTEXT_PATH: contextPath, ORDINARY_ARTIFACT_RUN_ID: runId,
      ORDINARY_ARTIFACT_BINDING_SHA256: digest(bytes) },
      (value) => console.log(redactCertificationStageResultDiagnosticOutput(value, sensitive)));
  } catch (error) { failures.push(error); }
  finally {
    if (receipt.outcome !== "not-attempted" && receipt.outcome !== "collision-preserved") {
      try { await dropOrdinaryRuntimeRole({ adminUrl: environment.DATABASE_URL, target, receipt, persist }); }
      catch (error) { failures.push(new Error(`Ordinary cleanup: ${runtimeFailureText(error)}`)); }
    }
    finishOrdinaryRuntimeResult({ runId, receipt, failures, sensitive,
      close: () => closeSync(fd), retain: (result) => writeFileSync(path.join(root, "result.json"),
        `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }) });
  }
}

export function finishOrdinaryRuntimeResult({ runId, receipt, failures, sensitive, close, retain }) {
  try { close(); } catch (error) { failures.push(new Error(`Ordinary receipt close: ${runtimeFailureText(error)}`)); }
  const diagnostic = () => redactCertificationStageResultDiagnosticOutput(
    failures.map((error, index) => `${index + 1}. ${runtimeFailureText(error)}`).join("\n"), sensitive);
  const result = { runId, classification: "ORDINARY_CI_NOT_CERTIFICATION", passed: failures.length === 0,
    diagnostic: diagnostic(), cleanup: receipt.cleanup ?? null };
  try { retain(result); } catch (error) { failures.push(new Error(`Ordinary result retention: ${runtimeFailureText(error)}`)); }
  if (failures.length) throw new Error(diagnostic());
  return result;
}

function validateRetainedOrdinaryTarget(target, environment, manifest, inspectService) {
  if (![target?.databaseOid, target?.roleOid].every((oid) => Number.isSafeInteger(oid) && oid > 0)) {
    throw new Error("Ordinary capability requires acknowledged positive database and role OIDs");
  }
  if (target.resourceOwner === "github-stable-service") {
    if (target.database !== "interior_ai_test" || !/^\d+-\d+$/.test(target.githubRun ?? "") ||
        target.githubRepository !== "justuslaw66-max/interior-ai" || target.githubJob !== "stable-checks" ||
        manifest.candidateIdentifier !== `github-${target.githubRun}` ||
        environment.CI !== "true" || environment.GITHUB_ACTIONS !== "true" ||
        environment.CI_AUTH_FIXTURE_SESSION_ID !== `${target.githubRun}-stable-auth-session` ||
        environment.CI_AUTH_FIXTURE_SESSION_NONCE !== `${target.githubRun}-stable-auth-nonce`) {
      throw new Error("Ordinary capability has a foreign hosted service/run owner");
    }
    const inspected = inspectService({ ...environment,
      ORDINARY_ARTIFACT_POSTGRES_SERVICE_ID: target.serviceContainerId });
    if (JSON.stringify(inspected.serverAddresses) !== JSON.stringify(target.serverAddresses) ||
        !inspected.serverAddresses.includes(target.serverAddress)) {
      throw new Error("Ordinary capability's declared service network binding changed");
    }
    return;
  }
  if (target.resourceOwner !== "window-local-receipt") throw new Error("Ordinary capability has no isolated resource owner");
  const receipt = privateJson(target.creationReceiptPath);
  if (digest(readFileSync(target.creationReceiptPath)) !== target.creationReceiptSha256 ||
      receipt.schema !== "window-opening-database-creation/v1" || receipt.created !== true || receipt.outcome !== "created" ||
      !target.ownerId || receipt.ownerId !== target.ownerId || receipt.databaseOid !== target.databaseOid ||
      receipt.databaseName !== target.database || !/^interior_ai_window_opening_evidence_test_[a-z0-9_]+$/.test(target.database) ||
      target.database.length > 63 || target.serverAddress !== "127.0.0.1" || receipt.host !== "127.0.0.1" || receipt.port !== 5432 || receipt.role !== "justus") {
    throw new Error("Ordinary capability has a foreign WINDOW database creation receipt");
  }
}

export async function consumeOrdinaryArtifactRuntime({ repositoryRoot, manifestPath, manifest, environment, ClientClass,
  inspectService = inspectOrdinaryPostgresService }) {
  const fixture = ordinaryFixtureProjection({ repositoryRoot, environment, manifest });
  const context = privateJson(environment.ORDINARY_ARTIFACT_CONTEXT_PATH);
  validateRetainedOrdinaryTarget(context.target, environment, manifest, inspectService);
  const root = path.dirname(environment.ORDINARY_ARTIFACT_CONTEXT_PATH);
  const receipt = privateJson(path.join(root, "role.json"));
  if (receipt.schema !== "ordinary-artifact-role/v1" || receipt.runId !== context.identity?.runId ||
      receipt.outcome !== "created" || receipt.cleanup ||
      ![receipt.roleOid, receipt.target?.databaseOid].every((oid) => Number.isSafeInteger(oid) && oid > 0) ||
      receipt.role !== `interior_ai_ordinary_stage_${receipt.runId}` ||
      receipt.role !== context.target?.role || receipt.roleOid !== context.target?.roleOid ||
      ["database", "databaseOid", "serverAddress", "serverAddresses", "resourceOwner", "serviceContainerId",
        "githubRun", "githubRepository", "githubJob", "creationReceiptPath", "creationReceiptSha256", "ownerId"]
        .some((name) => JSON.stringify(receipt.target?.[name]) !== JSON.stringify(context.target?.[name]))) {
    throw new Error("Ordinary capability lacks its run's acknowledged role/catalog ownership");
  }
  if (!root.startsWith(`${realpathSync(environment.CI_AUTH_FIXTURE_SESSION_ROOT)}${path.sep}`) ||
      (lstatSync(root).mode & 0o077) !== 0 ||
      lstatSync(path.join(root, "result.json"), { throwIfNoEntry: false }) ||
      digest(readFileSync(environment.ORDINARY_ARTIFACT_CONTEXT_PATH)) !== environment.ORDINARY_ARTIFACT_BINDING_SHA256 ||
      context.repositoryRoot !== realpathSync(repositoryRoot) ||
      context.manifestSha256 !== digest(readFileSync(path.resolve(repositoryRoot, manifestPath))) ||
      context.sessionSha256 !== fixture.sessionSha256 || context.runtimeUrlSha256 !== digest(environment.DATABASE_URL) ||
      JSON.stringify(context.identity) !== JSON.stringify(ordinaryRuntimeIdentity(manifest, environment.ORDINARY_ARTIFACT_RUN_ID)) ||
      !Number.isSafeInteger(context.ownerPid) || context.ownerPid <= 0 || context.ownerPid === process.pid) {
    throw new Error("Ordinary runtime capability is foreign, altered, or finalized");
  }
  process.kill(context.ownerPid, 0);
  await withOrdinaryDatabase(environment.DATABASE_URL, async (client) => {
    assertOrdinaryDatabaseObservation(await observeOrdinaryDatabase(client), context.target, { runtime: true });
  }, ClientClass);
  return projectOrdinaryArtifactEnvironment({ environment, manifest, fixture: fixture.projection });
}

function ordinaryTestEnvironment(environment) {
  const names = ["PATH", "HOME", "TMPDIR", "SystemRoot", "AUTH_SECRET", "NEXTAUTH_SECRET",
    "CI_AUTH_FIXTURE_SESSION_ROOT", "CI", "GITHUB_ACTIONS", "NPM_CONFIG_CACHE", "npm_config_cache",
    "npm_config_offline", "PLAYWRIGHT_BROWSERS_PATH", "PLAYWRIGHT_EXTERNAL_EVIDENCE_ROOT",
    "RUNTIME_SMOKE_PHASE_TIMINGS_PATH", "NEXT_TELEMETRY_DISABLED"];
  return { ...ordinaryServiceConfiguration(environment), ...Object.fromEntries(names.filter((name) => environment[name] !== undefined)
    .map((name) => [name, environment[name]])) };
}

export function projectOrdinaryArtifactEnvironment({ environment, manifest, fixture }) {
  assertNoCertificationContext(environment);
  const selected = Object.fromEntries(["PATH", "HOME", "TMPDIR", "SystemRoot", "AUTH_SECRET", "NEXTAUTH_SECRET"]
    .filter((name) => environment[name] !== undefined).map((name) => [name, environment[name]]));
  return { ...selected, ...ordinaryServiceConfiguration(environment), ...fixture, CI: "true", NODE_ENV: "production", APP_ENV: "staging",
    NEXT_PUBLIC_APP_ENV: "staging", VERCEL_ENV: "preview", CATALOG_STRICT_VALIDATION: "true",
    DATABASE_URL: environment.DATABASE_URL, NEXTAUTH_URL: "http://127.0.0.1:3000", APP_ORIGIN: "http://127.0.0.1:3000",
    AUTH_TRUST_HOST: "true", ADMIN_EMAILS: "gate-a3-admin@example.test", NEXT_TELEMETRY_DISABLED: "1",
    PRODUCTION_ARTIFACT_EVIDENCE: "1", PRODUCTION_ARTIFACT_BUILD_ID: manifest.build.nextBuildId,
    PRODUCTION_ARTIFACT_SHA256: manifest.artifact.sha256, PRODUCTION_ARTIFACT_COMMIT_SHA: manifest.source.commitSha,
    PRODUCTION_EVIDENCE_CANDIDATE_ID: manifest.candidateIdentifier, PRODUCTION_EVIDENCE_EXPECTED_TREE_SHA: manifest.source.treeSha,
    ORDINARY_ARTIFACT_RUNTIME: "1", ORDINARY_ARTIFACT_RUN_ID: environment.ORDINARY_ARTIFACT_RUN_ID,
    ORDINARY_ARTIFACT_BINDING_SHA256: environment.ORDINARY_ARTIFACT_BINDING_SHA256 };
}
