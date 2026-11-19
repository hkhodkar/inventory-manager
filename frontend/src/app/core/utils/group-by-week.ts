import { DailyMovement } from '../models/inventory.models';

/** Sums daily rows into 7-day buckets, counting back from the last day. */
export function groupByWeek(days: DailyMovement[]): DailyMovement[] {
  const weeks: DailyMovement[] = [];
  for (let end = days.length; end > 0; end -= 7) {
    const chunk = days.slice(Math.max(0, end - 7), end);
    weeks.unshift(
      chunk.reduce(
        (week, d) => ({
          ...week,
          units_in: week.units_in + d.units_in,
          units_out: week.units_out + d.units_out,
          adjustments: week.adjustments + d.adjustments,
          value_in: Math.round((week.value_in + d.value_in) * 100) / 100,
          value_out: Math.round((week.value_out + d.value_out) * 100) / 100,
        }),
        { ...chunk[0], units_in: 0, units_out: 0, adjustments: 0, value_in: 0, value_out: 0 },
      ),
    );
  }
  return weeks;
}
