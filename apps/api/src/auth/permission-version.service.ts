import { type AuditWriter, type AuditEntry } from '../audit/audit-writer.js';
import type { Tx } from '../core/prisma.service.js';
import { type SessionService } from './session.service.js';

/**
 * Forces a session refresh after a change to what a user may do (docs/architecture/AUTH.md, "Role
 * or permission change forces a session refresh"): increments
 * `users.permission_version`, so the next request with an older token gets 401
 * `auth.token_stale` and the PWA refreshes silently, and writes the audit entry of the change.
 * Role assignment, permission-panel changes, blocklist and account-state
 * changes all go through here.
 */
export class PermissionVersionService {
  constructor(
    private readonly audit: AuditWriter,
    private readonly sessions: SessionService,
  ) {}

  /** Bumps the version inside the caller's transaction and audits the change; returns the new version. */
  async bump(
    tx: Tx,
    userId: string,
    entry: Omit<AuditEntry, 'entityType' | 'entityId'>,
  ): Promise<number> {
    const user = await tx.user.update({
      where: { id: userId },
      data: { permissionVersion: { increment: 1 } },
      select: { permissionVersion: true },
    });
    await this.audit.record(tx, { ...entry, entityType: 'user', entityId: userId });
    this.sessions.evictUser(userId);
    return user.permissionVersion;
  }

  /**
   * Drops the cached session facts of the users once more, after the transaction of their `bump`
   * has committed: a request that ran between the bump and the commit read the old version and
   * cached it, and an old token would pass until that cache entry ended.
   */
  settled(...userIds: string[]): void {
    for (const userId of userIds) this.sessions.evictUser(userId);
  }
}
