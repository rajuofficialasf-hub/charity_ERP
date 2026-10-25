import { z } from 'zod';
import { sensitive } from '../access/field-mask';
import type { Tx } from '../core/prisma.service';
import type { FormAudience } from '../services/forms';
import { OFFICIAL_SECTION } from './view';

const uuid = z.uuid();

/** One step of an application's timeline (contract `TimelineEntry`). */
export const timelineEntry = z.object({
  id: uuid,
  at: z.string(),
  action: z.string(),
  from: z.string().nullable(),
  to: z.string(),
  automatic: z.boolean(),
  actor: sensitive(z.object({ id: uuid, name: z.string() }).nullable(), OFFICIAL_SECTION),
  reason: sensitive(z.string().nullable(), OFFICIAL_SECTION),
  comment: sensitive(z.string().nullable(), OFFICIAL_SECTION),
  message: z.string().nullable(),
});
export type TimelineEntry = z.infer<typeof timelineEntry>;

/** One logged change of an answer or a locked field (contract `FieldChange`). */
export const fieldChangeView = z.object({
  id: uuid,
  field: z.string(),
  kind: z.enum(['unlock', 'contact_update', 'correction', 'sync_conflict', 'review_edit']),
  unlockState: z.enum(['open', 'updated', 'relocked']).nullable(),
  oldValue: z.unknown(),
  newValue: z.unknown(),
  reason: z.string().nullable(),
  requestedBy: uuid.nullable(),
  approvedBy: uuid.nullable(),
  createdAt: z.string(),
});
export type FieldChangeView = z.infer<typeof fieldChangeView>;

const stateChange = z.object({ status: z.string() }).loose();
const stepDetails = z
  .object({
    status: z.string(),
    action: z.string().optional(),
    automatic: z.boolean().optional(),
    comment: z.string().optional(),
    message: z.string().optional(),
  })
  .loose();

/**
 * The timeline is the audit log: every entry of the application that records a state (the
 * creation and each move of the engine), in order, projected per audience. The office reads the
 * actor, the office's reason and the comment; a volunteer reads the state, the time and the
 * message written for them, and the office's reason, a return reason and the old and new values
 * never leave the server for them.
 */
export async function readTimeline(
  tx: Tx,
  applicationId: string,
  audience: FormAudience,
): Promise<TimelineEntry[]> {
  const rows = await tx.auditLog.findMany({
    where: { entityType: 'application', entityId: applicationId },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      createdAt: true,
      action: true,
      old: true,
      new: true,
      reason: true,
      actorUser: { select: { id: true, displayName: true } },
    },
  });
  const official = audience === 'official';
  return rows.flatMap((r) => {
    const details = stepDetails.safeParse(r.new);
    if (!details.success) return [];
    const from = stateChange.safeParse(r.old);
    // an entry that keeps the state (an edit) is not a step
    if (from.success && from.data.status === details.data.status) return [];
    return [
      {
        id: r.id,
        at: r.createdAt.toISOString(),
        action: r.action,
        from: from.success ? from.data.status : null,
        to: details.data.status,
        automatic: details.data.automatic === true,
        actor:
          official && r.actorUser ? { id: r.actorUser.id, name: r.actorUser.displayName } : null,
        reason: official ? r.reason : null,
        comment: official ? (details.data.comment ?? null) : null,
        message: details.data.message ?? null,
      },
    ];
  });
}

/** The logged changes of an application's answers, newest first. */
export async function readChanges(
  tx: Tx,
  applicationId: string,
  page: { limit: number; beforeId?: string },
): Promise<FieldChangeView[]> {
  const rows = await tx.fieldChange.findMany({
    where: {
      entityType: 'application',
      entityId: applicationId,
      ...(page.beforeId ? { id: { lt: page.beforeId } } : {}),
    },
    orderBy: { id: 'desc' },
    take: page.limit,
  });
  return rows.map((r) => ({
    id: r.id,
    field: r.field,
    kind: fieldChangeView.shape.kind.parse(r.kind),
    unlockState: fieldChangeView.shape.unlockState.parse(r.unlockState),
    oldValue: r.oldValue,
    newValue: r.newValue,
    reason: r.reason,
    requestedBy: r.requestedBy,
    approvedBy: r.approvedBy,
    createdAt: r.createdAt.toISOString(),
  }));
}
