import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { ShipmentFormPage } from './shipment-form-page';

const offices = [
  { zipCode: '10001', name: 'Midtown', address: 'a' },
  { zipCode: '20002', name: 'Harbor', address: 'b' },
];

describe('ShipmentFormPage', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<ShipmentFormPage>;
  let navigate: ReturnType<typeof vi.spyOn>;

  // The form is protected API of the component; tests drive it directly.
  const form = () => (fixture.componentInstance as any)['form'];
  const submit = async () => {
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShipmentFormPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    fixture = TestBed.createComponent(ShipmentFormPage);
    fixture.detectChanges();
    http.expectOne('/api/post-offices').flush(offices);
    await fixture.whenStable();
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('offers the post offices labelled "ZIP · name"', () => {
    const offered = (fixture.componentInstance as any)['offices']();
    expect(offered.map((o: { label: string }) => o.label)).toEqual(['10001 · Midtown', '20002 · Harbor']);
  });

  it('does not call the API while required fields are missing', async () => {
    await submit();
    http.expectNone('/api/shipments');
    expect(form().controls.type.touched).toBe(true);
  });

  it('rejects the same origin and destination without calling the API', async () => {
    form().setValue({ type: 'LETTER', weightCategory: 'LESS_THAN_1KG', originZip: '10001', destinationZip: '10001' });
    await submit();
    http.expectNone('/api/shipments');
    expect(form().errors).toEqual({ sameOffice: true });
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('different from the origin');
  });

  it('creates the shipment and returns to the shipments list', async () => {
    const value = {
      type: 'PACKAGE',
      weightCategory: 'MORE_THAN_5KG',
      originZip: '10001',
      destinationZip: '20002',
    };
    form().setValue(value);
    await submit();

    const req = http.expectOne('/api/shipments');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(value);
    req.flush({ ...value, shipmentNumber: 'SHP-0000000001' }, { status: 201, statusText: 'Created' });
    await fixture.whenStable();

    expect(navigate).toHaveBeenCalledWith(['/shipments']);
  });

  it('shows server-side field errors and stays on the page', async () => {
    form().setValue({ type: 'LETTER', weightCategory: 'LESS_THAN_1KG', originZip: '10001', destinationZip: '20002' });
    await submit();

    http.expectOne('/api/shipments').flush(
      {
        error: 'Validation failed',
        details: [{ field: 'destinationZip', message: 'No post office with ZIP code 20002' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    await fixture.whenStable();
    fixture.detectChanges();

    expect(navigate).not.toHaveBeenCalled();
    expect(form().controls.destinationZip.errors).toEqual({ server: 'No post office with ZIP code 20002' });
  });
});
