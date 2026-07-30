import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit config (per region via DATABASE_URL). `generate` diffs the schema
 * into SQL under ./migrations; `migrate` applies them transactionally.
 *
 * The pgvector extension, the uuidv7() shim, and the HNSW index are authored by
 * hand in migrations/0000_init.sql (they are not diffable from the schema).
 */
export default defineConfig({
  schema: './src/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? '',
  },
  verbose: true,
  strict: true,
});
