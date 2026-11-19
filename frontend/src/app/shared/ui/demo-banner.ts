import { ChangeDetectionStrategy, Component, DOCUMENT, inject, signal } from '@angular/core';
import { DemoMode } from '../../core/mock/demo-mode';
import { ConfirmDialog } from './confirm-dialog';
import { Icon } from './icon';
import { ToastService } from './toast.service';

const RESET_FLAG = 'inventory-manager.demo-reset';

@Component({
  selector: 'app-demo-banner',
  imports: [Icon, ConfirmDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demo.active()) {
      <aside class="demo-banner" aria-label="Demo mode">
        <app-icon class="demo-icon" name="info" [size]="16" />
        <p><strong>Demo mode</strong> – sample data stored in your browser</p>
        <button type="button" class="btn btn-sm" (click)="askReset()">
          <app-icon name="reset" [size]="14" />
          Reset data
        </button>
      </aside>
    }

    @if (confirming()) {
      <app-confirm-dialog
        title="Reset demo data?"
        message="Your changes will be removed and the sample products, suppliers and stock movements restored."
        confirmLabel="Reset data"
        (confirmed)="reset()"
        (cancelled)="cancelReset()"
      />
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .demo-banner {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 24px;
      padding: 6px 6px 6px 12px;
      border: 1px solid color-mix(in srgb, var(--primary) 24%, transparent);
      border-radius: var(--radius-sm);
      background: var(--primary-soft);
      font-size: 13px;
      line-height: 1.4;
    }

    .demo-icon {
      color: var(--primary);
    }

    p {
      flex: 1;
      min-width: 0;
      margin: 0;
      color: var(--text-muted);

      strong {
        color: var(--text);
        font-weight: 600;
      }
    }

    .btn {
      flex-shrink: 0;
      gap: 6px;
      height: 30px;
      padding: 0 10px;
    }

    @media (max-width: 960px) {
      .demo-banner {
        margin-bottom: 16px;
      }
    }
  `,
})
export class DemoBanner {
  protected readonly demo = inject(DemoMode);
  private readonly document = inject(DOCUMENT);
  private readonly toast = inject(ToastService);

  protected readonly confirming = signal(false);

  constructor() {
    if (this.readFlag()) {
      this.toast.success('Demo data has been reset');
    }
  }

  protected askReset(): void {
    this.confirming.set(true);
  }

  protected cancelReset(): void {
    this.confirming.set(false);
  }

  // reload so every page fetches the fresh data
  protected reset(): void {
    this.demo.reset();
    try {
      sessionStorage.setItem(RESET_FLAG, '1');
    } catch {
      // no session storage, just skip the toast after the reload
    }
    this.document.defaultView?.location.reload();
  }

  private readFlag(): boolean {
    try {
      const set = sessionStorage.getItem(RESET_FLAG) === '1';
      sessionStorage.removeItem(RESET_FLAG);
      return set;
    } catch {
      return false;
    }
  }
}
