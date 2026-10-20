import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Router } from 'express';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildTestApp, type TestApp } from '../support/app';
import { contractRecorder } from '../support/contract';

// Every JSON response of the test app is checked against docs/api/openapi.yaml by the recorder
// (docs/testing/TEST_STRATEGY.md, section "API and contract"); the setup file fails a test on a
// violation, so these cases read the recorder directly and reset it.
const ERROR = {
  error: { code: 'rate.limited', messageKey: 'errors.rate.limited', message: 'x', requestId: 'r' },
};

/** A body-less route under the API prefix, outside the contract. */
const emptyRoute = () => {
  const router = Router();
  router.post('/probe-empty', (_req, res) => {
    res.status(204).end();
  });
  return router;
};

/** A plain text route under the API prefix, outside the contract. */
const textRoute = () => {
  const router = Router();
  router.get('/probe-text', (_req, res) => {
    res.type('text/plain').send('hello');
  });
  return router;
};

let open: TestApp | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
  contractRecorder.reset();
});

// the probes of this file never count as coverage of the real operations they borrow
let scratch: string;
let realCoverageDir: string;
beforeAll(() => {
  realCoverageDir = contractRecorder.coverageDir;
  scratch = mkdtempSync(join(tmpdir(), 'css-contract-'));
  contractRecorder.coverageDir = scratch;
});
afterAll(() => {
  contractRecorder.flushCoverage();
  contractRecorder.coverageDir = realCoverageDir;
  rmSync(scratch, { recursive: true, force: true });
});

describe('the contract recorder', () => {
  it('records a real response of the app and validates it against its operation', async () => {
    open = buildTestApp();
    const res = await request(open.app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'auth.token_missing' } });
    expect(contractRecorder.records()).toEqual([{ operationId: 'auth.me.get', status: 401 }]);
    expect(contractRecorder.violations()).toEqual([]);
  });

  it('reports a body the schema does not allow, with the operation, the status and the path of the error', () => {
    contractRecorder.record('get', '/me/attention', 200, { data: 'not-a-list', meta: {} });
    const [violation] = contractRecorder.violations();
    expect(violation).toMatchObject({ operationId: 'auth.me.attention', status: 200 });
    expect(violation?.errors.join(' ')).toMatch(/\/data/);
  });

  it('keeps a test probe outside the contract as an unknown operation without a violation, whatever its body', async () => {
    open = buildTestApp({ routers: [textRoute] });
    const res = await request(open.app).get('/api/v1/probe-text');
    expect(res.status).toBe(200);
    expect(res.text).toBe('hello');
    expect(contractRecorder.records()).toEqual([{ operationId: null, status: 200 }]);
    contractRecorder.record('get', '/no/such/path', 200, { anything: true });
    expect(contractRecorder.records()).toHaveLength(2);
    expect(contractRecorder.violations()).toEqual([]);
  });

  it('records an answer without a JSON body through the app, and refuses one where the operation declares a body', async () => {
    open = buildTestApp({ routers: [emptyRoute] });
    const res = await request(open.app).post('/api/v1/probe-empty');
    expect(res.status).toBe(204);
    expect(contractRecorder.records()).toEqual([{ operationId: null, status: 204 }]);
    contractRecorder.record('post', '/notifications/read', 204, undefined);
    expect(contractRecorder.violations()).toEqual([]);
    contractRecorder.record('get', '/me/attention', 200, undefined);
    expect(contractRecorder.violations()[0]?.errors.join(' ')).toMatch(/no JSON body/);
  });

  it('skips the body of a 204, accepts an undeclared error as the error envelope, and refuses an undeclared success', () => {
    contractRecorder.record('post', '/notifications/read', 204, undefined);
    expect(contractRecorder.records()).toEqual([
      { operationId: 'notifications.inbox.markRead', status: 204 },
    ]);
    contractRecorder.record('get', '/me/attention', 429, ERROR);
    expect(contractRecorder.violations()).toEqual([]);
    contractRecorder.record('get', '/me/attention', 429, { error: { code: 'rate.limited' } });
    expect(contractRecorder.violations()[0]?.errors.join(' ')).toMatch(/messageKey|required/);
    contractRecorder.record('get', '/me/attention', 202, { data: [], meta: {} });
    expect(contractRecorder.violations().at(-1)?.errors.join(' ')).toMatch(/not declared/);
  });

  it('matches a static path before a parameter in the same position', () => {
    contractRecorder.record('get', '/volunteers/statistics', 401, ERROR);
    contractRecorder.record('get', '/volunteers/0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b', 401, ERROR);
    expect(contractRecorder.records().map((r) => r.operationId)).toEqual([
      'volunteers.volunteer.statistics',
      'volunteers.volunteer.get',
    ]);
    expect(contractRecorder.violations()).toEqual([]);
  });

  it('forgets the records and violations of a test on reset, keeping them for the coverage file', () => {
    contractRecorder.record('get', '/me/attention', 200, { data: [], meta: {} });
    contractRecorder.reset();
    expect(contractRecorder.records()).toEqual([]);
    expect(contractRecorder.violations()).toEqual([]);
    expect(contractRecorder.flushCoverage()).toEqual(
      expect.arrayContaining([{ operationId: 'auth.me.attention', status: 200 }]),
    );
    expect(contractRecorder.flushCoverage()).toEqual([]);
  });
});
