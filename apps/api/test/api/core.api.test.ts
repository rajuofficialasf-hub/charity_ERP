import 'reflect-metadata';
import { Writable } from 'node:stream';
import { Controller, Get, type INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppModule } from '../../src/app.module';
import { Audit } from '../../src/audit/audit.decorator';
import { configureApp } from '../../src/bootstrap';
import { ok, page } from '../../src/core/envelope';
import { pageQuery } from '../../src/core/pagination';
import { ZBody, ZQuery } from '../../src/core/validation';
import { testEnv } from '../support/env';
import { Public } from '../../src/openapi/api-contract';

const body = z.strictObject({
  name: z.string().min(1).max(10),
  nid: z.string().regex(/^\d{10}$/, { message: 'validation.nid_format' }),
});

// Test probe outside the contract: public for the AuthGuard (T1.7).
@Public()
@Controller('core-probe')
class ProbeController {
  @Get('one')
  one() {
    return ok({ id: '1' });
  }

  @Get('plain')
  plain() {
    return { hello: 'world' };
  }

  @Get('list')
  list(@ZQuery(pageQuery.extend({ status: z.string().optional() })) query: { limit: number }) {
    return page([{ id: 'a' }], { nextCursor: null, prevCursor: null, limit: query.limit });
  }

  @Post('echo')
  @Audit('none')
  echo(@ZBody(body) input: z.infer<typeof body>) {
    return ok({ name: input.name });
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

const lines: string[] = [];
const logStream = new Writable({
  write(chunk, _enc, done) {
    lines.push(String(chunk));
    done();
  },
});

describe('API core: envelope, request id, validation, logging (API_STANDARDS 3, 7)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const env = testEnv({ LOG_LEVEL: 'info' });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(env, { logStream }), ProbeModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('wraps results in { data, meta.requestId } and echoes X-Request-Id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/core-probe/one')
      .set('X-Request-Id', 'caddy-request-0001')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('caddy-request-0001');
    expect(res.body).toEqual({ data: { id: '1' }, meta: { requestId: 'caddy-request-0001' } });
    const plain = await request(app.getHttpServer()).get('/api/v1/core-probe/plain').expect(200);
    expect(plain.body.data).toEqual({ hello: 'world' });
    expect(plain.body.meta.requestId).toMatch(/^req_[0-9a-f]{32}$/);
  });

  it('ignores a forwarded request id that could inject into logs', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/core-probe/one')
      .set('X-Request-Id', 'bad id <script> with spaces')
      .expect(200);
    expect(res.headers['x-request-id']).toMatch(/^req_/);
  });

  it('returns list pages with pagination meta and rejects unknown query parameters', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/core-probe/list?limit=10')
      .expect(200);
    expect(res.body.meta).toMatchObject({ limit: 10, nextCursor: null, prevCursor: null });
    const bad = await request(app.getHttpServer())
      .get('/api/v1/core-probe/list?limt=10')
      .expect(400);
    expect(bad.body.error).toMatchObject({
      code: 'validation.unknown_parameter',
      details: [{ path: 'limt', code: 'validation.unknown_parameter' }],
    });
    expect(bad.body.error.requestId).toMatch(/^req_/);
  });

  it('reports field problems as 422 validation.failed with localized details', async () => {
    const en = await request(app.getHttpServer())
      .post('/api/v1/core-probe/echo')
      .set('Accept-Language', 'en')
      .send({ name: '', nid: '12' })
      .expect(422);
    expect(en.body.error).toMatchObject({
      code: 'validation.failed',
      message: 'Some information is not valid.',
      details: [
        { path: 'name', code: 'validation.required', message: 'Fill in this field.' },
        {
          path: 'nid',
          code: 'validation.nid_format',
          message: 'The NID must have 10, 13 or 17 digits.',
        },
      ],
    });
    const bn = await request(app.getHttpServer())
      .post('/api/v1/core-probe/echo')
      .send({ name: 'ক' })
      .expect(422);
    expect(bn.body.error.details[0]).toMatchObject({
      path: 'nid',
      code: 'validation.required',
      message: 'এই ঘরটি পূরণ করুন।',
    });
  });

  it('answers malformed JSON with 400 validation.malformed', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/core-probe/echo')
      .set('Content-Type', 'application/json')
      .send('{"name": ')
      .expect(400);
    expect(res.body.error.code).toBe('validation.malformed');
  });

  it('logs one line per request without bodies, query strings or secrets', async () => {
    lines.length = 0;
    await request(app.getHttpServer())
      .post('/api/v1/core-probe/echo?mobile=01700000001')
      .set('Authorization', 'Bearer secret-token-value')
      .set('Cookie', 'refresh=secret-cookie')
      .send({ name: 'x', nid: '1000000001', password: 'hunter2' });
    const log = lines.join('');
    expect(log).toContain('/api/v1/core-probe/echo');
    for (const secret of [
      '01700000001',
      'secret-token-value',
      'secret-cookie',
      '1000000001',
      'hunter2',
    ])
      expect(log).not.toContain(secret);
  });

  it('keeps health probes outside the envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'up' });
  });
});
