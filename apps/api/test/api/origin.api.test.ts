import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../support/app.js';

// A write from another site, or from no site at all, is refused before any route runs; the PWA's
// own origin and the configured ones pass, and reads need no origin.
describe('the origin check on writes', () => {
  let t: TestApp;
  beforeAll(() => {
    t = buildTestApp({ envOverrides: { ALLOWED_ORIGINS: 'https://partner.example.org' } });
  });
  afterAll(() => t.close());

  const login = () =>
    request(t.app)
      .post('/api/v1/auth/login')
      .send({ loginId: 'nobody@example.org', password: 'x' });

  it('lets a write from the app itself through to its route', async () => {
    const res = await login().set('Origin', 'http://127.0.0.1:3000');
    expect(res.status).not.toBe(403);
    expect(res.body.error?.code).not.toBe('client.origin_refused');
  });

  it('lets a write from a configured origin through', async () => {
    const res = await login().set('Origin', 'https://partner.example.org');
    expect(res.body.error?.code).not.toBe('client.origin_refused');
  });

  it('refuses a write with no origin, in the language of the request', async () => {
    const en = await login().set('x-test-origin', 'none').set('Accept-Language', 'en').expect(403);
    expect(en.body.error).toMatchObject({
      code: 'client.origin_refused',
      message: 'This request did not come from the app and was refused. Try again from the app.',
    });
    const bn = await login().set('x-test-origin', 'none').set('Accept-Language', 'bn').expect(403);
    expect(bn.body.error.message).toBe(
      'অনুরোধটি অ্যাপ থেকে আসেনি, তাই নেওয়া হয়নি। অ্যাপ থেকে আবার চেষ্টা করুন।',
    );
  });

  it('refuses a write whose origin is null or another site', async () => {
    for (const origin of ['null', 'https://evil.example', 'http://127.0.0.1:3000.evil.example']) {
      const res = await login().set('Origin', origin).expect(403);
      expect(res.body.error.code, origin).toBe('client.origin_refused');
    }
  });

  it('refuses every writing method, and lets a read pass without an origin', async () => {
    for (const method of ['put', 'patch', 'delete'] as const) {
      const res = await request(t.app)[method]('/api/v1/me/profile').set('x-test-origin', 'none');
      expect(res.status, method).toBe(403);
    }
    // a read reaches the routes: an unknown path answers 404, not the origin check's 403
    await request(t.app).get('/api/v1/no-such-path').set('x-test-origin', 'none').expect(404);
  });
});
