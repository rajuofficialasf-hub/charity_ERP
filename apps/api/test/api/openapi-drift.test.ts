import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from 'express';
import yaml from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { sensitive } from '../../src/access/field-mask';
import { buildOpenApiDocument } from '../../src/openapi/build-document';
import { defineRoute, type RouteDeps } from '../../src/openapi/define-route';
import { canonicalSchema, compareWithContract, PERMISSION_MARKERS } from '../../src/openapi/drift';
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

// Fixtures use an operation of the contract that is not implemented yet (a new form version, a
// later task of docs/PLAN.md).
const contractOf = {
  operationId: 'forms.version.createDraft',
  tag: 'forms',
  summary: 'Start a draft version of a form',
  permission: 'form.build',
  scope: 'project',
  audit: 'form.version_created',
  idempotency: 'none' as const,
  rateLimit: 'default' as const,
  status: 201,
  params: { formId: z.uuid() },
  // a success with a body declares its schema (the field mask reads it)
  responses: { 201: z.object({ id: z.uuid() }), 404: null, 409: null },
};
const FIXTURE_PATH = '/forms/:formId/versions';

function matching(deps: RouteDeps): Router {
  const router = Router();
  defineRoute(router, deps, {
    ...contractOf,
    method: 'post',
    path: FIXTURE_PATH,
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
    status: 200,
    responses: { 200: z.object({ id: z.uuid() }) },
    method: 'post',
    path: FIXTURE_PATH,
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
    expect(Object.keys(document.paths)).toContain('/forms/{formId}/versions');
    expect(compareWithContract(document as never, contract as never, permissions)).toEqual([]);
  });

  it('an operation that drifts from the contract fails with every difference named', async () => {
    open = buildTestApp({ routers: [drifting] });
    const document = buildOpenApiDocument(open.registry);
    const problems = compareWithContract(document as never, contract as never, permissions).join(
      '\n',
    );
    expect(problems).toMatch(/x-audit is "none", the contract says "form.version_created"/);
    expect(problems).toMatch(/x-permission is "user.state.change", the contract says "form.build"/);
    expect(problems).toMatch(/request body schema/);
    expect(problems).toMatch(/responses \["200"\] differ/);
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
              path: FIXTURE_PATH,
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

  // The field mask needs the response schema (U4 of the plan above).
  it('refuses a route with protected data but no response schema, or with undeclared classes', () => {
    const register = (over: Record<string, unknown>) => () =>
      buildTestApp({
        routers: [
          (deps) => {
            const router = Router();
            defineRoute(router, deps, {
              ...contractOf,
              audit: 'none',
              status: 200,
              method: 'get',
              path: '/probe-mask',
              operationId: 'probe.mask',
              responses: { 200: null },
              ...over,
              handler: () => null,
            });
            return router;
          },
        ],
      });
    expect(register({ scope: 'volunteer' })).toThrow(/needs a response schema/);
    expect(register({ sensitiveFields: ['volunteer.bank'] })).toThrow(/needs a response schema/);
    expect(register({ sensitiveFields: ['volunteer.money'] })).toThrow(
      /unknown sensitive field class volunteer\.money/,
    );
    const marked = z.object({
      data: z.object({ nid: sensitive(z.string(), 'volunteer.identity') }),
    });
    expect(register({ responses: { 200: marked } })).toThrow(
      /marks volunteer\.identity but does not declare it/,
    );
    expect(
      register({ responses: { 200: marked }, sensitiveFields: ['volunteer.identity'] }),
    ).not.toThrow();
  });

  it('ignores only the regex zod writes for a format, never a pattern of the contract', () => {
    const generated = { type: 'string', format: 'uuid', pattern: '^zod-regex$' };
    expect(canonicalSchema(generated, true)).toEqual(
      canonicalSchema({ type: 'string', format: 'uuid' }),
    );
    const contract = { type: 'string', format: 'uuid', pattern: '^[0-9a-f-]{36}$' };
    expect(canonicalSchema(contract)).not.toEqual(canonicalSchema(generated, true));
  });
});
