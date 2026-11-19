import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { STOCK_STATUSES, StockStatus } from '../../core/models/inventory.models';

@Component({
  selector: 'app-stock-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="status()"><span class="dot"></span>{{ label() }}</span>`,
  styles: `
    .in_stock {
      background: var(--success-soft);
      color: var(--success);
    }

    .low {
      background: var(--warning-soft);
      color: var(--warning);
    }

    .out {
      background: var(--danger-soft);
      color: var(--danger);
    }
  `,
})
export class StockBadge {
  readonly status = input.required<StockStatus>();

  protected readonly label = computed(
    () => STOCK_STATUSES.find((s) => s.value === this.status())?.label ?? this.status(),
  );
}
