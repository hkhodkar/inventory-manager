import { DOCUMENT, Injectable, computed, inject } from '@angular/core';
import { ThemeService } from './theme.service';

export interface ChartColors {
  text: string;
  muted: string;
  grid: string;
  surface: string;
  series: string[];
  success: string;
  danger: string;
  warning: string;
  primary: string;
}

/** Reads the theme's CSS variables so charts follow light and dark mode. */
@Injectable({ providedIn: 'root' })
export class ChartTheme {
  private readonly document = inject(DOCUMENT);
  private readonly theme = inject(ThemeService);

  readonly colors = computed<ChartColors>(() => {
    this.theme.theme(); // recompute when the theme changes
    const style = getComputedStyle(this.document.documentElement);
    const css = (name: string) => style.getPropertyValue(name).trim();
    return {
      text: css('--text'),
      muted: css('--text-muted'),
      grid: css('--border'),
      surface: css('--surface'),
      series: [1, 2, 3, 4, 5, 6, 7].map((n) => css(`--chart-${n}`)),
      success: css('--success'),
      danger: css('--danger'),
      warning: css('--warning'),
      primary: css('--primary'),
    };
  });
}

/** "#16a34a" plus an alpha value, as an rgba() color that canvas understands. */
export function withAlpha(hex: string, alpha: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
