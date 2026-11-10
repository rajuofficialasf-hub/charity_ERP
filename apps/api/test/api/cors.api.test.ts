import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildTestApp } from '../support/app';

// The CORS allowlist: only the configured origins get the allow headers, with credentials.
describe('CORS allowlist', () => {
  it('answers an allowed origin with the allow and credentials headers', async () => {
    const t = buildTestApp({
      envOverrides: { ALLOWED_ORIGINS: 'https://erp.example.org, http://localhost:3000' },
    });
    try {
      expect(t.container.env.ALLOWED_ORIGINS).toEqual([
        'https://erp.example.org',
        'http://localhost:3000',
      ]);
      const res = await request(t.app)
        .get('/api/v1/healthz')
        .set('Origin', 'http://localhost:3000')
        .expect(200);
      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      // the client reads the wait time and the request id across origins
      expect(res.headers['access-control-expose-headers']).toBe(
        'Retry-After,X-Request-Id,Idempotent-Replay',
      );
      const preflight = await request(t.app)
        .options('/api/v1/anything')
        .set('Origin', 'https://erp.example.org')
        .set('Access-Control-Request-Method', 'POST')
        .expect(204);
      expect(preflight.headers['access-control-allow-origin']).toBe('https://erp.example.org');
    } finally {
      await t.close();
    }
  });

  it('sends no allow header to another origin, and none at all when the list is empty', async () => {
    const listed = buildTestApp({ envOverrides: { ALLOWED_ORIGINS: 'https://erp.example.org' } });
    const empty = buildTestApp({ envOverrides: { ALLOWED_ORIGINS: '' } });
    try {
      const other = await request(listed.app)
        .get('/api/v1/healthz')
        .set('Origin', 'https://evil.example')
        .expect(200);
      expect(other.headers['access-control-allow-origin']).toBeUndefined();
      const none = await request(empty.app)
        .get('/api/v1/healthz')
        .set('Origin', 'https://erp.example.org')
        .expect(200);
      expect(none.headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      await listed.close();
      await empty.close();
    }
  });
});
