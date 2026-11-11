import type { Request } from 'express';
import type { Scope } from '../access/scope.js';
import { ApiError } from '../i18n/api-error.js';

/**
 * The authenticated caller of a request, set by requireAccess (docs/architecture/AUTH.md, "Tokens
 * and device sessions"; docs/architecture/SYSTEM_ARCHITECTURE.md, "Request lifecycle (exact order
 * of checks)").
 */
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

export type AuthedRequest = Request & {
  principal?: Principal;
  scope?: Scope;
  /**
   * The protected field classes the caller may see (docs/security/RBAC.md, "Field-level
   * protection"); absent means none.
   */
  fieldClasses?: ReadonlySet<string>;
};

/** The caller's scope for the route's permission and entity, set by the access middleware. */
export function scopeOf(req: AuthedRequest): Scope {
  if (!req.scope) throw new Error('scopeOf: the route has no access scope (public route?)');
  return req.scope;
}

export function principalOf(req: AuthedRequest): Principal {
  if (!req.principal) throw new ApiError('auth.token_missing', 401);
  return req.principal;
}
