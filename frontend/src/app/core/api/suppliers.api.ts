import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { Page, Supplier, SupplierPayload } from '../models/inventory.models';
import { QueryValue, toHttpParams } from '../utils/http-params';

export interface SupplierQuery {
  search?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class SuppliersApi {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/suppliers';

  list(query: SupplierQuery = {}): Observable<Page<Supplier>> {
    return this.http.get<Page<Supplier>>(this.url, {
      params: toHttpParams(query as Record<string, QueryValue>),
    });
  }

  /** All suppliers by name, for selects. Fails quietly to an empty list. */
  options(): Observable<Supplier[]> {
    return this.list({ sort: 'name', page_size: 200 }).pipe(
      map((page) => page.items),
      catchError(() => of([])),
    );
  }

  get(id: number): Observable<Supplier> {
    return this.http.get<Supplier>(`${this.url}/${id}`);
  }

  create(payload: SupplierPayload): Observable<Supplier> {
    return this.http.post<Supplier>(this.url, payload);
  }

  update(id: number, payload: Partial<SupplierPayload>): Observable<Supplier> {
    return this.http.patch<Supplier>(`${this.url}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }
}
