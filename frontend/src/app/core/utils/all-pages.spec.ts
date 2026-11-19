import { firstValueFrom, of } from 'rxjs';
import { Page } from '../models/inventory.models';
import { allPages } from './all-pages';

describe('allPages', () => {
  it('requests pages until every item is loaded', async () => {
    const items = Array.from({ length: 5 }, (_, i) => i + 1);
    const requested: number[] = [];
    const fetch = (page: number) => {
      requested.push(page);
      const page_size = 2;
      const slice = items.slice((page - 1) * page_size, page * page_size);
      return of<Page<number>>({ items: slice, total: items.length, page, page_size });
    };
    expect(await firstValueFrom(allPages(fetch))).toEqual([1, 2, 3, 4, 5]);
    expect(requested).toEqual([1, 2, 3]);
  });

  it('stops after the first page when it holds everything', async () => {
    const fetch = (page: number) =>
      of<Page<string>>({ items: ['a'], total: 1, page, page_size: 200 });
    expect(await firstValueFrom(allPages(fetch))).toEqual(['a']);
  });
});
