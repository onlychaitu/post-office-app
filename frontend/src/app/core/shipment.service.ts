import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CreateShipmentRequest,
  Page,
  Shipment,
  ShipmentDetail,
  ShipmentQuery,
  ShipmentStatus,
} from './models';

@Injectable({ providedIn: 'root' })
export class ShipmentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/shipments';

  list(query: ShipmentQuery): Observable<Page<Shipment>> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<Page<Shipment>>(this.baseUrl, { params });
  }

  get(shipmentNumber: string): Observable<ShipmentDetail> {
    return this.http.get<ShipmentDetail>(this.url(shipmentNumber));
  }

  create(body: CreateShipmentRequest): Observable<Shipment> {
    return this.http.post<Shipment>(this.baseUrl, body);
  }

  /**
   * Moves the shipment one step forward. Sending the status the user was looking at
   * makes the server refuse (409) if someone else already advanced it.
   */
  advance(shipmentNumber: string, expectedStatus: ShipmentStatus): Observable<ShipmentDetail> {
    return this.http.post<ShipmentDetail>(`${this.url(shipmentNumber)}/advance`, { expectedStatus });
  }

  delete(shipmentNumber: string): Observable<void> {
    return this.http.delete<void>(this.url(shipmentNumber));
  }

  private url(shipmentNumber: string): string {
    return `${this.baseUrl}/${encodeURIComponent(shipmentNumber)}`;
  }
}
