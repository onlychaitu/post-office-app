import type pg from 'pg';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { createTestPool, insertPostOffice, insertShipment, resetDb } from '../../test/helpers.js';

const pool: pg.Pool = createTestPool();
const app = createApp(pool);

const office = { zipCode: '10001', name: 'Midtown', address: '421 8th Ave' };

beforeEach(() => resetDb(pool));
afterAll(() => pool.end());

describe('GET /api/post-offices', () => {
  it('returns an empty list when there are none', async () => {
    const res = await request(app).get('/api/post-offices');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns offices ordered by ZIP without exposing internal ids', async () => {
    await insertPostOffice(pool, '20002');
    await insertPostOffice(pool, '10001');
    const res = await request(app).get('/api/post-offices');
    expect(res.body.map((o: { zipCode: string }) => o.zipCode)).toEqual(['10001', '20002']);
    expect(res.body[0]).toEqual({ zipCode: '10001', name: 'Office 10001', address: '10001 Main St' });
  });

  it('filters by ZIP or name, treating wildcards literally', async () => {
    await insertPostOffice(pool, '10001', 'Midtown');
    await insertPostOffice(pool, '20002', 'Harbor 100% Branch');
    const byName = await request(app).get('/api/post-offices').query({ search: 'mid' });
    expect(byName.body.map((o: { zipCode: string }) => o.zipCode)).toEqual(['10001']);
    const byZip = await request(app).get('/api/post-offices').query({ search: '2000' });
    expect(byZip.body.map((o: { zipCode: string }) => o.zipCode)).toEqual(['20002']);
    const literalPercent = await request(app).get('/api/post-offices').query({ search: '%' });
    expect(literalPercent.body.map((o: { zipCode: string }) => o.zipCode)).toEqual(['20002']);
  });
});

describe('POST /api/post-offices', () => {
  it('creates an office and trims input', async () => {
    const res = await request(app)
      .post('/api/post-offices')
      .send({ zipCode: ' 10001 ', name: '  Midtown ', address: ' 421 8th Ave ' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual(office);
  });

  it('rejects missing and invalid fields with details', async () => {
    const res = await request(app).post('/api/post-offices').send({ zipCode: 'bad!zip', name: '' });
    expect(res.status).toBe(400);
    const fields = res.body.details.map((d: { field: string }) => d.field).sort();
    expect(fields).toEqual(['address', 'name', 'zipCode']);
    const address = res.body.details.find((d: { field: string }) => d.field === 'address');
    expect(address.message).toBe('Address is required');
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/post-offices')
      .set('Content-Type', 'application/json')
      .send('{not json');
    expect(res.status).toBe(400);
  });

  it('returns 409 for a duplicate ZIP code', async () => {
    await request(app).post('/api/post-offices').send(office).expect(201);
    const res = await request(app).post('/api/post-offices').send(office);
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('10001');
  });
});

describe('GET /api/post-offices/:zip', () => {
  it('returns the office with the number of shipments a delete would remove', async () => {
    const a = await insertPostOffice(pool, '10001');
    const b = await insertPostOffice(pool, '20002');
    const c = await insertPostOffice(pool, '30003');
    await insertShipment(pool, a, b); // a is origin
    await insertShipment(pool, b, a); // a is destination
    await insertShipment(pool, b, c); // unrelated to a

    const res = await request(app).get('/api/post-offices/10001');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ zipCode: '10001', shipmentCount: 2 });
  });

  it('returns 404 for an unknown ZIP', async () => {
    const res = await request(app).get('/api/post-offices/99999');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/post-offices/:zip', () => {
  it('updates every field, including the ZIP code', async () => {
    await insertPostOffice(pool, '10001');
    const res = await request(app)
      .put('/api/post-offices/10001')
      .send({ zipCode: '10002', name: 'Renamed', address: 'New address' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ zipCode: '10002', name: 'Renamed', address: 'New address' });
    await request(app).get('/api/post-offices/10001').expect(404);
    await request(app).get('/api/post-offices/10002').expect(200);
  });

  it('keeps shipments attached when the ZIP changes', async () => {
    const a = await insertPostOffice(pool, '10001');
    const b = await insertPostOffice(pool, '20002');
    await insertShipment(pool, a, b);
    await request(app)
      .put('/api/post-offices/10001')
      .send({ zipCode: '10009', name: 'Moved', address: 'Elsewhere' })
      .expect(200);
    const res = await request(app).get('/api/post-offices/10009');
    expect(res.body.shipmentCount).toBe(1);
  });

  it('allows saving without changing the ZIP', async () => {
    await insertPostOffice(pool, '10001');
    const res = await request(app)
      .put('/api/post-offices/10001')
      .send({ zipCode: '10001', name: 'Only name changed', address: 'Same' });
    expect(res.status).toBe(200);
  });

  it('returns 409 when the new ZIP belongs to another office', async () => {
    await insertPostOffice(pool, '10001');
    await insertPostOffice(pool, '20002');
    const res = await request(app).put('/api/post-offices/10001').send({ ...office, zipCode: '20002' });
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown ZIP and 400 for an invalid body', async () => {
    await request(app).put('/api/post-offices/99999').send(office).expect(404);
    await insertPostOffice(pool, '10001');
    await request(app).put('/api/post-offices/10001').send({ zipCode: '10001' }).expect(400);
  });
});

describe('DELETE /api/post-offices/:zip', () => {
  it('deletes the office and cascades to its shipments and their history', async () => {
    const a = await insertPostOffice(pool, '10001');
    const b = await insertPostOffice(pool, '20002');
    const c = await insertPostOffice(pool, '30003');
    await insertShipment(pool, a, b); // removed: a is origin
    await insertShipment(pool, c, a); // removed: a is destination
    const kept = await insertShipment(pool, b, c); // unrelated

    await request(app).delete('/api/post-offices/10001').expect(204);

    const shipments = await pool.query('SELECT shipment_number FROM shipment');
    expect(shipments.rows.map((r) => r.shipment_number)).toEqual([kept]);
    const history = await pool.query('SELECT shipment_number FROM shipment_status_history');
    expect(history.rows.map((r) => r.shipment_number)).toEqual([kept]);
    await request(app).get('/api/post-offices/10001').expect(404);
  });

  it('returns 404 for an unknown ZIP', async () => {
    await request(app).delete('/api/post-offices/99999').expect(404);
  });
});
