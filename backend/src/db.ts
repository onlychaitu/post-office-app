import pg from 'pg';
import { config } from './config.js';

export function createPool(connectionString: string = config.databaseUrl): pg.Pool {
  return new pg.Pool({ connectionString });
}

/** Runs `work` in a transaction: commits if it resolves, rolls back if it throws. */
export async function withTransaction<T>(
  pool: pg.Pool,
  work: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
