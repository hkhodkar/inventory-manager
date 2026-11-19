import { HttpParams } from '@angular/common/http';

export type QueryValue =
  string | number | boolean | null | undefined | readonly (string | number)[];

/** Builds HttpParams and drops empty values so the API only sees real filters. */
export function toHttpParams(query: Record<string, QueryValue>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === null || value === undefined || value === '') {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params = params.append(key, String(item));
      }
    } else {
      params = params.set(key, String(value));
    }
  }
  return params;
}
