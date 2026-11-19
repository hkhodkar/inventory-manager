import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  CategoryValue,
  DailyMovement,
  DashboardStats,
  LowStockItem,
  TopMover,
} from '../models/inventory.models';
import { toHttpParams } from '../utils/http-params';

@Injectable({ providedIn: 'root' })
export class ReportsApi {
  private readonly http = inject(HttpClient);

  dashboard(): Observable<DashboardStats> {
    return this.http.get<DashboardStats>('/api/reports/dashboard');
  }

  lowStock(): Observable<LowStockItem[]> {
    return this.http.get<LowStockItem[]>('/api/alerts/low-stock');
  }

  stockByCategory(): Observable<CategoryValue[]> {
    return this.http.get<CategoryValue[]>('/api/reports/stock-by-category');
  }

  topMovers(days = 30, limit = 5): Observable<TopMover[]> {
    return this.http.get<TopMover[]>('/api/reports/top-movers', {
      params: toHttpParams({ days, limit }),
    });
  }

  movementsOverTime(days = 30): Observable<DailyMovement[]> {
    return this.http.get<DailyMovement[]>('/api/reports/movements-over-time', {
      params: toHttpParams({ days }),
    });
  }
}
