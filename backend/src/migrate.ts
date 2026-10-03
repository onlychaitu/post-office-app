import { runner } from 'node-pg-migrate';
import { config } from './config.js';

/** Applies all pending SQL migrations from ./migrations (resolved from the working directory). */
export async function runMigrations(databaseUrl: string = config.databaseUrl): Promise<void> {
  const applied = await runner({
    databaseUrl,
    dir: 'migrations',
    direction: 'up',
    migrationsTable: 'pgmigrations',
    log: () => {},
  });
  if (applied.length > 0) {
    console.log(`Applied ${applied.length} migration(s): ${applied.map((m) => m.name).join(', ')}`);
  }
}
