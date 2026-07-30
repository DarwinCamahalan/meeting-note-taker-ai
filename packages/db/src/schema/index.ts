/**
 * Schema barrel — the single import surface for Drizzle and drizzle-kit.
 * `drizzle.config.ts` points at this file; `client.ts` passes the namespace to
 * `drizzle(pool, { schema })` for relational queries.
 */
export * from './_shared.js';
export * from './identity.js';
export * from './sessions.js';
export * from './documents.js';
export * from './billing.js';
export * from './audit.js';
export * from './enterprise.js';
