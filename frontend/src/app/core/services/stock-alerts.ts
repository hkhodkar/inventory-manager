import { Injectable, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { ReportsApi } from '../api/reports.api';
import { LowStockItem } from '../models/inventory.models';

/**
 * Low-stock alerts shared by the nav badge and the alerts page. Anything that
 * changes stock or reorder levels calls `refresh()`.
 */
@Injectable({ providedIn: 'root' })
export class StockAlerts {
  private readonly api = inject(ReportsApi);
  private readonly version = signal(0);

  readonly alerts = rxResource({
    params: () => this.version(),
    stream: () => this.api.lowStock().pipe(catchError(() => of([] as LowStockItem[]))),
  });

  readonly count = computed(() => (this.alerts.hasValue() ? this.alerts.value().length : 0));

  refresh(): void {
    this.version.update((v) => v + 1);
  }
}
