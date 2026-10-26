import type { MediaPriority, ReferralState } from '@css/shared/media';
import type { Answer } from '@css/shared/forms';
import { api, ApiFailure } from '../../lib/api';
import { listQuery } from '../list-query';
import { PAGE_SIZE, pageParams } from '../list-paging';
import type {
  Application as VolunteerView,
  ApplicationSummary,
  Unlock,
} from '../../features/applications/applications-api';

export type { ApplicationSummary };

/** Why a decision asks for a comment: it goes against the score order, or the quota area is full. */
export type CommentReason = 'against_score' | 'quota_full';

/** One part of the priority score, frozen with the score at the decision. */
export interface ScoreItem {
  key: string;
  label?: { bn: string; en: string };
  input: unknown;
  max_points: number;
  points: number;
}

/** The record as an official reads it: the summary plus the office's own fields. */
export interface OfficeApplication extends VolunteerView {
  decisionComment?: string | null;
  totalScore?: number | null;
  scoreItems?: ScoreItem[] | null;
  /** The comments each decision would ask for now, by action. */
  decisionHints: Partial<Record<OfficeAction, CommentReason[]>>;
  zakat?: { nisabValue: string; decision: 'eligible' | 'not_eligible' | null } | null;
  /** Its referral to the Media Team, for the referrer's scope and the directors. */
  media?: {
    referralId: string;
    state: ReferralState;
    priority: MediaPriority;
    decisionComment: string | null;
    decidedAt: string | null;
    workStageCode: string | null;
  } | null;
  /** Whether the caller may send it to the Media Team now, or a returned referral again. */
  mayReferToMedia?: boolean;
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

/** The filters kept in the address; the division and the upazila only lead to the district and the union. */
export const FILTER_KEYS = [
  'sort',
  'status',
  'divisionId',
  'districtId',
  'upazilaId',
  'unionId',
  'flag',
] as const;
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
  const { divisionId: _division, upazilaId: _upazila, ...sent } = filters;
  return api<{ data: ApplicationSummary[]; meta: PageMeta }>(
    `/projects/${projectId}/applications${listQuery({
      ...sent,
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
  | 'waitlist'
  | 'pull_from_waitlist'
  | 'reject'
  | 'return_to_review'
  | 'verify_link'
  | 'verify_create'
  | 'reject_unverified'
  | 'delete';

export const officeAct = (
  id: string,
  etag: string,
  action: OfficeAction,
  body: {
    reason?: string;
    message?: string;
    comment?: string;
    linkBeneficiaryId?: string;
    ownerVolunteerId?: string;
  } = {},
) =>
  api<Enveloped<OfficeApplication>>(`/applications/${id}/actions/${action}`, {
    method: 'POST',
    body,
    headers: { 'If-Match': etag },
    envelope: true,
  });

/**
 * "পরেরজনকে আনুন": the next waitlisted application of the area moves into approved. The key makes
 * a repeat of the same click answer the same person.
 */
export const pullNext = (
  projectId: string,
  key: string,
  body: { areaId?: string; comment?: string },
) =>
  api<Enveloped<{ id: string; appNo: string | null }>>(
    `/projects/${projectId}/waitlist/pull-next`,
    { method: 'POST', body, headers: { 'Idempotency-Key': key }, envelope: true },
  );

/** The comment reasons a refused decision names, when the server asked for a comment. */
export const askedComments = (error: unknown): CommentReason[] | null =>
  error instanceof ApiFailure && error.code === 'workflow.comment_required'
    ? error.details
        .map((d) => d.path)
        .filter((p): p is CommentReason => p === 'against_score' || p === 'quota_full')
    : null;

/** Opens one answer of an approved application for correction, saying why. */
export const openUnlock = (applicationId: string, fieldKey: string, reason: string) =>
  api<Unlock>(`/applications/${applicationId}/unlocks`, {
    method: 'POST',
    body: { fieldKey, reason },
  });

/** Accepts the entered value, or sends it back with a reason. */
export const decideUnlock = (unlockId: string, decision: 'accept' | 'refuse', reason?: string) =>
  api<Unlock>(`/application-unlocks/${unlockId}/decision`, {
    method: 'POST',
    body: { decision, ...(reason ? { reason } : {}) },
  });

/** Ends a waiting unlock with a reason; the old value stays. */
export const cancelUnlock = (unlockId: string, reason: string) =>
  api<Unlock>(`/application-unlocks/${unlockId}/cancel`, { method: 'POST', body: { reason } });

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
