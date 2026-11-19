import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { MockDb } from './mock-db';

/** Min and max delay of mock responses in ms, so loading states still show. */
export const MOCK_LATENCY = new InjectionToken<readonly [number, number]>('MOCK_LATENCY', {
  factory: () => [150, 300],
});

/** Where the mock database keeps its changes. */
export const MOCK_STORAGE = new InjectionToken<Storage | null>('MOCK_STORAGE', {
  factory: () => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null; // storage blocked by the browser
    }
  },
});

/**
 * Demo mode answers API calls from an in-browser database instead of the
 * backend. It is always on in the demo build and switches on by itself when
 * no API is reachable.
 */
@Injectable({ providedIn: 'root' })
export class DemoMode {
  private readonly storage = inject(MOCK_STORAGE);
  private readonly enabled = signal(environment.demo);
  private database?: MockDb;

  readonly active = this.enabled.asReadonly();

  get db(): MockDb {
    return (this.database ??= new MockDb(this.storage));
  }

  enable(): void {
    this.enabled.set(true);
  }

  reset(): void {
    this.db.reset();
  }
}
