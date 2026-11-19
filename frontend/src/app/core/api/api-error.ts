import { HttpErrorResponse } from '@angular/common/http';

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
}

/** Turns FastAPI error bodies into one readable sentence. */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (!(error instanceof HttpErrorResponse)) {
    return fallback;
  }
  if (error.status === 0) {
    return 'Cannot reach the server. Is the API running?';
  }
  const detail = (error.error as { detail?: string | ValidationIssue[] } | null)?.detail;
  if (typeof detail === 'string') {
    return detail;
  }
  if (Array.isArray(detail) && detail.length) {
    const issue = detail[0];
    const field = issue.loc?.filter((part) => part !== 'body').join('.');
    const msg = (issue.msg ?? 'is invalid').replace(/^Value error, /, '');
    return field ? `${field}: ${msg}` : msg;
  }
  return fallback;
}
