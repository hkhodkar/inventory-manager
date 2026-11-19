export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

export type StockStatus = 'in_stock' | 'low' | 'out';
export type MovementType = 'in' | 'out' | 'adjustment';

export const UNITS = ['pcs', 'pack', 'box', 'set', 'pair', 'roll', 'kg', 'l', 'm'] as const;
export type Unit = (typeof UNITS)[number];

export const STOCK_STATUSES: { value: StockStatus; label: string }[] = [
  { value: 'in_stock', label: 'In stock' },
  { value: 'low', label: 'Low stock' },
  { value: 'out', label: 'Out of stock' },
];

export const MOVEMENT_TYPES: { value: MovementType; label: string }[] = [
  { value: 'in', label: 'Stock in' },
  { value: 'out', label: 'Stock out' },
  { value: 'adjustment', label: 'Adjustment' },
];

export interface SupplierRef {
  id: number;
  name: string;
}

export interface Supplier {
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
  product_count: number;
  stock_value: number;
}

export type SupplierPayload = Omit<Supplier, 'id' | 'created_at' | 'product_count' | 'stock_value'>;

export interface ProductRef {
  id: number;
  sku: string;
  name: string;
  unit: string;
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string;
  unit: Unit;
  cost_price: number;
  sale_price: number;
  reorder_level: number;
  supplier_id: number | null;
  supplier: SupplierRef | null;
  description: string | null;
  stock: number;
  stock_status: StockStatus;
  stock_value: number;
  created_at: string;
  updated_at: string;
}

export interface ProductPayload {
  sku: string;
  name: string;
  category: string;
  unit: Unit;
  cost_price: number;
  sale_price: number;
  reorder_level: number;
  supplier_id: number | null;
  description: string | null;
  initial_stock?: number;
}

export interface LowStockItem extends Product {
  shortage: number;
  suggested_order: number;
}

export interface Movement {
  id: number;
  product_id: number;
  product: ProductRef;
  type: MovementType;
  /** signed change in stock */
  quantity: number;
  balance_after: number;
  reference: string | null;
  note: string | null;
  created_at: string;
}

export interface MovementPayload {
  type: MovementType;
  quantity: number;
  reference: string | null;
  note: string | null;
}

export interface CategoryValue {
  category: string;
  product_count: number;
  units: number;
  stock_value: number;
  retail_value: number;
}

export interface TopMover {
  product: ProductRef;
  category: string;
  units_out: number;
  units_in: number;
  movement_count: number;
}

export interface DailyMovement {
  date: string;
  units_in: number;
  units_out: number;
  adjustments: number;
  /** value at cost price */
  value_in: number;
  value_out: number;
}

export interface DashboardStats {
  product_count: number;
  supplier_count: number;
  category_count: number;
  total_units: number;
  stock_value: number;
  retail_value: number;
  low_stock_count: number;
  out_of_stock_count: number;
  units_in_30d: number;
  units_out_30d: number;
  movements_30d: number;
  recent_movements: Movement[];
}
