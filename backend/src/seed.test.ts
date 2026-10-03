import { readFileSync } from 'node:fs';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from './migrate.js';
import { TEST_DATABASE_URL } from '../test/config.js';
import { createDatabaseIfMissing, dropDatabase } from '../test/database.js';

// A scratch database that has only ever seen the migrations, i.e. what a reviewer
// gets on their first `docker compose up`.
const SCRATCH_URL = TEST_DATABASE_URL.replace(/\/[^/]+$/, '/postoffice_seed_check');

let pool: pg.Pool;

beforeAll(async () => {
  await dropDatabase(SCRATCH_URL);
  await createDatabaseIfMissing(SCRATCH_URL);
  await runMigrations(SCRATCH_URL);
  pool = new pg.Pool({ connectionString: SCRATCH_URL });
});

afterAll(async () => {
  await pool.end();
  await dropDatabase(SCRATCH_URL);
});

const q = async <T extends pg.QueryResultRow>(sql: string): Promise<T[]> => (await pool.query<T>(sql)).rows;

describe('seed data on a fresh database', () => {
  it('has the 8 post offices', async () => {
    const [row] = await q<{ n: number }>('SELECT count(*)::int AS n FROM post_office');
    expect(row!.n).toBe(8);
  });

  it('has 30 demo shipments numbered SHP-0000000001..30', async () => {
    const rows = await q<{ shipment_number: string }>('SELECT shipment_number FROM shipment ORDER BY shipment_number');
    expect(rows).toHaveLength(30);
    expect(rows[0]!.shipment_number).toBe('SHP-0000000001');
    expect(rows[29]!.shipment_number).toBe('SHP-0000000030');
  });

  it('covers every status, both types and every weight category', async () => {
    const statuses = await q<{ current_status: string }>('SELECT DISTINCT current_status FROM shipment');
    expect(statuses.map((r) => r.current_status).sort()).toEqual([
      'DELIVERED',
      'RECEIVED_AT_DESTINATION',
      'RECEIVED_AT_ORIGIN',
    ]);
    expect(await q('SELECT DISTINCT type FROM shipment')).toHaveLength(2);
    expect(await q('SELECT DISTINCT weight_category FROM shipment')).toHaveLength(3);
  });

  it('never has the same origin and destination', async () => {
    expect(await q('SELECT 1 FROM shipment WHERE origin_post_office_id = destination_post_office_id')).toHaveLength(0);
  });

  it('keeps the history consistent with each shipment', async () => {
    // current status = last history entry; entries follow the lifecycle with the right offices
    const bad = await q(`
      WITH ordered AS (
        SELECT h.shipment_number, h.status, h.post_office_id,
               row_number() OVER (PARTITION BY h.shipment_number ORDER BY h.timestamp, h.id) AS step,
               count(*)     OVER (PARTITION BY h.shipment_number) AS steps
          FROM shipment_status_history h
      )
      SELECT s.shipment_number
        FROM shipment s
        JOIN ordered o ON o.shipment_number = s.shipment_number
       WHERE (o.step = o.steps AND o.status <> s.current_status)
          OR (o.step = 1 AND (o.status <> 'RECEIVED_AT_ORIGIN' OR o.post_office_id <> s.origin_post_office_id))
          OR (o.step > 1 AND o.post_office_id <> s.destination_post_office_id)
          OR (o.step = 2 AND o.status <> 'RECEIVED_AT_DESTINATION')
          OR (o.step = 3 AND o.status <> 'DELIVERED')`);
    expect(bad).toEqual([]);

    const counts = await q<{ current_status: string; steps: number }>(`
      SELECT s.current_status, count(*)::int AS steps
        FROM shipment s JOIN shipment_status_history h USING (shipment_number)
       GROUP BY s.shipment_number, s.current_status`);
    const expected: Record<string, number> = { RECEIVED_AT_ORIGIN: 1, RECEIVED_AT_DESTINATION: 2, DELIVERED: 3 };
    for (const row of counts) expect(row.steps).toBe(expected[row.current_status]);
  });

  it('continues numbering after the demo shipments', async () => {
    const [row] = await q<{ next: string }>(`SELECT 'SHP-' || lpad(nextval('shipment_seq')::text, 10, '0') AS next`);
    expect(row!.next).toBe('SHP-0000000031');
  });

  it('leaves existing data alone when its SQL is executed again', async () => {
    // Simulates a database that already has shipments (e.g. someone's dev database).
    const counts = async () =>
      (
        await q<{ shipments: number; history: number }>(
          `SELECT (SELECT count(*)::int FROM shipment) AS shipments,
                  (SELECT count(*)::int FROM shipment_status_history) AS history`,
        )
      )[0]!;
    const before = await counts();

    const file = readFileSync('migrations/1759400000002_seed-demo-shipments.sql', 'utf8');
    await pool.query(file.split('-- Down Migration')[0]!);

    expect(await counts()).toEqual(before);
    expect(before.shipments).toBe(30);
  });
});
