import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { Page, Product } from '../models/inventory.models';
import { DemoMode, MOCK_LATENCY, MOCK_STORAGE } from './demo-mode';
import { backendUnavailable, mockApiInterceptor } from './mock-api.interceptor';

describe('mockApiInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let demo: DemoMode;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([mockApiInterceptor])),
        provideHttpClientTesting(),
        { provide: MOCK_LATENCY, useValue: [0, 0] },
        { provide: MOCK_STORAGE, useValue: null },
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    demo = TestBed.inject(DemoMode);
  });

  afterEach(() => backend.verify());

  const products = () => firstValueFrom(http.get<Page<Product>>('/api/products'));

  it('uses the real API while it answers', async () => {
    const result = products();
    backend.expectOne('/api/products').flush({ items: [], total: 0, page: 1, page_size: 20 });
    expect((await result).total).toBe(0);
    expect(demo.active()).toBe(false);
  });

  it('passes API errors through untouched', async () => {
    const result = firstValueFrom(http.post('/api/products/1/movements', {}));
    backend
      .expectOne('/api/products/1/movements')
      .flush(
        { detail: 'Not enough stock' },
        { status: 409, statusText: 'Conflict', headers: { 'content-type': 'application/json' } },
      );
    await expect(result).rejects.toMatchObject({ status: 409 });
    expect(demo.active()).toBe(false);
  });

  it('switches to demo mode when the server is unreachable', async () => {
    const result = products();
    backend.expectOne('/api/products').error(new ProgressEvent('error'), { status: 0 });
    expect((await result).total).toBe(40);
    expect(demo.active()).toBe(true);

    // later calls skip the network
    const suppliers = await firstValueFrom(http.get<Page<unknown>>('/api/suppliers'));
    expect(suppliers.total).toBe(8);
    backend.expectNone('/api/suppliers');
  });

  it('switches to demo mode when a static host answers instead of the API', async () => {
    const result = products();
    backend.expectOne('/api/products').flush('<!doctype html><h1>404</h1>', {
      status: 404,
      statusText: 'Not Found',
      headers: { 'content-type': 'text/html' },
    });
    expect((await result).items.length).toBe(20);
    expect(demo.active()).toBe(true);
  });

  it('answers with FastAPI style errors in demo mode', async () => {
    demo.enable();
    const error = await firstValueFrom(http.get('/api/products/999')).catch((e) => e);
    expect(error).toBeInstanceOf(HttpErrorResponse);
    expect(error.status).toBe(404);
    expect(error.error).toEqual({ detail: 'The product 999 was not found' });
  });

  it('leaves other requests alone', async () => {
    demo.enable();
    const result = firstValueFrom(http.get('/assets/config.json'));
    backend.expectOne('/assets/config.json').flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });
});

describe('backendUnavailable', () => {
  const error = (status: number, contentType?: string) =>
    new HttpErrorResponse({
      status,
      headers: contentType ? new HttpHeaders({ 'content-type': contentType }) : undefined,
    });

  it('is true for network errors and proxy or static host answers', () => {
    expect(backendUnavailable(error(0))).toBe(true);
    expect(backendUnavailable(error(404, 'text/html; charset=utf-8'))).toBe(true);
    expect(backendUnavailable(error(502))).toBe(true);
    expect(backendUnavailable(error(503, 'text/plain'))).toBe(true);
  });

  it('is false for real API answers', () => {
    expect(backendUnavailable(error(404, 'application/json'))).toBe(false);
    expect(backendUnavailable(error(409, 'application/json'))).toBe(false);
    expect(backendUnavailable(new Error('boom'))).toBe(false);
  });
});
