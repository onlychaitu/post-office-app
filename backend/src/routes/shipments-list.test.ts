import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, insertPostOffice, insertShipment, resetDb } from '../../test/helpers.js';

const pool: pg.Pool = createTestPool();
const app = createApp(pool);

let a: number; // 10001 Midtown
let b: number; // 20002 Harbor
let c: number; // 30003 Airport

beforeEach(async () => {
  await resetDb(pool);
  a = await insertPostOffice(pool, '10001', 'Midtown');
  b = await insertPostOffice(pool, '20002', 'Harbor');
  c = await insertPostOffice(pool, '30003', 'Airport');
});
afterAll(() => pool.end());

const list = (query: Record<string, string | number> = {}) =>
  request(app).get('/api/shipments').query(query);
const numbers = (body: { items: { shipmentNumber: string }[] }) => body.items.map((s) => s.shipmentNumber);

describe('GET /api/shipments', () => {
  it('returns an empty page when there are no shipments', async () => {
    const res = await list();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], total: 0, page: 1, pageSize: 25 });
  });

  it('returns shipments with ZIPs and names, newest first by default', async () => {
    await insertShipment(pool, a, b, { createdAt: '2026-01-01T10:00:00Z' });
    await insertShipment(pool, b, c, { createdAt: '2026-03-01T10:00:00Z', type: 'PACKAGE', weightCategory: 'MORE_THAN_5KG' });

    const res = await list();
    expect(numbers(res.body)).toEqual(['SHP-0000000002', 'SHP-0000000001']);
    expect(res.body.items[0]).toMatchObject({
      shipmentNumber: 'SHP-0000000002',
      type: 'PACKAGE',
      weightCategory: 'MORE_THAN_5KG',
      originZip: '20002',
      originName: 'Harbor',
      destinationZip: '30003',
      destinationName: 'Airport',
      currentStatus: 'RECEIVED_AT_ORIGIN',
    });
    expect(res.body.total).toBe(2);
  });

  it('sorts by creation time or shipment number, ascending or descending', async () => {
    await insertShipment(pool, a, b, { createdAt: '2026-03-01T00:00:00Z' }); // 1: newest
    await insertShipment(pool, a, b, { createdAt: '2026-01-01T00:00:00Z' }); // 2: oldest
    await insertShipment(pool, a, b, { createdAt: '2026-02-01T00:00:00Z' }); // 3

    expect(numbers((await list({ sort: 'createdAt', order: 'asc' })).body)).toEqual([
      'SHP-0000000002', 'SHP-0000000003', 'SHP-0000000001',
    ]);
    expect(numbers((await list({ sort: 'shipmentNumber', order: 'asc' })).body)).toEqual([
      'SHP-0000000001', 'SHP-0000000002', 'SHP-0000000003',
    ]);
    expect(numbers((await list({ sort: 'shipmentNumber', order: 'desc' })).body)).toEqual([
      'SHP-0000000003', 'SHP-0000000002', 'SHP-0000000001',
    ]);
  });

  describe('paging', () => {
    beforeEach(async () => {
      for (let i = 0; i < 7; i++) await insertShipment(pool, a, b);
    });

    it('returns the requested page and the overall total', async () => {
      const first = await list({ page: 1, pageSize: 3 });
      expect(first.body).toMatchObject({ total: 7, page: 1, pageSize: 3 });
      expect(first.body.items).toHaveLength(3);
      expect((await list({ page: 3, pageSize: 3 })).body.items).toHaveLength(1);
    });

    it('returns no items, but the true total, past the last page', async () => {
      const res = await list({ page: 4, pageSize: 3 });
      expect(res.body.items).toEqual([]);
      expect(res.body.total).toBe(7);
    });

    it('pages deterministically even when every shipment has the same timestamp', async () => {
      await pool.query("UPDATE shipment SET created_at = '2026-05-05T05:05:05Z'");
      const seen: string[] = [];
      for (const page of [1, 2, 3, 4]) {
        seen.push(...numbers((await list({ page, pageSize: 2 })).body));
      }
      expect(seen).toHaveLength(7);
      expect(new Set(seen).size).toBe(7);
    });
  });

  describe('filters', () => {
    beforeEach(async () => {
      await insertShipment(pool, a, b, { type: 'LETTER', weightCategory: 'LESS_THAN_1KG' }); // 1
      await insertShipment(pool, a, c, { type: 'PACKAGE', weightCategory: 'MORE_THAN_5KG', status: 'RECEIVED_AT_DESTINATION' }); // 2
      await insertShipment(pool, b, c, { type: 'PACKAGE', weightCategory: 'BETWEEN_1_AND_5KG', status: 'DELIVERED' }); // 3
      await insertShipment(pool, c, a, { type: 'LETTER', weightCategory: 'MORE_THAN_5KG', status: 'DELIVERED' }); // 4
    });

    const found = async (query: Record<string, string>) =>
      numbers((await list({ sort: 'shipmentNumber', order: 'asc', ...query })).body);

    it('filters by type', async () => {
      expect(await found({ type: 'PACKAGE' })).toEqual(['SHP-0000000002', 'SHP-0000000003']);
    });

    it('filters by weight category', async () => {
      expect(await found({ weightCategory: 'MORE_THAN_5KG' })).toEqual(['SHP-0000000002', 'SHP-0000000004']);
    });

    it('filters by status', async () => {
      expect(await found({ status: 'DELIVERED' })).toEqual(['SHP-0000000003', 'SHP-0000000004']);
    });

    it('filters by origin and by destination ZIP', async () => {
      expect(await found({ originZip: '10001' })).toEqual(['SHP-0000000001', 'SHP-0000000002']);
      expect(await found({ destinationZip: '30003' })).toEqual(['SHP-0000000002', 'SHP-0000000003']);
    });

    it('combines filters with AND, and reports the filtered total', async () => {
      const res = await list({ type: 'PACKAGE', status: 'DELIVERED', destinationZip: '30003' });
      expect(numbers(res.body)).toEqual(['SHP-0000000003']);
      expect(res.body.total).toBe(1);
    });

    it('returns an empty page, not an error, for an unknown ZIP', async () => {
      const res = await list({ originZip: '00000' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ items: [], total: 0 });
    });
  });

  describe('shipment number search', () => {
    beforeEach(async () => {
      for (let i = 0; i < 12; i++) await insertShipment(pool, a, b);
    });

    it('matches the number exactly and case-insensitively', async () => {
      const res = await list({ shipmentNumber: ' shp-0000000002 ' });
      expect(numbers(res.body)).toEqual(['SHP-0000000002']);
      expect(res.body.total).toBe(1);
    });

    it('does not match partial numbers', async () => {
      for (const partial of ['0000000002', 'SHP-00000000', 'SHP-000000000']) {
        expect((await list({ shipmentNumber: partial })).body.total).toBe(0);
      }
    });

    it('applies together with the other filters', async () => {
      expect((await list({ shipmentNumber: 'SHP-0000000002', type: 'PACKAGE' })).body.total).toBe(0);
      expect((await list({ shipmentNumber: 'SHP-0000000002', type: 'LETTER' })).body.total).toBe(1);
    });
  });

  describe('validation', () => {
    it.each([
      ['page 0', { page: 0 }],
      ['non-numeric page', { page: 'abc' }],
      ['pageSize 0', { pageSize: 0 }],
      ['pageSize above 100', { pageSize: 101 }],
      ['unknown sort field', { sort: 'currentStatus' }],
      ['unknown order', { order: 'sideways' }],
      ['unknown type', { type: 'PARCEL' }],
      ['unknown status', { status: 'LOST' }],
      ['unknown weight category', { weightCategory: 'HEAVY' }],
    ])('rejects %s with 400', async (_label, query) => {
      const res = await list(query);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('does not let sort input reach the SQL', async () => {
      const res = await list({ sort: 's.created_at; DROP TABLE shipment' });
      expect(res.status).toBe(400);
      const { rows } = await pool.query("SELECT to_regclass('shipment') AS t");
      expect(rows[0].t).toBe('shipment');
    });
  });
});
