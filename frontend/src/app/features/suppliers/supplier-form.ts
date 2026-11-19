import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { apiErrorMessage } from '../../core/api/api-error';
import { SuppliersApi } from '../../core/api/suppliers.api';
import { Supplier, SupplierPayload } from '../../core/models/inventory.models';
import { notBlank, wholeNumber } from '../../shared/forms/validators';
import { Modal } from '../../shared/ui/modal';
import { ToastService } from '../../shared/ui/toast.service';

const PHONE_PATTERN = /^\+?[0-9()\-.\s]{5,}$/;
const EMAIL_PATTERN = /^\s*[^\s@]+@[^\s@]+\.[^\s@]{2,}\s*$/;

@Component({
  selector: 'app-supplier-form',
  imports: [ReactiveFormsModule, Modal],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './supplier-form.html',
})
export class SupplierForm implements OnInit {
  private readonly api = inject(SuppliersApi);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly supplier = input<Supplier | null>(null);
  readonly saved = output<Supplier>();
  readonly closed = output<void>();

  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly serverError = signal<string | null>(null);

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [notBlank, Validators.maxLength(120)]],
    contact_name: ['', Validators.maxLength(200)],
    email: ['', [Validators.pattern(EMAIL_PATTERN), Validators.maxLength(200)]],
    phone: ['', Validators.pattern(PHONE_PATTERN)],
    website: ['', Validators.maxLength(200)],
    city: ['', Validators.maxLength(200)],
    country: ['', Validators.maxLength(200)],
    lead_time_days: this.fb.control<number | null>(null, [
      Validators.min(0),
      Validators.max(365),
      wholeNumber,
    ]),
    notes: ['', Validators.maxLength(2000)],
  });

  ngOnInit(): void {
    const supplier = this.supplier();
    if (supplier) {
      this.form.patchValue({
        name: supplier.name,
        contact_name: supplier.contact_name ?? '',
        email: supplier.email ?? '',
        phone: supplier.phone ?? '',
        website: supplier.website ?? '',
        city: supplier.city ?? '',
        country: supplier.country ?? '',
        lead_time_days: supplier.lead_time_days,
        notes: supplier.notes ?? '',
      });
    }
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const text = (v: string) => v.trim() || null;
    const website = text(value.website);
    const payload: SupplierPayload = {
      name: value.name.trim(),
      contact_name: text(value.contact_name),
      email: text(value.email),
      phone: text(value.phone),
      website: website && !/^https?:\/\//i.test(website) ? `https://${website}` : website,
      city: text(value.city),
      country: text(value.country),
      lead_time_days: value.lead_time_days,
      notes: text(value.notes),
    };
    const existing = this.supplier();
    const request = existing ? this.api.update(existing.id, payload) : this.api.create(payload);

    this.saving.set(true);
    this.serverError.set(null);
    request.subscribe({
      next: (supplier) => {
        this.saving.set(false);
        this.toast.success(existing ? 'Supplier updated' : `${supplier.name} added`);
        this.saved.emit(supplier);
      },
      error: (error) => {
        this.saving.set(false);
        this.serverError.set(apiErrorMessage(error, 'Could not save the supplier'));
      },
    });
  }
}
