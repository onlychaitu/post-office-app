import { HttpErrorResponse } from '@angular/common/http';

export interface FieldError {
  field: string;
  message: string;
}

/** Human-readable message from an API error response ({ error: string }). */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server. Please try again.';
    const message = (err.error as { error?: string } | null)?.error;
    if (message) return message;
  }
  return 'Something went wrong. Please try again.';
}

/** Per-field validation errors from a 400 response, if present. */
export function apiFieldErrors(err: unknown): FieldError[] {
  if (err instanceof HttpErrorResponse && err.status === 400) {
    const details = (err.error as { details?: FieldError[] } | null)?.details;
    if (Array.isArray(details)) return details;
  }
  return [];
}
