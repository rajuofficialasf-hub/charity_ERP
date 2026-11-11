import type { RequestHandler } from 'express';
import type { Logger } from 'pino';
import { holdsPermission } from '../access/scope.js';
import type { AccessService } from '../access/service.js';
import type { Clock } from '../core/clock.js';
import { currentContext } from '../core/request-context.js';
import { ApiError } from '../i18n/api-error.js';
import type { OperationSpec } from '../openapi/registry.js';
import type { AuthedRequest } from './principal.js';
import type { SessionService } from './session.service.js';
import type { TokenService } from './token.service.js';

export interface AccessDeps {
  tokens: TokenService;
  sessions: SessionService;
  access: AccessService;
  clock: Clock;
  logger: Logger;
}

/**
 * Scope entities whose routes filter no data (docs/security/RBAC.md, "Server-side enforcement").
 */
const UNFILTERED = new Set(['none', 'global', 'system']);

/** The access rule of an operation: its permission and the pending-account allowance. */
export type AccessRule = Pick<
  OperationSpec,
  'permission' | 'allowPending' | 'allowPasswordChange' | 'scope'
>;

/**
 * Authentication and authorization of every route (docs/architecture/SYSTEM_ARCHITECTURE.md,
 * "Request lifecycle (exact order of checks)"; docs/security/SECURITY_POLICY.md, "Authorization and
 * field-level protection"; docs/architecture/AUTH.md, "Tokens and device sessions", "Account
 * states" and "Role or permission change forces a session refresh"). Default deny: `defineRoute`
 * refuses a route without a declared permission, and only `public` passes without a bearer token.
 * In order: bearer token → device session not revoked → permission version current → account state
 * → password change due → permission (the effective grants of docs/security/RBAC.md, "Model") → the
 * scope handle of the route's entity. Fills
 * `req.principal`, `req.scope` and the request context so logs and audit entries carry the actor.
 * Runs before the rate limiters, so the per-user and per-session windows see the caller.
 */
export function requireAccess(deps: AccessDeps): (rule: AccessRule) => RequestHandler[] {
  return (rule) => {
    if (rule.permission === 'public') return [];
    const check: RequestHandler = async (req: AuthedRequest, _res, next) => {
      try {
        const header = req.headers.authorization;
        if (!header?.startsWith('Bearer ')) throw new ApiError('auth.token_missing', 401);
        const claims = await deps.tokens.verifyAccess(header.slice(7).trim());

        const facts = await deps.sessions.facts(claims.sid);
        if (
          !facts ||
          facts.userId !== claims.sub ||
          facts.revokedAt ||
          facts.expiresAt <= deps.clock.now()
        )
          throw new ApiError('auth.session_revoked', 401);
        if (facts.state === 'deactivated') throw new ApiError('auth.session_revoked', 401);
        if (facts.permissionVersion !== claims.pv) throw new ApiError('auth.token_stale', 401);
        if (facts.state === 'blocked') throw new ApiError('auth.account_blocked', 403);
        if (facts.state === 'pending' && !rule.allowPending)
          throw new ApiError('auth.account_pending', 403);
        // an account that must choose a new password reaches only the operations for that
        if (facts.passwordChangeRequired && !rule.allowPasswordChange)
          throw new ApiError('auth.password_change_required', 403);

        req.principal = {
          userId: facts.userId,
          sessionId: facts.sessionId,
          kind: facts.kind,
          state: facts.state,
          roles: facts.roles,
          globalScope: facts.globalScope,
          isSystemOwner: facts.isSystemOwner,
          permissionVersion: facts.permissionVersion,
        };
        const ctx = currentContext();
        if (ctx) {
          ctx.userId = facts.userId;
          ctx.deviceSessionId = facts.sessionId;
          ctx.actorRole = facts.roles.join(',') || undefined;
        }
        await deps.sessions.touch(facts.sessionId, req.ip);

        const access = await deps.access.load(facts.userId);
        if (!holdsPermission(rule.permission, access.grants)) {
          deps.access.denied(facts.userId, rule.permission, rule.scope);
          throw new ApiError('permission.denied', 403);
        }
        // `entity` (file routes): the service decides from the file's linked record.
        const scope = await deps.access.scopeFor(
          req.principal,
          access,
          rule.permission,
          rule.scope,
        );
        // A route that filters no data needs a GLOBAL grant: a narrower one would act as GLOBAL.
        if (
          UNFILTERED.has(rule.scope) &&
          rule.permission !== 'authenticated' &&
          !scope.instances.global
        ) {
          deps.access.denied(facts.userId, rule.permission, rule.scope);
          throw new ApiError('permission.denied', 403);
        }
        req.scope = scope;
        req.fieldClasses = access.fieldClasses;
        next();
      } catch (error) {
        next(error);
      }
    };
    return [check];
  };
}
