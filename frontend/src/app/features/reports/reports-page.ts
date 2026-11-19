import { formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { apiErrorMessage } from '../../core/api/api-error';
import { ProductsApi } from '../../core/api/products.api';
import { ReportsApi } from '../../core/api/reports.api';
import { ChartTheme } from '../../core/services/chart-theme';
import { downloadCsv, toCsv } from '../../core/utils/csv';
import { formatChange, formatMoney, formatNumber, toDateInput } from '../../core/utils/format';
import { groupByWeek } from '../../core/utils/group-by-week';
import { ChartDirective } from '../../shared/directives/chart.directive';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';

const PERIODS = [7, 30, 90];

@Component({
  selector: 'app-reports-page',
  imports: [RouterLink, Icon, ChartDirective, MoneyPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reports-page.html',
  styleUrl: './reports-page.scss',
})
export class ReportsPage {
  private readonly api = inject(ReportsApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly toast = inject(ToastService);
  private readonly chartTheme = inject(ChartTheme);

  protected readonly periods = PERIODS;
  protected readonly days = signal(30);
  protected readonly measure = signal<'units' | 'value'>('units');
  protected readonly exporting = signal(false);

  protected readonly categories = rxResource({ stream: () => this.api.stockByCategory() });
  protected readonly timeline = rxResource({
    params: () => this.days(),
    stream: ({ params }) => this.api.movementsOverTime(params),
  });
  protected readonly movers = rxResource({
    params: () => this.days(),
    stream: ({ params }) => this.api.topMovers(params, 8),
  });

  protected readonly totalValue = computed(() =>
    (this.categories.value() ?? []).reduce((sum, c) => sum + c.stock_value, 0),
  );
  protected readonly maxOut = computed(() =>
    Math.max(1, ...(this.movers.value() ?? []).map((m) => m.units_out)),
  );
  protected readonly periodTotals = computed(() => {
    const days = this.timeline.value() ?? [];
    return {
      in: days.reduce((sum, d) => sum + d.units_in, 0),
      out: days.reduce((sum, d) => sum + d.units_out, 0),
      adjustments: days.reduce((sum, d) => sum + d.adjustments, 0),
      valueIn: days.reduce((sum, d) => sum + d.value_in, 0),
      valueOut: days.reduce((sum, d) => sum + d.value_out, 0),
    };
  });

  protected readonly categoryChart = computed<ChartConfiguration | null>(() => {
    const rows = this.categories.value();
    if (!rows?.length) return null;
    const c = this.chartTheme.colors();
    return {
      type: 'bar',
      data: {
        labels: rows.map((r) => r.category),
        datasets: [
          {
            label: 'Stock value at cost',
            data: rows.map((r) => r.stock_value),
            backgroundColor: rows.map((_, i) => c.series[i % c.series.length]),
            borderRadius: 6,
            maxBarThickness: 28,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => formatMoney(ctx.parsed.x) } },
        },
        scales: {
          x: {
            grid: { color: c.grid },
            border: { display: false },
            ticks: { color: c.muted, callback: (v) => formatMoney(Number(v), 'compact') },
          },
          y: { grid: { display: false }, border: { display: false }, ticks: { color: c.text } },
        },
      },
    };
  });

  protected readonly timelineChart = computed<ChartConfiguration | null>(() => {
    const days = this.timeline.value();
    if (!days?.length) return null;
    const c = this.chartTheme.colors();
    const value = this.measure() === 'value';
    const format = (n: number) => (value ? formatMoney(n) : formatNumber(n));
    // long periods read better per week than per day
    const buckets = days.length > 31 ? groupByWeek(days) : days;
    const labels = buckets.map((d) => formatDate(d.date, 'MMM d', 'en-US', 'UTC'));
    const bar = (color: string) => ({
      backgroundColor: color,
      borderRadius: 4,
      maxBarThickness: 18,
    });
    return {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: value ? 'Received at cost' : 'Units in',
            data: buckets.map((d) => (value ? d.value_in : d.units_in)),
            ...bar(c.success),
          },
          {
            label: value ? 'Shipped at cost' : 'Units out',
            data: buckets.map((d) => (value ? d.value_out : d.units_out)),
            ...bar(c.primary),
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { color: c.muted, usePointStyle: true, pointStyle: 'circle', boxHeight: 6 },
          },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${format(Number(ctx.parsed.y))}` },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: c.muted, maxTicksLimit: 8, maxRotation: 0 },
          },
          y: {
            beginAtZero: true,
            grid: { color: c.grid },
            border: { display: false },
            ticks: {
              color: c.muted,
              precision: 0,
              callback: (v) =>
                value ? formatMoney(Number(v), 'compact') : formatNumber(Number(v)),
            },
          },
        },
      },
    };
  });

  protected setMeasure(measure: 'units' | 'value'): void {
    this.measure.set(measure);
  }

  protected setDays(days: number): void {
    this.days.set(days);
  }

  protected share(value: number): number {
    const total = this.totalValue();
    return total ? Math.round((value / total) * 1000) / 10 : 0;
  }

  protected barWidth(units: number): number {
    return (units / this.maxOut()) * 100;
  }

  protected readonly formatNumber = formatNumber;
  protected readonly formatChange = formatChange;

  /** Stock valuation of every product, the report accountants usually ask for. */
  protected exportStock(): void {
    if (this.exporting()) return;
    this.exporting.set(true);
    this.productsApi.all().subscribe({
      next: (products) => {
        this.exporting.set(false);
        const csv = toCsv(
          [
            'SKU',
            'Product',
            'Category',
            'Supplier',
            'Unit',
            'On hand',
            'Reorder level',
            'Status',
            'Cost price',
            'Sale price',
            'Stock value (cost)',
            'Stock value (retail)',
          ],
          products.map((p) => [
            p.sku,
            p.name,
            p.category,
            p.supplier?.name,
            p.unit,
            p.stock,
            p.reorder_level,
            p.stock_status,
            p.cost_price,
            p.sale_price,
            p.stock_value,
            Math.round(Math.max(p.stock, 0) * p.sale_price * 100) / 100,
          ]),
        );
        downloadCsv(`stock-valuation-${toDateInput(new Date())}.csv`, csv);
        this.toast.success(`Exported ${products.length} products`);
      },
      error: (error) => {
        this.exporting.set(false);
        this.toast.error(apiErrorMessage(error, 'Could not export the stock list'));
      },
    });
  }

  protected exportCategories(): void {
    const rows = this.categories.value() ?? [];
    const csv = toCsv(
      ['Category', 'Products', 'Units', 'Stock value (cost)', 'Stock value (retail)'],
      rows.map((r) => [r.category, r.product_count, r.units, r.stock_value, r.retail_value]),
    );
    downloadCsv(`stock-by-category-${toDateInput(new Date())}.csv`, csv);
  }

  protected exportMovers(): void {
    const rows = this.movers.value() ?? [];
    const csv = toCsv(
      ['SKU', 'Product', 'Category', 'Units out', 'Units in', 'Movements'],
      rows.map((m) => [
        m.product.sku,
        m.product.name,
        m.category,
        m.units_out,
        m.units_in,
        m.movement_count,
      ]),
    );
    downloadCsv(`top-movers-${this.days()}-days-${toDateInput(new Date())}.csv`, csv);
  }
}
