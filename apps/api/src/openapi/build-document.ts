import { API_PREFIX } from '../app.js';
import {
  jsonSchemaOf,
  openApiPath,
  type RegisteredOperation,
  type RouteRegistry,
} from './registry.js';

type Operation = Record<string, unknown>;

/**
 * The OpenAPI document generated from the route registry (docs/api/API_STANDARDS.md, "OpenAPI
 * annotations required on every operation"): paths relative to the `/api/v1` server like
 * docs/api/openapi.yaml; bearer auth is the document default, public operations declare `security:
 * []` or their cookie requirement.
 */
export function buildOpenApiDocument(registry: RouteRegistry): {
  openapi: string;
  info: { title: string; version: string };
  servers: { url: string }[];
  security: Record<string, string[]>[];
  paths: Record<string, Record<string, Operation>>;
} {
  const paths: Record<string, Record<string, Operation>> = {};
  for (const op of registry.list()) {
    const path = openApiPath(op.path);
    // eslint-disable-next-line security/detect-object-injection -- path keys of the registry
    const item = (paths[path] ??= {});
    item[op.method] = operationOf(op);
  }
  return {
    openapi: '3.1.0',
    info: { title: 'CSS ERP API', version: '1' },
    servers: [{ url: `/${API_PREFIX}` }],
    security: [{ bearerAuth: [] }],
    paths,
  };
}

function operationOf(op: RegisteredOperation): Operation {
  const parameters: Record<string, unknown>[] = [];
  for (const [name, schema] of Object.entries(op.params ?? {}))
    parameters.push({ name, in: 'path', required: true, schema: jsonSchemaOf(schema) });
  for (const [name, schema] of Object.entries(op.query?.shape ?? {})) {
    const s = schema as Parameters<typeof jsonSchemaOf>[0];
    parameters.push({
      name,
      in: 'query',
      required: !s.safeParse(undefined).success,
      schema: jsonSchemaOf(s),
    });
  }
  for (const header of op.headers ?? [])
    parameters.push({ name: header.name, in: 'header', required: header.required });
  const responses: Record<string, unknown> = {};
  for (const [status, schema] of Object.entries(op.responses))
    // eslint-disable-next-line security/detect-object-injection -- status codes of the declaration
    responses[status] = {
      description: status,
      ...(schema ? { content: { 'application/json': { schema: jsonSchemaOf(schema) } } } : {}),
    };
  return {
    operationId: op.operationId,
    summary: op.summary,
    ...(op.description ? { description: op.description } : {}),
    tags: [op.tag],
    'x-permission': op.permission,
    'x-scope': op.scope,
    'x-audit': op.audit,
    'x-idempotency': op.idempotency,
    'x-rate-limit': op.rateLimit,
    ...(op.sensitiveFields?.length ? { 'x-sensitive-fields': op.sensitiveFields } : {}),
    ...(op.workflow ? { 'x-workflow': op.workflow } : {}),
    ...(op.permission === 'public'
      ? { security: op.cookieAuth ? [{ [op.cookieAuth]: [] }] : [] }
      : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(op.body
      ? {
          requestBody: {
            required: true,
            content: { 'application/json': { schema: jsonSchemaOf(op.body) } },
          },
        }
      : {}),
    responses,
  };
}
