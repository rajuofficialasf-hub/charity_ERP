import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CLOCK, type Clock } from '../core/clock';
import { currentContext } from '../core/request-context';
import { ApiError } from '../i18n/api-error';
import { ACCESS_RULE, type AccessRule } from '../openapi/api-contract';
import { PermissionResolver } from './permission-resolver';
import type { AuthedRequest } from './principal';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

/**
 * Authentication and authorization of every route (SYSTEM_ARCHITECTURE 6, SECURITY_POLICY 5,
 * AUTH.md 5, 7, 9). Default deny: a route without a declared permission is refused. In order:
 * bearer token → device session not revoked → permission version current → account state →
 * permission. Fills the request context so logs and audit entries carry the actor.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger('AuthGuard');

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(PermissionResolver) private readonly resolver: PermissionResolver,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const rule = this.reflector.getAllAndOverride<AccessRule | undefined>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!rule) {
      this.logger.error(
        `route without a declared permission: ${context.getClass().name}.${context.getHandler().name}`,
      );
      throw new ApiError('permission.denied', 403);
    }
    if (rule.permission === 'public') return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ApiError('auth.token_missing', 401);
    const claims = await this.tokens.verifyAccess(header.slice(7).trim());

    const facts = await this.sessions.facts(claims.sid);
    if (
      !facts ||
      facts.userId !== claims.sub ||
      facts.revokedAt ||
      facts.expiresAt <= this.clock.now()
    )
      throw new ApiError('auth.session_revoked', 401);
    if (facts.state === 'deactivated') throw new ApiError('auth.session_revoked', 401);
    if (facts.permissionVersion !== claims.pv) throw new ApiError('auth.token_stale', 401);
    if (facts.state === 'blocked') throw new ApiError('auth.account_blocked', 403);
    if (facts.state === 'pending' && !rule.allowPending)
      throw new ApiError('auth.account_pending', 403);

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
    await this.sessions.touch(facts.sessionId, req.ip);

    if (!this.resolver.allows(rule.permission, req.principal))
      throw new ApiError('permission.denied', 403);
    return true;
  }
}
