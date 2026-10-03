import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'shipments' },
  {
    path: 'shipments',
    loadComponent: () =>
      import('./features/shipments/shipments-page').then((m) => m.ShipmentsPage),
  },
  {
    path: 'shipments/new',
    loadComponent: () =>
      import('./features/shipments/shipment-form-page').then((m) => m.ShipmentFormPage),
  },
  {
    path: 'shipments/:shipmentNumber',
    loadComponent: () =>
      import('./features/shipments/shipment-detail-page').then((m) => m.ShipmentDetailPage),
  },
  {
    path: 'post-offices',
    loadComponent: () =>
      import('./features/post-offices/post-offices-page').then((m) => m.PostOfficesPage),
  },
  { path: '**', redirectTo: 'shipments' },
];
