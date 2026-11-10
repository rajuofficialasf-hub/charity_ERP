import { z, type ZodObject, type ZodType } from 'zod';
import { PERMISSION_MARKERS } from './drift';
import type { RateLimitClass } from '../rate-limit/rate-limit';

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * The OpenAPI contract of one operation (docs/api/API_STANDARDS.md, "OpenAPI annotations required
 * on every operation"), declared once with the route. The registry produces the generated document
 * that the drift test compares with docs/api/openapi.yaml, and the route uses the same values for
 * its audit action, rate-limit class, idempotency mode and access rule.
 */
export interface OperationSpec {
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
  /** The transition an action endpoint performs (`x-workflow`). */
  workflow?: { scope: string; action: string };
  /** A pending account may call this operation (docs/architecture/AUTH.md, "Account states"). */
  allowPending?: boolean;
  /**
   * An account that must set a new password may call this operation. Exactly the own
   * profile read, the language, the password change and the logout carry it.
   */
  allowPasswordChange?: boolean;
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

export interface RegisteredOperation extends OperationSpec {
  method: HttpMethod;
  /** Express path under /api/v1, e.g. `/users/:userId/state`. */
  path: string;
}

/** JSON Schema 2020-12 (OpenAPI 3.1) of a shared zod schema. */
export function jsonSchemaOf(schema: ZodType): Record<string, unknown> {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  return rest;
}

/** Every operation registered on an app, in registration order. */
export class RouteRegistry {
  private readonly operations: RegisteredOperation[] = [];

  add(operation: RegisteredOperation): void {
    const duplicate = this.operations.find((o) => o.operationId === operation.operationId);
    if (duplicate) throw new Error(`operationId ${operation.operationId} registered twice`);
    this.operations.push(operation);
  }

  list(): readonly RegisteredOperation[] {
    return this.operations;
  }
}

/** `/users/:userId/state` → `/users/{userId}/state` (OpenAPI path templates). */
export function openApiPath(expressPath: string): string {
  return expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

export { PERMISSION_MARKERS };
