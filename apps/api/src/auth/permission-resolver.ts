import { Injectable } from '@nestjs/common';
import type { Principal } from './principal';

/** Permissions every account holds on its own data until T1.8 resolves scopes (O-59 item 3). */
const SELF_PERMISSIONS = new Set(['session.revoke_own']);

/**
 * Interim permission decision until the RBAC engine of T1.8 (O-59 item 3), deny by default:
 * `authenticated` passes for any signed-in user; GLOBAL-scope roles (Department Head, Monitoring
 * Team, permissions.yaml `global_scope`) pass every named permission; every user passes the
 * SELF permissions on own data; everything else, including the `workflow` and `entity` markers,
 * is denied. Object-level checks (own session, system owner) stay in the services.
 */
@Injectable()
export class PermissionResolver {
  allows(permission: string, principal: Principal): boolean {
    if (permission === 'authenticated') return true;
    if (permission === 'workflow' || permission === 'entity') return false;
    if (SELF_PERMISSIONS.has(permission)) return true;
    return principal.globalScope;
  }
}
