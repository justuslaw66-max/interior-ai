import { spawnSync } from "node:child_process";
import process from "node:process";
import { Client } from "pg";

const rawUrl = process.env.GATE_A3_DATABASE_URL?.trim();
if (!rawUrl) {
  throw new Error(
    "GATE_A3_DATABASE_URL is required. The generic DATABASE_URL is intentionally not accepted.",
  );
}

const targetUrl = new URL(rawUrl);
if (targetUrl.protocol !== "postgresql:" && targetUrl.protocol !== "postgres:") {
  throw new Error("GATE_A3_DATABASE_URL must be a PostgreSQL URL.");
}

const databaseName = decodeURIComponent(targetUrl.pathname.replace(/^\//, ""));
if (!databaseName || !/(?:^|_)(?:test|gate_a3)(?:_|$)/i.test(databaseName)) {
  throw new Error(
    `Refusing database ${JSON.stringify(databaseName)}: its name must contain a test or gate_a3 segment.`,
  );
}

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
if (!localHosts.has(targetUrl.hostname) && process.env.GATE_A3_ALLOW_REMOTE_DATABASE !== "1") {
  throw new Error(
    "Refusing a remote database. Set GATE_A3_ALLOW_REMOTE_DATABASE=1 only for a dedicated remote test database.",
  );
}

const adminUrl = new URL(targetUrl);
adminUrl.pathname = "/postgres";
const admin = new Client({
  connectionString: adminUrl.toString(),
  connectionTimeoutMillis: 10_000,
});

await admin.connect();
try {
  const existing = await admin.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [databaseName],
  );
  if (existing.rowCount === 0) {
    const identifier = `"${databaseName.replaceAll('"', '""')}"`;
    await admin.query(`CREATE DATABASE ${identifier}`);
    console.log(`Created isolated Gate A3 database ${databaseName}.`);
  } else {
    console.log(`Using existing isolated Gate A3 database ${databaseName}.`);
  }
} finally {
  await admin.end();
}

const prismaExecutable =
  process.platform === "win32"
    ? "node_modules/.bin/prisma.cmd"
    : "node_modules/.bin/prisma";
const migration = spawnSync(prismaExecutable, ["migrate", "deploy"], {
  cwd: process.cwd(),
  env: { ...process.env, DATABASE_URL: targetUrl.toString() },
  stdio: "inherit",
});
if (migration.status !== 0) {
  throw new Error(`Prisma migration deployment failed with status ${migration.status ?? "unknown"}.`);
}

const verification = new Client({
  connectionString: targetUrl.toString(),
  connectionTimeoutMillis: 10_000,
});
await verification.connect();
try {
  const result = await verification.query(
    'SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  console.log(
    `Gate A3 database ready at ${targetUrl.hostname}:${targetUrl.port || "5432"}/${databaseName}; ${result.rows[0]?.count ?? 0} migrations applied.`,
  );
} finally {
  await verification.end();
}
