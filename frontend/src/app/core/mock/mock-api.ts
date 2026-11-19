import { MovementType, StockStatus } from '../models/inventory.models';
import { MockDb, Paging } from './mock-db';
import { MockApiError } from './mock-errors';
import {
  MOVEMENT_TYPE_VALUES,
  Maybe,
  UNSET,
  Validator,
  movementInput,
  productInput,
  supplierInput,
} from './mock-validation';

export interface MockResponse {
  status: number;
  body: unknown;
}

type Handler = (db: MockDb, query: Query, body: unknown, id: number) => MockResponse;

interface Route {
  pattern: RegExp;
  /** name of the path parameter, as FastAPI reports it in validation errors */
  param?: string;
  methods: Partial<Record<string, Handler>>;
}

const ok = (body: unknown, status = 200): MockResponse => ({ status, body });
const noContent = (): MockResponse => ({ status: 204, body: null });
const STOCK_STATUS_VALUES: StockStatus[] = ['in_stock', 'low', 'out'];

/** Query string parsing with FastAPI's validation messages. */
class Query {
  private readonly validator: Validator;

  constructor(private readonly params: URLSearchParams) {
    this.validator = new Validator(Object.fromEntries(params), 'query');
  }

  text(name: string): string | null {
    return this.params.get(name);
  }

  int(name: string, min?: number, max?: number): number | null {
    return this.clean(this.validator.int(name, { min, max }));
  }

  choice<T extends string>(name: string, values: readonly T[]): T | null {
    return this.clean(this.validator.choice(name, values, false));
  }

  date(name: string): string | null {
    return this.clean(this.validator.date(name));
  }

  paging(): Paging {
    return { page: this.int('page', 1) ?? 1, page_size: this.int('page_size', 1, 200) ?? 20 };
  }

  done(): void {
    this.validator.done();
  }

  private clean<T>(value: Maybe<T | null>): T | null {
    return value === UNSET ? null : (value as T | null);
  }
}

function listProducts(db: MockDb, q: Query): MockResponse {
  const filter = {
    ...q.paging(),
    search: q.text('search'),
    category: q.text('category'),
    supplier_id: q.int('supplier_id'),
    stock_status: q.choice<StockStatus>('stock_status', STOCK_STATUS_VALUES),
    sort: q.text('sort'),
  };
  q.done();
  return ok(db.listProducts(filter));
}

function listMovements(db: MockDb, q: Query): MockResponse {
  const filter = {
    ...q.paging(),
    type: q.choice<MovementType>('type', MOVEMENT_TYPE_VALUES),
    product_id: q.int('product_id'),
    search: q.text('search'),
    date_from: q.date('date_from'),
    date_to: q.date('date_to'),
    sort: q.text('sort'),
  };
  q.done();
  return ok(db.listMovements(filter));
}

function listSuppliers(db: MockDb, q: Query): MockResponse {
  const filter = { ...q.paging(), search: q.text('search'), sort: q.text('sort') };
  q.done();
  return ok(db.listSuppliers(filter));
}

function productMovements(db: MockDb, q: Query, id: number): MockResponse {
  const paging = q.paging();
  q.done();
  return ok(db.productMovements(id, paging));
}

function topMovers(db: MockDb, q: Query): MockResponse {
  const days = q.int('days', 1, 365) ?? 30;
  const limit = q.int('limit', 1, 50) ?? 5;
  q.done();
  return ok(db.topMovers(days, limit));
}

function movementsOverTime(db: MockDb, q: Query): MockResponse {
  const days = q.int('days', 7, 365) ?? 30;
  q.done();
  return ok(db.movementsOverTime(days));
}

// order matters: fixed paths come before the ones with an id
const ROUTES: Route[] = [
  { pattern: /^\/api\/health$/, methods: { GET: () => ok({ status: 'ok' }) } },
  {
    pattern: /^\/api\/products$/,
    methods: {
      GET: listProducts,
      POST: (db, _q, body) => ok(db.createProduct(productInput(body, true)), 201),
    },
  },
  { pattern: /^\/api\/products\/categories$/, methods: { GET: (db) => ok(db.categories()) } },
  {
    pattern: /^\/api\/products\/([^/]+)$/,
    param: 'product_id',
    methods: {
      GET: (db, _q, _b, id) => ok(db.getProduct(id)),
      PATCH: (db, _q, body, id) => ok(db.updateProduct(id, productInput(body, false))),
      DELETE: (db, _q, _b, id) => (db.deleteProduct(id), noContent()),
    },
  },
  {
    pattern: /^\/api\/products\/([^/]+)\/movements$/,
    param: 'product_id',
    methods: {
      GET: (db, q, _b, id) => productMovements(db, q, id),
      POST: (db, _q, body, id) => ok(db.addMovement(id, movementInput(body)), 201),
    },
  },
  { pattern: /^\/api\/movements$/, methods: { GET: listMovements } },
  {
    pattern: /^\/api\/suppliers$/,
    methods: {
      GET: listSuppliers,
      POST: (db, _q, body) => ok(db.createSupplier(supplierInput(body, true)), 201),
    },
  },
  {
    pattern: /^\/api\/suppliers\/([^/]+)$/,
    param: 'supplier_id',
    methods: {
      GET: (db, _q, _b, id) => ok(db.getSupplier(id)),
      PATCH: (db, _q, body, id) => ok(db.updateSupplier(id, supplierInput(body, false))),
      DELETE: (db, _q, _b, id) => (db.deleteSupplier(id), noContent()),
    },
  },
  { pattern: /^\/api\/alerts\/low-stock$/, methods: { GET: (db) => ok(db.lowStock()) } },
  { pattern: /^\/api\/reports\/dashboard$/, methods: { GET: (db) => ok(db.dashboard()) } },
  {
    pattern: /^\/api\/reports\/stock-by-category$/,
    methods: { GET: (db) => ok(db.stockByCategory()) },
  },
  { pattern: /^\/api\/reports\/top-movers$/, methods: { GET: topMovers } },
  { pattern: /^\/api\/reports\/movements-over-time$/, methods: { GET: movementsOverTime } },
];

function pathId(raw: string, param: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new MockApiError(422, [
      {
        type: 'int_parsing',
        loc: ['path', param],
        msg: 'Input should be a valid integer, unable to parse string as an integer',
        input: raw,
      },
    ]);
  }
  return Number(raw);
}

/**
 * Answers one API call against the mock database, the way the FastAPI
 * routers would. Errors come back as `{ detail }` with the same status codes.
 */
export function handleMockRequest(
  db: MockDb,
  method: string,
  url: string,
  body: unknown = null,
): MockResponse {
  const parsed = new URL(url, 'http://mock.local');
  const path = parsed.pathname.replace(/\/+$/, '');
  method = method.toUpperCase();

  try {
    let allowed = false;
    for (const route of ROUTES) {
      const match = route.pattern.exec(path);
      if (!match) continue;
      allowed = true;
      const handler = route.methods[method];
      if (!handler) continue;
      const id = route.param ? pathId(decodeURIComponent(match[1]), route.param) : 0;
      return handler(db, new Query(parsed.searchParams), body, id);
    }
    return allowed
      ? { status: 405, body: { detail: 'Method Not Allowed' } }
      : { status: 404, body: { detail: 'Not Found' } };
  } catch (error) {
    if (error instanceof MockApiError) {
      return { status: error.status, body: { detail: error.detail } };
    }
    throw error;
  }
}
