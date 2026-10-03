import pg from 'pg';
import { TEST_DATABASE_URL } from './config.js';

export function createTestPool(): pg.Pool {
  return new pg.Pool({ connectionString: TEST_DATABASE_URL });
}

/** Empties all data (including the migration-seeded post offices) and restarts the shipment numbers. */
export async function resetDb(pool: pg.Pool): Promise<void> {
  await pool.query('TRUNCATE post_office, shipment, shipment_status_history RESTART IDENTITY CASCADE');
  await pool.query('ALTER SEQUENCE shipment_seq RESTART');
}

export async function insertPostOffice(
  pool: pg.Pool,
  zipCode: string,
  name = `Office ${zipCode}`,
  address = `${zipCode} Main St`,
): Promise<number> {
  const { rows } = await pool.query(
    'INSERT INTO post_office (zip_code, name, address) VALUES ($1, $2, $3) RETURNING id',
    [zipCode, name, address],
  );
  return rows[0].id as number;
}

export interface ShipmentOverrides {
  type?: string;
  weightCategory?: string;
  status?: string;
  /** ISO timestamp; defaults to now(). */
  createdAt?: string;
}

/** Inserts a shipment with its first history row; returns the generated shipment number. */
export async function insertShipment(
  pool: pg.Pool,
  originId: number,
  destinationId: number,
  overrides: ShipmentOverrides = {},
): Promise<string> {
  const { rows } = await pool.query(
    `INSERT INTO shipment
       (type, weight_category, origin_post_office_id, destination_post_office_id, current_status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()), COALESCE($6::timestamptz, now()))
     RETURNING shipment_number`,
    [
      overrides.type ?? 'LETTER',
      overrides.weightCategory ?? 'LESS_THAN_1KG',
      originId,
      destinationId,
      overrides.status ?? 'RECEIVED_AT_ORIGIN',
      overrides.createdAt ?? null,
    ],
  );
  const shipmentNumber = rows[0].shipment_number as string;
  await pool.query(
    `INSERT INTO shipment_status_history (shipment_number, status, post_office_id)
     VALUES ($1, 'RECEIVED_AT_ORIGIN', $2)`,
    [shipmentNumber, originId],
  );
  return shipmentNumber;
}
