// App-managed enums. The database stores the names as varchar (guarded by CHECK constraints).

export const SHIPMENT_TYPES = ['LETTER', 'PACKAGE'] as const;
export type ShipmentType = (typeof SHIPMENT_TYPES)[number];

export const WEIGHT_CATEGORIES = ['LESS_THAN_1KG', 'BETWEEN_1_AND_5KG', 'MORE_THAN_5KG'] as const;
export type WeightCategory = (typeof WEIGHT_CATEGORIES)[number];

/** In lifecycle order: a shipment only ever moves forward through this list. */
export const SHIPMENT_STATUSES = ['RECEIVED_AT_ORIGIN', 'RECEIVED_AT_DESTINATION', 'DELIVERED'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const INITIAL_STATUS: ShipmentStatus = SHIPMENT_STATUSES[0];

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  RECEIVED_AT_ORIGIN: 'Received at origin',
  RECEIVED_AT_DESTINATION: 'Received at destination',
  DELIVERED: 'Delivered',
};

/**
 * The only legal transition: one step forward. Returns null when the shipment is
 * already delivered. Skipping a step or moving backwards is not possible.
 */
export function nextStatus(current: ShipmentStatus): ShipmentStatus | null {
  return SHIPMENT_STATUSES[SHIPMENT_STATUSES.indexOf(current) + 1] ?? null;
}
