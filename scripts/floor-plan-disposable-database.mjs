import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";

assert.deepEqual(process.argv.slice(2), ["--run-approved-batch"]);
const target = "interior_ai_fpd_fast_feature_test_20260911";
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.cwd(), root);
for (const name of [".env", ".env.local"]) assert.equal(existsSync(path.join(root, name)), false, "Private env loading is not authorized");
const role = os.userInfo().username;
assert.equal(role, "justus");
const evidenceRoot = path.join(root, "test-results/fpd-fast-feature/database-closeout");
mkdirSync(evidenceRoot, { recursive: true });
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = path.join(evidenceRoot, `${runId}.json`);
const marker = `fpd-fast-feature:${runId}`;
const cleanEnv = Object.fromEntries(["PATH", "TMPDIR", "LANG"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const report = { runId, sourceHead: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
  target: { host: "127.0.0.1", port: 5432, database: target, role }, phases: [], cleanup: "NOT_CREATED" };
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
report.testSources = Object.fromEntries(["scripts/floor-plan-disposable-database.mjs", "tests/database/floor-plan-directory.ts", "lib/floor-plan-catalog-prisma.ts", "package-lock.json"]
  .map((file) => [file, sha(readFileSync(path.join(root, file)))]));
const save = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
const sanitize = (text) => String(text).replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[connection redacted]");
const admin = new Client({ host: "127.0.0.1", port: 5432, database: "postgres", user: role,
  password: async () => { throw new Error("CREDENTIAL_REQUIRED_NO_LOOKUP"); }, connectionTimeoutMillis: 5000 });
let created = false;
let connected = false;
let identity;
async function databaseIdentity() {
  const r = await admin.query("SELECT oid::int AS oid, pg_get_userbyid(datdba) AS owner, shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [target]);
  return r.rows[0] ?? null;
}
function run(label, command, args, env) {
  const r = spawnSync(command, args, { cwd: root, env, encoding: "utf8", timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  const output = sanitize((r.stdout ?? "") + (r.stderr ?? ""));
  writeFileSync(path.join(evidenceRoot, `${runId}-${label}.log`), output, { flag: "wx" });
  report.phases.push({ label, command, args, exitCode: r.status, signal: r.signal, error: r.error?.code, outputSha256: sha(output) });
  save(); assert.equal(r.status, 0, `${label} failed; inspect sanitized retained log`);
}
try {
  await admin.connect(); connected = true;
  const endpoint = await admin.query("SELECT current_database() AS database, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port");
  assert.deepEqual(endpoint.rows[0], { database: "postgres", role, host: "127.0.0.1", port: 5432 });
  assert.equal(await databaseIdentity(), null, "Target already exists: no reuse or substitution authorized");
  await admin.query(`CREATE DATABASE "${target}"`); created = true;
  identity = await databaseIdentity(); assert.equal(identity.owner, role);
  await admin.query(`COMMENT ON DATABASE "${target}" IS '${marker}'`);
  identity = await databaseIdentity(); assert.equal(identity.marker, marker);
  report.identity = identity; report.phases.push({ label: "exclusive-create", passed: true }); save();
  const url = new URL(`postgresql://127.0.0.1:5432/${target}`); url.username = role;
  // Construct every child's target explicitly; no ambient DATABASE_URL, PG*, HOME or provider credentials survive.
  const env = { ...cleanEnv, APP_ENV: "development", NEXT_TELEMETRY_DISABLED: "1", DATABASE_URL: url.toString(),
    FPD_APPROVED_DISPOSABLE_DATABASE: target, FPD_DATABASE_OID: String(identity.oid), PGPASSFILE: "/dev/null" };
  run("migrate", "node_modules/.bin/prisma", ["migrate", "deploy"], env);
  const verification = new Client({ connectionString: url.toString(), password: async () => { throw new Error("CREDENTIAL_REQUIRED_NO_LOOKUP"); } });
  try {
    await verification.connect();
    const state = await verification.query('SELECT COUNT(*)::int AS completed FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    report.phases.push({ label: "migration-count", ...state.rows[0] }); save();
  } finally { await verification.end(); }
  run("feature-tests", "node_modules/.bin/ts-node", ["--transpile-only", "--compiler-options", '{"module":"CommonJS","moduleResolution":"node","jsx":"react-jsx"}',
    "-r", "tsconfig-paths/register", "tests/database/floor-plan-directory.ts"], env);
  report.passed = true;
} catch (error) {
  report.passed = false; report.failure = sanitize(error instanceof Error ? error.message : error); process.exitCode = 1;
} finally {
  if (created) {
    try {
      assert.ok(identity, "Creation identity unavailable; preserve target");
      assert.deepEqual(await databaseIdentity(), identity, "Target identity changed; preserve target");
      // The child has exited; allow PostgreSQL a bounded interval to observe socket closure.
      await new Promise((resolve) => setTimeout(resolve, 500));
      const active = await admin.query("SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datid=$1", [identity.oid]);
      assert.equal(active.rows[0].count, 0, "Active sessions: preserve database; never terminate unrelated sessions");
      await admin.query(`DROP DATABASE "${target}"`);
      assert.equal(await databaseIdentity(), null); report.cleanup = "DROPPED_AND_ABSENCE_VERIFIED";
    } catch (error) {
      report.cleanup = "PRESERVED_REQUIRES_ATTENTION"; report.cleanupFailure = sanitize(error.message); process.exitCode = 1;
    }
  }
  if (connected) await admin.end(); save();
  console.log(JSON.stringify({ reportPath, passed: report.passed, cleanup: report.cleanup, failure: report.failure, cleanupFailure: report.cleanupFailure }));
}
