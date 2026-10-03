import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CreateShipmentRequest } from './models';
import { ShipmentService } from './shipment.service';

describe('ShipmentService', () => {
  let service: ShipmentService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ShipmentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists shipments sending paging, sorting and only the filters that are set', () => {
    service
      .list({ page: 2, pageSize: 10, sort: 'shipmentNumber', order: 'asc', status: 'DELIVERED', type: undefined })
      .subscribe();

    const req = http.expectOne((r) => r.url === '/api/shipments');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.get('sort')).toBe('shipmentNumber');
    expect(req.request.params.get('order')).toBe('asc');
    expect(req.request.params.get('status')).toBe('DELIVERED');
    expect(req.request.params.has('type')).toBe(false);
    req.flush({ items: [], total: 0, page: 2, pageSize: 10 });
  });

  it('gets one shipment with its history', () => {
    service.get('SHP-0000000001').subscribe();
    const req = http.expectOne('/api/shipments/SHP-0000000001');
    expect(req.request.method).toBe('GET');
    req.flush({ history: [] });
  });

  it('advances with POST, sending the status the user was looking at', () => {
    service.advance('SHP-0000000001', 'RECEIVED_AT_ORIGIN').subscribe();
    const req = http.expectOne('/api/shipments/SHP-0000000001/advance');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ expectedStatus: 'RECEIVED_AT_ORIGIN' });
    req.flush({});
  });

  it('deletes a shipment', () => {
    service.delete('SHP-0000000001').subscribe();
    const req = http.expectOne('/api/shipments/SHP-0000000001');
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('creates a shipment with POST /api/shipments', () => {
    const body: CreateShipmentRequest = {
      type: 'LETTER',
      weightCategory: 'LESS_THAN_1KG',
      originZip: '10001',
      destinationZip: '20002',
    };
    let created: unknown;
    service.create(body).subscribe((s) => (created = s));

    const req = http.expectOne('/api/shipments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({ shipmentNumber: 'SHP-0000000001' }, { status: 201, statusText: 'Created' });
    expect(created).toEqual({ shipmentNumber: 'SHP-0000000001' });
  });
});
