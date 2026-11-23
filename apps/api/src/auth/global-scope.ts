import type { Tx } from '../core/prisma.service.js';

/**
 * Whether a person reaches the whole country, so their password needs the 12 characters of the
 * global roles (docs/architecture/AUTH.md, "Password rules"): a live role with the GLOBAL scope, or
 * a live permission given through the panel at the GLOBAL scope (not withdrawn, not expired). The
 * password change, the reset and the set-password link all ask here.
 */
export async function holdsGlobalScope(db: Tx, userId: string, now: Date): Promise<boolean> {
  const roles = await db.userRole.count({
    where: { userId, revokedAt: null, role: { globalScope: true } },
  });
  if (roles > 0) return true;
  const grants = await db.userPermission.count({
    where: {
      userId,
      effect: 'grant',
      scopeType: 'GLOBAL',
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  });
  return grants > 0;
}
