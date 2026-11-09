import { api } from '../../api/client';
import { listQuery } from '../list-query';

/** One entry of the audit log as GET /audit-log returns it (secret-looking keys already dropped). */
export interface AuditEntry {
  id: string;
  createdAt: string;
  action: string;
  entityType: string;
  entityId: string | null;
  actor: { id: string; name: string } | null;
  actorRole: string | null;
  reason: string | null;
  ip: string | null;
  deviceSessionId: string | null;
  old: unknown;
  new: unknown;
}

export interface AuditMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  /** The date range the server used (Dhaka days, inclusive). */
  from: string;
  to: string;
}

export const AUDIT_FILTERS = [
  'actorUserId',
  'entityType',
  'entityId',
  'action',
  'from',
  'to',
] as const;
export type AuditFilters = Partial<Record<(typeof AUDIT_FILTERS)[number], string>>;

export const AUDIT_KEY = ['admin', 'audit'] as const;

/** GET /audit-log: one page, newest first, for the filters and a cursor. */
export const auditPage = (filters: AuditFilters, cursor: string | null) =>
  api<{ data: AuditEntry[]; meta: AuditMeta }>(
    `/audit-log${listQuery({ ...filters, cursor: cursor ?? undefined })}`,
    { envelope: true },
  );
