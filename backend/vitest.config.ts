import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    // All test files share one Postgres database, so run them one at a time.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
