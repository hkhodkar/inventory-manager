import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { ReportsApi } from '../../core/api/reports.api';
import { ChartTheme } from '../../core/services/chart-theme';
import { StockAlerts } from '../../core/services/stock-alerts';
import { formatMoney, formatNumber } from '../../core/utils/format';
import { ChartDirective } from '../../shared/directives/chart.directive';
import { ChangePipe } from '../../shared/pipes/change.pipe';
import { MoneyPipe } from '../../shared/pipes/money.pipe';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';
import { Icon, IconName } from '../../shared/ui/icon';
import { MovementTypeBadge } from '../../shared/ui/movement-type';
import { valueOf } from '../../shared/ui/list-query';
import { StockBadge } from '../../shared/ui/stock-badge';

interface Kpi {
  label: string;
  value: string;
  hint: string;
  icon: IconName;
  tone: 'primary' | 'success' | 'warning' | 'danger';
  link?: string;
}

@Component({
  selector: 'app-dashboard-page',
  imports: [
    DatePipe,
    RouterLink,
    Icon,
    ChartDirective,
    MoneyPipe,
    ChangePipe,
    TimeAgoPipe,
    MovementTypeBadge,
    StockBadge,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage {
  private readonly api = inject(ReportsApi);
  private readonly chartTheme = inject(ChartTheme);
  protected readonly alerts = inject(StockAlerts);

  protected readonly stats = rxResource({ stream: () => this.api.dashboard() });
  protected readonly timeline = rxResource({ stream: () => this.api.movementsOverTime(30) });
  protected readonly categories = rxResource({ stream: () => this.api.stockByCategory() });
  protected readonly statsData = valueOf(this.stats);
  private readonly timelineData = valueOf(this.timeline);
  private readonly categoryData = valueOf(this.categories);

  protected readonly attention = computed(() =>
    this.alerts.alerts.hasValue() ? this.alerts.alerts.value().slice(0, 6) : [],
  );

  constructor() {
    this.alerts.refresh();
  }

  protected readonly kpis = computed<Kpi[]>(() => {
    const s = this.statsData();
    if (!s) return [];
    return [
      {
        label: 'Stock value',
        value: formatMoney(s.stock_value),
        hint: `${formatMoney(s.retail_value, 'compact')} at retail prices`,
        icon: 'dollar',
        tone: 'primary',
        link: '/reports',
      },
      {
        label: 'Products',
        value: formatNumber(s.product_count),
        hint: `${formatNumber(s.total_units)} units in ${s.category_count} categories`,
        icon: 'package',
        tone: 'primary',
        link: '/products',
      },
      {
        label: 'Low stock',
        value: formatNumber(s.low_stock_count),
        hint: 'At or below reorder level',
        icon: 'alert',
        tone: 'warning',
        link: '/alerts',
      },
      {
        label: 'Out of stock',
        value: formatNumber(s.out_of_stock_count),
        hint: 'Nothing left on the shelf',
        icon: 'bell',
        tone: 'danger',
        link: '/alerts',
      },
      {
        label: 'Units in · 30 days',
        value: formatNumber(s.units_in_30d),
        hint: `${formatNumber(s.units_out_30d)} units out, ${s.movements_30d} movements`,
        icon: 'trending-up',
        tone: 'success',
        link: '/movements',
      },
    ];
  });

  protected readonly flowChart = computed<ChartConfiguration | null>(() => {
    const days = this.timelineData();
    if (!days?.length) return null;
    const c = this.chartTheme.colors();
    return {
      type: 'bar',
      data: {
        labels: days.map((d) => d.date.slice(5).replace('-', '/')),
        datasets: [
          {
            label: 'Received',
            data: days.map((d) => d.value_in),
            backgroundColor: c.success,
            borderRadius: 4,
            maxBarThickness: 14,
          },
          {
            label: 'Shipped',
            data: days.map((d) => d.value_out),
            backgroundColor: c.primary,
            borderRadius: 4,
            maxBarThickness: 14,
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
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${formatMoney(Number(ctx.parsed.y))}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: c.muted, maxTicksLimit: 10, maxRotation: 0 },
          },
          y: {
            beginAtZero: true,
            grid: { color: c.grid },
            border: { display: false },
            ticks: { color: c.muted, callback: (v) => formatMoney(Number(v), 'compact') },
          },
        },
      },
    };
  });

  protected readonly categoryChart = computed<ChartConfiguration | null>(() => {
    const rows = this.categoryData();
    if (!rows?.length) return null;
    const c = this.chartTheme.colors();
    return {
      type: 'doughnut',
      data: {
        labels: rows.map((r) => r.category),
        datasets: [
          {
            data: rows.map((r) => r.stock_value),
            backgroundColor: rows.map((_, i) => c.series[i % c.series.length]),
            borderColor: c.surface,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '64%',
        plugins: {
          legend: {
            position: 'right',
            labels: { color: c.text, usePointStyle: true, pointStyle: 'circle', boxHeight: 6 },
          },
          tooltip: {
            callbacks: { label: (ctx) => ` ${ctx.label}: ${formatMoney(Number(ctx.parsed))}` },
          },
        },
      },
    };
  });
}
