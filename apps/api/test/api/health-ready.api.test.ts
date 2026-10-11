import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { PrismaService } from '../../src/core/prisma.service';
import { JobRunner } from '../../src/jobs/job-runner';
import { STORAGE } from '../../src/storage/storage';
import { testEnv } from '../support/env';

// Readiness (SYSTEM_ARCHITECTURE 10, D-057): database, storage and queue; details only with the
// HEALTH_TOKEN bearer token. The dependencies are replaced by switchable stand-ins.
const TOKEN = 'health-token-for-tests-0123456789';
const state = { database: true, storage: true, queue: true };

describe('GET /health/ready', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testEnv({ HEALTH_TOKEN: TOKEN }))],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: async () => {
          if (!state.database) throw new Error('connection refused');
          return [{ '?column?': 1 }];
        },
        $disconnect: async () => {},
      })
      .overrideProvider(STORAGE)
      .useValue({ ping: async () => state.storage })
      .overrideProvider(JobRunner)
      .useValue({ ping: async () => state.queue, onModuleDestroy: async () => {} })
      .compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  beforeEach(() => Object.assign(state, { database: true, storage: true, queue: true }));

  afterAll(async () => {
    await app.close();
  });

  it('is ready when every dependency answers, without details for anonymous callers', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('shows the per-check detail only with the token', async () => {
    const ok = await request(app.getHttpServer())
      .get('/health/ready')
      .set('Authorization', `Bearer ${TOKEN}`)
      .expect(200);
    expect(ok.body).toEqual({
      status: 'ready',
      checks: { database: 'up', storage: 'up', queue: 'up' },
    });
    const wrong = await request(app.getHttpServer())
      .get('/health/ready')
      .set('Authorization', 'Bearer not-the-token')
      .expect(200);
    expect(wrong.body).toEqual({ status: 'ready' });
  });

  it.each(['database', 'storage', 'queue'] as const)(
    'answers 503 when the %s is down',
    async (name) => {
      state[name] = false;
      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .set('Authorization', `Bearer ${TOKEN}`)
        .expect(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body.checks[name]).toBe('down');
    },
  );
});
