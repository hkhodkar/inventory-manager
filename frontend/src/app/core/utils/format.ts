const whole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const cents = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compact = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  // set both explicitly, older ICU versions otherwise print "$5.0K"
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export type MoneyFormat = 'whole' | 'cents' | 'compact';

export function formatMoney(
  value: number | null | undefined,
  format: MoneyFormat = 'whole',
): string {
  if (value == null) {
    return '-';
  }
  if (format === 'cents') {
    return cents.format(value);
  }
  return format === 'compact' && Math.abs(value) >= 1000
    ? compact.format(value)
    : whole.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  return value == null ? '-' : integer.format(value);
}

/** Signed quantity for the stock ledger: "+12", "−4" (with a real minus sign). */
export function formatChange(value: number): string {
  if (value > 0) return `+${integer.format(value)}`;
  if (value < 0) return `−${integer.format(-value)}`;
  return '0';
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return relative.format(Math.round(seconds / size), unit);
    }
  }
  return 'just now';
}

/** Value for an <input type="date"> in the user's timezone. */
export function toDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
