import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApiDocument } from '../../src/openapi/build-document';
import { defineRoute, type RouteDeps } from '../../src/openapi/define-route';
import { compareWithContract, PERMISSION_MARKERS } from '../../src/openapi/drift';
import { buildTestApp, type TestApp } from '../support/app';

// The generated document must match docs/api/openapi.yaml (API_STANDARDS 16, NFR-54).
const repo = join(__dirname, '../../../..');
const contract = yaml.load(readFileSync(join(repo, 'docs/api/openapi.yaml'), 'utf8')) as {
  paths: Record<string, Record<string, { 'x-permission'?: unknown } | null>>;
};
const permissions = new Set(
  (
    yaml.load(readFileSync(join(repo, 'docs/security/permissions.yaml'), 'utf8')) as {
      permissions: { name: string }[];
    }
  ).permissions.map((p) => p.name),
);

// Fixtures use an operation of the contract that is not implemented yet (handover, T1.9).
const userId = z.uuid();
const contractOf = {
  operationId: 'users.handover.complete',
  tag: 'users',
  summary: 'Complete the handover and deactivate the account (all items reassigned)',
  permission: 'user.handover',
  scope: 'user',
  audit: 'auth.handover_completed',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
  params: { userId },
  responses: { 200: null, 404: null, 409: null },
};

function matching(deps: RouteDeps): Router {
  const router = Router();
  defineRoute(router, deps, {
    ...contractOf,
    method: 'post',
    path: '/users/:userId/handover/complete',
    handler: () => null,
  });
  return router;
}

function drifting(deps: RouteDeps): Router {
  const router = Router();
  defineRoute(router, deps, {
    ...contractOf,
    audit: 'none',
    permission: 'user.state.change',
    body: z.strictObject({ language: z.string() }),
    responses: { 204: null },
    method: 'post',
    path: '/users/:userId/handover/complete',
    handler: () => null,
  });
  return router;
}

let open: TestApp | undefined;
afterEach(async () => {
  await open?.close();
  open = undefined;
});

describe('OpenAPI drift test (API_STANDARDS 16)', () => {
  it('the application matches docs/api/openapi.yaml', async () => {
    open = buildTestApp();
    const document = buildOpenApiDocument(open.registry);
    expect(compareWithContract(document as never, contract as never, permissions)).toEqual([]);
  });

  it('an operation declared like the contract passes', async () => {
    open = buildTestApp({ routers: [matching] });
    const document = buildOpenApiDocument(open.registry);
    expect(Object.keys(document.paths)).toContain('/users/{userId}/handover/complete');
    expect(compareWithContract(document as never, contract as never, permissions)).toEqual([]);
  });

  it('an operation that drifts from the contract fails with every difference named', async () => {
    open = buildTestApp({ routers: [drifting] });
    const document = buildOpenApiDocument(open.registry);
    const problems = compareWithContract(document as never, contract as never, permissions).join(
      '\n',
    );
    expect(problems).toMatch(/x-audit is "none", the contract says "auth.handover_completed"/);
    expect(problems).toMatch(
      /x-permission is "user.state.change", the contract says "user.handover"/,
    );
    expect(problems).toMatch(/request body schema/);
    expect(problems).toMatch(/responses \["204"\] differ/);
  });

  // Routes, the contract and permissions.yaml agree three ways (R21 of
  // docs/plans/2026-10-12-1100-feat-rbac-permission-panel-plan.md): the drift check above compares
  // the routes with the contract and the YAML; this covers the contract's operations not built yet.
  it('every x-permission of the contract is a marker or a permission of permissions.yaml', () => {
    const unknown: string[] = [];
    for (const [path, item] of Object.entries(contract.paths))
      for (const [method, op] of Object.entries(item)) {
        const permission = op?.['x-permission'];
        if (permission === undefined) continue;
        if (
          typeof permission !== 'string' ||
          !(PERMISSION_MARKERS.includes(permission) || permissions.has(permission))
        )
          unknown.push(`${method.toUpperCase()} ${path}: ${String(permission)}`);
      }
    expect(unknown).toEqual([]);
  });

  it('refuses to register a route whose permission or scope entity is unknown', () => {
    const register = (over: Record<string, unknown>) => () =>
      buildTestApp({
        routers: [
          (deps) => {
            const router = Router();
            defineRoute(router, deps, {
              ...contractOf,
              ...over,
              method: 'post',
              path: '/users/:userId/handover/complete',
              handler: () => null,
            });
            return router;
          },
        ],
      });
    expect(register({ permission: 'no.such_permission' })).toThrow(
      /unknown permission no\.such_permission/,
    );
    expect(register({ scope: 'planet' })).toThrow(/unknown scope entity planet/);
    expect(register({ permission: 'permission.view', scope: 'none' })).toThrow(
      /held below GLOBAL and needs a scope entity/,
    );
  });
});
