/**
 * Database provider — owns a single Drizzle client + pg Pool for the process,
 * built from {@link AppConfig}. The pool connects lazily (first query), so the
 * app boots even when Postgres is momentarily unavailable; it is drained on
 * shutdown via Nest's lifecycle hook.
 */
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { createDb, type Database } from '@cue/db';
import { AppConfig } from '../config/app-config.js';

@Injectable()
export class DbService implements OnModuleDestroy {
  private readonly handle: ReturnType<typeof createDb>;

  constructor(config: AppConfig) {
    this.handle = createDb({ connectionString: config.databaseUrl });
  }

  /** The Drizzle client (typed against the full @cue/db schema). */
  get db(): Database {
    return this.handle.db;
  }

  async onModuleDestroy(): Promise<void> {
    await this.handle.pool.end();
  }
}
