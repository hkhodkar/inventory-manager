import { addDays, formatChange, formatMoney, formatNumber, timeAgo, toDateInput } from './format';

describe('formatMoney', () => {
  it('formats whole dollars by default', () => {
    expect(formatMoney(48000)).toBe('$48,000');
    expect(formatMoney(12500.4)).toBe('$12,500');
  });

  it('keeps cents for prices', () => {
    expect(formatMoney(7.9, 'cents')).toBe('$7.90');
    expect(formatMoney(1234.5, 'cents')).toBe('$1,234.50');
  });

  it('uses compact notation when asked', () => {
    expect(formatMoney(162500, 'compact')).toBe('$162.5K');
    expect(formatMoney(5000, 'compact')).toBe('$5K');
    expect(formatMoney(800, 'compact')).toBe('$800');
  });

  it('shows a dash for missing values', () => {
    expect(formatMoney(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
  });
});

describe('formatChange', () => {
  it('always shows the sign of a stock change', () => {
    expect(formatChange(12)).toBe('+12');
    expect(formatChange(-1500)).toBe('−1,500');
    expect(formatChange(0)).toBe('0');
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-11-18T12:00:00Z');

  it('describes past dates in plain words', () => {
    expect(timeAgo('2026-11-18T11:59:30Z', now)).toBe('just now');
    expect(timeAgo('2026-11-18T09:00:00Z', now)).toBe('3 hours ago');
    expect(timeAgo('2026-11-17T12:00:00Z', now)).toBe('yesterday');
    expect(timeAgo('2026-11-04T12:00:00Z', now)).toBe('2 weeks ago');
  });
});

describe('date helpers', () => {
  it('formats a date for date inputs', () => {
    expect(toDateInput(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('adds days across month ends', () => {
    expect(toDateInput(addDays(new Date(2026, 0, 30), 3))).toBe('2026-02-02');
    expect(toDateInput(addDays(new Date(2026, 2, 1), -1))).toBe('2026-02-28');
  });
});
