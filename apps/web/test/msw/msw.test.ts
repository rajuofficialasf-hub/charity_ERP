import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from './server';

describe('MSW test server', () => {
  it('answers API calls from the default handlers', async () => {
    const res = await fetch('http://localhost/api/v1/ping-sample');
    expect(await res.json()).toEqual({ data: { pong: true } });
  });

  it('lets a test override a handler', async () => {
    server.use(
      http.get('*/api/v1/ping-sample', () => HttpResponse.json({ data: { pong: false } })),
    );
    const res = await fetch('http://localhost/api/v1/ping-sample');
    expect(await res.json()).toEqual({ data: { pong: false } });
  });
});
