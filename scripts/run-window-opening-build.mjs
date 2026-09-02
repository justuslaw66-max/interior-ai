import { createHash, randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";
import {
  physicalFileRecord,
  redactCommandEvidence,
  spawnCapture,
} from "./window-opening-evidence-command.mjs";
import { buildWindowOpeningChildEnvironment } from "./window-opening-child-environment.mjs";
import {
  assertSourceIdentityEquals,
  collectWorkingTreeIdentity,
} from "./window-opening-evidence-manifest.mjs";
import {
  assertIgnoredBuildOutputObservation,
  collectIgnoredStateInventory,
  createIgnoredBuildOutputObservation,
} from "./window-opening-ignored-build-outputs.mjs";

const repositoryRoot = process.cwd();
const startedAt = new Date();
const runId = `${startedAt.toISOString().replace(/[-:.]/g, "")}-${randomUUID()}`;
const runParent = process.env.WINDOW_OPENING_BUILD_PARENT
  ? path.resolve(process.env.WINDOW_OPENING_BUILD_PARENT)
  : "/private/tmp";
await fs.mkdir(runParent, { recursive: true });
const runRoot = await fs.mkdtemp(path.join(runParent, "window-opening-build-"));
const databaseName = `interior_ai_window_opening_evidence_test_build_${runId
  .toLowerCase().replace(/[^a-z0-9]/g, "").slice(-16)}`;
const databaseUrl = `postgresql://justus@127.0.0.1:5432/${databaseName}`;
const adminUrl = "postgresql://justus@127.0.0.1:5432/postgres";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const result = {
  schemaVersion: "window-opening-isolated-build/v3",
  classification: "development/lenient isolated feature validation",
  runId,
  runRoot,
  repositoryRoot,
  startedAt: startedAt.toISOString(),
  build: null,
  sourceState: {
    expectation: null,
    beforeBuild: null,
    afterBuild: null,
    taskSourceUnchanged: false,
    allowedIgnoredBuildOutputs: null,
  },
  childEnvironments: null,
  database: {
    host: "127.0.0.1",
    name: databaseName,
    provisioned: false,
    provision: null,
    dropped: false,
    preBuild: null,
    postBuild: null,
  },
  status: "running",
  failure: null,
};
let databaseMayExist = false;

async function runLogged(command, args, environmentContract, prefix) {
  const started = new Date();
  const startedNs = process.hrtime.bigint();
  const execution = await spawnCapture(command, args, {
    cwd: repositoryRoot,
    env: environmentContract.environment,
  });
  const redacted = redactCommandEvidence({
    argv: [command, ...args],
    stdout: execution.stdout,
    stderr: execution.stderr,
    environment: environmentContract.environment,
  });
  const stdoutPath = path.join(runRoot, `${prefix}.stdout.log`);
  const stderrPath = path.join(runRoot, `${prefix}.stderr.log`);
  await Promise.all([
    fs.writeFile(stdoutPath, redacted.stdout, { flag: "wx", mode: 0o644 }),
    fs.writeFile(stderrPath, redacted.stderr, { flag: "wx", mode: 0o644 }),
  ]);
  const record = {
    argv: redacted.argv,
    workingDirectory: repositoryRoot,
    startedAt: started.toISOString(),
    endedAt: new Date().toISOString(),
    durationMs: Number(process.hrtime.bigint() - startedNs) / 1e6,
    exitCode: execution.code,
    signal: execution.signal,
    environment: environmentContract.records,
    environmentNames: environmentContract.names,
    stdout: await physicalFileRecord(stdoutPath, runRoot),
    stderr: await physicalFileRecord(stderrPath, runRoot),
  };
  if (execution.code !== 0) {
    throw Object.assign(new Error(
      `${prefix} failed with exit ${execution.code}${execution.signal ? ` (${execution.signal})` : ""}.`
    ), { commandRecord: record });
  }
  return record;
}

async function databaseFingerprint() {
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    const tableResult = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
    );
    const columns = await client.query(
      "SELECT table_name,column_name,data_type,is_nullable,ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position"
    );
    const indexes = await client.query(
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname"
    );
    const tables = [];
    for (const { table_name: tableName } of tableResult.rows) {
      const rows = await client.query(
        `SELECT to_jsonb(source_row)::text AS row_json FROM ${quoteIdentifier(tableName)} AS source_row ORDER BY 1`
      );
      tables.push({
        name: tableName,
        rowCount: rows.rowCount,
        dataSha256: hash(JSON.stringify(rows.rows.map((entry) => entry.row_json))),
      });
    }
    return {
      capturedAt: new Date().toISOString(),
      schemaSha256: hash(JSON.stringify({ columns: columns.rows, indexes: indexes.rows })),
      tables,
      dataSha256: hash(JSON.stringify(tables)),
    };
  } finally {
    await client.end();
  }
}

async function dropDatabase() {
  const admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10_000 });
  await admin.connect();
  try {
    await admin.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [databaseName]
    );
    await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`);
  } finally {
    await admin.end();
  }
  result.database.dropped = true;
}

async function writeResult() {
  const resultPath = path.join(runRoot, "result.json");
  const payload = { ...result, endedAt: new Date().toISOString() };
  await fs.writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`, {
    flag: "wx", mode: 0o644,
  });
  const bytes = await fs.readFile(resultPath);
  await fs.writeFile(`${resultPath}.sha256`, `${hash(bytes)}\n`, {
    flag: "wx", mode: 0o644,
  });
}

async function expectedSourceIdentity() {
  const configuredPath = process.env.WINDOW_OPENING_EXPECTED_SOURCE_IDENTITY_PATH;
  if (configuredPath) {
    const identityPath = path.resolve(configuredPath);
    const identity = JSON.parse(await fs.readFile(identityPath, "utf8"));
    return { kind: "external-frozen-identity", identityPath, identity };
  }
  return {
    kind: "runner-pre-build-freeze",
    identityPath: null,
    identity: await collectWorkingTreeIdentity(repositoryRoot),
  };
}

try {
  result.sourceState.expectation = await expectedSourceIdentity();
  const initialIdentity = await collectWorkingTreeIdentity(repositoryRoot);
  assertSourceIdentityEquals(initialIdentity, result.sourceState.expectation.identity,
    "Build runner initial source identity");
  const authSecret = randomBytes(48).toString("base64url");
  const fixtureNonce = randomBytes(16).toString("hex");
  const isolatedEnvironment = buildWindowOpeningChildEnvironment({
    hostEnvironment: process.env,
    values: {
      DATABASE_URL: { value: databaseUrl, classification: "secret", generated: true,
        reason: "unique localhost disposable build database" },
      AUTH_SECRET: { value: authSecret, classification: "secret", generated: true,
        reason: "isolated auth fixture" },
      NEXTAUTH_SECRET: { value: authSecret, classification: "secret", generated: true,
        reason: "isolated auth fixture" },
      GOOGLE_CLIENT_ID: { value: `123456789-gate-a3-ci-${fixtureNonce}.apps.googleusercontent.com`,
        classification: "secret", generated: true, reason: "inert local auth fixture" },
      GOOGLE_CLIENT_SECRET: { value: `GOCSPX-gate-a3-ci-${fixtureNonce}`,
        classification: "secret", generated: true, reason: "inert local auth fixture" },
      CI_AUTH_FIXTURE_ACTIVE: { value: "1", reason: "enable inert local auth fixture" },
      CI_AUTH_FIXTURE_LOCAL_TEST: { value: "1", reason: "restrict fixture to localhost" },
      APP_ENV: { value: "development", reason: "development build classification" },
      NEXT_PUBLIC_APP_ENV: { value: "development", reason: "development UI classification" },
      NEXT_TELEMETRY_DISABLED: { value: "1", reason: "disable framework telemetry" },
      APP_ORIGIN: { value: "http://127.0.0.1:39999", reason: "inert build origin" },
      AUTH_URL: { value: "http://127.0.0.1:39999", reason: "inert build auth origin" },
      NEXTAUTH_URL: { value: "http://127.0.0.1:39999", reason: "inert build auth origin" },
    },
  });
  const provisionEnvironment = buildWindowOpeningChildEnvironment({
    hostEnvironment: process.env,
    values: {
      GATE_A3_DATABASE_URL: { value: databaseUrl, classification: "secret", generated: true,
        reason: "unique localhost disposable build database" },
    },
  });
  result.childEnvironments = {
    databaseProvision: provisionEnvironment.records,
    build: isolatedEnvironment.records,
  };
  databaseMayExist = true;
  result.database.provision = await runLogged(
    process.execPath,
    ["scripts/provision-gate-a3-database.mjs"],
    provisionEnvironment,
    "database-provision"
  );
  result.database.provisioned = true;
  result.database.preBuild = await databaseFingerprint();
  result.sourceState.beforeBuild = await collectWorkingTreeIdentity(repositoryRoot);
  assertSourceIdentityEquals(
    result.sourceState.beforeBuild,
    result.sourceState.expectation.identity,
    "Build pre-build source identity"
  );
  const ignoredBefore = await collectIgnoredStateInventory(repositoryRoot);
  try {
    result.build = await runLogged("npm", ["run", "build"], isolatedEnvironment, "build");
  } catch (cause) {
    result.build = cause?.commandRecord ?? null;
    throw cause;
  } finally {
    result.sourceState.afterBuild = await collectWorkingTreeIdentity(repositoryRoot);
    const ignoredAfter = await collectIgnoredStateInventory(repositoryRoot);
    result.sourceState.allowedIgnoredBuildOutputs = createIgnoredBuildOutputObservation(
      ignoredBefore, ignoredAfter
    );
    assertSourceIdentityEquals(
      result.sourceState.afterBuild,
      result.sourceState.beforeBuild,
      "Build post-build source identity"
    );
    result.sourceState.taskSourceUnchanged = true;
    assertIgnoredBuildOutputObservation(result.sourceState.allowedIgnoredBuildOutputs);
  }
  result.database.postBuild = await databaseFingerprint();
  const pre = result.database.preBuild;
  const post = result.database.postBuild;
  if (pre.schemaSha256 !== post.schemaSha256 || pre.dataSha256 !== post.dataSha256) {
    throw new Error("Build changed the isolated database schema or data fingerprint.");
  }
  await dropDatabase();
  result.status = "passed";
} catch (cause) {
  result.status = "failed";
  result.failure = cause instanceof Error ? cause.message : String(cause);
  process.exitCode = 1;
} finally {
  if (databaseMayExist && !result.database.dropped) {
    try { await dropDatabase(); } catch (cause) {
      result.status = "failed";
      result.failure ??= `Database teardown failed: ${cause instanceof Error ? cause.message : String(cause)}`;
      process.exitCode = 1;
    }
  }
  await writeResult();
  console.log(JSON.stringify({
    runRoot,
    runId,
    status: result.status,
    failure: result.failure,
  }, null, 2));
}
