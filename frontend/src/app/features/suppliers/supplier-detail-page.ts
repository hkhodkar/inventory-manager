import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { ProductsApi } from '../../core/api/products.api';
import { SuppliersApi } from '../../core/api/suppliers.api';
import { Product, Supplier } from '../../core/models/inventory.models';
import { StockAlerts } from '../../core/services/stock-alerts';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { Icon } from '../../shared/ui/icon';
import { latestValue, valueOf } from '../../shared/ui/list-query';
import { Pagination } from '../../shared/ui/pagination';
import { StockBadge } from '../../shared/ui/stock-badge';
import { ToastService } from '../../shared/ui/toast.service';
import { ProductForm } from '../products/product-form';
import { SupplierForm } from './supplier-form';

const PRODUCTS_PAGE_SIZE = 8;

@Component({
  selector: 'app-supplier-detail-page',
  imports: [
    RouterLink,
    Icon,
    Pagination,
    StockBadge,
    MoneyPipe,
    SupplierForm,
    ProductForm,
    ConfirmDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './supplier-detail-page.html',
  styleUrl: './supplier-detail-page.scss',
})
export class SupplierDetailPage {
  private readonly api = inject(SuppliersApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(StockAlerts);

  /** route parameter */
  readonly id = input.required<string>();

  protected readonly supplierId = computed(() => Number(this.id()));
  protected readonly productsPage = signal(1);

  protected readonly supplier = rxResource({
    params: () => this.supplierId(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly products = rxResource({
    params: () => ({ id: this.supplierId(), page: this.productsPage() }),
    stream: ({ params }) =>
      this.productsApi.list({
        supplier_id: params.id,
        sort: 'name',
        page: params.page,
        page_size: PRODUCTS_PAGE_SIZE,
      }),
  });
  protected readonly current = valueOf(this.supplier);
  protected readonly productsResult = latestValue(this.products);

  protected readonly editing = signal(false);
  protected readonly addingProduct = signal(false);
  protected readonly deleting = signal(false);
  protected readonly busy = signal(false);

  protected notFound(): boolean {
    const error = this.supplier.error() as { status?: number } | undefined;
    return error?.status === 404 || error?.status === 422;
  }

  protected location(supplier: Supplier): string {
    return [supplier.city, supplier.country].filter(Boolean).join(', ');
  }

  protected websiteLabel(url: string): string {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  protected edit(): void {
    this.editing.set(true);
  }

  protected closeEdit(): void {
    this.editing.set(false);
  }

  protected onSaved(supplier: Supplier): void {
    this.editing.set(false);
    this.supplier.set(supplier);
  }

  protected addProduct(): void {
    this.addingProduct.set(true);
  }

  protected closeAddProduct(): void {
    this.addingProduct.set(false);
  }

  protected onProductAdded(product: Product): void {
    this.addingProduct.set(false);
    void this.router.navigate(['/products', product.id]);
  }

  protected setProductsPage(page: number): void {
    this.productsPage.set(page);
  }

  protected askDelete(): void {
    this.deleting.set(true);
  }

  protected cancelDelete(): void {
    this.deleting.set(false);
  }

  protected deleteMessage(supplier: Supplier): string {
    const n = supplier.product_count;
    return n
      ? `${supplier.name} will be removed. Its ${n} product${n === 1 ? '' : 's'} will stay in the catalogue without a supplier.`
      : `${supplier.name} will be removed.`;
  }

  protected confirmDelete(supplier: Supplier): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.delete(supplier.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(`${supplier.name} deleted`);
        this.alerts.refresh();
        void this.router.navigate(['/suppliers']);
      },
      error: (error) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(error, 'Could not delete the supplier'));
      },
    });
  }
}
