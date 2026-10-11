import { applyDecorators, SetMetadata } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCookieAuth,
  ApiExtension,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { z, type ZodObject, type ZodType } from 'zod';
import { Audit } from '../audit/audit.decorator';
import { Idempotency } from '../idempotency/idempotency.service';
import { RateLimit, type RateLimitClass } from '../rate-limit/rate-limit';

/** Metadata read by the AuthGuard: the declared permission and the pending-account allowance. */
export const ACCESS_RULE = 'css:access-rule';

export interface AccessRule {
  /** Permission name or one of the markers public, authenticated, workflow, entity. */
  permission: string;
  scope: string;
  /** A pending account may call this operation (AUTH.md 7: own profile and session only). */
  allowPending?: boolean;
}

/**
 * Marks a route outside the API contract (health probes, test probes) as public for the
 * AuthGuard. Contract operations declare their permission through `@ApiContract` instead.
 */
export const Public = () =>
  SetMetadata(ACCESS_RULE, { permission: 'public', scope: 'none' } satisfies AccessRule);

/**
 * The OpenAPI contract of one operation (API_STANDARDS 16). Declared once on the handler, it
 * produces the generated OpenAPI operation (checked against docs/api/openapi.yaml by the drift
 * test) and sets the runtime behaviour that the annotations name: the audit action, the rate-limit
 * class and the idempotency mode.
 */
export interface ApiContractSpec {
  operationId: string;
  tag: string;
  summary: string;
  description?: string;
  /** Permission name from permissions.yaml, or public, authenticated, workflow, entity. */
  permission: string;
  scope: string;
  /** Audit action or 'none'. */
  audit: string;
  idempotency: 'none' | 'clientUuid' | 'header';
  rateLimit: RateLimitClass;
  sensitiveFields?: string[];
  workflow?: string;
  /** A pending account may call this operation (AUTH.md 7). */
  allowPending?: boolean;
  /** Security of a public operation that is not bearer, e.g. the refresh cookie. */
  cookieAuth?: string;
  /** Header parameters of the contract (Accept-Language, X-Client-Version, If-Match, …). */
  headers?: { name: string; required: boolean }[];
  body?: ZodType;
  /** A strict zod object; each field becomes a query parameter. */
  query?: ZodObject;
  params?: Record<string, ZodType>;
  /** Status code → response schema, or null for a response without a body. */
  responses: Record<number, ZodType | null>;
}

/** JSON Schema 2020-12 (OpenAPI 3.1) of a shared zod schema. */
export function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return rest;
}

export function ApiContract(spec: ApiContractSpec): MethodDecorator {
  const decorators: (MethodDecorator | ClassDecorator | PropertyDecorator)[] = [
    ApiOperation({
      operationId: spec.operationId,
      summary: spec.summary,
      description: spec.description,
    }),
    ApiTags(spec.tag),
    ApiExtension('x-permission', spec.permission),
    ApiExtension('x-scope', spec.scope),
    ApiExtension('x-audit', spec.audit),
    ApiExtension('x-idempotency', spec.idempotency),
    ApiExtension('x-rate-limit', spec.rateLimit),
    SetMetadata(ACCESS_RULE, {
      permission: spec.permission,
      scope: spec.scope,
      allowPending: spec.allowPending ?? false,
    } satisfies AccessRule),
    Audit(spec.audit),
    RateLimit(spec.rateLimit),
    Idempotency(spec.idempotency),
  ];
  if (spec.sensitiveFields?.length)
    decorators.push(ApiExtension('x-sensitive-fields', spec.sensitiveFields));
  if (spec.workflow) decorators.push(ApiExtension('x-workflow', spec.workflow));
  if (spec.permission !== 'public') decorators.push(ApiBearerAuth('bearerAuth'));
  if (spec.cookieAuth) decorators.push(ApiCookieAuth(spec.cookieAuth));
  for (const header of spec.headers ?? [])
    decorators.push(ApiHeader({ name: header.name, required: header.required }));
  if (spec.body) decorators.push(ApiBody({ schema: jsonSchemaOf(spec.body) }));
  for (const [name, schema] of Object.entries(spec.query?.shape ?? {})) {
    const s = schema as ZodType;
    decorators.push(
      ApiQuery({ name, required: !s.safeParse(undefined).success, schema: jsonSchemaOf(s) }),
    );
  }
  for (const [name, schema] of Object.entries(spec.params ?? {}))
    decorators.push(ApiParam({ name, required: true, schema: jsonSchemaOf(schema) }));
  for (const [status, schema] of Object.entries(spec.responses))
    decorators.push(
      ApiResponse({
        status: Number(status),
        description: String(status),
        ...(schema ? { schema: jsonSchemaOf(schema) } : {}),
      }),
    );
  return applyDecorators(...decorators);
}
