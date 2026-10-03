import { Router } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { withTransaction } from '../db.js';
import {
  INITIAL_STATUS,
  SHIPMENT_STATUSES,
  SHIPMENT_TYPES,
  STATUS_LABELS,
  WEIGHT_CATEGORIES,
  nextStatus,
  type ShipmentStatus,
} from '../domain.js';
import { FieldValidationError, conflict, notFound, type FieldIssue } from '../errors.js';
import { SHIPMENT_FROM, SHIPMENT_SELECT, getShipmentDetail } from '../shipment-queries.js';

const zipField = (label: string) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`);

const createShipmentBody = z
  .object({
    type: z.enum(SHIPMENT_TYPES, { error: 'Type must be LETTER or PACKAGE' }),
    weightCategory: z.enum(WEIGHT_CATEGORIES, {
      error: 'Weight category must be LESS_THAN_1KG, BETWEEN_1_AND_5KG or MORE_THAN_5KG',
    }),
    originZip: zipField('Origin'),
    destinationZip: zipField('Destination'),
  })
  .refine((body) => body.originZip !== body.destinationZip, {
    path: ['destinationZip'],
    message: 'Destination must be different from the origin',
  });

// Shipment numbers are matched case-insensitively (they are stored upper-case).
const numberParam = z.string().trim().min(1).transform((value) => value.toUpperCase());

const advanceBody = z.object({ expectedStatus: z.enum(SHIPMENT_STATUSES).optional() });

const optionalText = z.string().trim().min(1).optional();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sort: z.enum(['createdAt', 'shipmentNumber']).default('createdAt'),
  order: z.enum(['asc', 'desc']).default('desc'),
  // exact match, case-insensitive: the number is unique, so this finds at most one shipment
  shipmentNumber: optionalText,
  type: z.enum(SHIPMENT_TYPES).optional(),
  weightCategory: z.enum(WEIGHT_CATEGORIES).optional(),
  status: z.enum(SHIPMENT_STATUSES).optional(),
  originZip: optionalText,
  destinationZip: optionalText,
});

export function shipmentsRouter(pool: pg.Pool): Router {
  const router = Router();

  router.get('/', async (req, res) => {
    const q = listQuery.parse(req.query);

    const params: unknown[] = [];
    const conditions: string[] = [];
    const addCondition = (sql: (placeholder: string) => string, value: unknown): void => {
      params.push(value);
      conditions.push(sql(`$${params.length}`));
    };

    if (q.shipmentNumber) addCondition((p) => `s.shipment_number = ${p}`, q.shipmentNumber.toUpperCase());
    if (q.type) addCondition((p) => `s.type = ${p}`, q.type);
    if (q.weightCategory) addCondition((p) => `s.weight_category = ${p}`, q.weightCategory);
    if (q.status) addCondition((p) => `s.current_status = ${p}`, q.status);
    if (q.originZip) addCondition((p) => `o.zip_code = ${p}`, q.originZip);
    if (q.destinationZip) addCondition((p) => `d.zip_code = ${p}`, q.destinationZip);
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // The ORDER BY is built only from the validated enums below, never from raw input.
    // shipment_number is unique, so as a tiebreaker it makes paging deterministic
    // when several shipments share a created_at (e.g. batch inserts).
    const direction = q.order === 'asc' ? 'ASC' : 'DESC';
    const orderBy =
      q.sort === 'shipmentNumber'
        ? `s.shipment_number ${direction}`
        : `s.created_at ${direction}, s.shipment_number ${direction}`;

    const [{ rows: items }, { rows: counted }] = await Promise.all([
      pool.query(
        `SELECT ${SHIPMENT_SELECT} FROM ${SHIPMENT_FROM} ${where}
          ORDER BY ${orderBy}
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, q.pageSize, (q.page - 1) * q.pageSize],
      ),
      pool.query<{ total: number }>(
        `SELECT count(*)::int AS total FROM ${SHIPMENT_FROM} ${where}`,
        params,
      ),
    ]);

    res.json({ items, total: counted[0]!.total, page: q.page, pageSize: q.pageSize });
  });

  router.post('/', async (req, res) => {
    const body = createShipmentBody.parse(req.body);

    const shipment = await withTransaction(pool, async (client) => {
      // FOR SHARE keeps both offices from being deleted until this transaction commits.
      const offices = await client.query<{ id: string; zip_code: string }>(
        'SELECT id, zip_code FROM post_office WHERE zip_code = ANY($1::text[]) FOR SHARE',
        [[body.originZip, body.destinationZip]],
      );
      const idByZip = new Map(offices.rows.map((row) => [row.zip_code, row.id]));
      const originId = idByZip.get(body.originZip);
      const destinationId = idByZip.get(body.destinationZip);

      const issues: FieldIssue[] = [];
      if (originId === undefined) {
        issues.push({ field: 'originZip', message: `No post office with ZIP code ${body.originZip}` });
      }
      if (destinationId === undefined) {
        issues.push({
          field: 'destinationZip',
          message: `No post office with ZIP code ${body.destinationZip}`,
        });
      }
      if (originId === undefined || destinationId === undefined) {
        throw new FieldValidationError(issues);
      }

      // shipment_number is generated by the database (sequence-based default).
      const inserted = await client.query<{ shipment_number: string }>(
        `INSERT INTO shipment
           (type, weight_category, origin_post_office_id, destination_post_office_id, current_status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING shipment_number`,
        [body.type, body.weightCategory, originId, destinationId, INITIAL_STATUS],
      );
      const shipmentNumber = inserted.rows[0]!.shipment_number;

      // First history entry: received at the origin office.
      await client.query(
        `INSERT INTO shipment_status_history (shipment_number, status, post_office_id)
         VALUES ($1, $2, $3)`,
        [shipmentNumber, INITIAL_STATUS, originId],
      );

      const { rows } = await client.query(
        `SELECT ${SHIPMENT_SELECT} FROM ${SHIPMENT_FROM} WHERE s.shipment_number = $1`,
        [shipmentNumber],
      );
      return rows[0];
    });

    res.status(201).json(shipment);
  });

  router.get('/:shipmentNumber', async (req, res) => {
    const shipmentNumber = numberParam.parse(req.params.shipmentNumber);
    const detail = await getShipmentDetail(pool, shipmentNumber);
    if (!detail) throw notFound('Shipment');
    res.json(detail);
  });

  // Moves the shipment one step forward and records where that happened. The row is
  // locked, so concurrent advances are applied one after another, never twice at once.
  router.post('/:shipmentNumber/advance', async (req, res) => {
    const shipmentNumber = numberParam.parse(req.params.shipmentNumber);
    const { expectedStatus } = advanceBody.parse(req.body ?? {});

    const detail = await withTransaction(pool, async (client) => {
      const locked = await client.query<{ current_status: ShipmentStatus; destination_post_office_id: string }>(
        `SELECT current_status, destination_post_office_id
           FROM shipment WHERE shipment_number = $1 FOR UPDATE`,
        [shipmentNumber],
      );
      const row = locked.rows[0];
      if (!row) throw notFound('Shipment');

      // Optional guard against a stale view: two employees looking at the same
      // status must not both advance it and skip a step.
      if (expectedStatus && expectedStatus !== row.current_status) {
        throw conflict(
          `Shipment status has changed: it is now "${STATUS_LABELS[row.current_status]}". Refresh and try again.`,
        );
      }
      const next = nextStatus(row.current_status);
      if (!next) throw conflict('Shipment has already been delivered');

      await client.query(
        'UPDATE shipment SET current_status = $2, updated_at = now() WHERE shipment_number = $1',
        [shipmentNumber, next],
      );
      // Both later steps happen at the destination office.
      await client.query(
        `INSERT INTO shipment_status_history (shipment_number, status, post_office_id)
         VALUES ($1, $2, $3)`,
        [shipmentNumber, next, row.destination_post_office_id],
      );
      return getShipmentDetail(client, shipmentNumber);
    });

    res.json(detail);
  });

  // Status history rows are removed by ON DELETE CASCADE, in the same statement.
  router.delete('/:shipmentNumber', async (req, res) => {
    const shipmentNumber = numberParam.parse(req.params.shipmentNumber);
    const result = await pool.query('DELETE FROM shipment WHERE shipment_number = $1', [shipmentNumber]);
    if (result.rowCount === 0) throw notFound('Shipment');
    res.status(204).end();
  });

  return router;
}
