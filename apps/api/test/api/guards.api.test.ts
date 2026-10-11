import 'reflect-metadata';
import { Body, Controller, Get, Inject, type INestApplication, Module, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { Audit } from '../../src/audit/audit.decorator';
import { AuditWriter } from '../../src/audit/audit-writer';
import { configureApp } from '../../src/bootstrap';
import type { Tx } from '../../src/core/prisma.service';
import { RateLimit } from '../../src/rate-limit/rate-limit';
import { testEnv } from '../support/env';

// A transaction stand-in: the audit insert succeeds without a database.
const fakeTx = { auditLog: { create: async () => ({}) } } as unknown as Tx;

@Controller('guard-probe')
class ProbeController {
  constructor(@Inject(AuditWriter) private readonly audit: AuditWriter) {}

  @Post('login')
  @Audit('none')
  @RateLimit('login')
  login(@Body() _body: unknown) {
    return { ok: true };
  }

  @Get('read')
  read() {
    return { ok: true };
  }

  @Post('audited')
  @Audit('probe.write')
  async audited() {
    await this.audit.record(fakeTx, { action: 'probe.write', entityType: 'probe' });
    return { ok: true };
  }

  @Post('forgot-audit')
  @Audit('probe.write')
  forgot() {
    return { ok: true };
  }

  @Post('undeclared')
  undeclared() {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('rate limits and audit enforcement (API_STANDARDS 10, 15; D-068)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testEnv()), ProbeModule],
    }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('allows 10 logins per minute per login id and IP, then answers 429 with Retry-After', async () => {
    const server = app.getHttpServer();
    for (let i = 1; i <= 10; i++) {
      const res = await request(server)
        .post('/api/v1/guard-probe/login')
        .send({ login: 'a@example.org' })
        .expect(201);
      expect(res.headers['ratelimit-limit']).toBe('10');
      expect(res.headers['ratelimit-remaining']).toBe(String(10 - i));
    }
    const blocked = await request(server)
      .post('/api/v1/guard-probe/login')
      .send({ login: 'a@example.org' })
      .expect(429);
    expect(blocked.body.error.code).toBe('rate_limit.exceeded');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    // another login id has its own budget
    await request(server)
      .post('/api/v1/guard-probe/login')
      .send({ login: 'b@example.org' })
      .expect(201);
  });

  it('applies the default class to routes without a declared class', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/guard-probe/read').expect(200);
    expect(res.headers['ratelimit-limit']).toBe('600');
  });

  it('passes a write that records its audit entry', async () => {
    await request(app.getHttpServer()).post('/api/v1/guard-probe/audited').expect(201);
  });

  it('fails a write that declared an audit action but wrote no entry', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/guard-probe/forgot-audit')
      .expect(500);
    expect(res.body.error.code).toBe('server.internal');
  });

  it('fails a write route without @Audit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/guard-probe/undeclared')
      .expect(500);
    expect(res.body.error.code).toBe('server.internal');
  });
});
