import type pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { withTransaction } from './db.js';
import { createTestPool, resetDb } from '../test/helpers.js';

const pool: pg.Pool = createTestPool();

beforeEach(() => resetDb(pool));
afterAll(() => pool.end());

const officeCount = async () =>
  (await pool.query('SELECT count(*)::int AS n FROM post_office')).rows[0].n as number;

describe('withTransaction', () => {
  it('commits when the work resolves and returns its result', async () => {
    const result = await withTransaction(pool, async (client) => {
      await client.query("INSERT INTO post_office (zip_code, name, address) VALUES ('1', 'A', 'B')");
      return 'done';
    });
    expect(result).toBe('done');
    expect(await officeCount()).toBe(1);
  });

  it('rolls back everything when the work throws', async () => {
    await expect(
      withTransaction(pool, async (client) => {
        await client.query("INSERT INTO post_office (zip_code, name, address) VALUES ('1', 'A', 'B')");
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await officeCount()).toBe(0);
  });
});
