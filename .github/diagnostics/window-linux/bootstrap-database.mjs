import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest } from './projection.mjs';

export async function finishBootstrapConnection({ client, receipt, persist, primaryError = null }) {
  let closeFailed = false; let persistFailed = false;
  try { await client.end(); } catch { closeFailed = true; receipt.closeFailures++; }
  try { persist(receipt); } catch { persistFailed = true; receipt.persistenceFailures++; }
  if (primaryError !== null) throw primaryError;
  if (closeFailed) throw new Error('bootstrap-close-failed');
  if (persistFailed) throw new Error('bootstrap-receipt-write-failed');
}

// Own only the prerequisite migration DB. The Stable owner's separate DB/role,
// attestation and cleanup remain entirely under the existing source owner.
export async function bootstrapDatabase({ source, adminUrl, name, persist, serviceId }) {
  if (!/^window_linux_test_[CT]_[1-9][0-9]*_1$/.test(name) || name.length > 63) throw new Error('bootstrap-name');
  const url = new URL(adminUrl);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '5432' || url.username !== 'test' || !url.password || url.pathname !== '/postgres' || url.search || url.hash) throw new Error('bootstrap-admin');
  const { Client } = createRequire(path.join(source, 'package.json'))('pg');
  const { inspectGithubPostgresServiceContainer } = await import(pathToFileURL(path.join(source, 'scripts/production-certification-database-transport.mjs')).href);
  const snapshot = inspectGithubPostgresServiceContainer({ repositoryRoot: source });
  if (snapshot.containerIdentitySha256 !== digest(serviceId)) throw new Error('bootstrap-service-identity');
  const receipt = { name, creation: 'not-attempted', oid: null, absent: false, sessionCount: null, cleanup: 'not-attempted', connectionFailures: 0, closeFailures: 0, persistenceFailures: 0, primaryFailureStage: null };
  async function connect() {
    if (JSON.stringify(inspectGithubPostgresServiceContainer({ repositoryRoot: source })) !== JSON.stringify(snapshot)) throw new Error('bootstrap-service-changed');
    const client = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 10000, statement_timeout: 10000, query_timeout: 12000 });
    try {
      await client.connect();
      const result = await client.query("SELECT current_user AS role, current_database() AS database, current_setting('server_version_num')::int AS version, inet_server_port() AS port, host(inet_server_addr()) AS server_address, host(inet_client_addr()) AS client_address");
      const row = result.rows[0];
      if (row.role !== 'test' || row.database !== 'postgres' || row.port !== 5432 || row.version < 150000 || row.version >= 160000) throw new Error('bootstrap-server');
      const network = snapshot.networks.find(item => item.address === row.server_address);
      if (!network || row.client_address !== network.gateway) throw new Error('bootstrap-network-binding');
      return client;
    } catch (error) {
      receipt.connectionFailures++;
      receipt.primaryFailureStage = 'connect';
      await finishBootstrapConnection({ client, receipt, persist, primaryError: error });
    }
  }
  return {
    receipt,
    async create() {
      persist(receipt); const client = await connect(); let primaryError = null;
      try {
        const before = await client.query('SELECT oid FROM pg_database WHERE datname = $1', [name]);
        if (before.rowCount !== 0) { receipt.creation = 'collision-preserved'; persist(receipt); throw new Error('bootstrap-collision'); }
        receipt.creation = 'unacknowledged'; persist(receipt);
        await client.query(`CREATE DATABASE "${name}"`);
        receipt.creation = 'created'; persist(receipt);
        const after = await client.query('SELECT oid FROM pg_database WHERE datname = $1', [name]);
        if (after.rowCount !== 1 || !Number.isSafeInteger(Number(after.rows[0].oid))) throw new Error('bootstrap-acknowledgement');
        receipt.oid = Number(after.rows[0].oid); persist(receipt);
      } catch (error) { primaryError = error; receipt.primaryFailureStage = 'create'; }
      finally { await finishBootstrapConnection({ client, receipt, persist, primaryError }); }
    },
    async cleanup() {
      if (receipt.creation !== 'created' || !Number.isSafeInteger(receipt.oid) || receipt.oid <= 0) throw new Error('bootstrap-ownership-uncertain');
      const client = await connect(); let primaryError = null;
      try {
        const before = await client.query('SELECT oid FROM pg_database WHERE datname = $1', [name]);
        if (before.rowCount !== 1 || Number(before.rows[0].oid) !== receipt.oid) throw new Error('bootstrap-identity-changed');
        const sessions = await client.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1', [name]);
        receipt.sessionCount = sessions.rows[0].count; persist(receipt);
        if (receipt.sessionCount !== 0) throw new Error('bootstrap-sessions-remain');
        const boundary = await client.query('SELECT oid FROM pg_database WHERE datname = $1', [name]);
        if (boundary.rowCount !== 1 || Number(boundary.rows[0].oid) !== receipt.oid) throw new Error('bootstrap-identity-changed');
        await client.query(`DROP DATABASE "${name}"`);
        const after = await client.query('SELECT oid FROM pg_database WHERE datname = $1', [name]);
        const remaining = await client.query('SELECT count(*)::int AS count FROM pg_stat_activity WHERE datname = $1', [name]);
        receipt.sessionCount = remaining.rows[0].count; receipt.absent = after.rowCount === 0 && receipt.sessionCount === 0;
        receipt.cleanup = receipt.absent ? 'absence-verified' : 'absence-unproven'; persist(receipt);
        if (!receipt.absent) throw new Error('bootstrap-cleanup-unproven');
        return true;
      } catch (error) { primaryError = error; receipt.primaryFailureStage = 'cleanup'; }
      finally { await finishBootstrapConnection({ client, receipt, persist, primaryError }); }
    },
  };
}
