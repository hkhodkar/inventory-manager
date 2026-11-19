import { DailyMovement } from '../models/inventory.models';
import { groupByWeek } from './group-by-week';

const day = (n: number, units = 1): DailyMovement => ({
  date: `2026-05-${String(n).padStart(2, '0')}`,
  units_in: units,
  units_out: 2 * units,
  adjustments: 0,
  value_in: units * 1.5,
  value_out: units * 3,
});

describe('groupByWeek', () => {
  it('sums full weeks and labels each with its first day', () => {
    const days = Array.from({ length: 14 }, (_, i) => day(i + 1));
    const weeks = groupByWeek(days);
    expect(weeks.map((w) => w.date)).toEqual(['2026-05-01', '2026-05-08']);
    expect(weeks[1]).toMatchObject({ units_in: 7, units_out: 14, value_in: 10.5, value_out: 21 });
  });

  it('keeps the latest days in full weeks and puts the remainder first', () => {
    const weeks = groupByWeek(Array.from({ length: 9 }, (_, i) => day(i + 1)));
    expect(weeks.map((w) => [w.date, w.units_in])).toEqual([
      ['2026-05-01', 2],
      ['2026-05-03', 7],
    ]);
  });
});
