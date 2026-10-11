import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApiDocument } from '../../src/openapi/build-document';
import { defineRoute, type RouteDeps } from '../../src/openapi/define-route';
import { compareWithContract } from '../../src/openapi/drift';
import { buildTestApp, type TestApp } from '../support/app';

// The generated document must match docs/api/openapi.yaml (API_STANDARDS 16, NFR-54).
const repo = join(__dirname, '../../../..');
const contract = yaml.load(readFileSync(join(repo, 'docs/api/openapi.yaml'), 'utf8')) as Record<
  string,
  never
>;
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
    permission: 'no.such_permission',
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
    expect(compareWithContract(document as never, contract, permissions)).toEqual([]);
  });

  it('an operation declared like the contract passes', async () => {
    open = buildTestApp({ routers: [matching] });
    const document = buildOpenApiDocument(open.registry);
    expect(Object.keys(document.paths)).toContain('/users/{userId}/handover/complete');
    expect(compareWithContract(document as never, contract, permissions)).toEqual([]);
  });

  it('an operation that drifts from the contract fails with every difference named', async () => {
    open = buildTestApp({ routers: [drifting] });
    const document = buildOpenApiDocument(open.registry);
    const problems = compareWithContract(document as never, contract, permissions).join('\n');
    expect(problems).toMatch(/x-audit is "none", the contract says "auth.handover_completed"/);
    expect(problems).toMatch(/unknown x-permission "no.such_permission"/);
    expect(problems).toMatch(/request body schema/);
    expect(problems).toMatch(/responses \["204"\] differ/);
  });
});
