import { DestroyRef, ResourceRef, inject, linkedSignal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { debounceTime, distinctUntilChanged } from 'rxjs';

/**
 * Keeps list filters in the URL query string, so filtered views can be
 * bookmarked and the back button works. Must be called in an injection context.
 */
export function useListQuery() {
  const router = inject(Router);
  const route = inject(ActivatedRoute);

  const update = (params: Params, resetPage = true): void => {
    void router.navigate([], {
      relativeTo: route,
      queryParams: resetPage ? { ...params, page: null } : params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  };

  const search = new FormControl(route.snapshot.queryParamMap.get('search') ?? '', {
    nonNullable: true,
  });
  const subscription = search.valueChanges
    .pipe(debounceTime(300), distinctUntilChanged())
    .subscribe((value) => update({ search: value.trim() || null }));
  inject(DestroyRef).onDestroy(() => subscription.unsubscribe());

  return { search, update };
}

export function toPage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function toId(value: string | undefined | null): number | null {
  const id = Number(value);
  return value && Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Last successful value of a resource. Unlike `value()` it doesn't drop back to
 * undefined while new filters load, so tables don't flicker.
 */
export function latestValue<T>(resource: ResourceRef<T | undefined>) {
  return linkedSignal<T | undefined, T | undefined>({
    source: () => (resource.hasValue() ? resource.value() : undefined),
    computation: (value, previous) => value ?? previous?.value,
  });
}
