import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { ApiError } from '../i18n/api-error';

/** The authenticated caller of a request, set by the AuthGuard (AUTH.md 5, SYSTEM_ARCHITECTURE 6). */
export interface Principal {
  userId: string;
  sessionId: string;
  kind: string;
  state: string;
  roles: string[];
  /** Holds a GLOBAL-scope role (Department Head, Monitoring Team). */
  globalScope: boolean;
  isSystemOwner: boolean;
  permissionVersion: number;
}

export type AuthedRequest = Request & { principal?: Principal };

export function principalOf(req: AuthedRequest): Principal {
  if (!req.principal) throw new ApiError('auth.token_missing', 401);
  return req.principal;
}

/** The caller of an authenticated operation, as a handler parameter. */
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  principalOf(context.switchToHttp().getRequest<AuthedRequest>()),
);
