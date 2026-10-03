export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Host port 5433 is what docker-compose publishes for Postgres, so a locally
  // running API (npm run dev) can reach the compose database out of the box.
  databaseUrl:
    process.env.DATABASE_URL ?? 'postgres://postoffice:postoffice@localhost:5433/postoffice',
};
