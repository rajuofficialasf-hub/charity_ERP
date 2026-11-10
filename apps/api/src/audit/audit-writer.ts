import { uuidv7 } from '@css/shared';
import type { Tx } from '../core/prisma.service';
import { currentContext } from '../core/request-context';
import type { Prisma } from '../generated/prisma/client';

/**
 * One business event for the audit trail (docs/MASTER_PROMPT.md, "STANDARDS";
 * docs/database/DATABASE_SCHEMA.md, "audit_log").
 */
export interface AuditEntry {
  /** Action name, the same as the endpoint's `x-audit`, e.g. `application.approve`. */
  action: string;
  entityType: string;
  entityId?: string | null;
  old?: Prisma.InputJsonValue | null;
  new?: Prisma.InputJsonValue | null;
  reason?: string | null;
  /** Offline record id when the write came from a device. */
  clientUuid?: string | null;
  /**
   * Originating user when a job or sync acts for someone (docs/architecture/SYSTEM_ARCHITECTURE.md,
   * "Request lifecycle (exact order of checks)").
   */
  onBehalfOfUserId?: string | null;
  /** Jobs pass the system actor; requests take the user from the request context. */
  actorUserId?: string | null;
}

/**
 * Writes audit entries inside the caller's transaction, so an entry exists exactly when
 * the business write committed. Actor, role, IP, device session and request id come from the
 * request context; the count feeds the check that an audited route wrote its entry.
 */
export class AuditWriter {
  async record(tx: Tx, entry: AuditEntry): Promise<string> {
    const ctx = currentContext();
    const id = uuidv7();
    await tx.auditLog.create({
      data: {
        id,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        old: entry.old ?? undefined,
        new: entry.new ?? undefined,
        reason: entry.reason ?? null,
        clientUuid: entry.clientUuid ?? null,
        onBehalfOfUserId: entry.onBehalfOfUserId ?? null,
        actorUserId: entry.actorUserId ?? ctx?.userId ?? null,
        actorRole: ctx?.actorRole ?? null,
        ip: ctx?.ip ?? null,
        deviceSessionId: ctx?.deviceSessionId ?? null,
        requestId: ctx?.requestId ?? null,
      },
    });
    if (ctx) ctx.auditCount += 1;
    return id;
  }
}
