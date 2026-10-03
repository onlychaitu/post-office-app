// Integration tests use their own database so they never touch development data.
// Defaults match the docker-compose Postgres (host port 5433).
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postoffice:postoffice@localhost:5433/postoffice_test';
