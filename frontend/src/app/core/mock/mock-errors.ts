/** An error the mock API answers with, `detail` follows FastAPI's error body. */
export class MockApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(typeof detail === 'string' ? detail : `HTTP ${status}`);
  }
}
