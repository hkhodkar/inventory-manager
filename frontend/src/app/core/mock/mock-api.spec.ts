import { Movement, Page, Product, Supplier } from '../models/inventory.models';
import { handleMockRequest } from './mock-api';
import { MockDb, STORAGE_KEY } from './mock-db';

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear(): void {
    this.items.clear();
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

const NOW = new Date('2026-03-18T10:30:00Z');
const NEW_PRODUCT = { sku: 'tst-1', name: 'Test product', category: 'Tools', reorder_level: 5 };

describe('mock API', () => {
  let storage: MemoryStorage;
  let db: MockDb;

  beforeEach(() => {
    storage = new MemoryStorage();
    db = new MockDb(storage, () => NOW);
  });

  function call<T = unknown>(method: string, url: string, body?: unknown) {
    return handleMockRequest(db, method, url, body ?? null) as { status: number; body: T };
  }
  const get = <T>(url: string) => call<T>('GET', url).body;
  const detail = (method: string, url: string, body?: unknown) =>
    call<{ detail: unknown }>(method, url, body).body.detail;

  describe('products', () => {
    it('creates a product with opening stock booked as a movement', () => {
      const created = call<Product>('POST', '/api/products', { ...NEW_PRODUCT, initial_stock: 8 });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({
        sku: 'TST-1',
        unit: 'pcs',
        stock: 8,
        stock_status: 'in_stock',
        supplier: null,
      });
      const history = get<Page<Movement>>(`/api/products/${created.body.id}/movements`);
      expect(history.items).toHaveLength(1);
      expect(history.items[0]).toMatchObject({ type: 'in', quantity: 8, note: 'Opening stock' });
    });

    it('rejects duplicate SKUs and invalid input like the API', () => {
      expect(call('POST', '/api/products', { ...NEW_PRODUCT, sku: 'elc-1001' }).status).toBe(409);
      expect(detail('POST', '/api/products', { ...NEW_PRODUCT, sku: 'has space' })).toEqual([
        expect.objectContaining({ type: 'string_pattern_mismatch', loc: ['body', 'sku'] }),
      ]);
      expect(call('POST', '/api/products', { ...NEW_PRODUCT, cost_price: -1 }).status).toBe(422);
      expect(call('POST', '/api/products', { ...NEW_PRODUCT, unit: 'crate' }).status).toBe(422);
      expect(call('POST', '/api/products', { ...NEW_PRODUCT, supplier_id: 99 }).status).toBe(422);
      expect(call('PATCH', '/api/products/1', { name: null }).status).toBe(422);
    });

    it('validates query parameters', () => {
      expect(call('GET', '/api/products?stock_status=nope').status).toBe(422);
      expect(call('GET', '/api/products?page_size=500').status).toBe(422);
      expect(detail('GET', '/api/products?sort=price')).toContain("Unknown sort field 'price'");
      expect(call('GET', '/api/products/abc').status).toBe(422);
      expect(call('GET', '/api/products/999').status).toBe(404);
    });

    it('deletes a product together with its history', () => {
      expect(call('DELETE', '/api/products/1').status).toBe(204);
      expect(get<Page<Movement>>('/api/movements?product_id=1').total).toBe(0);
      expect(call('GET', '/api/products/1').status).toBe(404);
    });
  });

  describe('stock movements', () => {
    it('keeps a running balance', () => {
      const product = call<Product>('POST', '/api/products', NEW_PRODUCT).body;
      const url = `/api/products/${product.id}/movements`;
      expect(call<Movement>('POST', url, { type: 'in', quantity: 20 }).body.balance_after).toBe(20);
      const out = call<Movement>('POST', url, { type: 'out', quantity: 8, reference: 'SO-1' });
      expect(out.body).toMatchObject({ quantity: -8, balance_after: 12, reference: 'SO-1' });
      const adjust = call<Movement>('POST', url, { type: 'adjustment', quantity: -2 });
      expect(adjust.body.balance_after).toBe(10);
      expect(get<Product>(`/api/products/${product.id}`).stock).toBe(10);
    });

    it('refuses to take stock below zero', () => {
      const product = call<Product>('POST', '/api/products', { ...NEW_PRODUCT, initial_stock: 5 });
      const url = `/api/products/${product.body.id}/movements`;
      const response = call('POST', url, { type: 'out', quantity: 6 });
      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        detail: 'Not enough stock: TST-1 has 5 pcs on hand, so 6 cannot be removed',
      });
      expect(call('POST', url, { type: 'adjustment', quantity: -6 }).status).toBe(409);
      expect(get<Product>(`/api/products/${product.body.id}`).stock).toBe(5);
    });

    it('validates quantities per movement type', () => {
      const url = '/api/products/1/movements';
      expect(detail('POST', url, { type: 'in', quantity: 0 })).toEqual([
        expect.objectContaining({ msg: 'Value error, Quantity must be greater than 0' }),
      ]);
      expect(call('POST', url, { type: 'out', quantity: -3 }).status).toBe(422);
      expect(call('POST', url, { type: 'adjustment', quantity: 0 }).status).toBe(422);
      expect(call('POST', url, { type: 'move', quantity: 3 }).status).toBe(422);
      expect(call('POST', url, { type: 'in', quantity: 1.5 }).status).toBe(422);
    });

    it('filters the log by whole UTC days', () => {
      const all = get<Page<Movement>>('/api/movements?page_size=200').items;
      const day = all[0].created_at.slice(0, 10);
      const sameDay = all.filter((m) => m.created_at.startsWith(day));
      const filtered = get<Page<Movement>>(
        `/api/movements?date_from=${day}&date_to=${day}&page_size=200`,
      );
      expect(filtered.total).toBe(sameDay.length);
      expect(call('GET', '/api/movements?date_from=2026-05-02&date_to=2026-05-01').status).toBe(
        422,
      );
      expect(call('GET', '/api/movements?date_from=yesterday').status).toBe(422);
    });
  });

  describe('suppliers', () => {
    it('keeps products when a supplier is deleted', () => {
      const before = get<Page<Product>>('/api/products?supplier_id=3').total;
      expect(before).toBeGreaterThan(0);
      expect(call('DELETE', '/api/suppliers/3').status).toBe(204);
      expect(get<Page<Product>>('/api/products?supplier_id=3').total).toBe(0);
      expect(get<Page<Product>>('/api/products').total).toBe(40);
    });

    it('validates contact details', () => {
      expect(call('POST', '/api/suppliers', { name: 'boxwell packaging' }).status).toBe(409);
      expect(call('POST', '/api/suppliers', { name: 'X', email: 'nope' }).status).toBe(422);
      expect(call('POST', '/api/suppliers', { name: 'X', phone: 'abc' }).status).toBe(422);
      const created = call<Supplier>('POST', '/api/suppliers', { name: 'New Co', phone: '' });
      expect(created.status).toBe(201);
      expect(created.body).toMatchObject({ phone: null, product_count: 0, stock_value: 0 });
    });
  });

  describe('storage', () => {
    it('keeps changes across reloads and resets to the seed', () => {
      call('POST', '/api/products', NEW_PRODUCT);
      expect(storage.getItem(STORAGE_KEY)).not.toBeNull();

      const reloaded = new MockDb(storage, () => NOW);
      expect(handleMockRequest(reloaded, 'GET', '/api/products?search=TST-1').body).toMatchObject({
        total: 1,
      });

      // another tab's change shows up after a reload from storage
      call('POST', '/api/products', { ...NEW_PRODUCT, sku: 'tst-2' });
      reloaded.reload();
      expect(handleMockRequest(reloaded, 'GET', '/api/products?search=TST-').body).toMatchObject({
        total: 2,
      });

      reloaded.reset();
      expect(storage.getItem(STORAGE_KEY)).toBeNull();
      expect(handleMockRequest(reloaded, 'GET', '/api/products').body).toMatchObject({ total: 40 });
    });
  });

  it('answers unknown routes and methods like FastAPI', () => {
    expect(call('GET', '/api/nope').status).toBe(404);
    expect(call('PUT', '/api/products/1').status).toBe(405);
  });
});
