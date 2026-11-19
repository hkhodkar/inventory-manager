import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { Page } from '../models/inventory.models';

/** Follows the pages of a list endpoint one after another and collects all items. */
export function allPages<T>(fetch: (page: number) => Observable<Page<T>>): Observable<T[]> {
  return fetch(1).pipe(
    expand((result) =>
      result.page * result.page_size < result.total ? fetch(result.page + 1) : EMPTY,
    ),
    map((result) => result.items),
    reduce((all, items) => all.concat(items), [] as T[]),
  );
}
