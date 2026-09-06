import { spawnSync } from "node:child_process";
import path from "node:path";

import {
  assertUnprotectedDatabaseName,
  databaseAdminPolicy,
  targetDatabaseUrl,
} from "./production-certification-database-contract.mjs";
import {
  CERTIFICATION_APP_EVENT_BINDING_KEY,
  certificationAppEventRowsSha256,
} from "./production-certification-app-event-lifecycle.mjs";

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

async function queryAppEventRows(client, { forUpdate = false } = {}) {
  const result = await client.query(
    `SELECT id,
            "eventType" AS "eventType",
            authority::text AS authority,
            producer::text AS producer,
            "verificationMethod"::text AS "verificationMethod",
            "provenanceVersion" AS "provenanceVersion",
            "externalEventId" AS "externalEventId",
            "createdAt" AS "createdAt",
            "shareToken" IS NULL AS "shareTokenNull",
            jsonb_typeof(meta) = 'object' AS "metaObject",
            meta -> $1 AS binding,
            COALESCE(
              meta::text ~* '(postgres(?:ql)?|mysql|mongodb(?:\\+srv)?|redis|rediss|amqp|amqps)://|https?://[^/@[:space:]]+:[^/@[:space:]]+@|https?://(localhost|127\\.0\\.0\\.1|\\[?::1\\]?|10\\.[0-9.]+|192\\.168\\.[0-9.]+|172\\.(1[6-9]|2[0-9]|3[01])\\.[0-9.]+|[^/[:space:]]+\\.(local|internal))([:/]|$)|/(Users|home|private|var|tmp)/'
              OR jsonb_path_exists(
                COALESCE(meta, '{}'::jsonb),
                '$.** ? (@.type() == "object").keyvalue() ? (@.key like_regex "(authorization|cookie|credential|password|secret|token|api[-_]?key|private[-_]?key|card|cvv|payment|session|address|street|postal|room[-_]?name|project[-_]?name|design[-_]?title|notes?|free[-_]?form|search[-_]?(term|query))" flag "i" && @.value != "[redacted]")'
              ),
              false
            ) AS "prohibitedPrivateData"
       FROM "AppEvent"
      ORDER BY id${forUpdate ? " FOR UPDATE" : ""}`,
    [CERTIFICATION_APP_EVENT_BINDING_KEY],
  );
  return result.rows.map((row) => ({
    ...row,
    provenanceVersion:
      row.provenanceVersion === null ? null : Number(row.provenanceVersion),
    createdAt: new Date(row.createdAt).toISOString(),
  }));
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
        "SELECT oid, datname FROM pg_database WHERE datname = $1",
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
        databaseOid: database.rowCount ? Number(database.rows[0].oid) : null,
      };
    });
  }

  async createDatabase(databaseName) {
    const identifier = quotedIdentifier(databaseName);
    let outcome = "not-created";
    let databaseOid = null;
    try {
      return await withClient(this.adminUrl, async (client) => {
        const before = await client.query(
          "SELECT 1 FROM pg_database WHERE datname = $1", [databaseName],
        );
        if (before.rowCount !== 0) {
          throw new Error("generated certification database already exists");
        }
        outcome = "ambiguous";
        await client.query(`CREATE DATABASE ${identifier}`);
        outcome = "created";
        const after = await client.query(
          "SELECT oid FROM pg_database WHERE datname = $1", [databaseName],
        );
        if (after.rowCount !== 1) {
          throw new Error("generated certification database creation was not observed");
        }
        databaseOid = Number(after.rows[0].oid);
        if (!Number.isSafeInteger(databaseOid) || databaseOid <= 0) {
          throw new Error("created database catalog identity is invalid");
        }
        return { created: true, databaseOid };
      });
    } catch (error) {
      error.databaseOid = databaseOid;
      error.databaseCreateOutcome = outcome === "ambiguous" && error?.code === "42P04"
        ? "not-created" : outcome;
      throw error;
    }
  }

  async createStageRole({ databaseName, roleName, password }) {
    const databaseIdentifier = quotedIdentifier(databaseName);
    const roleIdentifier = quotedStageRole(roleName);
    if (!/^[a-f0-9]{64}$/.test(password)) {
      throw new Error("certification database stage credential is malformed");
    }
    let outcome = "not-created";
    let roleOid = null;
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
        outcome = "ambiguous";
        await client.query(
          `CREATE ROLE ${roleIdentifier} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
        );
        outcome = "created";
        const created = await client.query("SELECT oid FROM pg_roles WHERE rolname = $1", [roleName]);
        roleOid = created.rowCount === 1 ? Number(created.rows[0].oid) : null;
        if (!Number.isSafeInteger(roleOid) || roleOid <= 0) {
          throw new Error("created role catalog identity was not recorded");
        }
        await client.query(`GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${roleIdentifier}`);
      });
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
        roleOid,
        classification: "stage-login-no-admin",
        adminCapabilities: false,
      };
    } catch (error) {
      error.roleOid = roleOid;
      error.stageRoleCreateOutcome = outcome === "ambiguous" && error?.code === "42710"
        ? "not-created" : outcome;
      throw error;
    }
  }

  async inspectStageRole(roleName) {
    quotedStageRole(roleName);
    return withClient(this.adminUrl, async (client) => {
      const result = await client.query(
        `SELECT oid, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
           FROM pg_roles
          WHERE rolname = $1`,
        [roleName],
      );
      const row = result.rows[0];
      return {
        exists: result.rowCount === 1,
        roleOid: row ? Number(row.oid) : null,
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

  async dropStageRole(roleName, expectedOid) {
    if (!Number.isSafeInteger(expectedOid) || expectedOid <= 0) {
      throw new Error("role cleanup requires its recorded catalog identity");
    }
    const roleIdentifier = quotedStageRole(roleName);
    return withClient(this.adminUrl, async (client) => {
      const existing = await client.query(
        "SELECT oid FROM pg_roles WHERE rolname = $1",
        [roleName],
      );
      if (existing.rowCount === 0) return { dropped: false, alreadyAbsent: true };
      if (Number(existing.rows[0].oid) !== expectedOid) {
        throw new Error("stage role catalog identity changed; replacement is preserved");
      }
      const sessions = await client.query("SELECT pid FROM pg_stat_activity WHERE usesysid = $1", [expectedOid]);
      if (sessions.rowCount !== 0) throw new Error("owned stage role still has connections; no sessions were terminated");
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

  async appEventRows(databaseName) {
    return withClient(this.targetUrl(databaseName), (client) =>
      queryAppEventRows(client),
    );
  }

  async deleteCertificationAppEvents({
    databaseName,
    ownership,
    expectedIds,
    expectedRowsSha256,
  }) {
    assertUnprotectedDatabaseName(databaseName);
    return withClient(this.targetUrl(databaseName), async (client) => {
      await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
      try {
        const rows = await queryAppEventRows(client, { forUpdate: true });
        const observedIds = rows.map((row) => row.id).sort();
        if (
          JSON.stringify(observedIds) !== JSON.stringify(expectedIds) ||
          certificationAppEventRowsSha256(rows, ownership) !==
            expectedRowsSha256
        ) {
          throw new Error(
            "AppEvent rows changed after evidence retention and before cleanup",
          );
        }
        const removed = await client.query(
          `DELETE FROM "AppEvent" WHERE id = ANY($1::text[])`,
          [expectedIds],
        );
        const remaining = await client.query(
          `SELECT COUNT(*)::int AS count FROM "AppEvent"`,
        );
        const remainingCount = Number(remaining.rows[0]?.count ?? 0);
        if (
          removed.rowCount !== expectedIds.length ||
          remainingCount !== 0
        ) {
          throw new Error(
            "exact certification AppEvent cleanup did not prove absence",
          );
        }
        await client.query("COMMIT");
        return {
          removedCount: removed.rowCount,
          remainingCount,
          exactOwnedRowsOnly: true,
        };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
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

  async stageRoleSessions(roleName, roleOid) {
    quotedStageRole(roleName);
    if (!Number.isSafeInteger(roleOid) || roleOid <= 0) {
      throw new Error("role session inspection requires its recorded catalog identity");
    }
    return withClient(this.adminUrl, async (client) => {
      const result = await client.query(
        `SELECT pid, usename, datname, application_name, client_addr, state, backend_start
           FROM pg_stat_activity WHERE usesysid = $1 ORDER BY pid`, [roleOid],
      );
      return result.rows.map((row) => ({ ...safeSession(row), database: row.datname }));
    });
  }

  async terminateTargetSessions(databaseName) {
    // Owners close their clients and processes before cleanup. A database name
    // does not prove session ownership, so any remaining connection blocks drop.
    const sessions = await this.targetSessions(databaseName);
    return {
      matchedSessionCount: sessions.length,
      terminatedPids: [],
      remainingSessionCount: sessions.length,
    };
  }

  async dropDatabase(databaseName, expectedOid) {
    if (!Number.isSafeInteger(expectedOid) || expectedOid <= 0) {
      throw new Error("database cleanup requires its recorded catalog identity");
    }
    const identifier = quotedIdentifier(databaseName);
    return withClient(this.adminUrl, async (client) => {
      const existing = await client.query(
        "SELECT oid FROM pg_database WHERE datname = $1",
        [databaseName],
      );
      if (existing.rowCount === 0) return { dropped: false, alreadyAbsent: true };
      if (Number(existing.rows[0].oid) !== expectedOid) {
        throw new Error("database catalog identity changed; replacement is preserved");
      }
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
