import { spawnSync } from "node:child_process";
import process from "node:process";
import path from "node:path";
import { closeSync, ftruncateSync, fsyncSync, lstatSync, openSync, readFileSync, writeSync } from "node:fs";
import { Client } from "pg";


function windowOpeningTarget(rawUrl) {
  const url = new URL(rawUrl);
  const name = decodeURIComponent(url.pathname.slice(1));
  if (!new Set(["postgres:", "postgresql:"]).has(url.protocol) ||
      url.hostname !== "127.0.0.1" || url.port !== "5432" ||
      url.username !== "justus" || url.password || url.search || url.hash ||
      !/^interior_ai_window_opening_evidence_test_[a-z0-9_]+$/.test(name) ||
      Buffer.byteLength(name) > 63) {
    throw new Error("Owned window database requires the exact approved local target and a name of at most 63 bytes.");
  }
  return { name, adminUrl: "postgresql://justus@127.0.0.1:5432/postgres" };
}

async function inspectWindowAdmin(client) {
  const observed = await client.query(
    `SELECT current_user AS role, current_database() AS database,
            host(inet_server_addr()) AS host, inet_server_port() AS port,
            rolcreatedb AS can_create_database
       FROM pg_roles WHERE rolname = current_user`,
  );
  const row = observed.rows[0];
  if (row?.role !== "justus" || row.database !== "postgres" ||
      row.host !== "127.0.0.1" || row.port !== 5432 || !row.can_create_database) {
    throw new Error("Connected PostgreSQL server/account differs from the approved window database target.");
  }
  return row;
}

export async function createOwnedWindowOpeningDatabase({ databaseUrl, receiptPath, ownerId, ClientClass = Client }) {
  const target = windowOpeningTarget(databaseUrl);
  if (!ownerId || !path.isAbsolute(receiptPath)) throw new Error("Exact database owner and receipt path are required.");
  const fd = openSync(receiptPath, "wx", 0o600);
  const receipt = { schema: "window-opening-database-creation/v1", ownerId,
    databaseName: target.name, host: "127.0.0.1", port: 5432, role: "justus",
    created: false, outcome: "not-attempted", databaseOid: null, server: null };
  const persist = () => {
    const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
    ftruncateSync(fd, 0);
    writeSync(fd, bytes, 0, bytes.length, 0);
    fsyncSync(fd);
  };
  const admin = new ClientClass({ connectionString: target.adminUrl, connectionTimeoutMillis: 10_000 });
  try {
    persist();
    await admin.connect();
    receipt.server = await inspectWindowAdmin(admin);
    const before = await admin.query("SELECT oid FROM pg_database WHERE datname = $1", [target.name]);
    if (before.rowCount !== 0) {
      receipt.outcome = "collision-preserved";
      persist();
      throw new Error("Generated window database already exists; it will not be reused or removed.");
    }
    receipt.outcome = "unacknowledged";
    persist();
    try {
      await admin.query(`CREATE DATABASE "${target.name}"`);
    } catch (error) {
      if (error.code === "42P04") { receipt.outcome = "collision-preserved"; persist(); }
      throw error;
    }
    receipt.created = true;
    receipt.outcome = "created";
    persist();
    const after = await admin.query("SELECT oid FROM pg_database WHERE datname = $1", [target.name]);
    if (after.rowCount !== 1) throw new Error("Acknowledged database creation could not be observed; retain its receipt.");
    receipt.databaseOid = Number(after.rows[0].oid);
    persist();
    return receipt;
  } finally {
    closeSync(fd);
    await admin.end();
  }
}

export async function dropOwnedWindowOpeningDatabase({ databaseUrl, receiptPath, ownerId, ClientClass = Client }) {
  const target = windowOpeningTarget(databaseUrl);
  const entry = lstatSync(receiptPath, { throwIfNoEntry: false });
  if (!entry) return { owned: false, dropped: false, databaseName: target.name, reason: "no-creation-receipt" };
  if (!entry.isFile() || entry.isSymbolicLink()) throw new Error("Database creation receipt must be a physical file.");
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  if (receipt.schema !== "window-opening-database-creation/v1" || receipt.ownerId !== ownerId ||
      receipt.databaseName !== target.name || receipt.host !== "127.0.0.1" ||
      receipt.port !== 5432 || receipt.role !== "justus") {
    throw new Error("Database cleanup receipt belongs to a different invocation or target.");
  }
  if (!receipt.created || receipt.outcome !== "created") {
    return { owned: false, dropped: false, databaseName: target.name, reason: receipt.outcome };
  }
  if (!Number.isSafeInteger(receipt.databaseOid) || receipt.databaseOid <= 0) {
    throw new Error(`Retain acknowledged database ${target.name}: its catalog identity was not recorded.`);
  }
  const admin = new ClientClass({ connectionString: target.adminUrl, connectionTimeoutMillis: 10_000 });
  await admin.connect();
  try {
    await inspectWindowAdmin(admin);
    const before = await admin.query("SELECT oid FROM pg_database WHERE datname = $1", [target.name]);
    if (before.rowCount !== 0 && Number(before.rows[0].oid) !== receipt.databaseOid) {
      throw new Error("Database catalog identity changed; replacement is preserved.");
    }
    const sessions = await admin.query("SELECT pid FROM pg_stat_activity WHERE datname = $1", [target.name]);
    if (sessions.rowCount !== 0) throw new Error(`Retain owned database ${target.name}: connections remain; no sessions were terminated.`);
    if (before.rowCount !== 0) await admin.query(`DROP DATABASE "${target.name}"`);
    const after = await admin.query("SELECT oid FROM pg_database WHERE datname = $1", [target.name]);
    const remaining = await admin.query("SELECT pid FROM pg_stat_activity WHERE datname = $1", [target.name]);
    if (after.rowCount !== 0 || remaining.rowCount !== 0) throw new Error("Owned database/session absence was not verified.");
    return { owned: true, dropped: true, databaseName: target.name, databaseOid: receipt.databaseOid,
      alreadyAbsent: before.rowCount === 0, databaseAbsent: true, sessionCount: 0 };
  } finally { await admin.end(); }
}

async function main() {
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

  const ownedArguments = process.argv.slice(2);
  if (ownedArguments.length > 0) {
    if (ownedArguments.length !== 3 || ownedArguments[0] !== "--create-owned-window") {
      throw new Error("Usage: provision-gate-a3-database.mjs [--create-owned-window receipt-path owner-id]");
    }
    await createOwnedWindowOpeningDatabase({ databaseUrl: rawUrl,
      receiptPath: path.resolve(ownedArguments[1]), ownerId: ownedArguments[2] });
  } else {
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
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  await main();
}
