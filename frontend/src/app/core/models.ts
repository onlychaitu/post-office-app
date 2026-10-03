export interface PostOffice {
  zipCode: string;
  name: string;
  address: string;
}

/** Returned when fetching a single post office. */
export interface PostOfficeDetail extends PostOffice {
  /** Shipments (as origin or destination) that deleting this office would also delete. */
  shipmentCount: number;
}

/** How a post office is shown wherever it is selectable or listed: "10001 · Midtown Post Office". */
export const officeLabel = (office: { zipCode: string; name: string }): string =>
  `${office.zipCode} · ${office.name}`;

export const SHIPMENT_TYPES = ['LETTER', 'PACKAGE'] as const;
export type ShipmentType = (typeof SHIPMENT_TYPES)[number];

export const WEIGHT_CATEGORIES = ['LESS_THAN_1KG', 'BETWEEN_1_AND_5KG', 'MORE_THAN_5KG'] as const;
export type WeightCategory = (typeof WEIGHT_CATEGORIES)[number];

/** In lifecycle order. */
export const SHIPMENT_STATUSES = ['RECEIVED_AT_ORIGIN', 'RECEIVED_AT_DESTINATION', 'DELIVERED'] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_TYPE_LABELS: Record<ShipmentType, string> = {
  LETTER: 'Letter',
  PACKAGE: 'Package',
};

export const WEIGHT_CATEGORY_LABELS: Record<WeightCategory, string> = {
  LESS_THAN_1KG: 'Less than 1 kg',
  BETWEEN_1_AND_5KG: 'Between 1 and 5 kg',
  MORE_THAN_5KG: 'More than 5 kg',
};

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  RECEIVED_AT_ORIGIN: 'Received at origin',
  RECEIVED_AT_DESTINATION: 'Received at destination',
  DELIVERED: 'Delivered',
};

export interface Shipment {
  shipmentNumber: string;
  type: ShipmentType;
  weightCategory: WeightCategory;
  originZip: string;
  originName: string;
  destinationZip: string;
  destinationName: string;
  currentStatus: ShipmentStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentHistoryEntry {
  status: ShipmentStatus;
  zipCode: string;
  officeName: string;
  timestamp: string;
}

/** A shipment with its status history, oldest entry first. */
export interface ShipmentDetail extends Shipment {
  history: ShipmentHistoryEntry[];
}

/** The one legal next step, or null once delivered. Mirrors the backend rule. */
export function nextStatus(status: ShipmentStatus): ShipmentStatus | null {
  return SHIPMENT_STATUSES[SHIPMENT_STATUSES.indexOf(status) + 1] ?? null;
}

export type ShipmentSortField = 'createdAt' | 'shipmentNumber';
export type SortOrder = 'asc' | 'desc';

/** Everything the shipments grid sends to GET /api/shipments. Unset filters are omitted. */
export interface ShipmentQuery {
  /** 1-based. */
  page: number;
  pageSize: number;
  sort: ShipmentSortField;
  order: SortOrder;
  shipmentNumber?: string;
  type?: ShipmentType;
  weightCategory?: WeightCategory;
  status?: ShipmentStatus;
  originZip?: string;
  destinationZip?: string;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreateShipmentRequest {
  type: ShipmentType;
  weightCategory: WeightCategory;
  originZip: string;
  destinationZip: string;
}
