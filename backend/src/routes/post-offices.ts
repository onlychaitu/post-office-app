import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { conflict, isUniqueViolation, notFound } from '../errors.js';

const postOfficeBody = z.object({
  zipCode: z
    .string({ error: 'ZIP code is required' })
    .trim()
    .min(1, 'ZIP code is required')
    .max(20, 'ZIP code must be at most 20 characters')
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]*$/, 'ZIP code may only contain letters, digits, spaces and hyphens'),
  name: z
    .string({ error: 'Name is required' })
    .trim()
    .min(1, 'Name is required')
    .max(200, 'Name must be at most 200 characters'),
  address: z
    .string({ error: 'Address is required' })
    .trim()
    .min(1, 'Address is required')
    .max(500, 'Address must be at most 500 characters'),
});

const searchQuery = z.object({
  search: z.string().trim().max(100).optional(),
});

const zipParam = z.string().trim().min(1);

const SELECT_FIELDS = 'p.zip_code AS "zipCode", p.name, p.address';

const duplicateZip = (zip: string) => conflict(`A post office with ZIP code ${zip} already exists`);

/** Escapes LIKE wildcards so user input is matched literally. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (c) => `\\${c}`);

export function postOfficesRouter(pool: pg.Pool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const { search } = searchQuery.parse(req.query);
    const params: string[] = [];
    let where = '';
    if (search) {
      params.push(`%${escapeLike(search)}%`);
      where = 'WHERE p.zip_code ILIKE $1 OR p.name ILIKE $1';
    }
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS} FROM post_office p ${where} ORDER BY p.zip_code`,
      params,
    );
    res.json(rows);
  });

  router.get('/:zip', async (req, res) => {
    const zip = zipParam.parse(req.params.zip);
    const { rows } = await pool.query(
      `SELECT ${SELECT_FIELDS},
              (SELECT count(*)::int FROM shipment s
                WHERE s.origin_post_office_id = p.id
                   OR s.destination_post_office_id = p.id) AS "shipmentCount"
         FROM post_office p
        WHERE p.zip_code = $1`,
      [zip],
    );
    if (rows.length === 0) throw notFound('Post office');
    res.json(rows[0]);
  });

  router.post('/', async (req, res) => {
    const body = postOfficeBody.parse(req.body);
    try {
      const { rows } = await pool.query(
        `INSERT INTO post_office AS p (zip_code, name, address)
         VALUES ($1, $2, $3)
         RETURNING ${SELECT_FIELDS}`,
        [body.zipCode, body.name, body.address],
      );
      res.status(201).json(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateZip(body.zipCode);
      throw err;
    }
  });

  router.put('/:zip', async (req, res) => {
    const zip = zipParam.parse(req.params.zip);
    const body = postOfficeBody.parse(req.body);
    try {
      const { rows } = await pool.query(
        `UPDATE post_office AS p
            SET zip_code = $2, name = $3, address = $4
          WHERE p.zip_code = $1
          RETURNING ${SELECT_FIELDS}`,
        [zip, body.zipCode, body.name, body.address],
      );
      if (rows.length === 0) throw notFound('Post office');
      res.json(rows[0]);
    } catch (err) {
      if (isUniqueViolation(err)) throw duplicateZip(body.zipCode);
      throw err;
    }
  });

  // Cascades: ON DELETE CASCADE removes the office's shipments (as origin or
  // destination) and, through them, their status history.
  router.delete('/:zip', async (req, res) => {
    const zip = zipParam.parse(req.params.zip);
    const result = await pool.query('DELETE FROM post_office WHERE zip_code = $1', [zip]);
    if (result.rowCount === 0) throw notFound('Post office');
    res.status(204).end();
  });

  return router;
}
