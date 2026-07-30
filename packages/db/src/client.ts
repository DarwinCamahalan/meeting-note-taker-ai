/**
 * Drizzle client — a pg Pool from DATABASE_URL wrapped by drizzle().
 *
 * `db` is a lazily-created singleton so importing this module does not open a
 * connection (e.g. in tests / codegen). Services that need a distinct pool
 * (custom TLS, per-region URL) call `createDb()` directly.
 */
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import * as schema from './schema/index.js';

export type Schema = typeof schema;
export type Database = NodePgDatabase<Schema>;

export interface CreateDbOptions {
  /** Overrides `process.env.DATABASE_URL`. */
  connectionString?: string;
  /** Extra pg PoolConfig (max, ssl, statement_timeout, ...). */
  pool?: Omit<PoolConfig, 'connectionString'>;
}

/**
 * Create a fresh pool + Drizzle instance. Callers own the returned pool's
 * lifecycle and should `pool.end()` on shutdown.
 */
export function createDb(opts: CreateDbOptions = {}): { db: Database; pool: Pool } {
  const connectionString = opts.connectionString ?? process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set (and no connectionString override was provided).');
  }
  const pool = new Pool({ connectionString, ...opts.pool });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

let singleton: { db: Database; pool: Pool } | undefined;

/** Process-wide singleton, created on first access from `process.env.DATABASE_URL`. */
export function getDb(): Database {
  singleton ??= createDb();
  return singleton.db;
}

/** The underlying pool for the singleton (for graceful shutdown / health checks). */
export function getPool(): Pool {
  singleton ??= createDb();
  return singleton.pool;
}

export { schema };
