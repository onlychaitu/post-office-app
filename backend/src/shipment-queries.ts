import type pg from 'pg';

/**
 * SQL fragments shared by every query that returns shipments, so the API always
 * exposes ZIP codes and names (never internal post office ids).
 */
export const SHIPMENT_SELECT = `
  s.shipment_number  AS "shipmentNumber",
  s.type             AS "type",
  s.weight_category  AS "weightCategory",
  o.zip_code         AS "originZip",
  o.name             AS "originName",
  d.zip_code         AS "destinationZip",
  d.name             AS "destinationName",
  s.current_status   AS "currentStatus",
  s.created_at       AS "createdAt",
  s.updated_at       AS "updatedAt"`;

export const SHIPMENT_FROM = `
  shipment s
  JOIN post_office o ON o.id = s.origin_post_office_id
  JOIN post_office d ON d.id = s.destination_post_office_id`;

/** Works with a pool or a transaction client. */
type Queryable = Pick<pg.Pool, 'query'>;

/** A shipment plus its status history, oldest entry first; undefined when it does not exist. */
export async function getShipmentDetail(db: Queryable, shipmentNumber: string) {
  const { rows } = await db.query(
    `SELECT ${SHIPMENT_SELECT} FROM ${SHIPMENT_FROM} WHERE s.shipment_number = $1`,
    [shipmentNumber],
  );
  if (rows.length === 0) return undefined;

  const history = await db.query(
    `SELECT h.status,
            p.zip_code AS "zipCode",
            p.name     AS "officeName",
            h.timestamp
       FROM shipment_status_history h
       JOIN post_office p ON p.id = h.post_office_id
      WHERE h.shipment_number = $1
      ORDER BY h.timestamp, h.id`,
    [shipmentNumber],
  );
  return { ...rows[0], history: history.rows };
}
