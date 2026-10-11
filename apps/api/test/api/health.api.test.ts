import 'reflect-metadata';
import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';

describe('GET /health/live', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the process as up', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'up' });
  });

  it('is not served under the /api/v1 prefix', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(404);
  });

  it('returns 404 for unknown /api/v1 routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/does-not-exist').expect(404);
  });
});
