import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { apiErrorMessage } from '../../core/api/api-error';
import { ProductsApi } from '../../core/api/products.api';
import { MovementType, Product } from '../../core/models/inventory.models';
import { StockAlerts } from '../../core/services/stock-alerts';
import { ChangePipe } from '../../shared/pipes/change.pipe';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { Icon } from '../../shared/ui/icon';
import { latestValue, valueOf } from '../../shared/ui/list-query';
import { MovementTypeBadge } from '../../shared/ui/movement-type';
import { Pagination } from '../../shared/ui/pagination';
import { StockBadge } from '../../shared/ui/stock-badge';
import { ToastService } from '../../shared/ui/toast.service';
import { MovementForm } from '../movements/movement-form';
import { ProductForm } from './product-form';

const HISTORY_PAGE_SIZE = 8;

@Component({
  selector: 'app-product-detail-page',
  imports: [
    DatePipe,
    RouterLink,
    Icon,
    StockBadge,
    MovementTypeBadge,
    Pagination,
    MoneyPipe,
    ChangePipe,
    ProductForm,
    MovementForm,
    ConfirmDialog,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-detail-page.html',
  styleUrl: './product-detail-page.scss',
})
export class ProductDetailPage {
  private readonly api = inject(ProductsApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(StockAlerts);

  /** route parameter */
  readonly id = input.required<string>();

  protected readonly productId = computed(() => Number(this.id()));
  protected readonly historyPage = signal(1);

  protected readonly product = rxResource({
    params: () => this.productId(),
    stream: ({ params }) => this.api.get(params),
  });
  protected readonly history = rxResource({
    params: () => ({ id: this.productId(), page: this.historyPage() }),
    stream: ({ params }) => this.api.movements(params.id, params.page, HISTORY_PAGE_SIZE),
  });
  protected readonly current = valueOf(this.product);
  protected readonly historyResult = latestValue(this.history);

  protected readonly margin = computed(() => {
    const product = this.current();
    if (!product || product.sale_price <= 0) return null;
    return Math.round(((product.sale_price - product.cost_price) / product.sale_price) * 100);
  });

  /** Fill of the stock bar, the reorder level sits at one third. */
  protected readonly levelPercent = computed(() => {
    const product = this.current();
    if (!product) return 0;
    if (!product.reorder_level) return product.stock > 0 ? 100 : 0;
    return Math.min(100, (product.stock / (product.reorder_level * 3)) * 100);
  });

  protected readonly editing = signal(false);
  protected readonly moveType = signal<MovementType | null>(null);
  protected readonly deleting = signal(false);
  protected readonly busy = signal(false);

  protected notFound(): boolean {
    const error = this.product.error() as { status?: number } | undefined;
    return error?.status === 404 || error?.status === 422;
  }

  protected openMovement(type: MovementType): void {
    this.moveType.set(type);
  }

  protected closeMovement(): void {
    this.moveType.set(null);
  }

  protected onMoved(): void {
    this.moveType.set(null);
    this.historyPage.set(1);
    this.product.reload();
    this.history.reload();
  }

  protected edit(): void {
    this.editing.set(true);
  }

  protected closeEdit(): void {
    this.editing.set(false);
  }

  protected onSaved(product: Product): void {
    this.editing.set(false);
    this.product.set(product);
  }

  protected setHistoryPage(page: number): void {
    this.historyPage.set(page);
  }

  protected askDelete(): void {
    this.deleting.set(true);
  }

  protected cancelDelete(): void {
    this.deleting.set(false);
  }

  protected confirmDelete(product: Product): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.delete(product.id).subscribe({
      next: () => {
        this.busy.set(false);
        this.toast.success(`${product.name} deleted`);
        this.alerts.refresh();
        void this.router.navigate(['/products']);
      },
      error: (error) => {
        this.busy.set(false);
        this.toast.error(apiErrorMessage(error, 'Could not delete the product'));
      },
    });
  }
}
