import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'inventory-manager.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  readonly theme = signal<Theme>(this.initialTheme());
  readonly isDark = computed(() => this.theme() === 'dark');

  toggle(): void {
    const theme = this.theme() === 'dark' ? 'light' : 'dark';
    // set the attribute right away so anything reading CSS variables sees the new values
    this.document.documentElement.setAttribute('data-theme', theme);
    this.theme.set(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // private mode or storage disabled, the theme just won't persist
    }
  }

  private initialTheme(): Theme {
    const current = this.document.documentElement.getAttribute('data-theme');
    return current === 'dark' ? 'dark' : 'light';
  }
}
