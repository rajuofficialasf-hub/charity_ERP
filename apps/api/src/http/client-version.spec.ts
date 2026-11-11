import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../i18n/api-error.js';
import { belowMinimum, clientVersionGate, parseVersion } from './client-version.js';

describe('the client version gate', () => {
  it('reads a version with or without a v, and nothing else', () => {
    expect(parseVersion('1.4.2')).toEqual([1, 4, 2]);
    expect(parseVersion('v2.0.10-beta')).toEqual([2, 0, 10]);
    expect(parseVersion('latest')).toBeNull();
    expect(parseVersion(undefined)).toBeNull();
  });

  it('calls a build below the minimum old, and lets the rest through', () => {
    expect(belowMinimum('1.2.3', '1.3.0')).toBe(true);
    expect(belowMinimum('1.3.0', '1.3.0')).toBe(false);
    expect(belowMinimum('2.0.0', '1.9.9')).toBe(false);
    expect(belowMinimum(undefined, '1.0.0')).toBe(false);
    expect(belowMinimum('garbage', '1.0.0')).toBe(false);
    expect(belowMinimum('0.0.1', '0.0.0')).toBe(false);
  });

  it('answers 426 to an old build and passes a current one', async () => {
    const app = express();
    app.get('/x', clientVersionGate('1.2.0'), (_req, res) => res.json({ ok: true }));
    app.use(
      (
        error: unknown,
        _req: express.Request,
        res: express.Response,
        _next: express.NextFunction,
      ) => {
        res
          .status(error instanceof ApiError ? error.status : 500)
          .json({ code: (error as ApiError).code });
      },
    );
    const old = await request(app).get('/x').set('X-Client-Version', '1.1.9');
    expect(old.status).toBe(426);
    expect(old.body.code).toBe('client.upgrade_required');
    expect((await request(app).get('/x').set('X-Client-Version', '1.2.0')).status).toBe(200);
    expect((await request(app).get('/x')).status).toBe(200);
  });
});
