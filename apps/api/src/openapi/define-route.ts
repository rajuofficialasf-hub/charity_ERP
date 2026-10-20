import type { Request, RequestHandler, Response, Router } from 'express';
import type { Logger } from 'pino';
import type { ZodType } from 'zod';
import { maskData, sensitiveClassesOf } from '../access/field-mask';
import { type AccessRegistry, SCOPE_ENTITIES } from '../access/registry';
import type { AuthedRequest } from '../auth/principal';
import { assertAudited, WRITE_METHODS } from '../audit/write-route';
import { mapData, send } from '../http/send';
import { ApiError } from '../i18n/api-error';
import { validate, validatedOf } from '../http/validate';
import type { RateLimiters } from '../rate-limit/limiters';
import { type HttpMethod, type OperationSpec, type RouteRegistry } from './registry';

/** What every route gets from the app: the registry, the limiters and the logger. */
export interface RouteDeps {
  registry: RouteRegistry;
  limiters: RateLimiters;
  logger: Logger;
  /** permissions.yaml: a route may name only its permissions and the contract markers. */
  permissions: AccessRegistry;
  /** The access middleware of a declared rule (`requireAccess`, passed by createApp). */
  access: (spec: OperationSpec) => RequestHandler[];
}

/** The handler of a route: the validated parts of the request plus the raw objects. */
export interface RouteContext<B = unknown, Q = unknown, P = Record<string, unknown>> {
  body: B;
  query: Q;
  params: P;
  req: Request;
  res: Response;
}

export interface RouteDefinition<
  B = unknown,
  Q = unknown,
  P = Record<string, unknown>,
> extends OperationSpec {
  method: HttpMethod;
  path: string;
  /** Success status (200 by default; 201 for creates; 204 sends no body). */
  status?: number;
  /** Route-only request middleware after the rate limits, e.g. the raw photo body parser. */
  before?: RequestHandler[];
  /** The handler writes the response itself (a file stream): no envelope and no field mask. */
  streams?: boolean;
  handler: (ctx: RouteContext<B, Q, P>) => Promise<unknown> | unknown;
}

/**
 * Registers one operation (ADR-014, CONTRIBUTING "How to add an endpoint"): the OpenAPI
 * operation in the registry, the access rule, the rate-limit chain of its class, validation of
 * body, query and params, the handler, the envelope, and for writes the audit enforcement. A
 * write route must declare its audit action or it cannot be registered (BR-179, D-068).
 */
export function defineRoute<B = unknown, Q = unknown, P = Record<string, unknown>>(
  router: Router,
  deps: RouteDeps,
  definition: RouteDefinition<B, Q, P>,
): void {
  const { method, path, status = 200, handler, before = [], streams = false, ...spec } = definition;
  const where = `${method.toUpperCase()} ${path}`;
  if (WRITE_METHODS.has(method) && !spec.audit)
    throw new Error(`${where}: a write route must declare its audit action (BR-179)`);
  if (!spec.permission) throw new Error(`${where}: a route must declare its permission`);
  if (!deps.permissions.isKnownPermission(spec.permission))
    throw new Error(`${where}: unknown permission ${spec.permission} (not in permissions.yaml)`);
  // `entity` passes the access middleware for every active user; only the file service, which
  // decides per file, may rely on it (DECISION_LOG D-087).
  if (spec.permission === 'entity' && spec.scope !== 'file')
    throw new Error(`${where}: the entity marker is only for file routes (scope file)`);
  if (!(SCOPE_ENTITIES as readonly string[]).includes(spec.scope))
    throw new Error(`${where}: unknown scope entity ${spec.scope}`);
  // A permission held below GLOBAL must name the entity its scope filters (O-62).
  const scoped = deps.permissions.permissions
    .get(spec.permission)
    ?.defaults.some((d) => d.scope !== 'GLOBAL');
  if (scoped && spec.scope === 'none')
    throw new Error(`${where}: ${spec.permission} is held below GLOBAL and needs a scope entity`);
  const dataSchema = streams ? undefined : maskedDataSchema(where, spec, status, deps.permissions);
  /** The handler result in its JSON form, checked against the response schema. */
  const parseResponse = (schema: ZodType, data: unknown) => {
    const parsed = schema.safeParse(JSON.parse(JSON.stringify(data ?? null)));
    if (parsed.success) return parsed.data;
    // a contract bug of the handler: nothing is sent; logged with the route and the paths only
    deps.logger.error(
      { route: where, issues: parsed.error.issues.map((i) => i.path.join('.')) },
      'response does not match its schema',
    );
    throw new ApiError('server.internal', 500);
  };
  deps.registry.add({ ...spec, method, path });

  const run: RequestHandler = async (req, res, next) => {
    try {
      const v = validatedOf(res);
      const value = await handler({
        body: v.body as B,
        query: v.query as Q,
        params: v.params as P,
        req,
        res,
      });
      // a replay of an earlier create wrote nothing, so it has nothing to audit (API_STANDARDS 9)
      const replay = res.getHeader('Idempotent-Replay') === 'true';
      if (WRITE_METHODS.has(method) && !replay) assertAudited(spec.audit, where, deps.logger);
      if (streams) return;
      // Only the declared fields leave, minus the classes the caller may not see (RBAC.md 6).
      const visible = (req as AuthedRequest).fieldClasses ?? new Set<string>();
      const body = dataSchema
        ? mapData(value, (data) => maskData(dataSchema, parseResponse(dataSchema, data), visible))
        : value;
      send(res, body, replay ? 200 : status);
    } catch (error) {
      next(error);
    }
  };
  router[method](
    path,
    ...(spec.permission === 'public' ? [] : [noStore]),
    ...deps.access(spec),
    ...deps.limiters.for(spec.rateLimit, where),
    ...before,
    validate({ body: spec.body, query: spec.query, params: spec.params }),
    run,
  );
}

/**
 * A signed-in answer holds the caller's own or other people's personal data, so no browser or
 * proxy keeps it (R7 of docs/plans/2026-10-14-1400-feat-volunteer-form-refine-plan.md). Public
 * routes carry no personal data; the ones that do (a draft) set the header themselves.
 */
const noStore: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
};

/** Entities whose records carry protected fields: their routes always declare a response schema. */
const MASKED_ENTITIES = new Set([
  'volunteer',
  'beneficiary',
  'application',
  'project',
  'program',
  'file',
]);

/**
 * The schema of the success response's `data`, which the field mask runs on (RBAC.md 6, O-62). A
 * route of a masked entity or with declared sensitive fields needs one; a schema may mark only the
 * classes the route declares in `sensitiveFields` (the contract's `x-sensitive-fields`).
 */
function maskedDataSchema(
  where: string,
  spec: OperationSpec,
  status: number,
  registry: AccessRegistry,
): ZodType | undefined {
  const declared = spec.sensitiveFields ?? [];
  for (const cls of declared)
    if (!registry.sensitiveFields.some((c) => c.key === cls))
      throw new Error(`${where}: unknown sensitive field class ${cls}`);
  if (status === 204) return undefined;
  const schema = Object.hasOwn(spec.responses, status) ? spec.responses[status] : null;
  if (!schema) {
    if (MASKED_ENTITIES.has(spec.scope) || declared.length)
      throw new Error(`${where}: needs a response schema for ${status} (field mask, RBAC.md 6)`);
    return undefined;
  }
  for (const cls of sensitiveClassesOf(schema))
    if (!declared.includes(cls))
      throw new Error(`${where}: the response schema marks ${cls} but does not declare it`);
  const shape = (schema as unknown as { shape?: Record<string, ZodType> }).shape;
  return shape && Object.hasOwn(shape, 'data') ? shape.data : schema;
}
