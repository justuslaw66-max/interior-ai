import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { finished } from "node:stream/promises";
import { Client } from "pg";
import { dropOwnedWindowOpeningDatabase } from "./provision-gate-a3-database.mjs";
import { buildWindowOpeningChildEnvironment } from "./window-opening-child-environment.mjs";
import { collectWorkingTreeIdentity } from "./window-opening-evidence-manifest.mjs";
import { verifyWindowOpeningMountedReport } from "./window-opening-mounted-test-contract.mjs";
import {
  assertPortHasNoListener,
  processExists,
  resolveOwnedPortListener,
} from "./window-opening-process-ownership.mjs";

const repositoryRoot = process.cwd();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const startedAt = new Date();
const runId = `${startedAt.toISOString().replace(/[-:.]/g, "")}-${randomUUID()}`;
const runParent = process.env.WINDOW_OPENING_MOUNTED_PARENT
  ? path.resolve(process.env.WINDOW_OPENING_MOUNTED_PARENT)
  : "/private/tmp";
await fs.mkdir(runParent, { recursive: true });
const runRoot = await fs.mkdtemp(path.join(runParent, "window-opening-mounted-"));
const evidenceRoot = process.env.WINDOW_OPENING_EVIDENCE_ROOT
  ? path.resolve(process.env.WINDOW_OPENING_EVIDENCE_ROOT) : runRoot;
const runRelativeToEvidence = path.relative(evidenceRoot, runRoot);
if (runRelativeToEvidence.startsWith("..") || path.isAbsolute(runRelativeToEvidence)) {
  throw new Error("Mounted run root must be inside WINDOW_OPENING_EVIDENCE_ROOT.");
}
const databaseName = `interior_ai_window_opening_evidence_test_${runId
  .toLowerCase().replace(/[^a-z0-9]/g, "").slice(-20)}`;
const databaseUrl = `postgresql://justus@127.0.0.1:5432/${databaseName}`;
const databaseReceiptPath = path.join(runRoot, "database-created.json");
const authSecret = randomBytes(48).toString("base64url");
const authFixtureNonce = randomBytes(16).toString("hex");
const result = {
  schemaVersion: "window-opening-mounted-run/v2",
  runId,
  runRoot,
  evidenceRoot,
  repositoryRoot,
  startedAt: startedAt.toISOString(),
  port: null,
  server: null,
  sourceIdentity: null,
  childEnvironments: null,
  suite: null,
  runtimeEvents: null,
  database: { host: "127.0.0.1", name: databaseName, provisioned: false, dropped: false },
  analytics: null,
  browser: null,
  status: "running",
  failure: null,
};
let server = null;
let serverExit = null;
let databaseProvisionAttempted = false;
let listenerPid = null;
let launcherPid = null;

function spawnLogged(command, args, options, prefix) {
  const stdoutPath = path.join(runRoot, `${prefix}.stdout.log`);
  const stderrPath = path.join(runRoot, `${prefix}.stderr.log`);
  const stdout = createWriteStream(stdoutPath, { flags: "wx", mode: 0o644 });
  const stderr = createWriteStream(stderrPath, { flags: "wx", mode: 0o644 });
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    detached: options.detached === true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.pipe(stdout);
  child.stderr.pipe(stderr);
  const completed = new Promise((resolve, reject) => child.once("close", (code, signal) => {
    Promise.all([finished(stdout), finished(stderr)]).then(() => resolve({
      code: code ?? (signal ? 1 : 0), signal: signal ?? null, stdoutPath, stderrPath,
    }), reject);
  }));
  return { child, completed, stdoutPath, stderrPath };
}

async function runLogged(command, args, options, prefix) {
  const execution = spawnLogged(command, args, options, prefix);
  const completed = await execution.completed;
  if (completed.code !== 0) {
    throw new Error(`${prefix} failed with exit ${completed.code}${completed.signal ? ` (${completed.signal})` : ""}.`);
  }
  return completed;
}

async function allocatePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (!address || typeof address === "string" || address.port === 3000) {
        probe.close(() => reject(new Error("Failed to allocate a non-3000 local port.")));
        return;
      }
      probe.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForReady(baseUrl) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (serverExit) throw new Error(`Application server exited before readiness (${serverExit.code}).`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { redirect: "manual" });
      if (response.ok) return;
    } catch {
      // The owned server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Application server readiness timed out.");
}

async function portIsOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => { socket.destroy(); resolve(false); });
  });
}

async function stopOwnedServer() {
  if (!server || !launcherPid) return;
  try { process.kill(-launcherPid, "SIGTERM"); } catch (cause) {
    if (cause?.code !== "ESRCH") throw cause;
  }
  const deadline = Date.now() + 15_000;
  while ((await portIsOpen(result.port) || (listenerPid && processExists(listenerPid))) &&
      Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (await portIsOpen(result.port) || (listenerPid && processExists(listenerPid))) {
    try { process.kill(-launcherPid, "SIGKILL"); } catch (cause) {
      if (cause?.code !== "ESRCH") throw cause;
    }
    const killDeadline = Date.now() + 5_000;
    while ((await portIsOpen(result.port) || (listenerPid && processExists(listenerPid))) &&
        Date.now() < killDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  if (await portIsOpen(result.port) || (listenerPid && processExists(listenerPid))) {
    throw new Error("The exact owned listener process did not terminate.");
  }
}

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

async function databaseFingerprint() {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const tablesResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    );
    const columns = await client.query(
      "SELECT table_name,column_name,data_type,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"
    );
    const tables = [];
    for (const { table_name: tableName } of tablesResult.rows) {
      const rows = await client.query(
        `SELECT to_jsonb(source_row)::text AS row_json FROM ${quoteIdentifier(tableName)} AS source_row ORDER BY 1`
      );
      tables.push({ name: tableName, rowCount: rows.rowCount,
        dataSha256: hash(JSON.stringify(rows.rows.map((entry) => entry.row_json))) });
    }
    return {
      capturedAt: new Date().toISOString(),
      schemaSha256: hash(JSON.stringify(columns.rows)),
      tables,
      tableCountsSha256: hash(JSON.stringify(tables)),
      dataSha256: hash(JSON.stringify(tables)),
    };
  } finally {
    await client.end();
  }
}

async function dropDatabase({ requireOwned = true } = {}) {
  const cleanup = await dropOwnedWindowOpeningDatabase({
    databaseUrl, receiptPath: databaseReceiptPath, ownerId: runId,
  });
  result.database.creationReceiptPath = databaseReceiptPath;
  result.database.cleanup = cleanup;
  result.database.dropped = cleanup.dropped === true;
  if (requireOwned && !cleanup.owned) throw new Error("Database creation ownership was not recorded.");
}

function tableDeltas(before, after) {
  const names = new Set([...before.tables, ...after.tables].map((entry) => entry.name));
  return [...names].sort().map((name) => ({
    name,
    before: before.tables.find((entry) => entry.name === name)?.rowCount ?? 0,
    after: after.tables.find((entry) => entry.name === name)?.rowCount ?? 0,
  })).map((entry) => ({ ...entry, delta: entry.after - entry.before }));
}

async function loadRuntimeEvidence(runtimeRoot) {
  const names = (await fs.readdir(runtimeRoot)).filter((name) => name.endsWith(".json")).sort();
  if (!names.length) throw new Error("Browser runtime-policy evidence is missing.");
  const records = await Promise.all(names.map(async (name) =>
    JSON.parse(await fs.readFile(path.join(runtimeRoot, name), "utf8"))));
  const categories = [
    "consoleError", "consoleWarning", "pageError", "requestFailure", "responseError",
  ];
  const sumCounts = (key) => Object.fromEntries(categories.map((category) => [
    category, records.reduce((total, record) => total + (record[key]?.[category] ?? 0), 0),
  ]));
  return {
    schemaVersion: "window-opening-runtime-policy/v1",
    policy: "zero-unallowlisted-events",
    sourceFiles: names,
    counts: sumCounts("counts"),
    allowlistedCounts: sumCounts("allowlistedCounts"),
    rejectedCounts: sumCounts("rejectedCounts"),
    allowlistPolicies: records[0].allowlistPolicies,
    allowlistedEvents: records.flatMap((record) => record.allowlistedEvents),
    rejectedEvents: records.flatMap((record) => record.rejectedEvents),
    tests: records.flatMap((record) => record.tests),
  };
}

async function writeResult() {
  const resultPath = path.join(runRoot, "result.json");
  const payload = { ...result, endedAt: new Date().toISOString() };
  await fs.writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`, { flag: "wx", mode: 0o644 });
  const bytes = await fs.readFile(resultPath);
  await fs.writeFile(`${resultPath}.sha256`, `${hash(bytes)}\n`, { flag: "wx", mode: 0o644 });
}

try {
  if (process.argv.length !== 2) {
    throw new Error("The sealable mounted runner does not accept test or filter arguments.");
  }
  if (Object.hasOwn(process.env, "WINDOW_OPENING_PLAYWRIGHT_GREP")) {
    throw new Error("WINDOW_OPENING_PLAYWRIGHT_GREP is forbidden for a sealable mounted run.");
  }
  result.sourceIdentity = await collectWorkingTreeIdentity(repositoryRoot);
  const port = await allocatePort();
  result.port = port;
  await assertPortHasNoListener(port);
  const baseUrl = `http://127.0.0.1:${port}`;
  const provisionEnvironment = buildWindowOpeningChildEnvironment({
    hostEnvironment: process.env,
    values: {
      GATE_A3_DATABASE_URL: {
        value: databaseUrl, classification: "secret", generated: true,
        reason: "unique localhost disposable database",
      },
    },
  });
  databaseProvisionAttempted = true;
  await runLogged(process.execPath, ["scripts/provision-gate-a3-database.mjs", "--create-owned-window", databaseReceiptPath, runId], {
    cwd: repositoryRoot,
    env: provisionEnvironment.environment,
  }, "database-provision");
  result.database.provisioned = true;
  result.database.preBrowser = await databaseFingerprint();

  const serverEnvironment = buildWindowOpeningChildEnvironment({
    hostEnvironment: process.env,
    values: {
      DATABASE_URL: { value: databaseUrl, classification: "secret", generated: true,
        reason: "unique localhost disposable database" },
      AUTH_SECRET: { value: authSecret, classification: "secret", generated: true,
        reason: "isolated auth fixture" },
      NEXTAUTH_SECRET: { value: authSecret, classification: "secret", generated: true,
        reason: "isolated auth fixture" },
      APP_ENV: { value: "development", reason: "development server classification" },
      NEXT_PUBLIC_APP_ENV: { value: "development", reason: "development UI classification" },
      NEXT_PUBLIC_ENABLE_QA_HOOKS: { value: "1", reason: "capture-only QA state" },
      NEXT_TELEMETRY_DISABLED: { value: "1", reason: "disable framework telemetry" },
      GOOGLE_CLIENT_ID: { value: `123456789-gate-a3-ci-${authFixtureNonce}.apps.googleusercontent.com`,
        classification: "secret", generated: true, reason: "inert local auth fixture" },
      GOOGLE_CLIENT_SECRET: { value: `GOCSPX-gate-a3-ci-${authFixtureNonce}`,
        classification: "secret", generated: true, reason: "inert local auth fixture" },
      CI_AUTH_FIXTURE_ACTIVE: { value: "1", reason: "enable inert local auth fixture" },
      CI_AUTH_FIXTURE_LOCAL_TEST: { value: "1", reason: "restrict fixture to localhost" },
      APP_ORIGIN: { value: baseUrl, generated: true, reason: "dedicated run origin" },
      AUTH_URL: { value: baseUrl, generated: true, reason: "dedicated run auth origin" },
      NEXTAUTH_URL: { value: baseUrl, generated: true, reason: "dedicated run auth origin" },
    },
  });
  const serverExecution = spawnLogged(
    path.join(repositoryRoot, "node_modules/.bin/next"),
    ["dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)],
    { cwd: repositoryRoot, env: serverEnvironment.environment, detached: true },
    "server"
  );
  server = serverExecution.child;
  launcherPid = server.pid;
  serverExecution.completed.then((value) => { serverExit = value; });
  result.server = { launcherPid, listenerPid: null, baseUrl,
    startedAt: new Date().toISOString(), stdoutPath: serverExecution.stdoutPath,
    stderrPath: serverExecution.stderrPath };
  await waitForReady(baseUrl);
  const ownership = await resolveOwnedPortListener({
    port, launcherPid, repositoryRoot,
  });
  listenerPid = ownership.listenerPid;
  const readyAt = new Date().toISOString();
  result.server = { ...result.server, ...ownership, readyAt };
  const serverContextPath = path.join(runRoot, "server-context.json");
  await fs.writeFile(serverContextPath, `${JSON.stringify({
    schemaVersion: "window-opening-server-context/v1",
    runId,
    runRoot,
    evidenceRoot,
    repositoryRoot,
    port,
    baseUrl,
    sourceCompleteStateIdentitySha256: result.sourceIdentity.completeStateIdentitySha256,
    launcherPid,
    listenerPid,
    serverCwd: ownership.listenerCwd,
    serverExecutable: ownership.listenerExecutable,
    readyAt,
  }, null, 2)}\n`, { flag: "wx", mode: 0o644 });

  const browserStartedAt = new Date();
  const browserArgs = ["test", "--config=playwright.window-opening.config.ts"];
  const browserEnvironment = buildWindowOpeningChildEnvironment({
    hostEnvironment: process.env,
    values: {
      CI: { value: "1", reason: "deterministic Playwright execution" },
      WINDOW_OPENING_BASE_URL: { value: baseUrl, generated: true, reason: "dedicated server" },
      WINDOW_OPENING_RUN_ROOT: { value: runRoot, generated: true, reason: "immutable run artifacts" },
      WINDOW_OPENING_EVIDENCE_ROOT: { value: evidenceRoot, generated: true,
        reason: "final evidence-relative capture paths" },
      WINDOW_OPENING_SCREENSHOT_DIR: { value: path.join(runRoot, "screenshots"),
        generated: true, reason: "capture output" },
      WINDOW_OPENING_NETWORK_EVIDENCE_PATH: { value: path.join(runRoot, "analytics-interceptions"),
        generated: true, reason: "analytics interception evidence" },
      WINDOW_OPENING_RUNTIME_EVIDENCE_PATH: { value: path.join(runRoot, "runtime-events"),
        generated: true, reason: "browser runtime policy evidence" },
      WINDOW_OPENING_SERVER_CONTEXT_PATH: { value: serverContextPath,
        generated: true, reason: "capture-time server ownership contract" },
      WINDOW_OPENING_SOURCE_IDENTITY: {
        value: result.sourceIdentity.completeStateIdentitySha256,
        generated: true, reason: "frozen source binding",
      },
    },
  });
  result.childEnvironments = {
    databaseProvision: provisionEnvironment.records,
    server: serverEnvironment.records,
    browser: browserEnvironment.records,
  };
  const browserExecution = await runLogged(
    path.join(repositoryRoot, "node_modules/.bin/playwright"),
    browserArgs,
    {
      cwd: repositoryRoot,
      env: browserEnvironment.environment,
    },
    "browser"
  );
  result.browser = { startedAt: browserStartedAt.toISOString(), endedAt: new Date().toISOString(),
    argv: ["node_modules/.bin/playwright", ...browserArgs],
    ...browserExecution };
  const report = JSON.parse(await fs.readFile(path.join(runRoot, "playwright-report.json"), "utf8"));
  result.suite = await verifyWindowOpeningMountedReport(report, {
    sealable: true, filters: [],
  });
  const runtimeEventsPath = path.join(runRoot, "runtime-events");
  result.runtimeEvents = await loadRuntimeEvidence(runtimeEventsPath);
  if (result.runtimeEvents.rejectedEvents.length !== 0 ||
      Object.values(result.runtimeEvents.rejectedCounts).some((count) => count !== 0) ||
      new Set(result.runtimeEvents.tests.map((entry) => entry.id)).size !== 12) {
    throw new Error("Mounted browser runtime policy recorded rejected events.");
  }
  await stopOwnedServer();
  result.server.endedAt = new Date().toISOString();
  result.server.exitCode = serverExit?.code ?? null;
  result.server.signal = serverExit?.signal ?? "SIGTERM";
  const stopDeadline = Date.now() + 10_000;
  while (await portIsOpen(port)) {
    if (Date.now() >= stopDeadline) throw new Error("Owned application port remained open after teardown.");
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  result.server.portStopped = true;
  result.server.listenerStopped = !processExists(listenerPid);

  result.database.postBrowser = await databaseFingerprint();
  result.database.tableDeltas = tableDeltas(
    result.database.preBrowser, result.database.postBrowser
  );
  if (result.database.preBrowser.schemaSha256 !== result.database.postBrowser.schemaSha256 ||
      result.database.preBrowser.dataSha256 !== result.database.postBrowser.dataSha256 ||
      result.database.tableDeltas.some((entry) => entry.delta !== 0)) {
    throw new Error("Mounted browser run changed the isolated database.");
  }
  const analyticsPath = path.join(runRoot, "analytics-interceptions");
  const analyticsFiles = (await fs.readdir(analyticsPath))
    .filter((name) => name.endsWith(".json")).sort();
  const analytics = (await Promise.all(analyticsFiles.map(async (name) =>
    JSON.parse(await fs.readFile(path.join(analyticsPath, name), "utf8"))))).flat();
  if (!analyticsFiles.length || !Array.isArray(analytics) || analytics.length === 0) {
    throw new Error("Analytics interception evidence is missing.");
  }
  result.analytics = { method: "playwright-route-interception", requestCount: analytics.length,
    evidencePath: analyticsPath, appEventRowDelta: 0 };
  await dropDatabase();
  result.status = "passed";
} catch (cause) {
  result.status = "failed";
  result.failure = cause instanceof Error ? cause.message : String(cause);
  process.exitCode = 1;
} finally {
  try { await stopOwnedServer(); } catch (cause) {
    result.status = "failed";
    result.failure ??= cause instanceof Error ? cause.message : String(cause);
    process.exitCode = 1;
  }
  if (result.port && await portIsOpen(result.port)) {
    result.status = "failed";
    result.failure ??= "The owned application port is still open.";
    process.exitCode = 1;
  }
  if (databaseProvisionAttempted && !result.database.dropped) {
    try { await dropDatabase({ requireOwned: false }); } catch (cause) {
      result.status = "failed";
      result.database.cleanupFailure = {
        resources: [databaseName], receiptPath: databaseReceiptPath,
        reason: cause instanceof Error ? cause.message : String(cause),
      };
      result.failure ??= `Database teardown failed: ${result.database.cleanupFailure.reason}`;
      process.exitCode = 1;
    }
  }
  await writeResult();
  console.log(JSON.stringify({ runRoot, runId, status: result.status, failure: result.failure,
    databaseCleanup: result.database.cleanup,
    databaseCleanupFailure: result.database.cleanupFailure }, null, 2));
}
