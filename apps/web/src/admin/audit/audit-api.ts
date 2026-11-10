import { api } from '../../api/client';
import type { AuditEntry, AuditMeta, AuditPage } from '../../api/schemas';
import { listQuery } from '../list-query';

export type { AuditEntry, AuditMeta };

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
  api<AuditPage>(`/audit-log${listQuery({ ...filters, cursor: cursor ?? undefined })}`, {
    envelope: true,
  });
