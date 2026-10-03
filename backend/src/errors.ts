import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

/** An error that maps directly onto an HTTP response (404, 409, ...). */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string): HttpError => new HttpError(404, `${what} not found`);
export const conflict = (message: string): HttpError => new HttpError(409, message);

export interface FieldIssue {
  field: string;
  message: string;
}

/** A 400 with per-field details, same shape as schema validation errors (e.g. "no such ZIP code"). */
export class FieldValidationError extends HttpError {
  constructor(readonly details: FieldIssue[]) {
    super(400, 'Validation failed');
  }
}

/** Postgres error code for unique_violation. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    });
    return;
  }
  if (err instanceof FieldValidationError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  // body-parser errors (e.g. malformed JSON) carry a 4xx status
  const status = (err as { status?: number }).status;
  if (status !== undefined && status >= 400 && status < 500) {
    res.status(status).json({ error: 'Invalid request' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
};
