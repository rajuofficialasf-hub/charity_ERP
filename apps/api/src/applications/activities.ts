import { z } from 'zod';
import type { Tx } from '../core/prisma.service.js';

const uuid = z.uuid();

/** The kinds of field work an activity records (contract `ActivityCreate.type`). */
export const ACTIVITY_TYPES = [
  'distribution',
  'construction',
  'purchase',
  'training',
  'visit',
  'payment',
  'voucher',
  'expense',
  'issue',
  'inspection',
  'follow_up',
] as const;

/** One activity of an application (contract `Activity`). */
export const activityView = z.object({
  id: uuid,
  projectId: uuid,
  clientUuid: uuid,
  clientCreatedAt: z.string().optional(),
  applicationId: uuid,
  type: z.enum(ACTIVITY_TYPES),
  stage: z.string().optional(),
  outcome: z.string().optional(),
  comment: z.string().optional(),
  photoFileIds: z.array(uuid),
  status: z.enum(['planned', 'done', 'failed']),
  doneBy: uuid,
  doneAt: z.string(),
});
export type ActivityView = z.infer<typeof activityView>;

/**
 * The activities of an application, newest first, with the photos linked to each; the screens of
 * the later tasks write them, this read already shows them in the record.
 */
export async function readActivities(
  tx: Tx,
  applicationId: string,
  page: { limit: number; beforeId?: string; type?: string },
): Promise<ActivityView[]> {
  const rows = await tx.activity.findMany({
    where: {
      applicationId,
      ...(page.type ? { type: page.type } : {}),
      ...(page.beforeId ? { id: { lt: page.beforeId } } : {}),
    },
    orderBy: { id: 'desc' },
    take: page.limit,
  });
  if (!rows.length) return [];
  const links = await tx.fileLink.findMany({
    where: { entityType: 'activity', entityId: { in: rows.map((r) => r.id) } },
    select: { entityId: true, fileId: true, position: true },
    orderBy: { position: 'asc' },
  });
  const photos = new Map<string, string[]>();
  for (const l of links) photos.set(l.entityId, [...(photos.get(l.entityId) ?? []), l.fileId]);
  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    clientUuid: r.clientUuid ?? r.id,
    applicationId: r.applicationId ?? applicationId,
    type: activityView.shape.type.parse(r.type),
    status: activityView.shape.status.parse(r.status),
    doneBy: r.doneBy,
    doneAt: r.doneAt.toISOString(),
    photoFileIds: photos.get(r.id) ?? [],
    ...(r.stage ? { stage: r.stage } : {}),
    ...(r.outcome ? { outcome: r.outcome } : {}),
    ...(r.comment ? { comment: r.comment } : {}),
  }));
}
