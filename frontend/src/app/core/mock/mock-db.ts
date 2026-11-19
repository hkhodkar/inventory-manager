import {
  CategoryValue,
  DailyMovement,
  DashboardStats,
  LowStockItem,
  Movement,
  MovementType,
  Page,
  Product,
  ProductRef,
  StockStatus,
  Supplier,
  TopMover,
} from '../models/inventory.models';
import { MockApiError } from './mock-errors';
import { MovementInput, ProductInput, SupplierInput } from './mock-validation';
import { MockData, MovementRow, ProductRow, SupplierRow, createSeedData } from './seed';

export interface Paging {
  page: number;
  page_size: number;
}

export interface ProductFilter extends Paging {
  search?: string | null;
  category?: string | null;
  supplier_id?: number | null;
  stock_status?: StockStatus | null;
  sort?: string | null;
}

export interface SupplierFilter extends Paging {
  search?: string | null;
  sort?: string | null;
}

export interface MovementFilter extends Paging {
  type?: MovementType | null;
  product_id?: number | null;
  search?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  sort?: string | null;
}

export const STORAGE_KEY = 'inventory-manager.demo-data';
const STORAGE_VERSION = 1;
const DAY = 86_400_000;

type SortValue = string | number | null;
type SortColumns<T> = Record<string, (row: T) => SortValue>;

// SQLite order: NULL first when ascending, plain code point comparison for text
function compareValues(a: SortValue, b: SortValue): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return a < b ? -1 : 1;
}

function sortRows<T>(
  rows: T[],
  sort: string | null | undefined,
  columns: SortColumns<T>,
  fallback: string,
  tieBreak: (a: T, b: T) => number,
): T[] {
  const key = sort || fallback;
  const name = key.replace(/^-+/, '');
  const column = columns[name];
  if (!column) {
    throw new MockApiError(
      422,
      `Unknown sort field '${name}'. Use one of: ${Object.keys(columns).join(', ')}`,
    );
  }
  const direction = key.startsWith('-') ? -1 : 1;
  return [...rows].sort(
    (a, b) => direction * compareValues(column(a), column(b)) || tieBreak(a, b),
  );
}

function paginate<T>(items: T[], { page, page_size }: Paging): Page<T> {
  const start = (page - 1) * page_size;
  return { items: items.slice(start, start + page_size), total: items.length, page, page_size };
}

function searchTerm(search: string | null | undefined): string | null {
  const term = search?.trim().toLowerCase();
  return term ? term : null;
}

function matches(term: string, ...fields: (string | null | undefined)[]): boolean {
  return fields.some((field) => !!field && field.toLowerCase().includes(term));
}

const lower = (value: string | null | undefined) => value?.toLowerCase() ?? null;
const round = (value: number) => Math.round(value * 100) / 100;
const nextId = (rows: { id: number }[]) => rows.reduce((max, row) => Math.max(max, row.id), 0) + 1;
const byIdAsc = (a: { id: number }, b: { id: number }) => a.id - b.id;
const byIdDesc = (a: { id: number }, b: { id: number }) => b.id - a.id;

export function stockStatus(stock: number, reorderLevel: number): StockStatus {
  if (stock <= 0) return 'out';
  if (stock <= reorderLevel) return 'low';
  return 'in_stock';
}

/** Start of a UTC calendar day given as YYYY-MM-DD. */
function dayStart(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

/**
 * In-memory version of the FastAPI backend. Follows the same rules for
 * filtering, sorting, paging and the stock ledger. Changes are saved to
 * storage (localStorage in the browser) so they survive a reload.
 */
export class MockDb {
  private data: MockData;

  constructor(
    private readonly storage: Storage | null = null,
    private readonly clock: () => Date = () => new Date(),
  ) {
    this.data = this.load() ?? createSeedData(this.clock());
  }

  /** Throws away all changes and starts again from the demo data. */
  reset(): void {
    try {
      this.storage?.removeItem(STORAGE_KEY);
    } catch {
      // storage not available, nothing to clear
    }
    this.data = createSeedData(this.clock());
  }

  // --- products ---

  listProducts(filter: ProductFilter): Page<Product> {
    const term = searchTerm(filter.search);
    const stock = this.stockLevels();
    const level = (p: ProductRow) => stock.get(p.id) ?? 0;
    let rows = this.data.products.filter(
      (p) =>
        (!term || matches(term, p.sku, p.name, p.category)) &&
        (!filter.category || p.category === filter.category) &&
        (filter.supplier_id == null || p.supplier_id === filter.supplier_id) &&
        (!filter.stock_status || stockStatus(level(p), p.reorder_level) === filter.stock_status),
    );
    rows = sortRows(
      rows,
      filter.sort,
      {
        sku: (p) => p.sku,
        name: (p) => lower(p.name),
        category: (p) => p.category,
        stock: (p) => level(p),
        reorder_level: (p) => p.reorder_level,
        cost_price: (p) => p.cost_price,
        sale_price: (p) => p.sale_price,
        stock_value: (p) => level(p) * p.cost_price,
        supplier: (p) => lower(this.supplierRef(p.supplier_id)?.name),
        created_at: (p) => p.created_at,
        updated_at: (p) => p.updated_at,
      },
      'name',
      byIdAsc,
    );
    return paginate(
      rows.map((p) => this.toProduct(p, level(p))),
      filter,
    );
  }

  categories(): string[] {
    return [...new Set(this.data.products.map((p) => p.category))].sort(compareValues);
  }

  getProduct(id: number): Product {
    return this.toProduct(this.findProduct(id));
  }

  createProduct(input: ProductInput): Product {
    this.ensureSupplier(input.supplier_id);
    this.ensureSkuFree(input.sku!);
    const now = this.now();
    const product: ProductRow = {
      id: nextId(this.data.products),
      sku: input.sku!,
      name: input.name!,
      category: input.category!,
      unit: input.unit ?? 'pcs',
      cost_price: input.cost_price ?? 0,
      sale_price: input.sale_price ?? 0,
      reorder_level: input.reorder_level ?? 0,
      supplier_id: input.supplier_id ?? null,
      description: input.description ?? null,
      created_at: now,
      updated_at: now,
    };
    this.data.products.push(product);
    if (input.initial_stock) {
      this.record(product, {
        type: 'in',
        quantity: input.initial_stock,
        reference: null,
        note: 'Opening stock',
      });
    }
    this.save();
    return this.toProduct(product);
  }

  updateProduct(id: number, changes: ProductInput): Product {
    const product = this.findProduct(id);
    this.ensureSupplier(changes.supplier_id);
    if (changes.sku) {
      this.ensureSkuFree(changes.sku, id);
    }
    const required: (keyof ProductRow)[] = [
      'sku',
      'name',
      'category',
      'unit',
      'cost_price',
      'sale_price',
      'reorder_level',
    ];
    for (const [field, value] of Object.entries(changes)) {
      if (value === null && required.includes(field as keyof ProductRow)) {
        throw new MockApiError(422, `${field} cannot be empty`);
      }
    }
    Object.assign(product, changes, { updated_at: this.now() });
    this.save();
    return this.toProduct(product);
  }

  deleteProduct(id: number): void {
    this.findProduct(id);
    this.data.products = this.data.products.filter((p) => p.id !== id);
    this.data.movements = this.data.movements.filter((m) => m.product_id !== id);
    this.save();
  }

  // --- stock movements ---

  productMovements(id: number, paging: Paging): Page<Movement> {
    this.findProduct(id);
    const rows = sortRows(
      this.data.movements.filter((m) => m.product_id === id),
      '-created_at',
      { created_at: (m) => m.created_at },
      '-created_at',
      byIdDesc,
    );
    return paginate(
      rows.map((m) => this.toMovement(m)),
      paging,
    );
  }

  addMovement(productId: number, input: MovementInput): Movement {
    const product = this.findProduct(productId);
    const movement = this.record(product, input);
    this.save();
    return this.toMovement(movement);
  }

  listMovements(filter: MovementFilter): Page<Movement> {
    if (filter.date_from && filter.date_to && filter.date_to < filter.date_from) {
      throw new MockApiError(422, 'date_to must be on or after date_from');
    }
    const term = searchTerm(filter.search);
    const from = filter.date_from ? dayStart(filter.date_from) : null;
    const to = filter.date_to ? dayStart(filter.date_to) + DAY : null;
    let rows = this.data.movements.filter((m) => {
      if (filter.type && m.type !== filter.type) return false;
      if (filter.product_id != null && m.product_id !== filter.product_id) return false;
      const time = Date.parse(m.created_at);
      if (from !== null && time < from) return false;
      if (to !== null && time >= to) return false;
      if (term) {
        const product = this.data.products.find((p) => p.id === m.product_id);
        if (!matches(term, product?.sku, product?.name, m.reference, m.note)) return false;
      }
      return true;
    });
    rows = sortRows(
      rows,
      filter.sort,
      { created_at: (m) => m.created_at, quantity: (m) => m.quantity },
      '-created_at',
      byIdDesc,
    );
    return paginate(
      rows.map((m) => this.toMovement(m)),
      filter,
    );
  }

  // --- suppliers ---

  listSuppliers(filter: SupplierFilter): Page<Supplier> {
    const term = searchTerm(filter.search);
    let rows = this.data.suppliers.filter(
      (s) => !term || matches(term, s.name, s.contact_name, s.email, s.city, s.country),
    );
    const stats = new Map(rows.map((s) => [s.id, this.supplierStats(s.id)]));
    rows = sortRows(
      rows,
      filter.sort,
      {
        name: (s) => lower(s.name),
        country: (s) => s.country,
        lead_time_days: (s) => s.lead_time_days,
        products: (s) => stats.get(s.id)!.product_count,
        stock_value: (s) => stats.get(s.id)!.stock_value,
        created_at: (s) => s.created_at,
      },
      'name',
      byIdAsc,
    );
    return paginate(
      rows.map((s) => ({ ...s, ...stats.get(s.id)! })),
      filter,
    );
  }

  getSupplier(id: number): Supplier {
    return { ...this.findSupplier(id), ...this.supplierStats(id) };
  }

  createSupplier(input: SupplierInput): Supplier {
    this.ensureSupplierNameFree(input.name!);
    const supplier: SupplierRow = {
      id: nextId(this.data.suppliers),
      name: input.name!,
      contact_name: input.contact_name ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      city: input.city ?? null,
      country: input.country ?? null,
      lead_time_days: input.lead_time_days ?? null,
      notes: input.notes ?? null,
      created_at: this.now(),
    };
    this.data.suppliers.push(supplier);
    this.save();
    return this.getSupplier(supplier.id);
  }

  updateSupplier(id: number, changes: SupplierInput): Supplier {
    const supplier = this.findSupplier(id);
    if (changes.name) {
      this.ensureSupplierNameFree(changes.name, id);
    }
    if (changes.name === null) {
      throw new MockApiError(422, 'name cannot be empty');
    }
    Object.assign(supplier, changes);
    this.save();
    return this.getSupplier(id);
  }

  deleteSupplier(id: number): void {
    this.findSupplier(id);
    // products are kept, they just lose the supplier link
    this.data.suppliers = this.data.suppliers.filter((s) => s.id !== id);
    for (const product of this.data.products) {
      if (product.supplier_id === id) product.supplier_id = null;
    }
    this.save();
  }

  // --- alerts and reports ---

  lowStock(): LowStockItem[] {
    const stock = this.stockLevels();
    const items = this.data.products
      .filter((p) => (stock.get(p.id) ?? 0) <= p.reorder_level)
      .map((p) => {
        const level = stock.get(p.id) ?? 0;
        return {
          ...this.toProduct(p, level),
          shortage: Math.max(p.reorder_level - level, 0),
          suggested_order: Math.max(p.reorder_level * 2 - level, 1),
        };
      });
    // empty shelves first, then the ones closest to running out
    return items.sort(
      (a, b) =>
        Number(a.stock_status !== 'out') - Number(b.stock_status !== 'out') ||
        a.stock / Math.max(a.reorder_level, 1) - b.stock / Math.max(b.reorder_level, 1) ||
        compareValues(a.name.toLowerCase(), b.name.toLowerCase()) ||
        a.id - b.id,
    );
  }

  dashboard(): DashboardStats {
    const stock = this.stockLevels();
    const products = this.data.products;
    const since = this.clock().getTime() - 30 * DAY;
    const recent = this.data.movements.filter((m) => Date.parse(m.created_at) >= since);
    const latest = sortRows(
      this.data.movements,
      '-created_at',
      { created_at: (m) => m.created_at },
      '-created_at',
      byIdDesc,
    ).slice(0, 8);
    const level = (p: ProductRow) => Math.max(stock.get(p.id) ?? 0, 0);
    const statuses = products.map((p) => stockStatus(stock.get(p.id) ?? 0, p.reorder_level));
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

    return {
      product_count: products.length,
      supplier_count: this.data.suppliers.length,
      category_count: new Set(products.map((p) => p.category)).size,
      total_units: sum(products.map(level)),
      stock_value: round(sum(products.map((p) => level(p) * p.cost_price))),
      retail_value: round(sum(products.map((p) => level(p) * p.sale_price))),
      low_stock_count: statuses.filter((s) => s === 'low').length,
      out_of_stock_count: statuses.filter((s) => s === 'out').length,
      units_in_30d: sum(recent.filter((m) => m.type === 'in').map((m) => m.quantity)),
      units_out_30d: sum(recent.filter((m) => m.type === 'out').map((m) => -m.quantity)),
      movements_30d: recent.length,
      recent_movements: latest.map((m) => this.toMovement(m)),
    };
  }

  stockByCategory(): CategoryValue[] {
    const stock = this.stockLevels();
    const totals = new Map<string, CategoryValue>();
    for (const p of this.data.products) {
      const row = totals.get(p.category) ?? {
        category: p.category,
        product_count: 0,
        units: 0,
        stock_value: 0,
        retail_value: 0,
      };
      const level = Math.max(stock.get(p.id) ?? 0, 0);
      row.product_count += 1;
      row.units += level;
      row.stock_value += level * p.cost_price;
      row.retail_value += level * p.sale_price;
      totals.set(p.category, row);
    }
    return [...totals.values()]
      .map((row) => ({
        ...row,
        stock_value: round(row.stock_value),
        retail_value: round(row.retail_value),
      }))
      .sort((a, b) => b.stock_value - a.stock_value || compareValues(a.category, b.category));
  }

  topMovers(days: number, limit: number): TopMover[] {
    const since = this.clock().getTime() - days * DAY;
    const stats = new Map<number, TopMover>();
    for (const m of this.data.movements) {
      if (Date.parse(m.created_at) < since) continue;
      let mover = stats.get(m.product_id);
      if (!mover) {
        const product = this.findProduct(m.product_id);
        mover = {
          product: this.productRef(product),
          category: product.category,
          units_out: 0,
          units_in: 0,
          movement_count: 0,
        };
        stats.set(m.product_id, mover);
      }
      mover.movement_count += 1;
      if (m.type === 'out') mover.units_out -= m.quantity;
      else if (m.type === 'in') mover.units_in += m.quantity;
    }
    return [...stats.values()]
      .filter((m) => m.units_out > 0)
      .sort(
        (a, b) =>
          b.units_out - a.units_out ||
          b.movement_count - a.movement_count ||
          compareValues(a.product.name.toLowerCase(), b.product.name.toLowerCase()),
      )
      .slice(0, limit);
  }

  movementsOverTime(days: number): DailyMovement[] {
    const now = this.clock();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const first = today - (days - 1) * DAY;
    const buckets = new Map<string, DailyMovement>();
    for (let offset = 0; offset < days; offset++) {
      const date = new Date(first + offset * DAY).toISOString().slice(0, 10);
      buckets.set(date, {
        date,
        units_in: 0,
        units_out: 0,
        adjustments: 0,
        value_in: 0,
        value_out: 0,
      });
    }
    for (const m of this.data.movements) {
      const bucket = buckets.get(m.created_at.slice(0, 10));
      if (!bucket) continue;
      const cost = this.findProduct(m.product_id).cost_price;
      if (m.type === 'in') {
        bucket.units_in += m.quantity;
        bucket.value_in += m.quantity * cost;
      } else if (m.type === 'out') {
        bucket.units_out -= m.quantity;
        bucket.value_out -= m.quantity * cost;
      } else {
        bucket.adjustments += m.quantity;
      }
    }
    return [...buckets.values()].map((b) => ({
      ...b,
      value_in: round(b.value_in),
      value_out: round(b.value_out),
    }));
  }

  // --- helpers ---

  /** Adds a ledger line, refusing anything that would take stock below zero. */
  private record(product: ProductRow, input: MovementInput): MovementRow {
    const current = this.stockOf(product.id);
    const change = input.type === 'out' ? -input.quantity : input.quantity;
    const balance = current + change;
    if (balance < 0) {
      throw new MockApiError(
        409,
        `Not enough stock: ${product.sku} has ${current} ${product.unit} on hand, ` +
          `so ${Math.abs(change)} cannot be removed`,
      );
    }
    const movement: MovementRow = {
      id: nextId(this.data.movements),
      product_id: product.id,
      type: input.type,
      quantity: change,
      balance_after: balance,
      reference: input.reference,
      note: input.note,
      created_at: this.now(),
    };
    this.data.movements.push(movement);
    return movement;
  }

  private stockLevels(): Map<number, number> {
    const levels = new Map<number, number>();
    for (const m of this.data.movements) {
      levels.set(m.product_id, (levels.get(m.product_id) ?? 0) + m.quantity);
    }
    return levels;
  }

  private stockOf(productId: number): number {
    return this.data.movements
      .filter((m) => m.product_id === productId)
      .reduce((sum, m) => sum + m.quantity, 0);
  }

  private supplierStats(id: number) {
    const stock = this.stockLevels();
    const products = this.data.products.filter((p) => p.supplier_id === id);
    return {
      product_count: products.length,
      stock_value: round(
        products.reduce((sum, p) => sum + Math.max(stock.get(p.id) ?? 0, 0) * p.cost_price, 0),
      ),
    };
  }

  private supplierRef(id: number | null) {
    const supplier = id === null ? undefined : this.data.suppliers.find((s) => s.id === id);
    return supplier ? { id: supplier.id, name: supplier.name } : null;
  }

  private productRef(product: ProductRow): ProductRef {
    return { id: product.id, sku: product.sku, name: product.name, unit: product.unit };
  }

  private toProduct(row: ProductRow, stock = this.stockOf(row.id)): Product {
    return {
      ...row,
      supplier: this.supplierRef(row.supplier_id),
      stock,
      stock_status: stockStatus(stock, row.reorder_level),
      stock_value: round(stock * row.cost_price),
    };
  }

  private toMovement(row: MovementRow): Movement {
    return { ...row, product: this.productRef(this.findProduct(row.product_id)) };
  }

  private findProduct(id: number): ProductRow {
    const row = this.data.products.find((p) => p.id === id);
    if (!row) throw new MockApiError(404, `The product ${id} was not found`);
    return row;
  }

  private findSupplier(id: number): SupplierRow {
    const row = this.data.suppliers.find((s) => s.id === id);
    if (!row) throw new MockApiError(404, `The supplier ${id} was not found`);
    return row;
  }

  private ensureSupplier(id: number | null | undefined): void {
    if (id != null && !this.data.suppliers.some((s) => s.id === id)) {
      throw new MockApiError(422, `supplier_id: no supplier with id ${id}`);
    }
  }

  private ensureSkuFree(sku: string, excludeId?: number): void {
    if (this.data.products.some((p) => p.sku === sku && p.id !== excludeId)) {
      throw new MockApiError(409, `A product with SKU ${sku} already exists`);
    }
  }

  private ensureSupplierNameFree(name: string, excludeId?: number): void {
    const taken = this.data.suppliers.some(
      (s) => s.name.toLowerCase() === name.toLowerCase() && s.id !== excludeId,
    );
    if (taken) throw new MockApiError(409, `A supplier named ${name} already exists`);
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private load(): MockData | null {
    try {
      const saved = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? 'null');
      return saved?.version === STORAGE_VERSION ? (saved.data as MockData) : null;
    } catch {
      return null;
    }
  }

  private save(): void {
    try {
      this.storage?.setItem(
        STORAGE_KEY,
        JSON.stringify({ version: STORAGE_VERSION, data: this.data }),
      );
    } catch {
      // storage full or disabled, changes then only last until a reload
    }
  }
}
