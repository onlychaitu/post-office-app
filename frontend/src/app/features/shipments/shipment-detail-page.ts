import { HttpErrorResponse } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, firstValueFrom, map, of, switchMap, tap } from 'rxjs';
import { apiErrorMessage } from '../../core/api-error';
import {
  SHIPMENT_STATUS_LABELS,
  SHIPMENT_TYPE_LABELS,
  ShipmentDetail,
  WEIGHT_CATEGORY_LABELS,
  nextStatus,
  officeLabel,
} from '../../core/models';
import { ShipmentService } from '../../core/shipment.service';
import { ConfirmDialog, ConfirmDialogData } from '../../shared/confirm-dialog';
import { backUrlFrom } from './shipment-nav';

@Component({
  selector: 'app-shipment-detail-page',
  imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatProgressBarModule],
  templateUrl: './shipment-detail-page.html',
  styleUrl: './shipment-detail-page.scss',
})
export class ShipmentDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly service = inject(ShipmentService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly typeLabels = SHIPMENT_TYPE_LABELS;
  protected readonly weightLabels = WEIGHT_CATEGORY_LABELS;
  protected readonly statusLabels = SHIPMENT_STATUS_LABELS;
  protected readonly officeLabel = officeLabel;

  protected readonly shipment = signal<ShipmentDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  /** True while an advance or delete request is in flight. */
  protected readonly busy = signal(false);

  protected readonly next = computed(() => {
    const current = this.shipment()?.currentStatus;
    return current ? nextStatus(current) : null;
  });
  protected readonly advanceLabel = computed(() => {
    const next = this.next();
    return next ? `Mark as ${SHIPMENT_STATUS_LABELS[next].toLowerCase()}` : null;
  });

  /** Where "Back" goes: the grid URL (with its filters and page) the user came from. */
  protected readonly backUrl = backUrlFrom(history.state);

  constructor() {
    this.route.paramMap
      .pipe(
        map((params) => params.get('shipmentNumber') ?? ''),
        tap(() => {
          this.loading.set(true);
          this.loadError.set(null);
          this.shipment.set(null);
        }),
        switchMap((number) =>
          this.service.get(number).pipe(
            catchError((err: unknown) => {
              this.loadError.set(
                err instanceof HttpErrorResponse && err.status === 404
                  ? `Shipment ${number} was not found.`
                  : apiErrorMessage(err),
              );
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(),
      )
      .subscribe((shipment) => {
        this.shipment.set(shipment);
        this.loading.set(false);
      });
  }

  protected async advance(): Promise<void> {
    const current = this.shipment();
    if (!current || this.busy()) return;
    this.busy.set(true);
    try {
      const updated = await firstValueFrom(this.service.advance(current.shipmentNumber, current.currentStatus));
      this.shipment.set(updated);
      this.snackBar.open(`Status updated: ${SHIPMENT_STATUS_LABELS[updated.currentStatus]}`, 'OK', {
        duration: 3000,
      });
    } catch (err) {
      this.snackBar.open(apiErrorMessage(err), 'Dismiss', { duration: 6000 });
      // A 409 means someone else changed the shipment: show its real state.
      if (err instanceof HttpErrorResponse && err.status === 409) await this.refresh(current.shipmentNumber);
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const current = this.shipment();
    if (!current || this.busy()) return;
    const data: ConfirmDialogData = {
      title: `Delete shipment ${current.shipmentNumber}?`,
      message: 'This permanently deletes the shipment and its status history.',
      confirmLabel: 'Delete',
      destructive: true,
    };
    const confirmed = await firstValueFrom(
      this.dialog.open<ConfirmDialog, ConfirmDialogData, boolean>(ConfirmDialog, { data }).afterClosed(),
    );
    if (confirmed !== true) return;

    this.busy.set(true);
    try {
      await firstValueFrom(this.service.delete(current.shipmentNumber));
      this.snackBar.open(`Shipment ${current.shipmentNumber} deleted`, 'OK', { duration: 3000 });
      await this.router.navigateByUrl(this.backUrl);
    } catch (err) {
      this.snackBar.open(apiErrorMessage(err), 'Dismiss', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }

  private async refresh(shipmentNumber: string): Promise<void> {
    try {
      this.shipment.set(await firstValueFrom(this.service.get(shipmentNumber)));
    } catch {
      // keep what is shown; the snackbar already reported the problem
    }
  }

}
