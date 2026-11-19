import cases from '../../../../../backend/tests/parity_cases.json';
import { handleMockRequest } from './mock-api';
import { MockDb } from './mock-db';

/*
 * The backend test suite runs the same requests (backend/tests/parity_cases.json)
 * against the real API, so these pin the mock to the API's filtering, sorting,
 * paging and report numbers.
 */

type Row = Record<string, unknown> & { id: number };

function summary(body: unknown): unknown {
  if (body && typeof body === 'object' && 'items' in body) {
    const page = body as { total: number; items: Row[] };
    return { total: page.total, ids: page.items.map((item) => item.id) };
  }
  if (body && !Array.isArray(body) && typeof body === 'object') {
    const { recent_movements, ...stats } = body as { recent_movements: Row[] };
    return { ...stats, recent_ids: recent_movements.map((m) => m.id) };
  }
  const list = body as Row[];
  if (list.length && typeof list[0] === 'object') {
    const first = list[0];
    if ('units_out' in first) {
      return list.map((m) => [(m['product'] as Row).id, m['units_out']]);
    }
    if (!('sku' in first)) return list;
    return list.map((item) => item.id);
  }
  return list;
}

describe('mock API parity with the backend', () => {
  const db = new MockDb(null, () => new Date('2026-06-15T09:30:00Z'));

  for (const { url, expected } of cases) {
    it(`GET ${url}`, () => {
      const response = handleMockRequest(db, 'GET', url);
      expect(response.status).toBe(200);
      expect(summary(response.body)).toEqual(expected);
    });
  }
});
