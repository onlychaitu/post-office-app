import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PostOffice, PostOfficeDetail } from './models';

@Injectable({ providedIn: 'root' })
export class PostOfficeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/post-offices';

  list(search?: string): Observable<PostOffice[]> {
    let params = new HttpParams();
    if (search) params = params.set('search', search);
    return this.http.get<PostOffice[]>(this.baseUrl, { params });
  }

  get(zipCode: string): Observable<PostOfficeDetail> {
    return this.http.get<PostOfficeDetail>(this.url(zipCode));
  }

  create(body: PostOffice): Observable<PostOffice> {
    return this.http.post<PostOffice>(this.baseUrl, body);
  }

  update(zipCode: string, body: PostOffice): Observable<PostOffice> {
    return this.http.put<PostOffice>(this.url(zipCode), body);
  }

  delete(zipCode: string): Observable<void> {
    return this.http.delete<void>(this.url(zipCode));
  }

  private url(zipCode: string): string {
    return `${this.baseUrl}/${encodeURIComponent(zipCode)}`;
  }
}
