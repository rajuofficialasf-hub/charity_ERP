import { answerValueSchema } from '@css/shared';
import type { Answer } from '@css/shared/forms';
import { api, ApiFailure } from '../../api/client';
import type {
  ApplicationSummary,
  BulkReview,
  BulkRowResult,
  CommentReason,
  FieldChange,
  OfficeAction,
  OfficeApplication,
  OfficeApplicationPage,
  OfficeApplicationRecord,
  OfficeTimelineEntry,
  PulledApplication,
  ScoreItem,
  Unlock,
} from '../../api/schemas';
import { listQuery } from '../list-query';
import { PAGE_SIZE, pageParams } from '../list-paging';

export type {
  ApplicationSummary,
  BulkRowResult,
  CommentReason,
  FieldChange,
  OfficeAction,
  OfficeApplication,
  OfficeTimelineEntry,
  ScoreItem,
};

/** The comment reasons, to read them from a refusal's details. */
const COMMENT_REASONS = [
  'against_score',
  'quota_full',
  'same_person',
  'family_match',
] as const satisfies readonly CommentReason[];
// the list holds every reason the API may name: one missing from it fails the typecheck
const everyReasonListed: Exclude<CommentReason, (typeof COMMENT_REASONS)[number]> extends never
  ? true
  : never = true;
void everyReasonListed;

/** The identity number an application's answers give, read from its answer, or null. */
export function identityNumberOf(a: OfficeApplication): string | null {
  const field = a.form.sections
    .flatMap((s) => s.fields)
    .find((f) => f.standardColumn === 'nid_or_birth_reg');
  const answer = field ? a.answers.find((x) => x.fieldKey === field.fieldKey) : undefined;
  const parsed = answer ? answerValueSchema.safeParse(answer.value) : undefined;
  const value = parsed?.success && 'v' in parsed.data ? parsed.data.v : undefined;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

/**
 * The filters the application list's API reads: the division and the upazila only narrow the
 * address picker on the page, the district and the union filter the rows.
 */
export function applicationListFilters(filters: FilterValues): FilterValues {
  const { divisionId: _division, upazilaId: _upazila, ...sent } = filters;
  return sent;
}

export function applicationPage(
  projectId: string,
  filters: FilterValues,
  q: string,
  page: number,
  cursor: string | null,
) {
  const sent = applicationListFilters(filters);
  return api<OfficeApplicationPage>(
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
  api<OfficeApplicationRecord>(`/applications/${id}`, { envelope: true });

export const officeTimeline = (id: string) =>
  api<OfficeTimelineEntry[]>(`/applications/${id}/timeline`);

export const changeLog = (id: string) =>
  api<FieldChange[]>(`/applications/${id}/changes${listQuery({ limit: '50' })}`);

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
  api<OfficeApplicationRecord>(`/applications/${id}/actions/${action}`, {
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
  api<PulledApplication>(`/projects/${projectId}/waitlist/pull-next`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
    envelope: true,
  });

/** The comment reasons a refused decision names, when the server asked for a comment. */
export const askedComments = (error: unknown): CommentReason[] | null =>
  error instanceof ApiFailure && error.code === 'workflow.comment_required'
    ? error.details
        .map((d) => d.path)
        .filter(
          (p): p is CommentReason =>
            p !== undefined && (COMMENT_REASONS as readonly string[]).includes(p),
        )
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

/** The most applications a bulk action takes when the official chooses the whole list. */
export const SELECT_ALL_MAX = 1000;

/**
 * Every row of the list the filters and the search give, read by cursor a hundred at a time, at
 * most `max`: the rows a bulk action over the whole list sends, each with its own version.
 */
export async function allApplicationRows(
  projectId: string,
  filters: FilterValues,
  q: string,
  max = SELECT_ALL_MAX,
): Promise<ApplicationSummary[]> {
  const rows: ApplicationSummary[] = [];
  let cursor: string | null = null;
  do {
    const page: OfficeApplicationPage = await api<OfficeApplicationPage>(
      `/projects/${projectId}/applications${listQuery({
        // the order does not matter to a bulk action, and only the default order reads by cursor
        ...applicationListFilters({ ...filters, sort: undefined }),
        q: q || undefined,
        ...(cursor ? { cursor } : {}),
        limit: '100',
      })}`,
      { envelope: true },
    );
    rows.push(...page.data);
    cursor = page.meta.nextCursor ?? null;
  } while (cursor && rows.length < max);
  return rows.slice(0, max);
}

/** One answer of the review checklist, with the version the page read. */
export const answerReviewCheck = (
  id: string,
  etag: string,
  itemCode: string,
  body: { result: 'ok' } | { result: 'problem'; comment: string },
) =>
  api<OfficeApplicationRecord>(`/applications/${id}/review-checks/${itemCode}`, {
    method: 'PUT',
    body,
    headers: { 'If-Match': etag },
    envelope: true,
  });

export const saveAnswers = (id: string, etag: string, answers: Answer[]) =>
  api<OfficeApplicationRecord>(`/applications/${id}`, {
    method: 'PATCH',
    body: { answers },
    headers: { 'If-Match': etag },
    envelope: true,
  });

/** The review screen's bulk action; the key makes a repeat of the request answer the same results. */
export const bulkReview = (
  projectId: string,
  key: string,
  body: {
    action: 'send_for_approval' | 'approve';
    rows: { clientUuid: string; applicationId: string; ifMatch: string }[];
    /** One comment for every row's decision. */
    comment?: string;
  },
) =>
  api<BulkReview>(`/projects/${projectId}/bulk/review`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
  });
