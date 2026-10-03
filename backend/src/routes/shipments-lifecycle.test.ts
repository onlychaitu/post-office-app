import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, insertPostOffice, resetDb } from '../../test/helpers.js';

const pool: pg.Pool = createTestPool();
const app = createApp(pool);

beforeEach(async () => {
  await resetDb(pool);
  await insertPostOffice(pool, '10001', 'Midtown');
  await insertPostOffice(pool, '20002', 'Harbor');
});
afterAll(() => pool.end());

/** Creates a shipment 10001 -> 20002 through the API and returns its number. */
async function createShipment(): Promise<string> {
  const res = await request(app)
    .post('/api/shipments')
    .send({ type: 'PACKAGE', weightCategory: 'BETWEEN_1_AND_5KG', originZip: '10001', destinationZip: '20002' })
    .expect(201);
  return res.body.shipmentNumber;
}

const historyRows = async (number: string) =>
  (
    await pool.query(
      `SELECT h.status, p.zip_code FROM shipment_status_history h
         JOIN post_office p ON p.id = h.post_office_id
        WHERE h.shipment_number = $1 ORDER BY h.id`,
      [number],
    )
  ).rows;

describe('GET /api/shipments/:shipmentNumber', () => {
  it('returns the shipment with its status history, oldest first', async () => {
    const number = await createShipment();
    await request(app).post(`/api/shipments/${number}/advance`).expect(200);

    const res = await request(app).get(`/api/shipments/${number}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      shipmentNumber: number,
      type: 'PACKAGE',
      weightCategory: 'BETWEEN_1_AND_5KG',
      originZip: '10001',
      originName: 'Midtown',
      destinationZip: '20002',
      destinationName: 'Harbor',
      currentStatus: 'RECEIVED_AT_DESTINATION',
    });
    expect(res.body.history).toHaveLength(2);
    expect(res.body.history[0]).toMatchObject({
      status: 'RECEIVED_AT_ORIGIN',
      zipCode: '10001',
      officeName: 'Midtown',
    });
    expect(res.body.history[1]).toMatchObject({
      status: 'RECEIVED_AT_DESTINATION',
      zipCode: '20002',
      officeName: 'Harbor',
    });
    expect(new Date(res.body.history[0].timestamp).getTime()).toBeLessThanOrEqual(
      new Date(res.body.history[1].timestamp).getTime(),
    );
  });

  it('is case-insensitive about the number', async () => {
    const number = await createShipment();
    const res = await request(app).get(`/api/shipments/${number.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.shipmentNumber).toBe(number);
  });

  it('returns 404 for an unknown number', async () => {
    await request(app).get('/api/shipments/SHP-0000000099').expect(404);
  });
});

describe('POST /api/shipments/:shipmentNumber/advance', () => {
  it('walks origin -> destination -> delivered, recording each step at the right office', async () => {
    const number = await createShipment();

    const first = await request(app).post(`/api/shipments/${number}/advance`);
    expect(first.status).toBe(200);
    expect(first.body.currentStatus).toBe('RECEIVED_AT_DESTINATION');
    expect(new Date(first.body.updatedAt).getTime()).toBeGreaterThan(new Date(first.body.createdAt).getTime());

    const second = await request(app).post(`/api/shipments/${number}/advance`);
    expect(second.body.currentStatus).toBe('DELIVERED');
    expect(second.body.history.map((h: { status: string }) => h.status)).toEqual([
      'RECEIVED_AT_ORIGIN',
      'RECEIVED_AT_DESTINATION',
      'DELIVERED',
    ]);

    expect(await historyRows(number)).toEqual([
      { status: 'RECEIVED_AT_ORIGIN', zip_code: '10001' },
      { status: 'RECEIVED_AT_DESTINATION', zip_code: '20002' },
      { status: 'DELIVERED', zip_code: '20002' },
    ]);
  });

  it('rejects advancing a delivered shipment with 409 and changes nothing', async () => {
    const number = await createShipment();
    await request(app).post(`/api/shipments/${number}/advance`).expect(200);
    await request(app).post(`/api/shipments/${number}/advance`).expect(200);

    const res = await request(app).post(`/api/shipments/${number}/advance`);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already been delivered');
    expect(await historyRows(number)).toHaveLength(3);
    const { rows } = await pool.query('SELECT current_status FROM shipment WHERE shipment_number = $1', [number]);
    expect(rows[0].current_status).toBe('DELIVERED');
  });

  it('returns 404 for an unknown shipment', async () => {
    await request(app).post('/api/shipments/SHP-0000000099/advance').expect(404);
  });

  describe('expectedStatus guard', () => {
    it('advances when the expected status matches', async () => {
      const number = await createShipment();
      const res = await request(app)
        .post(`/api/shipments/${number}/advance`)
        .send({ expectedStatus: 'RECEIVED_AT_ORIGIN' });
      expect(res.status).toBe(200);
      expect(res.body.currentStatus).toBe('RECEIVED_AT_DESTINATION');
    });

    it('returns 409, naming the current status, when the shipment has moved on', async () => {
      const number = await createShipment();
      await request(app).post(`/api/shipments/${number}/advance`).expect(200);

      const res = await request(app)
        .post(`/api/shipments/${number}/advance`)
        .send({ expectedStatus: 'RECEIVED_AT_ORIGIN' });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain('Received at destination');
      expect(await historyRows(number)).toHaveLength(2);
    });

    it('rejects an unknown status value with 400', async () => {
      const number = await createShipment();
      await request(app)
        .post(`/api/shipments/${number}/advance`)
        .send({ expectedStatus: 'LOST' })
        .expect(400);
    });
  });

  describe('concurrency', () => {
    it('lets exactly one of several identical stale advances win', async () => {
      const number = await createShipment();
      const responses = await Promise.all(
        Array.from({ length: 6 }, () =>
          request(app).post(`/api/shipments/${number}/advance`).send({ expectedStatus: 'RECEIVED_AT_ORIGIN' }),
        ),
      );
      expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(5);
      expect(await historyRows(number)).toHaveLength(2);
    });

    it('applies unguarded concurrent advances one after another, never duplicating history', async () => {
      const number = await createShipment();
      const responses = await Promise.all(
        Array.from({ length: 6 }, () => request(app).post(`/api/shipments/${number}/advance`)),
      );
      // two steps are available: the rest are rejected as already delivered
      expect(responses.filter((r) => r.status === 200)).toHaveLength(2);
      expect(responses.filter((r) => r.status === 409)).toHaveLength(4);
      expect(await historyRows(number)).toEqual([
        { status: 'RECEIVED_AT_ORIGIN', zip_code: '10001' },
        { status: 'RECEIVED_AT_DESTINATION', zip_code: '20002' },
        { status: 'DELIVERED', zip_code: '20002' },
      ]);
    });
  });
});

describe('DELETE /api/shipments/:shipmentNumber', () => {
  it('deletes the shipment and its history, leaving other shipments alone', async () => {
    const doomed = await createShipment();
    const kept = await createShipment();
    await request(app).post(`/api/shipments/${doomed}/advance`).expect(200);

    await request(app).delete(`/api/shipments/${doomed}`).expect(204);

    await request(app).get(`/api/shipments/${doomed}`).expect(404);
    expect(await historyRows(doomed)).toEqual([]);
    expect(await historyRows(kept)).toHaveLength(1);
    const list = await request(app).get('/api/shipments');
    expect(list.body.items.map((s: { shipmentNumber: string }) => s.shipmentNumber)).toEqual([kept]);
  });

  it('can delete a delivered shipment', async () => {
    const number = await createShipment();
    await request(app).post(`/api/shipments/${number}/advance`).expect(200);
    await request(app).post(`/api/shipments/${number}/advance`).expect(200);
    await request(app).delete(`/api/shipments/${number}`).expect(204);
  });

  it('returns 404 for an unknown number, including a second delete', async () => {
    const number = await createShipment();
    await request(app).delete(`/api/shipments/${number}`).expect(204);
    await request(app).delete(`/api/shipments/${number}`).expect(404);
  });
});
