import { convertToParamMap } from '@angular/router';
import { ShipmentQuery } from '../../core/models';
import { DEFAULT_QUERY, hasActiveFilters, parseQuery, toQueryParams } from './shipment-query';

const params = (values: Record<string, string>) => convertToParamMap(values);

describe('parseQuery', () => {
  it('returns the defaults for an empty URL', () => {
    expect(parseQuery(params({}))).toEqual({
      ...DEFAULT_QUERY,
      shipmentNumber: undefined,
      type: undefined,
      weightCategory: undefined,
      status: undefined,
      originZip: undefined,
      destinationZip: undefined,
    });
  });

  it('reads valid values', () => {
    const query = parseQuery(
      params({
        page: '3',
        pageSize: '50',
        sort: 'shipmentNumber',
        order: 'asc',
        type: 'PACKAGE',
        weightCategory: 'MORE_THAN_5KG',
        status: 'DELIVERED',
        originZip: ' 10001 ',
        destinationZip: '20002',
      }),
    );
    expect(query).toMatchObject({
      page: 3,
      pageSize: 50,
      sort: 'shipmentNumber',
      order: 'asc',
      type: 'PACKAGE',
      weightCategory: 'MORE_THAN_5KG',
      status: 'DELIVERED',
      originZip: '10001',
      destinationZip: '20002',
    });
  });

  it('upper-cases the shipment number', () => {
    expect(parseQuery(params({ shipmentNumber: ' shp-0000000002 ' })).shipmentNumber).toBe('SHP-0000000002');
  });

  it('falls back to defaults / drops values it does not recognise', () => {
    const query = parseQuery(
      params({
        page: '-4',
        pageSize: '7',
        sort: 'currentStatus',
        order: 'sideways',
        type: 'PARCEL',
        status: 'LOST',
        originZip: '   ',
      }),
    );
    expect(query).toMatchObject({ page: 1, pageSize: 25, sort: 'createdAt', order: 'desc' });
    expect(query.type).toBeUndefined();
    expect(query.status).toBeUndefined();
    expect(query.originZip).toBeUndefined();
  });

  it('treats a non-integer page as the first page', () => {
    expect(parseQuery(params({ page: '2.5' })).page).toBe(1);
    expect(parseQuery(params({ page: 'abc' })).page).toBe(1);
  });
});

describe('toQueryParams', () => {
  it('omits defaults and unset filters so URLs stay short', () => {
    const result = toQueryParams({ ...DEFAULT_QUERY });
    expect(Object.values(result).every((v) => v === null)).toBe(true);
  });

  it('keeps non-default values', () => {
    const query: ShipmentQuery = {
      ...DEFAULT_QUERY,
      page: 2,
      pageSize: 10,
      sort: 'shipmentNumber',
      order: 'asc',
      status: 'DELIVERED',
    };
    expect(toQueryParams(query)).toMatchObject({
      page: 2,
      pageSize: 10,
      sort: 'shipmentNumber',
      order: 'asc',
      status: 'DELIVERED',
      type: null,
    });
  });

  it('round-trips through parseQuery', () => {
    const query: ShipmentQuery = {
      ...DEFAULT_QUERY,
      page: 4,
      type: 'LETTER',
      originZip: '10001',
      shipmentNumber: 'SHP-0000000007',
    };
    const asParams = Object.fromEntries(
      Object.entries(toQueryParams(query)).filter(([, v]) => v !== null),
    ) as Record<string, string>;
    expect(parseQuery(convertToParamMap(asParams))).toMatchObject(query);
  });
});

describe('hasActiveFilters', () => {
  it('ignores paging and sorting', () => {
    expect(hasActiveFilters({ ...DEFAULT_QUERY, page: 3, sort: 'shipmentNumber', order: 'asc' })).toBe(false);
  });

  it('is true when any filter is set', () => {
    expect(hasActiveFilters({ ...DEFAULT_QUERY, type: 'LETTER' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_QUERY, destinationZip: '1' })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_QUERY, shipmentNumber: 'SHP-1' })).toBe(true);
  });
});
