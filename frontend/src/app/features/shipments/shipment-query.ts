import { ParamMap, Params } from '@angular/router';
import {
  SHIPMENT_STATUSES,
  SHIPMENT_TYPES,
  ShipmentQuery,
  ShipmentSortField,
  SortOrder,
  WEIGHT_CATEGORIES,
} from '../../core/models';

export const PAGE_SIZE_OPTIONS = [10, 25, 50];

export const DEFAULT_QUERY: ShipmentQuery = {
  page: 1,
  pageSize: 25,
  sort: 'createdAt',
  order: 'desc',
};

const SORT_FIELDS: readonly ShipmentSortField[] = ['createdAt', 'shipmentNumber'];
const ORDERS: readonly SortOrder[] = ['asc', 'desc'];

const oneOf = <T extends string>(allowed: readonly T[], value: string | null): T | undefined =>
  allowed.find((candidate) => candidate === value);

const text = (value: string | null): string | undefined => value?.trim() || undefined;

/**
 * Reads the grid state from URL query params. The URL is the single source of
 * truth, so anything unrecognised falls back to the default rather than failing.
 */
export function parseQuery(params: ParamMap): ShipmentQuery {
  const page = Number(params.get('page'));
  const pageSize = Number(params.get('pageSize'));
  return {
    page: Number.isInteger(page) && page >= 1 ? page : DEFAULT_QUERY.page,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSize) ? pageSize : DEFAULT_QUERY.pageSize,
    sort: oneOf(SORT_FIELDS, params.get('sort')) ?? DEFAULT_QUERY.sort,
    order: oneOf(ORDERS, params.get('order')) ?? DEFAULT_QUERY.order,
    shipmentNumber: text(params.get('shipmentNumber'))?.toUpperCase(),
    type: oneOf(SHIPMENT_TYPES, params.get('type')),
    weightCategory: oneOf(WEIGHT_CATEGORIES, params.get('weightCategory')),
    status: oneOf(SHIPMENT_STATUSES, params.get('status')),
    originZip: text(params.get('originZip')),
    destinationZip: text(params.get('destinationZip')),
  };
}

/**
 * Query params for router.navigate. Defaults and unset filters are null, which
 * removes them from the URL, keeping links short.
 */
export function toQueryParams(query: ShipmentQuery): Params {
  const orNull = <T>(value: T | undefined, fallback?: T): T | null =>
    value === undefined || value === fallback ? null : value;
  return {
    page: orNull(query.page, DEFAULT_QUERY.page),
    pageSize: orNull(query.pageSize, DEFAULT_QUERY.pageSize),
    sort: orNull(query.sort, DEFAULT_QUERY.sort),
    order: orNull(query.order, DEFAULT_QUERY.order),
    shipmentNumber: orNull(query.shipmentNumber),
    type: orNull(query.type),
    weightCategory: orNull(query.weightCategory),
    status: orNull(query.status),
    originZip: orNull(query.originZip),
    destinationZip: orNull(query.destinationZip),
  };
}

/** True when any filter (not paging/sorting) is set. */
export function hasActiveFilters(query: ShipmentQuery): boolean {
  return Boolean(
    query.shipmentNumber ||
      query.type ||
      query.weightCategory ||
      query.status ||
      query.originZip ||
      query.destinationZip,
  );
}
