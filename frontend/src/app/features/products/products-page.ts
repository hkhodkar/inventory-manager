import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { ProductsApi } from '../../core/api/products.api';
import { SuppliersApi } from '../../core/api/suppliers.api';
import { Product, STOCK_STATUSES, StockStatus } from '../../core/models/inventory.models';
import { StockAlerts } from '../../core/services/stock-alerts';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { Icon } from '../../shared/ui/icon';
import { latestValue, toId, toPage, useListQuery } from '../../shared/ui/list-query';
import { Pagination } from '../../shared/ui/pagination';
import { SortHeader } from '../../shared/ui/sort-header';
import { StockBadge } from '../../shared/ui/stock-badge';
import { ToastService } from '../../shared/ui/toast.service';
import { MovementForm } from '../movements/movement-form';
import { ProductForm } from './product-form';

const PAGE_SIZE = 12;

@Component({
  selector: 'app-products-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    Icon,
    Pagination,
    SortHeader,
    StockBadge,
    MoneyPipe,
    ProductForm,
    MovementForm,
    ConfirmDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './products-page.html',
})
export class ProductsPage {
  private readonly api = inject(ProductsApi);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(StockAlerts);
  protected readonly listQuery = useListQuery();

  // query params, bound by the router
  readonly search = input<string>();
  readonly category = input<string>();
  readonly supplier = input<string>();
  readonly status = input<string>();
  readonly sort = input<string>();
  readonly page = input<string>();

  protected readonly statuses = STOCK_STATUSES;
  protected readonly sortKey = computed(() => this.sort() || 'name');
  protected readonly statusFilter = computed<StockStatus | ''>(() =>
    STOCK_STATUSES.some((s) => s.value === this.status()) ? (this.status() as StockStatus) : '',
  );
  protected readonly query = computed(() => ({
    search: this.search() ?? '',
    category: this.category() ?? '',
    supplier_id: toId(this.supplier()),
    stock_status: this.statusFilter(),
    sort: this.sortKey(),
    page: toPage(this.page()),
    page_size: PAGE_SIZE,
  }));
  protected readonly hasFilters = computed(() => {
    const q = this.query();
    return !!(q.search || q.category || q.supplier_id || q.stock_status);
  });

  protected readonly products = rxResource({
    params: () => this.query(),
    stream: ({ params }) => this.api.list(params),
  });
  protected readonly result = latestValue(this.products);
  protected readonly categories = rxResource({ stream: () => this.api.categories() });
  protected readonly suppliers = rxResource({ stream: () => this.suppliersApi.options() });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Product | null>(null);
  protected readonly moving = signal<Product | null>(null);
  protected readonly deleting = signal<Product | null>(null);
  protected readonly busy = signal(false);

  protected setFilter(name: 'category' | 'supplier' | 'status', value: string): void {
    this.listQuery.update({ [name]: value || null });
  }

  protected clearFilters(): void {
    this.listQuery.search.setValue('', { emitEvent: false });
    this.listQuery.update({ search: null, category: null, supplier: null, status: null });
  }

  protected setSort(sort: string): void {
    this.listQuery.update({ sort });
  }

  protected setPage(page: number): void {
    this.listQuery.update({ page }, false);
  }

  protected open(product: Product): void {
    void this.router.navigate(['/products', product.id]);
  }

  protected create(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected edit(product: Product): void {
    this.editing.set(product);
    this.formOpen.set(true);
  }

  protected closeForm(): void {
    this.formOpen.set(false);
  }

  protected onSaved(product: Product): void {
    const created = !this.editing();
    this.formOpen.set(false);
    if (created) {
      void this.router.navigate(['/products', product.id]);
    } else {
      this.products.reload();
    }
    this.categories.reload();
  }

  protected recordMovement(product: Product): void {
    this.moving.set(product);
  }

  protected closeMovement(): void {
    this.moving.set(null);
  }

  protected onMoved(): void {
    this.moving.set(null);
    this.products.reload();
  }

  protected askDelete(product: Product): void {
    this.deleting.set(product);
  }

  protected cancelDelete(): void {
    this.deleting.set(null);
  }

  protected confirmDelete(): void {
    const product = this.deleting();
    if (!product || this.busy()) return;
    this.busy.set(true);
    this.api.delete(product.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.deleting.set(null);
        this.toast.success(`${product.name} deleted`);
        this.alerts.refresh();
        this.products.reload();
      },
      error: (error) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(error, 'Could not delete the product'));
      },
    });
  }
}
