import { HEAD_ROLE } from '../access/hard-rules.js';
import { isUniqueViolationOf } from '../core/db-errors.js';
import type { Tx } from '../core/prisma.service.js';
import { ApiError } from '../i18n/api-error.js';

/** The partial unique index that keeps one live Department Head. */
const ONE_HEAD = 'user_roles_one_department_head_key';

const seatTaken = () => new ApiError('user.department_head_exists', 409);

/**
 * One official holds the Department Head role at a time (docs/security/RBAC.md, "Roles"): giving
 * it is refused while another person holds it, in a new account, a registration's approval and a
 * role change alike. `userId` is the person the role goes to, who does not stand in their own
 * way. Any other role passes.
 */
export async function assertHeadSeatFree(tx: Tx, roleKey: string, userId?: string): Promise<void> {
  if (roleKey !== HEAD_ROLE) return;
  const others = await tx.userRole.count({
    where: { roleKey: HEAD_ROLE, revokedAt: null, ...(userId ? { NOT: { userId } } : {}) },
  });
  if (others) throw seatTaken();
}

/**
 * Of two appointments at once the index lets one through: the other's unique violation is the
 * same refusal. Every other error comes back as it is, for the caller to throw on.
 */
export function headSeatError(error: unknown): unknown {
  return isUniqueViolationOf(error, ONE_HEAD) ? seatTaken() : error;
}
