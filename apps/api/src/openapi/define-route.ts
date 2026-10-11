import type { Request, RequestHandler, Response, Router } from 'express';
import type { Logger } from 'pino';
import { assertAudited, WRITE_METHODS } from '../audit/write-route';
import { send } from '../http/send';
import { validate, validatedOf } from '../http/validate';
import type { RateLimiters } from '../rate-limit/limiters';
import { type HttpMethod, type OperationSpec, type RouteRegistry } from './registry';

/** What every route gets from the app: the registry, the limiters and the logger. */
export interface RouteDeps {
  registry: RouteRegistry;
  limiters: RateLimiters;
  logger: Logger;
  /** Access middleware for the declared rule: the auth middleware, or default deny. */
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
  const { method, path, status = 200, handler, ...spec } = definition;
  const where = `${method.toUpperCase()} ${path}`;
  if (WRITE_METHODS.has(method) && !spec.audit)
    throw new Error(`${where}: a write route must declare its audit action (BR-179)`);
  if (!spec.permission) throw new Error(`${where}: a route must declare its permission`);
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
      if (WRITE_METHODS.has(method)) assertAudited(spec.audit, where, deps.logger);
      send(res, value, status);
    } catch (error) {
      next(error);
    }
  };
  router[method](
    path,
    ...deps.access(spec),
    ...deps.limiters.for(spec.rateLimit, where),
    validate({ body: spec.body, query: spec.query, params: spec.params }),
    run,
  );
}
