import { MovementType, UNITS, Unit } from '../models/inventory.models';
import { MockApiError } from './mock-errors';

/*
 * Request validation for the mock API. Mirrors the Pydantic schemas in
 * backend/app/schemas.py and answers with the same 422 body FastAPI sends.
 */

export interface ValidationIssue {
  type: string;
  loc: (string | number)[];
  msg: string;
  input: unknown;
  ctx?: Record<string, unknown>;
}

export const UNSET = Symbol('unset');
export type Maybe<T> = T | typeof UNSET;

const PHONE_PATTERN = '^\\+?[0-9()\\-.\\s]{5,}$';
const SKU_PATTERN = '^[A-Z0-9][A-Z0-9-]{1,31}$';
export const MOVEMENT_TYPE_VALUES: MovementType[] = ['in', 'out', 'adjustment'];

export function choices(values: readonly string[]): string {
  const quoted = values.map((v) => `'${v}'`);
  return `${quoted.slice(0, -1).join(', ')} or ${quoted[quoted.length - 1]}`;
}

/** Collects issues for one request part (body or query), like a Pydantic model. */
export class Validator {
  readonly issues: ValidationIssue[] = [];

  constructor(
    private readonly source: Record<string, unknown>,
    private readonly part: 'body' | 'query',
  ) {}

  /** Throws the collected issues as a FastAPI style 422. */
  done(): void {
    if (this.issues.length) {
      throw new MockApiError(422, this.issues);
    }
  }

  fail(field: string | null, type: string, msg: string, input: unknown, ctx?: object): void {
    const loc = field === null ? [this.part] : [this.part, field];
    this.issues.push({ type, loc, msg, input, ...(ctx ? { ctx: { ...ctx } } : {}) });
  }

  private value(field: string): unknown {
    return Object.prototype.hasOwnProperty.call(this.source, field) ? this.source[field] : UNSET;
  }

  /** Required (or optional but non-null) trimmed string. */
  name(field: string, required: boolean, max = 120): Maybe<string | null> {
    const value = this.value(field);
    if (value === UNSET) {
      if (required) this.fail(field, 'missing', 'Field required', null);
      return UNSET;
    }
    if (value === null && !required) return null;
    return this.string(field, value, 1, max);
  }

  /** Optional free text, empty strings become null. */
  text(field: string, max = 200, pattern?: string): Maybe<string | null> {
    const value = this.value(field);
    if (value === UNSET) return UNSET;
    if (value === null || (typeof value === 'string' && !value.trim())) return null;
    const text = this.string(field, value, 0, max);
    if (text !== null && pattern && !new RegExp(pattern).test(text)) {
      this.patternMismatch(field, text, pattern);
    }
    return text;
  }

  phone(field: string): Maybe<string | null> {
    return this.text(field, 40, PHONE_PATTERN);
  }

  sku(field: string, required: boolean): Maybe<string | null> {
    const value = this.value(field);
    if (value === UNSET) {
      if (required) this.fail(field, 'missing', 'Field required', null);
      return UNSET;
    }
    if (value === null && !required) return null;
    if (typeof value !== 'string') {
      this.fail(field, 'string_type', 'Input should be a valid string', value);
      return null;
    }
    const sku = value.trim().toUpperCase();
    if (!new RegExp(SKU_PATTERN).test(sku)) {
      this.patternMismatch(field, sku, SKU_PATTERN);
      return null;
    }
    return sku;
  }

  email(field: string): Maybe<string | null> {
    const value = this.value(field);
    if (value === UNSET) return UNSET;
    if (value === null || (typeof value === 'string' && !value.trim())) return null;
    if (typeof value !== 'string') {
      this.fail(field, 'string_type', 'Input should be a valid string', value);
      return null;
    }
    const email = value.trim();
    const reason = emailProblem(email);
    if (reason) {
      this.fail(field, 'value_error', `value is not a valid email address: ${reason}`, value, {
        reason,
      });
      return null;
    }
    // like email-validator: the domain is lowercased, the local part is kept
    const at = email.lastIndexOf('@');
    return email.slice(0, at) + email.slice(at).toLowerCase();
  }

  /** Integer within bounds; `nullable` allows an explicit null. */
  int(
    field: string,
    { required = false, nullable = true, min, max }: IntOptions = {},
  ): Maybe<number | null> {
    const value = this.value(field);
    if (value === UNSET) {
      if (required) this.fail(field, 'missing', 'Field required', null);
      return UNSET;
    }
    if (value === null) {
      if (nullable && !required) return null;
      this.fail(field, 'int_type', 'Input should be a valid integer', value);
      return null;
    }
    const number = this.parseNumber(field, value, true);
    return number === null ? null : this.bounds(field, value, number, min, max);
  }

  number(
    field: string,
    { required = false, nullable = true, min, max }: IntOptions = {},
  ): Maybe<number | null> {
    const value = this.value(field);
    if (value === UNSET) {
      if (required) this.fail(field, 'missing', 'Field required', null);
      return UNSET;
    }
    if (value === null) {
      if (nullable && !required) return null;
      this.fail(field, 'float_type', 'Input should be a valid number', value);
      return null;
    }
    const number = this.parseNumber(field, value, false);
    return number === null ? null : this.bounds(field, value, number, min, max);
  }

  choice<T extends string>(
    field: string,
    values: readonly T[],
    required: boolean,
  ): Maybe<T | null> {
    const value = this.value(field);
    if (value === UNSET) {
      if (required) this.fail(field, 'missing', 'Field required', null);
      return UNSET;
    }
    if (value === null && !required) return null;
    if (typeof value !== 'string' || !values.includes(value as T)) {
      const expected = choices(values);
      this.fail(field, 'enum', `Input should be ${expected}`, value, { expected });
      return null;
    }
    return value as T;
  }

  date(field: string): Maybe<string | null> {
    const value = this.value(field);
    if (value === UNSET) return UNSET;
    if (value === null) return null;
    const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const valid =
      match &&
      new Date(Date.UTC(+match[1], +match[2] - 1, +match[3])).toISOString().slice(0, 10) === value;
    if (!valid) {
      this.fail(field, 'date_from_datetime_parsing', 'Input should be a valid date', value);
      return null;
    }
    return value as string;
  }

  private patternMismatch(field: string, value: string, pattern: string): void {
    this.fail(field, 'string_pattern_mismatch', `String should match pattern '${pattern}'`, value, {
      pattern,
    });
  }

  private string(field: string, value: unknown, min: number, max: number): string | null {
    if (typeof value !== 'string') {
      this.fail(field, 'string_type', 'Input should be a valid string', value);
      return null;
    }
    const text = value.trim();
    if (text.length < min) {
      this.fail(
        field,
        'string_too_short',
        `String should have at least ${min} character${min === 1 ? '' : 's'}`,
        value,
        { min_length: min },
      );
      return null;
    }
    if (text.length > max) {
      this.fail(field, 'string_too_long', `String should have at most ${max} characters`, value, {
        max_length: max,
      });
      return null;
    }
    return text;
  }

  private parseNumber(field: string, value: unknown, integer: boolean): number | null {
    let number: number;
    if (typeof value === 'number') {
      number = value;
    } else if (typeof value === 'string' && value.trim() && !Number.isNaN(Number(value))) {
      number = Number(value);
    } else {
      const parsing = typeof value === 'string';
      const kind = integer ? 'integer' : 'number';
      const reason = integer ? 'an integer' : 'a number';
      this.fail(
        field,
        `${integer ? 'int' : 'float'}_${parsing ? 'parsing' : 'type'}`,
        `Input should be a valid ${kind}${parsing ? `, unable to parse string as ${reason}` : ''}`,
        value,
      );
      return null;
    }
    if (integer && !Number.isInteger(number)) {
      this.fail(
        field,
        'int_from_float',
        'Input should be a valid integer, got a number with a fractional part',
        value,
      );
      return null;
    }
    return number;
  }

  private bounds(field: string, input: unknown, value: number, min?: number, max?: number) {
    if (min !== undefined && value < min) {
      this.fail(
        field,
        'greater_than_equal',
        `Input should be greater than or equal to ${min}`,
        input,
        { ge: min },
      );
    } else if (max !== undefined && value > max) {
      this.fail(field, 'less_than_equal', `Input should be less than or equal to ${max}`, input, {
        le: max,
      });
    }
    return value;
  }
}

interface IntOptions {
  required?: boolean;
  nullable?: boolean;
  min?: number;
  max?: number;
}

function emailProblem(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return 'An email address must have an @-sign.';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!local) return 'There must be something before the @-sign.';
  if (!domain) return 'There must be something after the @-sign.';
  if (/\s/.test(email) || local.includes('@')) {
    return 'The email address contains invalid characters.';
  }
  if (!domain.includes('.')) {
    return 'The part after the @-sign is not valid. It should have a period.';
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(domain)) {
    return 'The part after the @-sign is not valid.';
  }
  return null;
}

function body(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MockApiError(422, [
      { type: 'missing', loc: ['body'], msg: 'Field required', input: null },
    ]);
  }
  return value as Record<string, unknown>;
}

/** Drops fields the client didn't send, like `model_dump(exclude_unset=True)`. */
function defined<T extends object>(fields: Record<string, unknown>): T {
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== UNSET)) as T;
}

export interface SupplierInput {
  name?: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  country?: string | null;
  lead_time_days?: number | null;
  notes?: string | null;
}

export interface ProductInput {
  sku?: string;
  name?: string;
  category?: string;
  unit?: Unit;
  cost_price?: number;
  sale_price?: number;
  reorder_level?: number;
  supplier_id?: number | null;
  description?: string | null;
  initial_stock?: number;
}

export interface MovementInput {
  type: MovementType;
  quantity: number;
  reference: string | null;
  note: string | null;
}

// field order follows the Pydantic models, so the first issue matches the API

export function supplierInput(raw: unknown, creating: boolean): SupplierInput {
  const v = new Validator(body(raw), 'body');
  const fields = {
    contact_name: v.text('contact_name'),
    email: v.email('email'),
    phone: v.phone('phone'),
    website: v.text('website'),
    city: v.text('city'),
    country: v.text('country'),
    lead_time_days: v.int('lead_time_days', { min: 0, max: 365 }),
    notes: v.text('notes', 2000),
    name: v.name('name', creating),
  };
  v.done();
  return defined(fields);
}

export function productInput(raw: unknown, creating: boolean): ProductInput {
  const v = new Validator(body(raw), 'body');
  const required = creating;
  const fields = {
    cost_price: v.number('cost_price', { min: 0, max: 1_000_000, nullable: !creating }),
    sale_price: v.number('sale_price', { min: 0, max: 1_000_000, nullable: !creating }),
    reorder_level: v.int('reorder_level', { min: 0, max: 100_000, nullable: !creating }),
    supplier_id: v.int('supplier_id'),
    description: v.text('description', 2000),
    sku: v.sku('sku', required),
    name: v.name('name', required),
    category: v.name('category', required, 60),
    unit: v.choice<Unit>('unit', UNITS, false),
    initial_stock: creating
      ? v.int('initial_stock', { min: 0, max: 1_000_000, nullable: false })
      : UNSET,
  };
  v.done();
  const input = defined<ProductInput>(fields);
  if (creating) {
    input.unit ??= 'pcs';
    input.cost_price ??= 0;
    input.sale_price ??= 0;
    input.reorder_level ??= 0;
  }
  return input;
}

export function movementInput(raw: unknown): MovementInput {
  const source = body(raw);
  const v = new Validator(source, 'body');
  const type = v.choice<MovementType>('type', MOVEMENT_TYPE_VALUES, true);
  const quantity = v.int('quantity', {
    required: true,
    nullable: false,
    min: -1_000_000,
    max: 1_000_000,
  });
  const reference = v.text('reference', 60);
  const note = v.text('note', 300);
  v.done();

  const input: MovementInput = {
    type: type as MovementType,
    quantity: quantity as number,
    reference: reference === UNSET ? null : reference,
    note: note === UNSET ? null : note,
  };
  const problem =
    input.type === 'adjustment'
      ? input.quantity === 0 && 'An adjustment needs a quantity other than 0'
      : input.quantity <= 0 && 'Quantity must be greater than 0';
  if (problem) {
    v.fail(null, 'value_error', `Value error, ${problem}`, source, { error: {} });
    v.done();
  }
  return input;
}
