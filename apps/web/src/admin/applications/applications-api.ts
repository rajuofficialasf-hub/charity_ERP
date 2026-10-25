import type { Answer } from '@css/shared/forms';
import { api } from '../../lib/api';
import { listQuery } from '../list-query';
import { PAGE_SIZE, pageParams } from '../list-paging';
import type {
  Application as VolunteerView,
  ApplicationSummary,
} from '../../features/applications/applications-api';

export type { ApplicationSummary };

/** The record as an official reads it: the summary plus the office's own fields. */
export interface OfficeApplication extends VolunteerView {
  decisionComment?: string | null;
  totalScore?: number | null;
  zakat?: { nisabValue: string; decision: 'eligible' | 'not_eligible' | null } | null;
  familyDuplicateWarnings: {
    beneficiaryId: string;
    benNo: string;
    name: string;
    matchedOn: ('mobile' | 'union_village_father')[];
  }[];
}

/** One step of the application as the office reads it: the actor and the office's texts too. */
export interface OfficeTimelineEntry {
  id: string;
  at: string;
  action: string;
  from: string | null;
  to: string;
  automatic: boolean;
  actor?: { id: string; name: string } | null;
  reason?: string | null;
  comment?: string | null;
  message: string | null;
}

export interface FieldChange {
  id: string;
  field: string;
  kind: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: string;
}

interface PageMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  total?: number | '10000+';
}
interface Enveloped<T> {
  data: T;
  meta: { etag?: string };
}

export const FILTER_KEYS = ['status', 'districtId', 'unionId', 'flag'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];
export type FilterValues = Partial<Record<FilterKey, string>>;

export const APPLICATIONS_KEY = ['admin', 'applications'] as const;
export const applicationKey = (id: string) => ['admin', 'applications', id] as const;

export function applicationPage(
  projectId: string,
  filters: FilterValues,
  q: string,
  page: number,
  cursor: string | null,
) {
  return api<{ data: ApplicationSummary[]; meta: PageMeta }>(
    `/projects/${projectId}/applications${listQuery({
      ...filters,
      q: q || undefined,
      ...pageParams(page, cursor),
      limit: String(PAGE_SIZE),
      include: 'total',
    })}`,
    { envelope: true },
  );
}

export const officeApplication = (id: string) =>
  api<Enveloped<OfficeApplication>>(`/applications/${id}`, { envelope: true });

export const officeTimeline = (id: string) =>
  api<OfficeTimelineEntry[]>(`/applications/${id}/timeline`);

export const changeLog = (id: string) =>
  api<FieldChange[]>(`/applications/${id}/changes${listQuery({ limit: '50' })}`);

export type OfficeAction =
  | 'review'
  | 'send_for_approval'
  | 'approve'
  | 'reject'
  | 'return_to_review'
  | 'reject_unverified'
  | 'delete';

export const officeAct = (
  id: string,
  etag: string,
  action: OfficeAction,
  body: { reason?: string; message?: string; comment?: string } = {},
) =>
  api<Enveloped<OfficeApplication>>(`/applications/${id}/actions/${action}`, {
    method: 'POST',
    body,
    headers: { 'If-Match': etag },
    envelope: true,
  });

export const saveAnswers = (id: string, etag: string, answers: Answer[]) =>
  api<Enveloped<OfficeApplication>>(`/applications/${id}`, {
    method: 'PATCH',
    body: { answers },
    headers: { 'If-Match': etag },
    envelope: true,
  });

export interface BulkRowResult {
  clientUuid: string;
  result: 'done' | 'failed' | 'pending_photos' | 'needs_verification' | 'synced';
  code: string | null;
  serverId: string | null;
  status: string | null;
  stage: string | null;
}

/** The review screen's bulk action; the key makes a repeat of the request answer the same results. */
export const bulkReview = (
  projectId: string,
  key: string,
  body: {
    action: 'review' | 'approve';
    rows: { clientUuid: string; applicationId: string; ifMatch: string }[];
  },
) =>
  api<{ results: BulkRowResult[] }>(`/projects/${projectId}/bulk/review`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
  });
