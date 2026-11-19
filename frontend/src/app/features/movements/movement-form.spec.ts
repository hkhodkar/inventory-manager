import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Movement, Product } from '../../core/models/inventory.models';
import { MovementForm } from './movement-form';

const PRODUCT: Product = {
  id: 7,
  sku: 'PKG-3003',
  name: 'Clear packing tape 66 m',
  category: 'Packaging',
  unit: 'roll',
  cost_price: 1.1,
  sale_price: 2.9,
  reorder_level: 60,
  supplier_id: null,
  supplier: null,
  description: null,
  stock: 12,
  stock_status: 'low',
  stock_value: 13.2,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

function setup(type: 'in' | 'out' | 'adjustment' = 'in') {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  const fixture = TestBed.createComponent(MovementForm);
  fixture.componentRef.setInput('product', PRODUCT);
  fixture.componentRef.setInput('initialType', type);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const http = TestBed.inject(HttpTestingController);
  // the low-stock badge refresh is not part of these tests
  const ignoreAlerts = () => http.match('/api/alerts/low-stock');

  const typeIn = (selector: string, value: string) => {
    const input = el.querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const saved: Movement[] = [];
  fixture.componentInstance.saved.subscribe((m) => saved.push(m));
  return { fixture, el, http, typeIn, submit, saved, ignoreAlerts };
}

describe('MovementForm', () => {
  it('refuses to take out more than is on hand without calling the API', () => {
    const { el, http, typeIn, submit } = setup('out');
    typeIn('#movement-quantity', '15');
    submit();
    expect(el.querySelector('.field-error')?.textContent).toContain('Only 12 roll on hand');
    expect(el.querySelector('.preview')?.classList).toContain('problem');
    http.expectNone('/api/products/7/movements');
  });

  it('sends a stock-in with the typed quantity and reference', () => {
    const { el, http, typeIn, submit, saved, ignoreAlerts } = setup('in');
    typeIn('#movement-quantity', '40');
    typeIn('#movement-reference', ' PO-2026-140 ');
    expect(el.querySelector('.preview')?.textContent).toContain('52 roll');
    submit();

    const req = http.expectOne('/api/products/7/movements');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      type: 'in',
      quantity: 40,
      reference: 'PO-2026-140',
      note: null,
    });
    req.flush({ id: 1, balance_after: 52 } as Movement);
    ignoreAlerts();
    expect(saved.length).toBe(1);
  });

  it('turns a counted stock into a signed adjustment', () => {
    const { http, typeIn, submit, ignoreAlerts } = setup('adjustment');
    typeIn('#movement-quantity', '9');
    submit();
    const req = http.expectOne('/api/products/7/movements');
    expect(req.request.body).toMatchObject({ type: 'adjustment', quantity: -3 });
    req.flush({ id: 2, balance_after: 9 } as Movement);
    ignoreAlerts();
  });

  it('shows the API error when the server rejects the movement', () => {
    const { fixture, el, http, typeIn, submit } = setup('out');
    typeIn('#movement-quantity', '5');
    submit();
    http
      .expectOne('/api/products/7/movements')
      .flush(
        { detail: 'Not enough stock: PKG-3003 has 3 roll on hand, so 5 cannot be removed' },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();
    expect(el.querySelector('.form-error')?.textContent).toContain('Not enough stock');
  });
});
