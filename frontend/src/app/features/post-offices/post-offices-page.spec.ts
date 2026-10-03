import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PostOfficesPage } from './post-offices-page';

describe('PostOfficesPage', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PostOfficesPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function render(offices: unknown[]): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(PostOfficesPage);
    fixture.detectChanges();
    http.expectOne('/api/post-offices').flush(offices);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a row per post office', async () => {
    const el = await render([
      { zipCode: '10001', name: 'Midtown', address: '421 8th Ave' },
      { zipCode: '20002', name: 'Harbor', address: '1 Pier Rd' },
    ]);
    const rows = el.querySelectorAll('tr[mat-row]');
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('10001');
    expect(rows[0]?.textContent).toContain('Midtown');
    expect(rows[1]?.textContent).toContain('Harbor');
  });

  it('shows an empty state when there are no post offices', async () => {
    const el = await render([]);
    expect(el.querySelectorAll('tr[mat-row]').length).toBe(0);
    expect(el.textContent).toContain('No post offices yet');
  });
});
