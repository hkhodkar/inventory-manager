import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LowStockItem } from '../../core/models/inventory.models';
import { StockAlerts } from '../../core/services/stock-alerts';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { Icon } from '../../shared/ui/icon';
import { StockBadge } from '../../shared/ui/stock-badge';
import { MovementForm } from '../movements/movement-form';

type View = 'all' | 'out' | 'low';

@Component({
  selector: 'app-alerts-page',
  imports: [RouterLink, Icon, StockBadge, MoneyPipe, MovementForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alerts-page.html',
  styleUrl: './alerts-page.scss',
})
export class AlertsPage {
  protected readonly alerts = inject(StockAlerts);

  protected readonly view = signal<View>('all');
  protected readonly restocking = signal<LowStockItem | null>(null);

  protected readonly items = computed(() =>
    this.alerts.alerts.hasValue() ? this.alerts.alerts.value() : [],
  );
  protected readonly outCount = computed(
    () => this.items().filter((i) => i.stock_status === 'out').length,
  );
  protected readonly lowCount = computed(() => this.items().length - this.outCount());
  protected readonly reorderCost = computed(() =>
    this.items().reduce((sum, i) => sum + i.suggested_order * i.cost_price, 0),
  );
  protected readonly visible = computed(() => {
    const view = this.view();
    return view === 'all' ? this.items() : this.items().filter((i) => i.stock_status === view);
  });

  constructor() {
    // always show fresh numbers when the page opens
    this.alerts.refresh();
  }

  protected setView(view: View): void {
    this.view.set(view);
  }

  /** Width of the stock bar relative to the reorder level. */
  protected fill(item: LowStockItem): number {
    return item.reorder_level ? Math.min(100, (item.stock / item.reorder_level) * 100) : 0;
  }

  protected restock(item: LowStockItem): void {
    this.restocking.set(item);
  }

  protected closeRestock(): void {
    this.restocking.set(null);
  }

  protected onRestocked(): void {
    this.restocking.set(null);
  }
}
