import { spawnSync } from "node:child_process";
import { isIP } from "node:net";
// Source-only ordinary smoke resource owner. Certification's adapter is separate.
import { randomBytes } from "node:crypto";
import { runtimeFailureText } from "./production-artifact-runtime-binding.mjs";

const ROLE = /^interior_ai_ordinary_stage_[a-f0-9]{32}$/;
const quote = (value) => {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) throw new Error("Ordinary database identifier is malformed");
  return `"${value}"`;
};
export function inspectOrdinaryPostgresService(environment, inspect = spawnSync) {
  const serviceContainerId = environment.ORDINARY_ARTIFACT_POSTGRES_SERVICE_ID;
  if (!/^[a-f0-9]{64}$/.test(serviceContainerId ?? "")) {
    throw new Error("Ordinary hosted database requires the declared workflow service container ID");
  }
  const inspection = inspect("docker", ["inspect", "--type", "container", serviceContainerId], {
    encoding: "utf8", env: Object.fromEntries(["PATH", "HOME"].filter((name) => environment[name] !== undefined)
      .map((name) => [name, environment[name]])),
  });
  if (inspection.error || inspection.signal || inspection.status !== 0) {
    throw new Error("Ordinary workflow PostgreSQL service inspection failed");
  }
  const values = JSON.parse(inspection.stdout);
  const service = Array.isArray(values) && values.length === 1 ? values[0] : null;
  const configuration = service?.Config?.Env;
  const ports = service?.NetworkSettings?.Ports?.["5432/tcp"];
  const addresses = [...new Set(Object.values(service?.NetworkSettings?.Networks ?? {})
    .flatMap((network) => [network.IPAddress, network.GlobalIPv6Address]).filter(Boolean))].sort();
  if (service?.Id !== serviceContainerId || service.State?.Running !== true || service.Config?.Image !== "postgres:15" ||
      !Array.isArray(configuration) || !["POSTGRES_USER=test", "POSTGRES_PASSWORD=test", "POSTGRES_DB=interior_ai_test"]
        .every((assignment) => configuration.filter((value) => value.split("=")[0] === assignment.split("=")[0]).join() === assignment) ||
      !Array.isArray(ports) || ports.length === 0 || ports.some((binding) => binding.HostPort !== "5432" ||
        !["0.0.0.0", "127.0.0.1", "::", "::1"].includes(binding.HostIp)) ||
      addresses.length === 0 || addresses.some((address) => !isIP(address))) {
    throw new Error("Ordinary workflow PostgreSQL service image/configuration/port/network identity is mismatched");
  }
  return { serviceContainerId, serverAddresses: addresses };
}

export async function withOrdinaryDatabase(url, action, ClientClass) {
  // Projection/contract callers need no database package; only the real I/O owner loads it.
  if (!ClientClass) ClientClass = (await import("pg")).Client;
  const client = new ClientClass({ connectionString: url, connectionTimeoutMillis: 10_000 });
  let result;
  const failures = [];
  try { await client.connect(); result = await action(client); }
  catch (error) { failures.push(error); }
  try { await client.end(); } catch (error) { failures.push(new Error(`Database client close: ${runtimeFailureText(error)}`)); }
  if (failures.length) throw new Error(failures.map(runtimeFailureText).join("\n"));
  return result;
}

export async function observeOrdinaryDatabase(client) {
  const result = await client.query(`SELECT current_database() AS database, current_user AS role,
    host(inet_server_addr()) AS host, inet_server_port() AS port,
    d.oid::int AS "databaseOid", r.oid::int AS "roleOid",
    r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolinherit, r.rolreplication, r.rolbypassrls,
    has_schema_privilege(current_user, 'public', 'CREATE') AS "canCreate"
    FROM pg_database d, pg_roles r WHERE d.datname = current_database() AND r.rolname = current_user`);
  if (result.rowCount !== 1) throw new Error("Ordinary database identity could not be observed");
  return result.rows[0];
}

export function assertOrdinaryDatabaseObservation(observed, target, { runtime = false } = {}) {
  if (observed.database !== target.database || observed.role !== target.role ||
      observed.port !== 5432 || !(target.serverAddress ? [target.serverAddress] : target.serverAddresses ?? []).includes(observed.host) ||
      !Number.isSafeInteger(observed.databaseOid) || observed.databaseOid <= 0 ||
      !Number.isSafeInteger(observed.roleOid) || observed.roleOid <= 0 ||
      (target.databaseOid !== undefined && observed.databaseOid !== target.databaseOid) ||
      (target.roleOid !== undefined && observed.roleOid !== target.roleOid)) {
    throw new Error("Ordinary database server/account/catalog identity is mismatched");
  }
  if (runtime && (!ROLE.test(observed.role) || ["rolsuper", "rolcreatedb", "rolcreaterole",
    "rolinherit", "rolreplication", "rolbypassrls", "canCreate"].some((key) => observed[key] !== false))) {
    throw new Error("Ordinary runtime role is not restricted");
  }
}

export async function createOrdinaryRuntimeRole({ adminUrl, target, runId, receipt, persist, rememberSecret, ClientClass }) {
  const role = `interior_ai_ordinary_stage_${runId}`;
  if (!ROLE.test(role)) throw new Error("Ordinary runtime role identity is malformed");
  const password = randomBytes(32).toString("hex");
  rememberSecret?.(password);
  const runtimeUrl = new URL(adminUrl);
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  await withOrdinaryDatabase(adminUrl, async (client) => {
    assertOrdinaryDatabaseObservation(await observeOrdinaryDatabase(client), target);
    receipt.role = role;
    const before = await client.query("SELECT oid FROM pg_roles WHERE rolname = $1", [role]);
    if (before.rowCount !== 0) {
      receipt.outcome = "collision-preserved"; persist();
      throw new Error("Ordinary runtime role collision is preserved");
    }
    receipt.outcome = "unacknowledged"; persist();
    await client.query(`CREATE ROLE ${quote(role)} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
    receipt.outcome = "created"; persist();
    const after = await client.query("SELECT oid::int AS oid FROM pg_roles WHERE rolname = $1", [role]);
    if (after.rowCount !== 1) throw new Error("Acknowledged ordinary role has no observed OID; retain receipt");
    receipt.roleOid = after.rows[0].oid; persist();
    await client.query(`GRANT CONNECT ON DATABASE ${quote(target.database)} TO ${quote(role)}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${quote(role)}`);
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${quote(role)}`);
    await client.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${quote(role)}`);
  }, ClientClass);
  const runtimeTarget = { ...target, role, roleOid: receipt.roleOid };
  await withOrdinaryDatabase(runtimeUrl.href, async (client) => {
    assertOrdinaryDatabaseObservation(await observeOrdinaryDatabase(client), runtimeTarget, { runtime: true });
  }, ClientClass);
  return { runtimeUrl: runtimeUrl.href, runtimeTarget, password };
}

export async function dropOrdinaryRuntimeRole({ adminUrl, target, receipt, persist, ClientClass }) {
  if (receipt.outcome !== "created" || !ROLE.test(receipt.role ?? "") ||
      !Number.isSafeInteger(receipt.roleOid) || receipt.roleOid <= 0) {
    throw new Error("Ordinary role cleanup lacks acknowledged exact ownership; retain receipt");
  }
  await withOrdinaryDatabase(adminUrl, async (client) => {
    assertOrdinaryDatabaseObservation(await observeOrdinaryDatabase(client), target);
    const found = await client.query("SELECT oid::int AS oid FROM pg_roles WHERE rolname = $1", [receipt.role]);
    if (found.rowCount !== 1 || found.rows[0].oid !== receipt.roleOid) {
      throw new Error("Ordinary role catalog identity changed; preserve replacement");
    }
    const sessions = await client.query(`SELECT pid FROM pg_stat_activity
      WHERE pid <> pg_backend_pid() AND (usename = $1 OR datname = $2)`, [receipt.role, target.database]);
    if (sessions.rowCount !== 0) throw new Error("Ordinary cleanup requires zero database and role sessions; none terminated");
    const role = quote(receipt.role);
    await client.query(`REVOKE USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);
    await client.query(`REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM ${role}`);
    await client.query(`REVOKE USAGE ON SCHEMA public FROM ${role}`);
    await client.query(`REVOKE CONNECT ON DATABASE ${quote(target.database)} FROM ${role}`);
    assertOrdinaryDatabaseObservation(await observeOrdinaryDatabase(client), target);
    const exact = await client.query("SELECT oid::int AS oid FROM pg_roles WHERE rolname = $1", [receipt.role]);
    const beforeDrop = await client.query(`SELECT pid FROM pg_stat_activity WHERE pid <> pg_backend_pid()
      AND (usesysid = $1 OR datname = $2)`, [receipt.roleOid, target.database]);
    if (exact.rowCount !== 1 || exact.rows[0].oid !== receipt.roleOid || beforeDrop.rowCount !== 0) {
      throw new Error("Ordinary role changed or sessions appeared before DROP; preserve resource");
    }
    await client.query(`DROP ROLE ${role}`);
    const after = await client.query("SELECT oid FROM pg_roles WHERE rolname = $1", [receipt.role]);
    const remaining = await client.query(`SELECT pid FROM pg_stat_activity WHERE pid <> pg_backend_pid()
      AND (usesysid = $1 OR datname = $2)`, [receipt.roleOid, target.database]);
    if (after.rowCount !== 0 || remaining.rowCount !== 0) throw new Error("Ordinary role/session absence was not verified");
    receipt.cleanup = { roleAbsent: true, sessionCount: 0 }; persist();
  }, ClientClass);
}
