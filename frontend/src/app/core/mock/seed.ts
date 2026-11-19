import { MovementType, Unit } from '../models/inventory.models';
import seed from '../../../../../backend/app/seed_data.json';

/*
 * Demo data for the in-browser mock API. It reads the same seed file as the
 * backend (backend/app/seed_data.json), so both start with identical data.
 * Movement times count back from the latest 16:00 UTC, like backend/app/seed.py.
 */

export interface SupplierRow {
  id: number;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  country: string | null;
  lead_time_days: number | null;
  notes: string | null;
  created_at: string;
}

export interface ProductRow {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: Unit;
  cost_price: number;
  sale_price: number;
  reorder_level: number;
  supplier_id: number | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface MovementRow {
  id: number;
  product_id: number;
  type: MovementType;
  quantity: number;
  balance_after: number;
  reference: string | null;
  note: string | null;
  created_at: string;
}

export interface MockData {
  suppliers: SupplierRow[];
  products: ProductRow[];
  movements: MovementRow[];
}

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function createSeedData(now = new Date()): MockData {
  const start = new Date(now);
  start.setUTCSeconds(0, 0);
  const ago = (ms: number) => new Date(start.getTime() - ms).toISOString();
  const anchor = new Date(start);
  anchor.setUTCHours(16, 0, 0, 0);
  if (anchor > start) anchor.setUTCDate(anchor.getUTCDate() - 1);

  const suppliers: SupplierRow[] = seed.suppliers.map(({ days_ago, ...row }, i) => ({
    id: i + 1,
    ...row,
    created_at: ago(days_ago * DAY),
  }));

  const products: ProductRow[] = seed.products.map(({ days_ago, supplier, ...row }, i) => ({
    id: i + 1,
    ...row,
    unit: row.unit as Unit,
    supplier_id: supplier + 1,
    created_at: ago(days_ago * DAY),
    updated_at: ago(days_ago * DAY),
  }));

  // the file lists movements oldest first, so the running balance can be kept here
  const balances = new Map<number, number>();
  const movements: MovementRow[] = seed.movements.map((row, i) => {
    const productId = row.product + 1;
    const balance = (balances.get(productId) ?? 0) + row.quantity;
    balances.set(productId, balance);
    return {
      id: i + 1,
      product_id: productId,
      type: row.type as MovementType,
      quantity: row.quantity,
      balance_after: balance,
      reference: row.reference,
      note: row.note,
      created_at: new Date(anchor.getTime() - row.minutes_ago * MINUTE).toISOString(),
    };
  });

  return { suppliers, products, movements };
}
