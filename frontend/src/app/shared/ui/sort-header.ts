import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Icon } from './icon';

/** Clickable column header: first click sorts ascending, second click descending. */
@Component({
  selector: 'app-sort-header',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" class="sort-btn" [class.active]="direction()" (click)="toggle()">
      <ng-content />
      @if (direction(); as dir) {
        <app-icon [name]="dir === 'asc' ? 'chevron-up' : 'chevron-down'" [size]="14" />
      }
    </button>
  `,
})
export class SortHeader {
  readonly key = input.required<string>();
  readonly sort = input.required<string>();
  readonly descFirst = input(false);
  readonly sortChange = output<string>();

  protected readonly direction = computed(() => {
    const sort = this.sort();
    if (sort === this.key()) return 'asc';
    if (sort === `-${this.key()}`) return 'desc';
    return null;
  });

  protected toggle(): void {
    const dir = this.direction();
    const desc = dir ? dir === 'asc' : this.descFirst();
    this.sortChange.emit(desc ? `-${this.key()}` : this.key());
  }
}
