import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { MovementsApi } from '../../core/api/movements.api';
import { MOVEMENT_TYPES, MovementType } from '../../core/models/inventory.models';
import { downloadCsv, toCsv } from '../../core/utils/csv';
import { addDays, toDateInput } from '../../core/utils/format';
import { ChangePipe } from '../../shared/pipes/change.pipe';
import { Icon } from '../../shared/ui/icon';
import { latestValue, toPage, useListQuery } from '../../shared/ui/list-query';
import { MovementTypeBadge } from '../../shared/ui/movement-type';
import { Pagination } from '../../shared/ui/pagination';
import { SortHeader } from '../../shared/ui/sort-header';
import { ToastService } from '../../shared/ui/toast.service';

const PAGE_SIZE = 15;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

@Component({
  selector: 'app-movements-page',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    Icon,
    Pagination,
    SortHeader,
    MovementTypeBadge,
    ChangePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './movements-page.html',
  styleUrl: './movements-page.scss',
})
export class MovementsPage {
  private readonly api = inject(MovementsApi);
  private readonly toast = inject(ToastService);
  protected readonly listQuery = useListQuery();

  // query params, bound by the router
  readonly search = input<string>();
  readonly type = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly sort = input<string>();
  readonly page = input<string>();

  protected readonly types = MOVEMENT_TYPES;
  protected readonly ranges = RANGES;
  protected readonly sortKey = computed(() => this.sort() || '-created_at');
  protected readonly typeFilter = computed<MovementType | ''>(() =>
    MOVEMENT_TYPES.some((t) => t.value === this.type()) ? (this.type() as MovementType) : '',
  );
  protected readonly dateFrom = computed(() => (DATE.test(this.from() ?? '') ? this.from()! : ''));
  protected readonly dateTo = computed(() => (DATE.test(this.to() ?? '') ? this.to()! : ''));
  protected readonly invalidRange = computed(
    () => !!this.dateFrom() && !!this.dateTo() && this.dateTo() < this.dateFrom(),
  );

  protected readonly filters = computed(() => ({
    search: this.search() ?? '',
    type: this.typeFilter(),
    date_from: this.dateFrom(),
    date_to: this.dateTo(),
    sort: this.sortKey(),
  }));
  protected readonly hasFilters = computed(() => {
    const f = this.filters();
    return !!(f.search || f.type || f.date_from || f.date_to);
  });

  protected readonly movements = rxResource({
    params: () =>
      this.invalidRange()
        ? undefined
        : { ...this.filters(), page: toPage(this.page()), page_size: PAGE_SIZE },
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly result = latestValue(this.movements);
  protected readonly exporting = signal(false);

  protected setType(value: string): void {
    this.listQuery.update({ type: value || null });
  }

  protected setDate(name: 'from' | 'to', value: string): void {
    this.listQuery.update({ [name]: value || null });
  }

  /** Quick range ending today, in the user's local dates. */
  protected setRange(days: number): void {
    const today = new Date();
    this.listQuery.update({
      from: toDateInput(addDays(today, -(days - 1))),
      to: toDateInput(today),
    });
  }

  protected isRange(days: number): boolean {
    const today = new Date();
    return (
      this.dateTo() === toDateInput(today) &&
      this.dateFrom() === toDateInput(addDays(today, -(days - 1)))
    );
  }

  protected clearFilters(): void {
    this.listQuery.search.setValue('', { emitEvent: false });
    this.listQuery.update({ search: null, type: null, from: null, to: null });
  }

  protected setSort(sort: string): void {
    this.listQuery.update({ sort });
  }

  protected setPage(page: number): void {
    this.listQuery.update({ page }, false);
  }

  protected exportCsv(): void {
    if (this.exporting() || this.invalidRange()) return;
    this.exporting.set(true);
    this.api.all(this.filters()).subscribe({
      next: (rows) => {
        this.exporting.set(false);
        const csv = toCsv(
          [
            'Date (UTC)',
            'SKU',
            'Product',
            'Type',
            'Change',
            'Unit',
            'Balance after',
            'Reference',
            'Note',
          ],
          rows.map((m) => [
            formatDate(m.created_at, 'yyyy-MM-dd HH:mm', 'en-US', 'UTC'),
            m.product.sku,
            m.product.name,
            m.type,
            m.quantity,
            m.product.unit,
            m.balance_after,
            m.reference,
            m.note,
          ]),
        );
        downloadCsv(`stock-movements-${toDateInput(new Date())}.csv`, csv);
        this.toast.success(`Exported ${rows.length} movements`);
      },
      error: (error) => {
        this.exporting.set(false);
        this.toast.error(apiErrorMessage(error, 'Could not export the movements'));
      },
    });
  }
}
