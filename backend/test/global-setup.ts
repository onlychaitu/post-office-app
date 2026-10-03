import { runMigrations } from '../src/migrate.js';
import { TEST_DATABASE_URL } from './config.js';
import { createDatabaseIfMissing } from './database.js';

/** Creates the test database if missing, then applies all migrations to it. */
export default async function setup(): Promise<void> {
  await createDatabaseIfMissing(TEST_DATABASE_URL);
  await runMigrations(TEST_DATABASE_URL);
}
