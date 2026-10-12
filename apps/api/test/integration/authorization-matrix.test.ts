import { readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Router } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAccessRegistry } from '../../src/access/registry';
import { defineRoute, type RouteDeps } from '../../src/openapi/define-route';
import type { RegisteredOperation } from '../../src/openapi/registry';
import { seedAccessCatalogue } from './support/access-fixtures';
import { account, type AuthHarness, authHarness, bearer, login } from './support/auth-app';
import { ANONYMOUS, deniedByAccessLayer, expectedAllowed, matrixReport } from './support/matrix';

// Every registered endpoint × every role and an anonymous caller (R18 of
// docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md, U6; O-46 item 3). The calls use
// nonexistent ids and empty bodies, so no handler can change data (TS-14).
const REPORT = join(__dirname, '../../../../docs/security/AUTHORIZATION_MATRIX.md');
const MISSING_ID = '00000000-0000-7000-8000-00000000abcd';
const registry = loadAccessRegistry();
const roles = [...registry.roles.keys()];

// A probe with a permission no role holds by default (global roles only).
function probe(deps: RouteDeps): Router {
  const router = Router();
  defineRoute(router, deps, {
    method: 'get',
    path: '/matrix-probe',
    operationId: 'probe.matrix',
    tag: 'probe',
    summary: 'permission held by global roles only',
    permission: 'form.library.manage',
    scope: 'global',
    audit: 'none',
    idempotency: 'none',
    rateLimit: 'default',
    responses: { 200: null },
    handler: () => ({ ok: true }),
  });
  return router;
}

let h: AuthHarness;
// One listening server and keep-alive connections: a new connection per request (supertest)
// crashed the test worker on Windows after a few hundred requests.
let server: Server;
let base: string;
const decisions = new Map<string, Record<string, boolean>>();
const key = (op: RegisteredOperation) => `${op.method} ${op.path}`;

/** Logout ends the caller's session, so it runs last for each caller. */
const endsSession = (op: RegisteredOperation) => op.path === '/auth/logout';

async function call(op: RegisteredOperation, token: string | null): Promise<boolean> {
  const path = `/api/v1${op.path.replace(/:[A-Za-z0-9_]+/g, MISSING_ID)}`;
  const res = await fetch(`${base}${path}`, {
    method: op.method.toUpperCase(),
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(op.method !== 'get' ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(op.method !== 'get' ? { body: '{}' } : {}),
  });
  const text = await res.text();
  const code = text ? (JSON.parse(text) as { error?: { code?: string } }).error?.code : undefined;
  return !deniedByAccessLayer(res.status, code);
}

beforeAll(async () => {
  h = await authHarness({ extraRouters: [probe] });
  await seedAccessCatalogue(h.db);
  server = createServer(h.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const ops = [...h.registry.list()].sort(
    (a, b) => Number(endsSession(a)) - Number(endsSession(b)),
  );
  for (const op of ops) decisions.set(key(op), {});
  for (const op of ops) decisions.get(key(op))![ANONYMOUS] = await call(op, null);
  for (const role of roles) {
    const kind = registry.roles.get(role)!.kind === 'volunteer' ? 'volunteer' : 'staff';
    const session = await login(h, await account(h.db, { kind, role }));
    const token = bearer(session).Authorization.slice('Bearer '.length);
    for (const op of ops) decisions.get(key(op))![role] = await call(op, token);
  }
}, 120_000);

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await h.close();
});

describe('authorization matrix', () => {
  it('decides every endpoint for every role as permissions.yaml defines', () => {
    const wrong: string[] = [];
    for (const op of h.registry.list())
      for (const role of [ANONYMOUS, ...roles]) {
        const expected = expectedAllowed(registry, op, role);
        const actual = decisions.get(key(op))![role];
        if (actual !== expected)
          wrong.push(
            `${key(op)} as ${role}: ${actual ? 'allowed' : 'denied'}, expected ${expected ? 'allowed' : 'denied'}`,
          );
      }
    expect(wrong).toEqual([]);
  });

  // Cells written by hand from RBAC.md 5 and permissions.yaml, independent of the engine that the
  // computed expectation above uses, so an engine bug cannot agree with itself.
  it('matches the hand-checked cells of the default matrix', () => {
    const pinned: [string, string, boolean][] = [
      ['get /users', 'program_manager', true],
      ['get /users', 'regional_program_manager', true],
      ['get /users', 'project_executive', false],
      ['get /users', 'volunteer_general', false],
      ['get /users', ANONYMOUS, false],
      ['get /roles', 'monitoring_team', true],
      ['get /roles', 'program_manager', false],
      ['post /permission-grants', 'department_head', true],
      ['post /permission-grants', 'monitoring_team', true],
      ['post /permission-grants', 'program_manager', false],
      ['post /projects/:projectId/grants', 'regional_program_manager', true],
      ['post /projects/:projectId/grants', 'project_executive', false],
      ['get /users/:userId/sessions', 'regional_program_manager', true],
      ['get /users/:userId/sessions', 'program_manager', false],
      ['post /users/:userId/state', 'monitoring_team', true],
      ['post /users/:userId/state', 'regional_program_manager', false],
      ['get /sessions', 'volunteer_team_member', true],
      ['get /auth/me', 'volunteer_paid', true],
      ['post /auth/login', ANONYMOUS, true],
    ];
    for (const [route, role, allowed] of pinned)
      expect(decisions.get(route)?.[role], `${route} as ${role}`).toBe(allowed);
  });

  it('lets only the global roles through a permission no role holds by default', () => {
    const cells = decisions.get('get /matrix-probe')!;
    for (const role of [ANONYMOUS, ...roles])
      expect(cells[role], role).toBe(registry.roles.get(role)?.globalScope === true);
  });

  it('matches the committed report docs/security/AUTHORIZATION_MATRIX.md', () => {
    const rows = h.registry
      .list()
      .filter((op) => !op.operationId.startsWith('probe.'))
      .map((op) => ({ op, decisions: decisions.get(key(op))! }));
    const report = matrixReport(registry, rows, roles);
    if (process.env.CSS_WRITE_AUTHZ_MATRIX === '1') writeFileSync(REPORT, report);
    expect(readFileSync(REPORT, 'utf8').replace(/\r\n/g, '\n')).toBe(report);
  });
});
