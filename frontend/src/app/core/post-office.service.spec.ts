import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PostOfficeService } from './post-office.service';

describe('PostOfficeService', () => {
  let service: PostOfficeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PostOfficeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists post offices, passing the search term only when given', () => {
    service.list().subscribe();
    http.expectOne('/api/post-offices').flush([]);

    service.list('mid').subscribe();
    const req = http.expectOne((r) => r.url === '/api/post-offices');
    expect(req.request.params.get('search')).toBe('mid');
    req.flush([]);
  });

  it('url-encodes the ZIP code in item requests', () => {
    service.get('A B/1').subscribe();
    http.expectOne('/api/post-offices/A%20B%2F1').flush({});
  });

  it('creates, updates and deletes through the matching HTTP verbs', () => {
    const office = { zipCode: '10001', name: 'Midtown', address: '421 8th Ave' };

    service.create(office).subscribe();
    const post = http.expectOne('/api/post-offices');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual(office);
    post.flush(office);

    service.update('10001', { ...office, zipCode: '10002' }).subscribe();
    const put = http.expectOne('/api/post-offices/10001');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body.zipCode).toBe('10002');
    put.flush(office);

    service.delete('10001').subscribe();
    const del = http.expectOne('/api/post-offices/10001');
    expect(del.request.method).toBe('DELETE');
    del.flush(null);
  });
});
