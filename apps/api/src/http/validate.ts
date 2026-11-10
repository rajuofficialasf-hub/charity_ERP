import type { Request, RequestHandler, Response } from 'express';
import type { z, ZodType } from 'zod';
import { ApiError, type ApiErrorDetail } from '../i18n/api-error.js';

export type Source = 'body' | 'query' | 'params';

/** A catalogue code given by a shared schema as `{ message: 'validation.nid_format' }`. */
const CATALOGUE_CODE = /^[a-z_]+\.[a-z_.]+$/;

/**
 * Catalogue code of one zod issue (docs/api/API_STANDARDS.md, "Validation and localization" and
 * "Error-code catalogue"). Shared schemas name a specific code with `{ message: '<code>' }` or a
 * refinement's `params.code`; otherwise the issue kind decides.
 */
export function issueCode(issue: z.core.$ZodIssue): string {
  const custom = (issue as { params?: { code?: unknown } }).params?.code;
  if (typeof custom === 'string') return custom;
  if (CATALOGUE_CODE.test(issue.message)) return issue.message;
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined ? 'validation.required' : 'validation.failed';
    case 'too_big':
      return issue.origin === 'string' ? 'validation.too_long' : 'validation.out_of_range';
    case 'too_small':
      if (issue.origin === 'string' && Number(issue.minimum) <= 1) return 'validation.required';
      return 'validation.out_of_range';
    case 'invalid_value':
      return 'validation.option_unknown';
    default:
      return 'validation.failed';
  }
}

/**
 * Parses one request part with a shared zod schema: unknown query parameters
 * are 400 `validation.unknown_parameter`; field problems are 422 `validation.failed` with one
 * detail per problem (path in camelCase, code, message key; the error middleware renders the
 * message).
 */
export function parseWith<T>(schema: ZodType<T>, source: Source, value: unknown): T {
  const result = schema.safeParse(value ?? (source === 'body' ? undefined : {}));
  if (result.success) return result.data;
  const unknownKeys = result.error.issues.filter((i) => i.code === 'unrecognized_keys');
  if (unknownKeys.length && source === 'query') {
    const names = unknownKeys.flatMap((i) => (i as { keys: string[] }).keys);
    throw new ApiError(
      'validation.unknown_parameter',
      400,
      undefined,
      names.map((name) => ({ path: name, code: 'validation.unknown_parameter' })),
    );
  }
  const details: ApiErrorDetail[] = result.error.issues.flatMap((issue) => {
    if (issue.code === 'unrecognized_keys')
      return issue.keys.map((key) => ({
        path: [...issue.path, key].join('.'),
        code: 'validation.unknown_parameter',
      }));
    return [{ path: issue.path.join('.'), code: issueCode(issue) }];
  });
  throw new ApiError('validation.failed', 422, undefined, details);
}

export interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: Record<string, ZodType>;
}

export interface Validated {
  body: unknown;
  query: unknown;
  params: Record<string, unknown>;
}

const KEY = 'validated';

/** The parsed parts of a request, set by `validate()` (Express 5 keeps `req.query` read-only). */
export function validatedOf(res: Response): Validated {
  return (
    (res.locals as Record<string, Validated>)[KEY] ?? { body: undefined, query: {}, params: {} }
  );
}

/** Middleware that validates body, query and path parameters before the handler runs. */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res, next) => {
    try {
      const params: Record<string, unknown> = {};
      for (const [name, schema] of Object.entries(schemas.params ?? {}))
        // eslint-disable-next-line security/detect-object-injection -- names come from the route's own declaration
        params[name] = parseWith(schema, 'params', req.params[name]);
      const validated: Validated = {
        body: schemas.body ? parseWith(schemas.body, 'body', req.body) : undefined,
        query: schemas.query ? parseWith(schemas.query, 'query', req.query) : {},
        params,
      };
      (res.locals as Record<string, Validated>)[KEY] = validated;
      next();
    } catch (error) {
      next(error);
    }
  };
}
