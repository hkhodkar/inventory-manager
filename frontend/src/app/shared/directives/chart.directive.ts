import { DestroyRef, Directive, ElementRef, effect, inject, input } from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

// register only what the app uses to keep the bundle small
Chart.register(
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
);

/** Draws a chart.js chart on a canvas and redraws it when the config changes. */
@Directive({ selector: 'canvas[appChart]' })
export class ChartDirective {
  readonly config = input.required<ChartConfiguration>({ alias: 'appChart' });

  private readonly canvas = inject<ElementRef<HTMLCanvasElement>>(ElementRef).nativeElement;
  private chart?: Chart;

  constructor() {
    effect(() => {
      const config = this.config();
      this.chart?.destroy();
      this.chart = new Chart(this.canvas, config);
    });

    inject(DestroyRef).onDestroy(() => this.chart?.destroy());
  }
}
