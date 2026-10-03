import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ShipmentDetailPage } from './shipment-detail-page';

const NUMBER = 'SHP-0000000007';

const detail = (status: string, historyStatuses: string[]) => ({
  shipmentNumber: NUMBER,
  type: 'PACKAGE',
  weightCategory: 'BETWEEN_1_AND_5KG',
  originZip: '10001',
  originName: 'Midtown',
  destinationZip: '20002',
  destinationName: 'Harbor',
  currentStatus: status,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-02T09:00:00.000Z',
  history: historyStatuses.map((s, i) => ({
    status: s,
    zipCode: s === 'RECEIVED_AT_ORIGIN' ? '10001' : '20002',
    officeName: s === 'RECEIVED_AT_ORIGIN' ? 'Midtown' : 'Harbor',
    timestamp: `2026-10-0${i + 1}T09:00:00.000Z`,
  })),
});

const atOrigin = () => detail('RECEIVED_AT_ORIGIN', ['RECEIVED_AT_ORIGIN']);
const atDestination = () =>
  detail('RECEIVED_AT_DESTINATION', ['RECEIVED_AT_ORIGIN', 'RECEIVED_AT_DESTINATION']);
const delivered = () =>
  detail('DELIVERED', ['RECEIVED_AT_ORIGIN', 'RECEIVED_AT_DESTINATION', 'DELIVERED']);

describe('ShipmentDetailPage', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let router: Router;
  const dialogFake = { open: vi.fn() };
  const confirmWith = (answer: boolean) => dialogFake.open.mockReturnValue({ afterClosed: () => of(answer) });

  beforeEach(async () => {
    dialogFake.open.mockReset();
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([
          { path: 'shipments/:shipmentNumber', component: ShipmentDetailPage },
          { path: 'shipments', component: ShipmentDetailPage }, // stands in for the grid
        ]),
        { provide: MatDialog, useValue: dialogFake },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    harness = await RouterTestingHarness.create();
  });

  afterEach(() => http.verify());

  const el = () => harness.routeNativeElement as HTMLElement;
  const settle = async () => {
    await harness.fixture.whenStable();
    harness.detectChanges();
  };
  const buttons = () => Array.from(el().querySelectorAll('button')).map((b) => b.textContent!.trim());
  const click = async (label: string) => {
    Array.from(el().querySelectorAll('button')).find((b) => b.textContent!.includes(label))!.click();
    await settle();
  };

  async function open(response: object, status = 200) {
    await harness.navigateByUrl(`/shipments/${NUMBER}`, ShipmentDetailPage);
    const req = http.expectOne(`/api/shipments/${NUMBER}`);
    if (status === 200) req.flush(response);
    else req.flush(response, { status, statusText: 'Error' });
    await settle();
  }

  it('shows the shipment fields with readable labels', async () => {
    await open(atOrigin());
    const text = el().textContent!;
    expect(text).toContain(NUMBER);
    expect(text).toContain('Package');
    expect(text).toContain('Between 1 and 5 kg');
    expect(text).toContain('10001 · Midtown');
    expect(text).toContain('20002 · Harbor');
  });

  it('lists the status history oldest first, each entry with its office', async () => {
    await open(delivered());
    const entries = Array.from(el().querySelectorAll('.timeline li')).map((li) => li.textContent!);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toContain('Received at origin');
    expect(entries[0]).toContain('10001 · Midtown');
    expect(entries[1]).toContain('Received at destination');
    expect(entries[1]).toContain('20002 · Harbor');
    expect(entries[2]).toContain('Delivered');
    expect(el().querySelectorAll('.timeline li.current')).toHaveLength(1);
    expect(el().querySelector('.timeline li.current')!.textContent).toContain('Delivered');
  });

  it('offers "received at destination" as the next step for a shipment at its origin', async () => {
    await open(atOrigin());
    expect(buttons()).toContain('arrow_forward Mark as received at destination');
  });

  it('offers "delivered" as the next step for a shipment at its destination', async () => {
    await open(atDestination());
    expect(buttons().some((b) => b.includes('Mark as delivered'))).toBe(true);
    expect(buttons().some((b) => b.includes('Mark as received'))).toBe(false);
  });

  it('offers no next step once delivered, but still allows delete', async () => {
    await open(delivered());
    expect(buttons().some((b) => b.includes('Mark as'))).toBe(false);
    expect(buttons().some((b) => b.includes('Delete'))).toBe(true);
  });

  it('advances, sending the status the user saw, and shows the new state', async () => {
    await open(atOrigin());
    await click('Mark as received at destination');

    const req = http.expectOne(`/api/shipments/${NUMBER}/advance`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ expectedStatus: 'RECEIVED_AT_ORIGIN' });
    req.flush(atDestination());
    await settle();

    expect(el().querySelectorAll('.timeline li')).toHaveLength(2);
    expect(el().querySelector('.status')!.textContent).toContain('Received at destination');
    expect(buttons().some((b) => b.includes('Mark as delivered'))).toBe(true);
  });

  it('reloads the real state when someone else already advanced the shipment (409)', async () => {
    const snackBar = TestBed.inject(MatSnackBar);
    const open$ = vi.spyOn(snackBar, 'open');
    await open(atOrigin());
    await click('Mark as received at destination');

    http
      .expectOne(`/api/shipments/${NUMBER}/advance`)
      .flush(
        { error: 'Shipment status has changed: it is now "Received at destination". Refresh and try again.' },
        { status: 409, statusText: 'Conflict' },
      );
    await settle();
    http.expectOne(`/api/shipments/${NUMBER}`).flush(atDestination());
    await settle();

    expect(open$).toHaveBeenCalledWith(expect.stringContaining('has changed'), 'Dismiss', expect.anything());
    expect(el().querySelector('.status')!.textContent).toContain('Received at destination');
  });

  it('says so when the shipment does not exist', async () => {
    await open({ error: 'Shipment not found' }, 404);
    expect(el().textContent).toContain(`Shipment ${NUMBER} was not found.`);
    expect(el().querySelector('.timeline')).toBeNull();
  });

  it('deletes after confirmation and returns to the shipments list', async () => {
    confirmWith(true);
    await open(atOrigin());
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
    await click('Delete');

    expect(dialogFake.open).toHaveBeenCalledTimes(1);
    const req = http.expectOne(`/api/shipments/${NUMBER}`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await settle();

    expect(navigateByUrl).toHaveBeenCalledWith('/shipments');
  });

  it('does nothing when the delete is not confirmed', async () => {
    confirmWith(false);
    await open(atOrigin());
    await click('Delete');
    http.expectNone(`/api/shipments/${NUMBER}`);
    expect(router.url).toBe(`/shipments/${NUMBER}`);
  });

  it('links back to the shipments list', async () => {
    await open(atOrigin());
    const back = el().querySelector('a.back-link') as HTMLAnchorElement;
    expect(back.getAttribute('href')).toBe('/shipments');
  });
});
