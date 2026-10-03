import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, insertPostOffice, resetDb } from '../../test/helpers.js';

const pool: pg.Pool = createTestPool();
const app = createApp(pool);

const valid = {
  type: 'PACKAGE',
  weightCategory: 'BETWEEN_1_AND_5KG',
  originZip: '10001',
  destinationZip: '20002',
};

beforeEach(async () => {
  await resetDb(pool);
  await insertPostOffice(pool, '10001', 'Midtown');
  await insertPostOffice(pool, '20002', 'Harbor');
});
afterAll(() => pool.end());

const fieldsOf = (body: { details: { field: string }[] }) => body.details.map((d) => d.field).sort();

describe('POST /api/shipments', () => {
  it('creates a shipment at the origin office with a generated number', async () => {
    const res = await request(app).post('/api/shipments').send(valid);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      shipmentNumber: 'SHP-0000000001',
      type: 'PACKAGE',
      weightCategory: 'BETWEEN_1_AND_5KG',
      originZip: '10001',
      originName: 'Midtown',
      destinationZip: '20002',
      destinationName: 'Harbor',
      currentStatus: 'RECEIVED_AT_ORIGIN',
    });
    expect(new Date(res.body.createdAt).getTime()).not.toBeNaN();
    expect(res.body.updatedAt).toBe(res.body.createdAt);
    // internal ids are never exposed
    expect(Object.keys(res.body)).not.toContain('id');
  });

  it('records the first status history entry at the origin office', async () => {
    const res = await request(app).post('/api/shipments').send(valid);
    const { rows } = await pool.query(
      `SELECT h.status, p.zip_code
         FROM shipment_status_history h JOIN post_office p ON p.id = h.post_office_id
        WHERE h.shipment_number = $1`,
      [res.body.shipmentNumber],
    );
    expect(rows).toEqual([{ status: 'RECEIVED_AT_ORIGIN', zip_code: '10001' }]);
  });

  it('accepts letters of every weight category', async () => {
    for (const weightCategory of ['LESS_THAN_1KG', 'BETWEEN_1_AND_5KG', 'MORE_THAN_5KG']) {
      await request(app)
        .post('/api/shipments')
        .send({ ...valid, type: 'LETTER', weightCategory })
        .expect(201);
    }
  });

  it('generates distinct sequential numbers, also under concurrent requests', async () => {
    const responses = await Promise.all(
      Array.from({ length: 25 }, () => request(app).post('/api/shipments').send(valid)),
    );
    expect(responses.every((r) => r.status === 201)).toBe(true);
    const numbers = responses.map((r) => r.body.shipmentNumber as string);
    expect(new Set(numbers).size).toBe(25);
    expect([...numbers].sort()[0]).toBe('SHP-0000000001');
    expect([...numbers].sort()[24]).toBe('SHP-0000000025');
  });

  it('rejects an origin that is the same as the destination', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .send({ ...valid, destinationZip: '10001' });
    expect(res.status).toBe(400);
    expect(fieldsOf(res.body)).toEqual(['destinationZip']);
  });

  it('rejects unknown ZIP codes, naming each offending field', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .send({ ...valid, originZip: '00000', destinationZip: '99999' });
    expect(res.status).toBe(400);
    expect(fieldsOf(res.body)).toEqual(['destinationZip', 'originZip']);
    expect(res.body.details[0].message).toContain('00000');

    const onlyDestination = await request(app)
      .post('/api/shipments')
      .send({ ...valid, destinationZip: '99999' });
    expect(fieldsOf(onlyDestination.body)).toEqual(['destinationZip']);
  });

  it('rejects invalid enum values and missing fields', async () => {
    const res = await request(app)
      .post('/api/shipments')
      .send({ type: 'PARCEL', weightCategory: 'HEAVY' });
    expect(res.status).toBe(400);
    expect(fieldsOf(res.body)).toEqual(['destinationZip', 'originZip', 'type', 'weightCategory']);
  });

  it('does not create anything when validation fails', async () => {
    await request(app).post('/api/shipments').send({ ...valid, destinationZip: '99999' }).expect(400);
    const { rows } = await pool.query('SELECT count(*)::int AS n FROM shipment');
    expect(rows[0].n).toBe(0);
  });
});
