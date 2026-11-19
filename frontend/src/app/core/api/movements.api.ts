import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { Movement, MovementType, Page } from '../models/inventory.models';
import { allPages } from '../utils/all-pages';
import { QueryValue, toHttpParams } from '../utils/http-params';

export interface MovementQuery {
  search?: string;
  type?: MovementType | '';
  product_id?: number | null;
  date_from?: string;
  date_to?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

const EXPORT_PAGE_SIZE = 200;

@Injectable({ providedIn: 'root' })
export class MovementsApi {
  private readonly http = inject(HttpClient);
  private readonly url = '/api/movements';

  list(query: MovementQuery = {}): Observable<Page<Movement>> {
    return this.http.get<Page<Movement>>(this.url, {
      params: toHttpParams(query as Record<string, QueryValue>),
    });
  }

  /** Every movement matching the filters, fetched page by page (for exports). */
  all(query: Omit<MovementQuery, 'page' | 'page_size'>): Observable<Movement[]> {
    return allPages((page) => this.list({ ...query, page, page_size: EXPORT_PAGE_SIZE }));
  }
}
