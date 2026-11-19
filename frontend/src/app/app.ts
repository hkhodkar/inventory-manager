import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { DemoMode } from './core/mock/demo-mode';
import { StockAlerts } from './core/services/stock-alerts';
import { ThemeService } from './core/services/theme.service';
import { DemoBanner } from './shared/ui/demo-banner';
import { Icon, IconName } from './shared/ui/icon';
import { ToastContainer } from './shared/ui/toast-container';

interface NavItem {
  path: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  alerts?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ToastContainer, DemoBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  protected readonly theme = inject(ThemeService);
  protected readonly demo = inject(DemoMode);
  protected readonly alerts = inject(StockAlerts);
  protected readonly menuOpen = signal(false);

  protected readonly navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: 'dashboard', exact: true },
    { path: '/products', label: 'Products', icon: 'package' },
    { path: '/movements', label: 'Stock movements', icon: 'movements' },
    { path: '/alerts', label: 'Low stock', icon: 'bell', alerts: true },
    { path: '/suppliers', label: 'Suppliers', icon: 'truck' },
    { path: '/reports', label: 'Reports', icon: 'chart' },
  ];

  constructor() {
    // close the mobile menu after navigating
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.menuOpen.set(false));
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }
}
