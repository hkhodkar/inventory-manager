import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import {
  Movement,
  MovementPayload,
  Page,
  Product,
  ProductPayload,
  StockStatus,
} from '../models/inventory.models';
import { allPages } from '../utils/all-pages';
import { QueryValue, toHttpParams } from '../utils/http-params';

export interface ProductQuery {
  search?: string;
  category?: string;
  supplier_id?: number | null;
  stock_status?: StockStatus | '';
  sort?: string;
  page?: number;
  page_size?: number;
}

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/products';

  list(query: ProductQuery = {}): Observable<Page<Product>> {
    return this.http.get<Page<Product>>(this.url, {
      params: toHttpParams(query as Record<string, QueryValue>),
    });
  }

  /** The whole catalogue, fetched page by page (for exports). */
  all(sort = 'sku'): Observable<Product[]> {
    return allPages((page) => this.list({ sort, page, page_size: 200 }));
  }

  categories(): Observable<string[]> {
    return this.http
      .get<string[]>(`${this.url}/categories`)
      .pipe(catchError(() => of([] as string[])));
  }

  get(id: number): Observable<Product> {
    return this.http.get<Product>(`${this.url}/${id}`);
  }

  create(payload: ProductPayload): Observable<Product> {
    return this.http.post<Product>(this.url, payload);
  }

  update(id: number, payload: Partial<ProductPayload>): Observable<Product> {
    return this.http.patch<Product>(`${this.url}/${id}`, payload);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.url}/${id}`);
  }

  movements(id: number, page = 1, pageSize = 10): Observable<Page<Movement>> {
    return this.http.get<Page<Movement>>(`${this.url}/${id}/movements`, {
      params: toHttpParams({ page, page_size: pageSize }),
    });
  }

  addMovement(id: number, payload: MovementPayload): Observable<Movement> {
    return this.http.post<Movement>(`${this.url}/${id}/movements`, payload);
  }
}
