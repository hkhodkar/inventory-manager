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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { apiErrorMessage } from '../../core/api/api-error';
import { ProductsApi } from '../../core/api/products.api';
import { Movement, MovementType, Product } from '../../core/models/inventory.models';
import { StockAlerts } from '../../core/services/stock-alerts';
import { formatNumber } from '../../core/utils/format';
import { wholeNumber } from '../../shared/forms/validators';
import { Icon } from '../../shared/ui/icon';
import { Modal } from '../../shared/ui/modal';
import { ToastService } from '../../shared/ui/toast.service';

const MAX_QUANTITY = 1_000_000;

const TYPES: { value: MovementType; label: string; hint: string; reference: string }[] = [
  { value: 'in', label: 'Stock in', hint: 'Goods received', reference: 'e.g. PO-2026-140' },
  { value: 'out', label: 'Stock out', hint: 'Sold or used', reference: 'e.g. SO-20512' },
  {
    value: 'adjustment',
    label: 'Adjustment',
    hint: 'Correct after a count',
    reference: 'e.g. CNT-21',
  },
];

/** Records a stock movement for one product. Never lets the stock go below zero. */
@Component({
  selector: 'app-movement-form',
  imports: [ReactiveFormsModule, Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './movement-form.html',
  styleUrl: './movement-form.scss',
})
export class MovementForm implements OnInit {
  private readonly api = inject(ProductsApi);
  private readonly toast = inject(ToastService);
  private readonly alerts = inject(StockAlerts);
  private readonly fb = inject(FormBuilder);

  readonly product = input.required<Product>();
  readonly initialType = input<MovementType>('in');
  readonly suggestedQuantity = input<number | null>(null);
  readonly saved = output<Movement>();
  readonly closed = output<void>();

  protected readonly types = TYPES;
  protected readonly formatNumber = formatNumber;
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.group({
    type: this.fb.nonNullable.control<MovementType>('in'),
    quantity: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(0),
      Validators.max(MAX_QUANTITY),
      wholeNumber,
    ]),
    reference: this.fb.nonNullable.control('', Validators.maxLength(60)),
    note: this.fb.nonNullable.control('', Validators.maxLength(300)),
  });

  private readonly value = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  protected readonly type = computed(() => this.value().type ?? 'in');
  protected readonly isAdjustment = computed(() => this.type() === 'adjustment');
  protected readonly referenceHint = computed(
    () => TYPES.find((t) => t.value === this.type())!.reference,
  );

  /** Signed change in stock for the current input, null while it isn't a usable number. */
  protected readonly change = computed(() => {
    const quantity = this.value().quantity;
    if (quantity == null || !Number.isInteger(quantity) || quantity < 0) return null;
    switch (this.type()) {
      case 'in':
        return quantity;
      case 'out':
        return -quantity;
      default:
        // for adjustments the user enters the counted stock
        return quantity - this.product().stock;
    }
  });

  protected readonly balanceAfter = computed(() => {
    const change = this.change();
    return change === null ? null : this.product().stock + change;
  });

  /** Problem with the quantity that the field validators can't see. */
  protected readonly quantityProblem = computed(() => {
    const change = this.change();
    if (change === null) return null;
    const { stock, unit } = this.product();
    if (this.type() === 'out' && -change > stock) {
      return stock > 0
        ? `Only ${formatNumber(stock)} ${unit} on hand, you can't take out more than that`
        : 'This product is out of stock, there is nothing to take out';
    }
    if (this.type() !== 'adjustment' && change === 0) {
      return 'Enter a quantity of at least 1';
    }
    if (this.type() === 'adjustment' && change === 0) {
      return 'The count matches the current stock, there is nothing to adjust';
    }
    return null;
  });

  ngOnInit(): void {
    this.form.patchValue({ type: this.initialType(), quantity: this.suggestedQuantity() });
  }

  protected showQuantityError(): boolean {
    const control = this.form.controls.quantity;
    return (control.touched || this.submitted()) && (control.invalid || !!this.quantityProblem());
  }

  protected quantityError(): string {
    const control = this.form.controls.quantity;
    if (control.hasError('required')) {
      return this.isAdjustment() ? 'Enter the counted stock' : 'Enter a quantity';
    }
    if (control.hasError('wholeNumber')) return 'Use whole numbers only';
    if (control.hasError('min')) return 'The quantity cannot be negative';
    if (control.hasError('max')) return `The maximum is ${formatNumber(MAX_QUANTITY)}`;
    return this.quantityProblem() ?? '';
  }

  protected submit(): void {
    this.submitted.set(true);
    const change = this.change();
    if (this.form.invalid || this.quantityProblem() || change === null || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const product = this.product();

    this.saving.set(true);
    this.serverError.set(null);
    this.api
      .addMovement(product.id, {
        type: value.type,
        quantity: value.type === 'out' ? -change : change,
        reference: value.reference.trim() || null,
        note: value.note.trim() || null,
      })
      .subscribe({
        next: (movement) => {
          this.saving.set(false);
          this.alerts.refresh();
          this.toast.success(
            `${product.sku}: stock is now ${formatNumber(movement.balance_after)} ${product.unit}`,
          );
          this.saved.emit(movement);
        },
        error: (error) => {
          this.saving.set(false);
          this.serverError.set(apiErrorMessage(error, 'Could not save the movement'));
        },
      });
  }
}
