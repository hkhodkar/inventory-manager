import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { apiErrorMessage } from '../../core/api/api-error';
import { ProductsApi } from '../../core/api/products.api';
import { SuppliersApi } from '../../core/api/suppliers.api';
import { Product, ProductPayload, UNITS, Unit } from '../../core/models/inventory.models';
import { StockAlerts } from '../../core/services/stock-alerts';
import { notBlank, wholeNumber } from '../../shared/forms/validators';
import { Modal } from '../../shared/ui/modal';
import { ToastService } from '../../shared/ui/toast.service';

const SKU_PATTERN = /^\s*[A-Za-z0-9][A-Za-z0-9-]{1,31}\s*$/;
const MAX_PRICE = 1_000_000;

const UNIT_LABELS: Record<Unit, string> = {
  pcs: 'Pieces (pcs)',
  pack: 'Packs',
  box: 'Boxes',
  set: 'Sets',
  pair: 'Pairs',
  roll: 'Rolls',
  kg: 'Kilograms (kg)',
  l: 'Litres (l)',
  m: 'Metres (m)',
};

@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-form.html',
})
export class ProductForm implements OnInit {
  private readonly api = inject(ProductsApi);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(StockAlerts);
  private readonly suppliersApi = inject(SuppliersApi);
  private readonly fb = inject(FormBuilder);

  readonly product = input<Product | null>(null);
  /** preselects the supplier when adding a product from a supplier page */
  readonly supplierId = input<number | null>(null);
  readonly saved = output<Product>();
  readonly closed = output<void>();

  protected readonly units = UNITS.map((value) => ({ value, label: UNIT_LABELS[value] }));
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly categories = rxResource({ stream: () => this.api.categories() });
  protected readonly suppliers = rxResource({ stream: () => this.suppliersApi.options() });

  protected readonly form = this.fb.group({
    sku: this.fb.nonNullable.control('', [notBlank, Validators.pattern(SKU_PATTERN)]),
    name: this.fb.nonNullable.control('', [notBlank, Validators.maxLength(120)]),
    category: this.fb.nonNullable.control('', [notBlank, Validators.maxLength(60)]),
    unit: this.fb.nonNullable.control<Unit>('pcs'),
    supplier_id: this.fb.control<number | null>(null),
    cost_price: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(MAX_PRICE),
    ]),
    sale_price: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(MAX_PRICE),
    ]),
    reorder_level: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(100_000),
      wholeNumber,
    ]),
    initial_stock: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(1_000_000),
      wholeNumber,
    ]),
    description: this.fb.nonNullable.control('', Validators.maxLength(2000)),
  });

  private readonly prices = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Gross margin on the sale price, shown as a hint under the price fields. */
  protected readonly margin = computed(() => {
    const { cost_price: cost, sale_price: price } = this.prices();
    if (cost == null || price == null || price <= 0) return null;
    return Math.round(((price - cost) / price) * 100);
  });

  ngOnInit(): void {
    const product = this.product();
    if (product) {
      this.form.patchValue({
        sku: product.sku,
        name: product.name,
        category: product.category,
        unit: product.unit,
        supplier_id: product.supplier_id,
        cost_price: product.cost_price,
        sale_price: product.sale_price,
        reorder_level: product.reorder_level,
        description: product.description ?? '',
      });
    } else {
      this.form.patchValue({ supplier_id: this.supplierId() });
    }
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected numberError(name: 'cost_price' | 'sale_price' | 'reorder_level' | 'initial_stock') {
    const control = this.form.controls[name];
    if (control.hasError('required')) return 'Required';
    if (control.hasError('min')) return 'Cannot be negative';
    if (control.hasError('max')) return 'That number is too large';
    if (control.hasError('wholeNumber')) return 'Use whole numbers only';
    return '';
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const payload: ProductPayload = {
      sku: value.sku.trim().toUpperCase(),
      name: value.name.trim(),
      category: value.category.trim(),
      unit: value.unit,
      supplier_id: value.supplier_id,
      cost_price: value.cost_price!,
      sale_price: value.sale_price!,
      reorder_level: value.reorder_level!,
      description: value.description.trim() || null,
    };
    const existing = this.product();
    if (!existing && value.initial_stock) {
      payload.initial_stock = value.initial_stock;
    }
    const request = existing ? this.api.update(existing.id, payload) : this.api.create(payload);

    this.saving.set(true);
    this.serverError.set(null);
    request.subscribe({
      next: (product) => {
        this.saving.set(false);
        this.alerts.refresh();
        this.toast.success(existing ? 'Product updated' : `${product.name} added`);
        this.saved.emit(product);
      },
      error: (error) => {
        this.saving.set(false);
        this.serverError.set(apiErrorMessage(error, 'Could not save the product'));
      },
    });
  }
}
