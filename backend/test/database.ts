import pg from 'pg';

function parse(databaseUrl: string): { adminUrl: string; name: string } {
  const url = new URL(databaseUrl);
  const name = url.pathname.slice(1);
  if (!/^\w+$/.test(name)) throw new Error(`Unsafe database name: ${name}`);
  url.pathname = '/postgres';
  return { adminUrl: url.toString(), name };
}

async function asAdmin<T>(databaseUrl: string, work: (admin: pg.Client, name: string) => Promise<T>): Promise<T> {
  const { adminUrl, name } = parse(databaseUrl);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    return await work(admin, name);
  } finally {
    await admin.end();
  }
}

export function createDatabaseIfMissing(databaseUrl: string): Promise<void> {
  return asAdmin(databaseUrl, async (admin, name) => {
    const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  });
}

export function dropDatabase(databaseUrl: string): Promise<void> {
  return asAdmin(databaseUrl, async (admin, name) => {
    await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  });
}
