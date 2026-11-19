import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { SuppliersApi } from '../../core/api/suppliers.api';
import { Supplier } from '../../core/models/inventory.models';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { Icon } from '../../shared/ui/icon';
import { latestValue, toPage, useListQuery } from '../../shared/ui/list-query';
import { Pagination } from '../../shared/ui/pagination';
import { SortHeader } from '../../shared/ui/sort-header';
import { ToastService } from '../../shared/ui/toast.service';
import { SupplierForm } from './supplier-form';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-suppliers-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Icon,
    Pagination,
    SortHeader,
    MoneyPipe,
    SupplierForm,
    ConfirmDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './suppliers-page.html',
})
export class SuppliersPage {
  private readonly api = inject(SuppliersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly listQuery = useListQuery();

  // query params, bound by the router
  readonly search = input<string>();
  readonly sort = input<string>();
  readonly page = input<string>();

  protected readonly sortKey = computed(() => this.sort() || 'name');
  protected readonly suppliers = rxResource({
    params: () => ({
      search: this.search() ?? '',
      sort: this.sortKey(),
      page: toPage(this.page()),
      page_size: PAGE_SIZE,
    }),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly result = latestValue(this.suppliers);

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Supplier | null>(null);
  protected readonly deleting = signal<Supplier | null>(null);
  protected readonly busy = signal(false);

  protected location(supplier: Supplier): string {
    return [supplier.city, supplier.country].filter(Boolean).join(', ') || '-';
  }

  protected setSort(sort: string): void {
    this.listQuery.update({ sort });
  }

  protected setPage(page: number): void {
    this.listQuery.update({ page }, false);
  }

  protected open(supplier: Supplier): void {
    void this.router.navigate(['/suppliers', supplier.id]);
  }

  protected create(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected edit(supplier: Supplier): void {
    this.editing.set(supplier);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
  }

  protected onSaved(supplier: Supplier): void {
    const created = !this.editing();
    this.formOpen.set(false);
    if (created) {
      void this.router.navigate(['/suppliers', supplier.id]);
    } else {
      this.suppliers.reload();
    }
  }

  protected askDelete(supplier: Supplier): void {
    this.deleting.set(supplier);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected confirmDelete(): void {
    const supplier = this.deleting();
    if (!supplier || this.busy()) return;
    this.busy.set(true);
    this.api.delete(supplier.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toast.success(`${supplier.name} deleted`);
        this.suppliers.reload();
      },
      error: (error) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(error, 'Could not delete the supplier'));
      },
    });
  }

  protected deleteMessage(supplier: Supplier): string {
    const products = supplier.product_count;
    const kept =
      products === 0
        ? ''
        : ` Its ${products} product${products === 1 ? '' : 's'} will stay in the catalogue without a supplier.`;
    return `${supplier.name} will be removed.${kept}`;
  }
}
