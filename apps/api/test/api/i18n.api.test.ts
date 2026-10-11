import { Router } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '../../src/i18n/api-error';
import { buildTestApp, type TestApp } from '../support/app';

// A probe router that raises catalogue errors, mounted only in this test.
const probe = Router();
probe.get('/i18n-probe/nid', () => {
  throw new ApiError('validation.nid_format', 422);
});
probe.get('/i18n-probe/crash', () => {
  throw new Error('select * from secret_table failed');
});

describe('API errors in the request language (I18N 2 and 5, API_STANDARDS 3 and 7)', () => {
  let t: TestApp;

  beforeAll(() => {
    t = buildTestApp({ routers: [() => probe] });
  });

  afterAll(async () => {
    await t.close();
  });

  it('answers in bn by default', async () => {
    const res = await request(t.app).get('/api/v1/does-not-exist').expect(404);
    expect(res.headers['content-language']).toBe('bn');
    expect(res.body).toMatchObject({
      error: {
        code: 'permission.not_found',
        messageKey: 'errors.permission.not_found',
        message: 'খুঁজে পাওয়া যায়নি।',
      },
    });
  });

  it('answers in en for Accept-Language en and in bn for an unsupported language', async () => {
    const en = await request(t.app)
      .get('/api/v1/does-not-exist')
      .set('Accept-Language', 'en-US,en;q=0.9')
      .expect(404);
    expect(en.body.error.message).toBe('Not found.');
    expect(en.headers['content-language']).toBe('en');
    const fr = await request(t.app)
      .get('/api/v1/does-not-exist')
      .set('Accept-Language', 'fr')
      .expect(404);
    expect(fr.body.error.message).toBe('খুঁজে পাওয়া যায়নি।');
  });

  it('renders ApiError codes from the catalogue', async () => {
    const res = await request(t.app)
      .get('/api/v1/i18n-probe/nid')
      .set('Accept-Language', 'en')
      .expect(422);
    expect(res.body.error).toMatchObject({
      code: 'validation.nid_format',
      messageKey: 'errors.validation.nid_format',
      message: 'The NID must have 10, 13 or 17 digits.',
    });
  });

  it('turns unexpected failures into server.internal without leaking details (BR-210)', async () => {
    const res = await request(t.app).get('/api/v1/i18n-probe/crash').expect(500);
    expect(res.body.error.code).toBe('server.internal');
    expect(JSON.stringify(res.body)).not.toMatch(/secret_table|select/);
  });

  it('refuses malformed JSON and bodies over the limit (NE-REQ-02)', async () => {
    const bad = await request(t.app)
      .post('/api/v1/does-not-exist')
      .set('Content-Type', 'application/json')
      .send('{"a":')
      .expect(400);
    expect(bad.body.error.code).toBe('validation.malformed');
    const big = await request(t.app)
      .post('/api/v1/does-not-exist')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ a: 'x'.repeat(200_000) }))
      .expect(413);
    expect(big.body.error.code).toBe('validation.malformed');
  });
});
