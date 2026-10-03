import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, TestRequest, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ShipmentsPage } from './shipments-page';

const shipment = (n: number, overrides: Record<string, unknown> = {}) => ({
  shipmentNumber: `SHP-${String(n).padStart(10, '0')}`,
  type: 'PACKAGE',
  weightCategory: 'MORE_THAN_5KG',
  originZip: '10001',
  originName: 'Midtown',
  destinationZip: '20002',
  destinationName: 'Harbor',
  currentStatus: 'RECEIVED_AT_ORIGIN',
  createdAt: '2026-10-03T12:38:38.946Z',
  updatedAt: '2026-10-03T12:38:38.946Z',
  ...overrides,
});

describe('ShipmentsPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  const dialogFake = { open: vi.fn() };
  const confirmWith = (answer: boolean) => dialogFake.open.mockReturnValue({ afterClosed: () => of(answer) });

  beforeEach(async () => {
    dialogFake.open.mockReset();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'shipments', component: ShipmentsPage },
          { path: 'shipments/:shipmentNumber', component: ShipmentsPage }, // stands in for the detail page
        ]),
        { provide: MatDialog, useValue: dialogFake },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  const page = () => harness.routeNativeElement as HTMLElement;
  const component = () => harness.routeDebugElement!.componentInstance as any;
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };

  /** Expects the shipments request, and answers the post offices request if it is pending. */
  const listRequest = (): TestRequest => http.expectOne((r) => r.url === '/api/shipments');
  const flushOffices = () =>
    http.match('/api/post-offices').forEach((r) => r.flush([{ zipCode: '10001', name: 'Midtown', address: 'a' }]));
  const respond = async (req: TestRequest, items: unknown[], total = items.length) => {
    req.flush({ items, total, page: 1, pageSize: 25 });
    await settle();
  };
  const open = async (url = '/shipments') => {
    await harness.navigateByUrl(url, ShipmentsPage);
    flushOffices();
  };

  it('loads the first page with the default paging and sorting', async () => {
    await open();
    const req = listRequest();
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('25');
    expect(req.request.params.get('sort')).toBe('createdAt');
    expect(req.request.params.get('order')).toBe('desc');
    expect(req.request.params.has('status')).toBe(false);
    await respond(req, []);
  });

  it('shows each shipment with readable labels and "ZIP · name" offices', async () => {
    await open();
    await respond(listRequest(), [shipment(1), shipment(2, { type: 'LETTER', currentStatus: 'DELIVERED' })]);

    const rows = page().querySelectorAll('tr[mat-row]');
    expect(rows).toHaveLength(2);
    const first = rows[0]!.textContent!;
    expect(first).toContain('SHP-0000000001');
    expect(first).toContain('Package');
    expect(first).toContain('More than 5 kg');
    expect(first).toContain('10001 · Midtown');
    expect(first).toContain('20002 · Harbor');
    expect(first).toContain('Received at origin');
    expect(rows[1]!.textContent).toContain('Letter');
    expect(rows[1]!.textContent).toContain('Delivered');
  });

  it('applies filters, paging and sorting from the URL', async () => {
    await open('/shipments?status=DELIVERED&originZip=10001&page=2&pageSize=10&sort=shipmentNumber&order=asc');
    const req = listRequest();
    expect(Object.fromEntries(req.request.params.keys().map((k) => [k, req.request.params.get(k)]))).toEqual({
      page: '2',
      pageSize: '10',
      sort: 'shipmentNumber',
      order: 'asc',
      status: 'DELIVERED',
      originZip: '10001',
    });
    await respond(req, [], 0);
  });

  it('puts a changed filter in the URL, goes back to page 1 and reloads', async () => {
    await open('/shipments?page=3');
    await respond(listRequest(), [shipment(1)], 80);

    component().setFilter('status', 'DELIVERED');
    await settle();

    const router = TestBed.inject(Router);
    expect(router.url).toBe('/shipments?status=DELIVERED');
    const req = listRequest();
    expect(req.request.params.get('status')).toBe('DELIVERED');
    expect(req.request.params.get('page')).toBe('1');
    await respond(req, []);
  });

  it('changes page and page size through the URL', async () => {
    await open();
    await respond(listRequest(), [shipment(1)], 80);

    component().onPage({ pageIndex: 1, pageSize: 10, length: 80 });
    await settle();

    expect(TestBed.inject(Router).url).toBe('/shipments?page=2&pageSize=10');
    await respond(listRequest(), [shipment(11)], 80);
  });

  it('sorts by the chosen column and returns to page 1', async () => {
    await open('/shipments?page=2');
    await respond(listRequest(), [shipment(1)], 80);

    component().onSort({ active: 'shipmentNumber', direction: 'asc' });
    await settle();

    expect(TestBed.inject(Router).url).toBe('/shipments?sort=shipmentNumber&order=asc');
    await respond(listRequest(), []);
  });

  it('searches by an exact, upper-cased shipment number', async () => {
    await open();
    await respond(listRequest(), []);

    component().search(' shp-0000000002 ');
    await settle();

    expect(TestBed.inject(Router).url).toBe('/shipments?shipmentNumber=SHP-0000000002');
    const req = listRequest();
    expect(req.request.params.get('shipmentNumber')).toBe('SHP-0000000002');
    await respond(req, [shipment(2)]);
    expect(page().querySelectorAll('tr[mat-row]')).toHaveLength(1);
  });

  it('clears all filters and the search', async () => {
    await open('/shipments?status=DELIVERED&type=LETTER&shipmentNumber=SHP-0000000002');
    await respond(listRequest(), []);

    component().clearFilters(page().querySelector('input')!);
    await settle();

    expect(TestBed.inject(Router).url).toBe('/shipments');
    await respond(listRequest(), []);
  });

  it('explains an empty result: nothing yet, filtered out, or number not found', async () => {
    await open();
    await respond(listRequest(), []);
    expect(page().textContent).toContain('No shipments yet');

    await harness.navigateByUrl('/shipments?status=DELIVERED', ShipmentsPage);
    flushOffices();
    await respond(listRequest(), []);
    expect(page().textContent).toContain('No shipments match the current filters');

    await harness.navigateByUrl('/shipments?shipmentNumber=SHP-0000000099', ShipmentsPage);
    flushOffices();
    await respond(listRequest(), []);
    expect(page().textContent).toContain('No shipment found with number SHP-0000000099');
  });

  describe('opening and deleting', () => {
    it('opens the detail page, handing over the grid URL so Back keeps filters and page', async () => {
      await open('/shipments?status=DELIVERED&page=2');
      await respond(listRequest(), [shipment(5)], 30);
      const navigate = vi.spyOn(TestBed.inject(Router), 'navigate');

      (page().querySelector('tr[mat-row]') as HTMLElement).click();

      expect(navigate).toHaveBeenCalledWith(['/shipments', 'SHP-0000000005'], {
        state: { back: '/shipments?status=DELIVERED&page=2' },
      });
    });

    it('deletes after confirmation and reloads the current query', async () => {
      confirmWith(true);
      await open('/shipments?type=LETTER');
      await respond(listRequest(), [shipment(1), shipment(2)], 2);

      const done = component().remove(shipment(1), new Event('click'));
      await settle();
      const del = http.expectOne('/api/shipments/SHP-0000000001');
      expect(del.request.method).toBe('DELETE');
      del.flush(null, { status: 204, statusText: 'No Content' });
      await done;
      await settle();

      const reload = listRequest();
      expect(reload.request.params.get('type')).toBe('LETTER');
      await respond(reload, [shipment(2)], 1);
      expect(page().querySelectorAll('tr[mat-row]')).toHaveLength(1);
    });

    it('does not delete when the confirmation is declined', async () => {
      confirmWith(false);
      await open();
      await respond(listRequest(), [shipment(1)]);

      await component().remove(shipment(1), new Event('click'));

      http.expectNone('/api/shipments/SHP-0000000001');
      expect(dialogFake.open).toHaveBeenCalledTimes(1);
    });

    it('steps back a page when the last row of a later page is deleted', async () => {
      confirmWith(true);
      await open('/shipments?page=3&pageSize=10');
      await respond(listRequest(), [shipment(21)], 21);

      const done = component().remove(shipment(21), new Event('click'));
      await settle();
      http.expectOne('/api/shipments/SHP-0000000021').flush(null, { status: 204, statusText: 'No Content' });
      await done;
      await settle();

      expect(TestBed.inject(Router).url).toBe('/shipments?page=2&pageSize=10');
      expect(listRequest().request.params.get('page')).toBe('2');
    });

    it('keeps the list as it is and reports the problem when the delete fails', async () => {
      confirmWith(true);
      await open();
      await respond(listRequest(), [shipment(1)]);

      const done = component().remove(shipment(1), new Event('click'));
      await settle();
      http
        .expectOne('/api/shipments/SHP-0000000001')
        .flush({ error: 'Shipment not found' }, { status: 404, statusText: 'Not Found' });
      await done;
      await settle();

      http.expectNone((r) => r.url === '/api/shipments');
      expect(page().querySelectorAll('tr[mat-row]')).toHaveLength(1);
    });
  });

  it('shows an error message when loading fails', async () => {
    await open();
    listRequest().flush({ error: 'Internal server error' }, { status: 500, statusText: 'Server Error' });
    await settle();
    expect(page().textContent).toContain('Internal server error');
  });
});
