import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  assertUnprotectedDatabaseName,
  databaseAdminPolicy,
  targetDatabaseUrl,
} from "./production-certification-database-contract.mjs";

function quotedIdentifier(value) {
  assertUnprotectedDatabaseName(value);
  return `"${value.replaceAll('"', '""')}"`;
}

function quotedStageRole(value) {
  if (!/^interior_ai_cert_stage_[a-f0-9]{32}$/.test(value)) {
    throw new Error("certification database stage role is malformed");
  }
  return `"${value}"`;
}

function safeSession(row) {
  return {
    pid: Number(row.pid),
    role: row.usename,
    applicationName: row.application_name || null,
    clientAddress: row.client_addr || "local-socket",
    state: row.state || null,
    backendStartedAt: new Date(row.backend_start).toISOString(),
  };
}

async function withClient(connectionString, action) {
  const { Client } = await import("pg");
  const client = new Client({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

export class CertificationPostgresAdapter {
  constructor({ adminUrl, repositoryRoot }) {
    this.adminUrl = adminUrl;
    this.repositoryRoot = repositoryRoot;
    this.policy = databaseAdminPolicy(adminUrl);
  }

  targetUrl(databaseName) {
    return targetDatabaseUrl(this.adminUrl, databaseName);
  }

  async inspectAdmin(databaseName) {
    assertUnprotectedDatabaseName(databaseName);
    return withClient(this.adminUrl, async (client) => {
      const server = await client.query(
        `SELECT current_user AS role,
                current_database() AS database,
                current_setting('server_version') AS server_version,
                current_setting('server_version_num')::int AS server_version_num,
                host(inet_server_addr()) AS server_address,
                r.rolsuper,
                r.rolcreatedb
           FROM pg_roles r
          WHERE r.rolname = current_user`,
      );
      const database = await client.query(
        "SELECT datname FROM pg_database WHERE datname = $1",
        [databaseName],
      );
      const row = server.rows[0];
      if (
        !row ||
        row.database !== "postgres" ||
        Number(row.server_version_num) < 140000 ||
        (row.server_address !== "127.0.0.1" && row.server_address !== "::1") ||
        (row.rolsuper !== true && row.rolcreatedb !== true)
      ) {
        throw new Error("local PostgreSQL server or role classification is not approved");
      }
      return {
        hostClassification: this.policy.hostClassification,
        host: this.policy.host,
        port: this.policy.port,
        serverAddressClassification: "loopback",
        serverVersion: row.server_version,
        serverVersionNumber: Number(row.server_version_num),
        role: row.role,
        roleClassification: row.rolsuper
          ? "local-superuser-createdb"
          : "local-createdb",
        canCreateDatabase: true,
        targetExists: database.rowCount !== 0,
      };
    });
  }

  async createDatabase(databaseName) {
    const identifier = quotedIdentifier(databaseName);
    return withClient(this.adminUrl, async (client) => {
      const before = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [databaseName],
      );
      if (before.rowCount !== 0) {
        throw new Error("generated certification database already exists");
      }
      try {
        await client.query(`CREATE DATABASE ${identifier}`);
      } catch (error) {
        error.databaseCreateOutcome =
          error?.code === "42P04" ? "not-created" : "ambiguous";
        throw error;
      }
      const after = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [databaseName],
      );
      if (after.rowCount !== 1) {
        throw new Error("generated certification database creation was not observed");
      }
      return { created: true };
    });
  }

  async createStageRole({ databaseName, roleName, password }) {
    const databaseIdentifier = quotedIdentifier(databaseName);
    const roleIdentifier = quotedStageRole(roleName);
    if (!/^[a-f0-9]{64}$/.test(password)) {
      throw new Error("certification database stage credential is malformed");
    }
    try {
      await withClient(this.adminUrl, async (client) => {
        const existing = await client.query(
          "SELECT 1 FROM pg_roles WHERE rolname = $1",
          [roleName],
        );
        if (existing.rowCount !== 0) {
          throw Object.assign(
            new Error("certification database stage role already exists"),
            { stageRoleCreateOutcome: "not-created" },
          );
        }
        await client.query(
          `CREATE ROLE ${roleIdentifier} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
        );
        await client.query(`GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${roleIdentifier}`);
      });
    } catch (error) {
      if (error?.code === "42710" && !error.stageRoleCreateOutcome) {
        error.stageRoleCreateOutcome = "not-created";
      }
      throw error;
    }
    await withClient(this.targetUrl(databaseName), async (client) => {
      await client.query(`GRANT USAGE ON SCHEMA public TO ${roleIdentifier}`);
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${roleIdentifier}`,
      );
      await client.query(
        `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${roleIdentifier}`,
      );
    });
    const scopedUrl = new URL(this.targetUrl(databaseName));
    scopedUrl.username = roleName;
    scopedUrl.password = password;
    const verified = await withClient(scopedUrl.toString(), async (client) => {
      const result = await client.query(
        `SELECT current_user AS role, rolsuper, rolcreatedb, rolcreaterole,
                rolreplication, rolbypassrls
           FROM pg_roles
          WHERE rolname = current_user`,
      );
      return result.rows[0];
    });
    if (
      verified?.role !== roleName ||
      verified?.rolsuper !== false ||
      verified?.rolcreatedb !== false ||
      verified?.rolcreaterole !== false ||
      verified?.rolreplication !== false ||
      verified?.rolbypassrls !== false
    ) {
      throw new Error("certification database stage role retained admin capability");
    }
    return {
      created: true,
      classification: "stage-login-no-admin",
      adminCapabilities: false,
    };
  }

  async inspectStageRole(roleName) {
    quotedStageRole(roleName);
    return withClient(this.adminUrl, async (client) => {
      const result = await client.query(
        `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
           FROM pg_roles
          WHERE rolname = $1`,
        [roleName],
      );
      const row = result.rows[0];
      return {
        exists: result.rowCount === 1,
        adminCapabilities: row
          ? row.rolsuper === true ||
            row.rolcreatedb === true ||
            row.rolcreaterole === true ||
            row.rolreplication === true ||
            row.rolbypassrls === true
          : false,
      };
    });
  }

  async dropStageRole(roleName) {
    const roleIdentifier = quotedStageRole(roleName);
    return withClient(this.adminUrl, async (client) => {
      const existing = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname = $1",
        [roleName],
      );
      if (existing.rowCount === 0) return { dropped: false, alreadyAbsent: true };
      await client.query(`DROP ROLE ${roleIdentifier}`);
      return { dropped: true, alreadyAbsent: false };
    });
  }

  async inspectStageConnection({ databaseUrl, databaseName, roleName }) {
    assertUnprotectedDatabaseName(databaseName);
    quotedStageRole(roleName);
    return withClient(databaseUrl, async (client) => {
      const result = await client.query(
        `SELECT current_user AS role,
                current_database() AS database,
                rolsuper,
                rolcreatedb,
                rolcreaterole,
                rolreplication,
                rolbypassrls
           FROM pg_roles
          WHERE rolname = current_user`,
      );
      const row = result.rows[0];
      return {
        exactTarget: row?.database === databaseName,
        exactRole: row?.role === roleName,
        adminCapabilities:
          row?.rolsuper === true ||
          row?.rolcreatedb === true ||
          row?.rolcreaterole === true ||
          row?.rolreplication === true ||
          row?.rolbypassrls === true,
      };
    });
  }

  deployMigrations(databaseName) {
    const executable =
      process.platform === "win32"
        ? path.join(this.repositoryRoot, "node_modules/.bin/prisma.cmd")
        : path.join(this.repositoryRoot, "node_modules/.bin/prisma");
    const child = spawnSync(executable, ["migrate", "deploy"], {
      cwd: this.repositoryRoot,
      env: {
        ...process.env,
        DATABASE_URL: this.targetUrl(databaseName),
      },
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    if (child.error || child.signal || child.status !== 0) {
      throw new Error("canonical Prisma migration deployment failed");
    }
    return { exitCode: 0, signal: null };
  }

  async migrationNames(databaseName) {
    return withClient(this.targetUrl(databaseName), async (client) => {
      const result = await client.query(
        `SELECT migration_name
           FROM "_prisma_migrations"
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
          ORDER BY migration_name`,
      );
      return result.rows.map((row) => row.migration_name);
    });
  }

  async applicationRows(databaseName) {
    return withClient(this.targetUrl(databaseName), async (client) => {
      const tables = await client.query(
        `SELECT tablename
           FROM pg_catalog.pg_tables
          WHERE schemaname = 'public'
            AND tablename <> '_prisma_migrations'
          ORDER BY tablename`,
      );
      const rows = [];
      for (const { tablename } of tables.rows) {
        const identifier = `"${tablename.replaceAll('"', '""')}"`;
        const count = await client.query(
          `SELECT COUNT(*)::int AS count FROM ${identifier}`,
        );
        rows.push({ table: tablename, count: Number(count.rows[0]?.count ?? 0) });
      }
      return rows;
    });
  }

  async targetSessions(databaseName) {
    assertUnprotectedDatabaseName(databaseName);
    return withClient(this.adminUrl, async (client) => {
      const result = await client.query(
        `SELECT pid, usename, application_name, client_addr, state, backend_start
           FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()
          ORDER BY pid`,
        [databaseName],
      );
      return result.rows.map(safeSession);
    });
  }

  async terminateTargetSessions(databaseName) {
    assertUnprotectedDatabaseName(databaseName);
    return withClient(this.adminUrl, async (client) => {
      const before = await client.query(
        `SELECT pid
           FROM pg_stat_activity
          WHERE datname = $1 AND pid <> pg_backend_pid()
          ORDER BY pid`,
        [databaseName],
      );
      const pids = before.rows.map((row) => Number(row.pid));
      const terminated = [];
      for (const pid of pids) {
        const result = await client.query(
          `SELECT pg_terminate_backend(pid) AS terminated
             FROM pg_stat_activity
            WHERE datname = $1 AND pid = $2 AND pid <> pg_backend_pid()`,
          [databaseName, pid],
        );
        if (result.rows[0]?.terminated === true) terminated.push(pid);
      }
      let remainingSessionCount = pids.length;
      for (let attempt = 0; attempt < 20 && remainingSessionCount > 0; attempt += 1) {
        const after = await client.query(
          `SELECT COUNT(*)::int AS count
             FROM pg_stat_activity
            WHERE datname = $1 AND pid <> pg_backend_pid()`,
          [databaseName],
        );
        remainingSessionCount = Number(after.rows[0]?.count ?? 0);
        if (remainingSessionCount > 0) {
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      return {
        matchedSessionCount: pids.length,
        terminatedPids: terminated,
        remainingSessionCount,
      };
    });
  }

  async dropDatabase(databaseName) {
    const identifier = quotedIdentifier(databaseName);
    return withClient(this.adminUrl, async (client) => {
      const existing = await client.query(
        "SELECT 1 FROM pg_database WHERE datname = $1",
        [databaseName],
      );
      if (existing.rowCount === 0) return { dropped: false, alreadyAbsent: true };
      const sessions = await client.query(
        "SELECT 1 FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
        [databaseName],
      );
      if (sessions.rowCount !== 0) {
        throw new Error("generated certification database still has active sessions");
      }
      await client.query(`DROP DATABASE ${identifier}`);
      return { dropped: true, alreadyAbsent: false };
    });
  }
}
