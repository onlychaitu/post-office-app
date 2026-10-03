import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { firstValueFrom } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { apiErrorMessage, apiFieldErrors } from '../../core/api-error';
import { PostOffice } from '../../core/models';
import { PostOfficeService } from '../../core/post-office.service';

/** Add / edit dialog. Pass the office as dialog data to edit, nothing to create. Closes with the saved office. */
@Component({
  selector: 'app-post-office-form-dialog',
  imports: [ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './post-office-form-dialog.html',
  styleUrl: './post-office-form-dialog.scss',
})
export class PostOfficeFormDialog {
  private readonly service = inject(PostOfficeService);
  private readonly dialogRef = inject<MatDialogRef<PostOfficeFormDialog, PostOffice>>(MatDialogRef);
  protected readonly office = inject<PostOffice | null>(MAT_DIALOG_DATA, { optional: true });

  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    zipCode: [
      this.office?.zipCode ?? '',
      [Validators.required, Validators.maxLength(20), Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9 -]*$/)],
    ],
    name: [this.office?.name ?? '', [Validators.required, Validators.maxLength(200)]],
    address: [this.office?.address ?? '', [Validators.required, Validators.maxLength(500)]],
  });

  protected async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.formError.set(null);
    const value = this.form.getRawValue();
    try {
      const saved = await firstValueFrom(
        this.office
          ? this.service.update(this.office.zipCode, value)
          : this.service.create(value),
      );
      this.dialogRef.close(saved);
    } catch (err) {
      this.showError(err);
    } finally {
      this.saving.set(false);
    }
  }

  private showError(err: unknown): void {
    // 409: the ZIP code is taken, so show it on the ZIP field.
    if (err instanceof HttpErrorResponse && err.status === 409) {
      this.form.controls.zipCode.setErrors({ server: apiErrorMessage(err) });
      this.form.controls.zipCode.markAsTouched();
      return;
    }
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
