import type { Answer, FormDefinition } from '@css/shared/forms';
import { api } from '../../lib/api';

/** A row of a list (the API's `ApplicationSummary`). */
export interface ApplicationSummary {
  id: string;
  appNo: string | null;
  projectId: string;
  beneficiaryId: string | null;
  beneficiaryName: string | null;
  ownerVolunteerId: string | null;
  status: string;
  stage: string | null;
  outcome: string | null;
  flags: string[];
  districtId: string;
  unionId: string;
  submittedAt: string | null;
  waitingDays: number | null;
  /** The priority score, for the office only; none when the form gives no points. */
  totalScore?: number | null;
  etag: string;
}

/** The form version the answers belong to, as the caller's audience sees it. */
export interface ApplicationForm extends FormDefinition {
  id: string;
  formId: string;
  versionNo: number;
  status: string;
  publishedAt: string | null;
}

/** The record (the API's `Application`), as a volunteer reads it. */
export interface Application extends ApplicationSummary {
  formVersionId: string;
  createdByUserId: string | null;
  identityKind: 'nid' | 'birth_reg' | null;
  rejectionMessage: string | null;
  answers: Answer[];
  reviewedAt: string | null;
  approvedAt: string | null;
  familyDuplicateWarnings: unknown[];
  availableActions: string[];
  form: ApplicationForm;
}

export interface TimelineEntry {
  id: string;
  at: string;
  action: string;
  from: string | null;
  to: string;
  automatic: boolean;
  message: string | null;
}

interface Page<T> {
  data: T[];
  meta: { nextCursor?: string | null; total?: number };
}
interface Record<T> {
  data: T;
  meta: { etag?: string };
}

export const MY_APPLICATIONS_KEY = ['me', 'applications'] as const;
export const applicationKey = (id: string) => ['applications', id] as const;

/** The project's published application form for the caller. */
export const applicationForm = (projectId: string) =>
  api<ApplicationForm>(`/projects/${projectId}/application-form`);

/** The caller's own applications, by state (comma-separated). */
export const myApplications = (status: string, limit = 50) =>
  api<Page<ApplicationSummary>>(
    `/me/applications?status=${encodeURIComponent(status)}&limit=${limit}&include=total`,
    { envelope: true },
  );

/** The record with the version a write carries back in If-Match. */
export const application = (id: string) =>
  api<Record<Application>>(`/applications/${id}`, { envelope: true });

export const createApplication = (
  projectId: string,
  body: { clientUuid: string; formVersionId: string; answers: Answer[] },
) =>
  api<Record<Application>>(`/projects/${projectId}/applications`, {
    method: 'POST',
    body: { ...body, projectId, clientCreatedAt: new Date().toISOString() },
    envelope: true,
  });

export const updateApplication = (id: string, etag: string, answers: Answer[]) =>
  api<Record<Application>>(`/applications/${id}`, {
    method: 'PATCH',
    body: { answers },
    headers: { 'If-Match': etag },
    envelope: true,
  });

/** A workflow action with the version the caller last read. */
export const actOn = (
  id: string,
  etag: string,
  action: 'submit' | 'delete',
  body: { reason?: string; message?: string } = {},
) =>
  api<Record<Application>>(`/applications/${id}/actions/${action}`, {
    method: 'POST',
    body,
    headers: { 'If-Match': etag },
    envelope: true,
  });

export const timeline = (id: string) => api<TimelineEntry[]>(`/applications/${id}/timeline`);
