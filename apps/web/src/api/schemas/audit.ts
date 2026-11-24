import { z } from 'zod';
import { date, dateTime } from './common';

/** One entry of the audit log as `GET /audit-log` returns it (secret-looking keys dropped). */
export const auditEntrySchema = z.object({
  id: z.string(),
  createdAt: dateTime,
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  /** Who or what the entry is about, by name or number; null where the log names none. */
  entityName: z.string().nullable().optional(),
  actor: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  actorRole: z.string().nullable(),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  deviceSessionId: z.uuid().nullable(),
  old: z.unknown(),
  new: z.unknown(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const auditMetaSchema = z.object({
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  /** The date range the server used (Dhaka days, inclusive). */
  from: date,
  to: date,
});
export type AuditMeta = z.infer<typeof auditMetaSchema>;

/** One page of the audit log, newest first, with the range the server used. */
export const auditPageSchema = z.object({ data: z.array(auditEntrySchema), meta: auditMetaSchema });
export type AuditPage = z.infer<typeof auditPageSchema>;
