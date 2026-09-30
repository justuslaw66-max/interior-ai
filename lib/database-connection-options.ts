import type { PoolConfig } from "pg";

// Optional connection settings for a process that sits far from the database. The floor-plan
// worker runs in Europe while the database is in Sydney: a new TLS connection takes over two
// seconds there, so pg's default 10 s idle timeout and Prisma's default 2 s transaction wait
// make the worker's 30 s lease heartbeat fail. Unset variables keep the pg and Prisma defaults,
// so the web app behaves exactly as before.
type Environment = Record<string, string | undefined>;

function optionalMilliseconds(env: Environment, name: string, maximum: number): number | undefined {
  const raw = env[name]?.trim();
  if (!raw) return undefined;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be a whole number of milliseconds from 1 to ${maximum}.`);
  }
  return value;
}

/** pg pool settings from DATABASE_POOL_IDLE_TIMEOUT_MS; empty when it is unset. */
export function databasePoolOptions(
  env: Environment = process.env
): Pick<PoolConfig, "idleTimeoutMillis" | "keepAlive"> {
  const idleTimeoutMillis = optionalMilliseconds(env, "DATABASE_POOL_IDLE_TIMEOUT_MS", 3_600_000);
  return idleTimeoutMillis === undefined ? {} : { idleTimeoutMillis, keepAlive: true };
}

/** Prisma's client-wide interactive-transaction limits; undefined when neither variable is set. */
export function prismaTransactionOptions(
  env: Environment = process.env
): { maxWait?: number; timeout?: number } | undefined {
  const maxWait = optionalMilliseconds(env, "PRISMA_TRANSACTION_MAX_WAIT_MS", 120_000);
  const timeout = optionalMilliseconds(env, "PRISMA_TRANSACTION_TIMEOUT_MS", 300_000);
  if (maxWait === undefined && timeout === undefined) return undefined;
  return {
    ...(maxWait === undefined ? {} : { maxWait }),
    ...(timeout === undefined ? {} : { timeout }),
  };
}
