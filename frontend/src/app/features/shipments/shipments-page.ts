import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { BehaviorSubject, catchError, combineLatest, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import {
  Page,
  SHIPMENT_STATUSES,
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_TYPES,
  SHIPMENT_TYPE_LABELS,
  Shipment,
  ShipmentQuery,
  ShipmentSortField,
  WEIGHT_CATEGORIES,
  WEIGHT_CATEGORY_LABELS,
  officeLabel,
} from '../../core/models';
import { PostOfficeService } from '../../core/post-office.service';
import { ShipmentService } from '../../core/shipment.service';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/confirm-dialog';
import {
  DEFAULT_QUERY,
  PAGE_SIZE_OPTIONS,
  hasActiveFilters,
  parseQuery,
  toQueryParams,
} from './shipment-query';

type FilterName = 'type' | 'weightCategory' | 'status' | 'originZip' | 'destinationZip';

@Component({
  selector: 'app-shipments-page',
  imports: [
    DatePipe,
    RouterLink,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  templateUrl: './shipments-page.html',
  styleUrl: './shipments-page.scss',
})
export class ShipmentsPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly shipmentService = inject(ShipmentService);
  private readonly postOfficeService = inject(PostOfficeService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Emits to re-run the current query, e.g. after a delete. */
  private readonly refresh$ = new BehaviorSubject<void>(undefined);

  protected readonly columns = [
    'shipmentNumber',
    'type',
    'weightCategory',
    'origin',
    'destination',
    'currentStatus',
    'createdAt',
    'actions',
  ];
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;

  protected readonly typeOptions = SHIPMENT_TYPES.map((value) => ({ value, label: SHIPMENT_TYPE_LABELS[value] }));
  protected readonly weightOptions = WEIGHT_CATEGORIES.map((value) => ({
    value,
    label: WEIGHT_CATEGORY_LABELS[value],
  }));
  protected readonly statusOptions = SHIPMENT_STATUSES.map((value) => ({
    value,
    label: SHIPMENT_STATUS_LABELS[value],
  }));
  // mat-table cell variables are untyped in templates, so expose the maps as string-indexed.
  protected readonly typeLabels: Record<string, string> = SHIPMENT_TYPE_LABELS;
  protected readonly weightLabels: Record<string, string> = WEIGHT_CATEGORY_LABELS;
  protected readonly statusLabels: Record<string, string> = SHIPMENT_STATUS_LABELS;
  protected readonly officeLabel = officeLabel;

  protected readonly query = signal<ShipmentQuery>(DEFAULT_QUERY);
  protected readonly result = signal<Page<Shipment> | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly offices = signal<{ zipCode: string; label: string }[]>([]);

  protected readonly hasFilters = computed(() => hasActiveFilters(this.query()));

  constructor() {
    // The URL query params are the single source of truth for the grid state, so
    // filters and paging survive navigating away and back, and links are shareable.
    // switchMap drops the response of a superseded request.
    combineLatest([this.route.queryParamMap.pipe(map(parseQuery)), this.refresh$])
      .pipe(
        map(([query]) => query),
        tap((query) => {
          this.query.set(query);
          this.loading.set(true);
          this.loadError.set(null);
        }),
        switchMap((query) =>
          this.shipmentService.list(query).pipe(
            catchError((err) => {
              this.loadError.set(apiErrorMessage(err));
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((result) => {
        if (result) this.result.set(result);
        this.loading.set(false);
      });

    this.postOfficeService
      .list()
      .pipe(takeUntilDestroyed())
      .subscribe({
        next: (offices) => this.offices.set(offices.map((o) => ({ zipCode: o.zipCode, label: officeLabel(o) }))),
        // the filter dropdowns just stay empty; the grid itself still works
        error: () => undefined,
      });
  }

  /** Opens the detail page, handing over this grid's URL so "Back" restores filters and page. */
  protected open(shipment: Shipment): void {
    void this.router.navigate(['/shipments', shipment.shipmentNumber], { state: { back: this.router.url } });
  }

  protected async remove(shipment: Shipment, event: Event): Promise<void> {
    event.stopPropagation(); // the row itself opens the detail page
    const data: ConfirmDialogData = {
      title: `Delete shipment ${shipment.shipmentNumber}?`,
      message: 'This permanently deletes the shipment and its status history.',
      confirmLabel: 'Delete',
      destructive: true,
    };
    const confirmed = await firstValueFrom(
      this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data }).afterClosed(),
    );
    if (confirmed !== true) return;

    try {
      await firstValueFrom(this.shipmentService.delete(shipment.shipmentNumber));
      this.snackBar.open(`Shipment ${shipment.shipmentNumber} deleted`, 'OK', { duration: 3000 });
    } catch (err) {
      this.snackBar.open(apiErrorMessage(err), 'Dismiss', { duration: 6000 });
      return;
    }

    // Deleting the last row of a later page would leave an empty page: step back one.
    const { page } = this.query();
    if (page > 1 && this.result()?.items.length === 1) {
      this.update({ page: page - 1 }, false);
    } else {
      this.refresh$.next();
    }
  }

  protected search(value: string): void {
    this.update({ shipmentNumber: value.trim().toUpperCase() || undefined });
  }

  protected clearSearch(input: HTMLInputElement): void {
    input.value = '';
    this.update({ shipmentNumber: undefined });
  }

  protected setFilter(name: FilterName, value: string): void {
    this.update({ [name]: value || undefined });
  }

  protected clearFilters(searchInput: HTMLInputElement): void {
    searchInput.value = '';
    this.update({
      shipmentNumber: undefined,
      type: undefined,
      weightCategory: undefined,
      status: undefined,
      originZip: undefined,
      destinationZip: undefined,
    });
  }

  protected onSort(sort: Sort): void {
    this.update({ sort: sort.active as ShipmentSortField, order: sort.direction === 'asc' ? 'asc' : 'desc' });
  }

  protected onPage(event: PageEvent): void {
    this.update({ page: event.pageIndex + 1, pageSize: event.pageSize }, false);
  }

  /** Applies changes by navigating, which re-triggers the load. Filter/sort changes go back to page 1. */
  private update(changes: Partial<ShipmentQuery>, resetPage = true): void {
    const next = { ...this.query(), ...(resetPage ? { page: 1 } : {}), ...changes };
    void this.router.navigate([], { relativeTo: this.route, queryParams: toQueryParams(next) });
  }
}
