import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { vi } from 'vitest';
import { PostOfficeFormDialog } from './post-office-form-dialog';

describe('PostOfficeFormDialog', () => {
  let http: HttpTestingController;
  const close = vi.fn();

  async function setup(data: unknown) {
    await TestBed.configureTestingModule({
      imports: [PostOfficeFormDialog],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close } },
        { provide: MAT_DIALOG_DATA, useValue: data },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(PostOfficeFormDialog);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const type = (label: string, value: string) => {
      const input = Array.from(el.querySelectorAll('mat-form-field')).find((f) =>
        f.textContent?.includes(label),
      )?.querySelector('input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const submit = async () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit'));
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, el, type, submit };
  }

  beforeEach(() => close.mockClear());
  afterEach(() => http.verify());

  it('does not call the API while the form is invalid', async () => {
    const { submit } = await setup(null);
    await submit();
    http.expectNone('/api/post-offices');
    expect(close).not.toHaveBeenCalled();
  });

  it('creates a post office and closes with the saved value', async () => {
    const { type, submit, fixture } = await setup(null);
    type('ZIP code', '10001');
    type('Name', 'Midtown');
    type('Address', '421 8th Ave');
    await submit();

    const req = http.expectOne('/api/post-offices');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ zipCode: '10001', name: 'Midtown', address: '421 8th Ave' });
    req.flush(req.request.body, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(close).toHaveBeenCalledWith({ zipCode: '10001', name: 'Midtown', address: '421 8th Ave' });
  });

  it('edits through PUT using the original ZIP in the URL', async () => {
    const existing = { zipCode: '10001', name: 'Midtown', address: '421 8th Ave' };
    const { type, submit } = await setup(existing);
    type('ZIP code', '10009');
    await submit();

    const req = http.expectOne('/api/post-offices/10001');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.zipCode).toBe('10009');
    req.flush({ ...existing, zipCode: '10009' });
  });

  it('shows the 409 message on the ZIP field and keeps the dialog open', async () => {
    const { type, submit, fixture, el } = await setup(null);
    type('ZIP code', '10001');
    type('Name', 'Midtown');
    type('Address', '421 8th Ave');
    await submit();

    http
      .expectOne('/api/post-offices')
      .flush({ error: 'A post office with ZIP code 10001 already exists' }, { status: 409, statusText: 'Conflict' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(close).not.toHaveBeenCalled();
    expect(el.querySelector('mat-error')?.textContent).toContain('already exists');
  });
});
