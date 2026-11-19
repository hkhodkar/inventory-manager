import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MovementType } from '../../core/models/inventory.models';
import { Icon, IconName } from './icon';

const TYPES: Record<MovementType, { label: string; icon: IconName }> = {
  in: { label: 'In', icon: 'arrow-down' },
  out: { label: 'Out', icon: 'arrow-up' },
  adjustment: { label: 'Adjustment', icon: 'sliders' },
};

@Component({
  selector: 'app-movement-type',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="badge" [class]="type()">
      <app-icon [name]="meta().icon" [size]="12" />
      {{ meta().label }}
    </span>
  `,
  styles: `
    .in {
      background: var(--success-soft);
      color: var(--success);
    }

    .out {
      background: var(--primary-soft);
      color: var(--primary);
    }

    .adjustment {
      background: var(--warning-soft);
      color: var(--warning);
    }
  `,
})
export class MovementTypeBadge {
  readonly type = input.required<MovementType>();

  protected readonly meta = computed(() => TYPES[this.type()]);
}
