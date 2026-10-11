import { Body, type PipeTransform, Param, Query } from '@nestjs/common';
import type { z, ZodType } from 'zod';
import { ApiError, type ApiErrorDetail } from '../i18n/api-error';

type Source = 'body' | 'query' | 'param';

/** A catalogue code given by a shared schema as `{ message: 'validation.nid_format' }`. */
const CATALOGUE_CODE = /^[a-z_]+\.[a-z_.]+$/;

/**
 * Catalogue code of one zod issue (API_STANDARDS 7 and 8). Shared schemas name a specific code
 * with `{ message: '<code>' }` or a refinement's `params.code`; otherwise the issue kind decides.
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
 * The one validation pipe (D-068): parses with the shared zod schema; unknown query parameters
 * are 400 `validation.unknown_parameter`; field problems are 422 `validation.failed` with one
 * detail per problem (path in camelCase, code, message key; the filter renders the message).
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(
    private readonly schema: ZodType,
    private readonly source: Source,
  ) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value ?? (this.source === 'body' ? undefined : {}));
    if (result.success) return result.data;
    const unknownKeys = result.error.issues.filter((i) => i.code === 'unrecognized_keys');
    if (unknownKeys.length && this.source === 'query') {
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
}

/** Validated request body. */
export const ZBody = (schema: ZodType) => Body(new ZodValidationPipe(schema, 'body'));
/** Validated query string; the schema should be strict so typos are rejected (API_STANDARDS 5). */
export const ZQuery = (schema: ZodType) => Query(new ZodValidationPipe(schema, 'query'));
/** Validated path parameter. */
export const ZParam = (name: string, schema: ZodType) =>
  Param(name, new ZodValidationPipe(schema, 'param'));
