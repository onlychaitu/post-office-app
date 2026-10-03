import { Component, OnInit, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { apiErrorMessage, apiFieldErrors } from '../../core/api-error';
import {
  PostOffice,
  SHIPMENT_TYPES,
  SHIPMENT_TYPE_LABELS,
  ShipmentType,
  WEIGHT_CATEGORIES,
  WEIGHT_CATEGORY_LABELS,
  WeightCategory,
  officeLabel,
} from '../../core/models';
import { PostOfficeService } from '../../core/post-office.service';
import { ShipmentService } from '../../core/shipment.service';

/** Cross-field rule: a shipment cannot be sent to the office it came from. */
function originDiffersFromDestination(group: AbstractControl): ValidationErrors | null {
  const origin = group.get('originZip')?.value;
  const destination = group.get('destinationZip')?.value;
  return origin && destination && origin === destination ? { sameOffice: true } : null;
}

@Component({
  selector: 'app-shipment-form-page',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatSelectModule, MatButtonModule, RouterLink],
  templateUrl: './shipment-form-page.html',
  styleUrl: './shipment-form-page.scss',
})
export class ShipmentFormPage implements OnInit {
  private readonly shipments = inject(ShipmentService);
  private readonly postOffices = inject(PostOfficeService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly types = SHIPMENT_TYPES.map((value) => ({ value, label: SHIPMENT_TYPE_LABELS[value] }));
  protected readonly weights = WEIGHT_CATEGORIES.map((value) => ({
    value,
    label: WEIGHT_CATEGORY_LABELS[value],
  }));
  protected readonly offices = signal<{ zipCode: string; label: string }[]>([]);
  protected readonly loadingOffices = signal(true);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      type: ['' as ShipmentType | '', Validators.required],
      weightCategory: ['' as WeightCategory | '', Validators.required],
      originZip: ['', Validators.required],
      destinationZip: ['', Validators.required],
    },
    { validators: originDiffersFromDestination },
  );

  async ngOnInit(): Promise<void> {
    try {
      const list: PostOffice[] = await firstValueFrom(this.postOffices.list());
      this.offices.set(list.map((o) => ({ zipCode: o.zipCode, label: officeLabel(o) })));
    } catch (err) {
      this.formError.set(apiErrorMessage(err));
    } finally {
      this.loadingOffices.set(false);
    }
  }

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    const { type, weightCategory, originZip, destinationZip } = this.form.getRawValue();
    try {
      const created = await firstValueFrom(
        this.shipments.create({
          // the required validators guarantee these are not the empty initial value
          type: type as ShipmentType,
          weightCategory: weightCategory as WeightCategory,
          originZip,
          destinationZip,
        }),
      );
      this.snackBar.open(`Shipment ${created.shipmentNumber} created`, 'OK', { duration: 6000 });
      await this.router.navigate(['/shipments']);
    } catch (err) {
      this.showError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private showError(err: unknown): void {
    const fieldErrors = apiFieldErrors(err);
    if (fieldErrors.length > 0) {
      for (const { field, message } of fieldErrors) {
        const control = this.form.get(field);
        control?.setErrors({ server: message });
        control?.markAsTouched();
      }
      return;
    }
    this.formError.set(apiErrorMessage(err));
  }
}
