import type { Answer } from '@css/shared/forms';
import { api } from '../../api/client';
import type {
  Application,
  ApplicationForm,
  ApplicationPage,
  ApplicationRecord,
  ApplicationSummary,
  TimelineEntry,
  Unlock,
} from '../../api/schemas';

export type { Application, ApplicationForm, ApplicationSummary, TimelineEntry, Unlock };

/** The new value of an open answer; the server checks it like any answer of its question. */
export const fillUnlock = (unlockId: string, value: unknown) =>
  api<Unlock>(`/application-unlocks/${unlockId}/value`, { method: 'PUT', body: { value } });

export const MY_APPLICATIONS_KEY = ['me', 'applications'] as const;
export const applicationKey = (id: string) => ['applications', id] as const;

/** The project's published application form for the caller. */
export const applicationForm = (projectId: string) =>
  api<ApplicationForm>(`/projects/${projectId}/application-form`);

/** The caller's own applications, by state (comma-separated). */
export const myApplications = (status: string, limit = 50) =>
  api<ApplicationPage>(
    `/me/applications?status=${encodeURIComponent(status)}&limit=${limit}&include=total`,
    { envelope: true },
  );

/** The record with the version a write carries back in If-Match. */
export const application = (id: string) =>
  api<ApplicationRecord>(`/applications/${id}`, { envelope: true });

export const createApplication = (
  projectId: string,
  body: { clientUuid: string; formVersionId: string; answers: Answer[] },
) =>
  api<ApplicationRecord>(`/projects/${projectId}/applications`, {
    method: 'POST',
    body: { ...body, projectId, clientCreatedAt: new Date().toISOString() },
    envelope: true,
  });

export const updateApplication = (id: string, etag: string, answers: Answer[]) =>
  api<ApplicationRecord>(`/applications/${id}`, {
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
  api<ApplicationRecord>(`/applications/${id}/actions/${action}`, {
    method: 'POST',
    body,
    headers: { 'If-Match': etag },
    envelope: true,
  });

export const timeline = (id: string) => api<TimelineEntry[]>(`/applications/${id}/timeline`);
