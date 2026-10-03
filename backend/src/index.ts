import { createApp } from './app.js';
import { config } from './config.js';
import { createPool } from './db.js';
import { runMigrations } from './migrate.js';

async function main(): Promise<void> {
  await runMigrations();
  const pool = createPool();
  const app = createApp(pool);

  const server = app.listen(config.port, () => {
    console.log(`API listening on http://localhost:${config.port}/api`);
  });

  const shutdown = (): void => {
    server.close(() => {
      void pool.end().then(() => process.exit(0));
    });
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('Failed to start API', err);
  process.exit(1);
});
