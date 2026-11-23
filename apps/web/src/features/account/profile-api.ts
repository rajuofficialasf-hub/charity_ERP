import {
  type EditField,
  type PhotoSlot,
  REQUEST_FIELD_LABEL,
  type StaffEditField,
} from '@css/shared/registration';
import type { OwnStaffProfile, ProjectsWork } from '@css/shared/auth';
import { api } from '../../api/client';
import type { ChangeRequest, OwnProfile, StaffChoices, StoredFile } from '../../api/schemas';

export type { ChangeRequest, OwnProfile, StaffChoices };

export const PROFILE_KEY = ['volunteers', 'me'] as const;
export const REQUESTS_KEY = ['me', 'change-requests'] as const;

export const ownProfile = () => api<OwnProfile>('/volunteers/me');
export const ownRequests = () => api<ChangeRequest[]>('/me/change-requests');

export const answerRequest = (id: string, newValue: unknown) =>
  api<ChangeRequest>(`/me/change-requests/${id}`, { method: 'PATCH', body: { newValue } });

export const resubmit = () => api<void>('/me/registration/resubmit', { method: 'POST' });

/** One edit request of a detail, as the batch takes it. */
export type EditAsk = { field: string; newValue?: unknown; note?: string };
/** Several details at once, all or none, once per key (a retry of the same send repeats it). */
export const askEdits = (requests: EditAsk[], key: string) =>
  api<ChangeRequest[]>('/me/change-requests/batch', {
    method: 'POST',
    body: { requests },
    headers: { 'Idempotency-Key': key },
  });

export const sendContactCode = (id: string) =>
  api<void>(`/me/change-requests/${id}/otp`, { method: 'POST' });

export const verifyContactCode = (id: string, code: string) =>
  api<void>(`/me/change-requests/${id}/otp/verify`, { method: 'POST', body: { code } });

export const uploadOwnPhoto = async (requestId: string, slot: PhotoSlot, photo: Blob) =>
  api<StoredFile>(`/me/photos/${slot}?requestId=${requestId}&source=gallery`, {
    method: 'POST',
    rawBody: await photo.arrayBuffer(),
    headers: { 'Content-Type': photo.type },
  });

/** The catalogue label key of each field a request may name (registration namespace). */
export const FIELD_LABEL = REQUEST_FIELD_LABEL;
/** A field of a volunteer's request; an official's own fields are their profile's. */
export type RequestField = Exclude<
  keyof typeof FIELD_LABEL,
  Exclude<StaffEditField, EditField | PhotoSlot>
>;

/** An official's own profile and their projects with the figures of their work. */
export const STAFF_PROFILE_KEY = ['me', 'profile'] as const;
export const OWN_WORK_KEY = ['me', 'projects-work'] as const;
export const ownStaffProfile = () => api<OwnStaffProfile>('/me/profile');
export const ownProjectsWork = () => api<ProjectsWork>('/me/projects-work');
export const projectsWorkOf = (userId: string) =>
  api<ProjectsWork>(`/users/${userId}/projects-work`);

/** An official's own change request; the code routes are the official's own. */
/** An official's several details at once, all or none, once per key. */
export const askStaffEdits = (requests: EditAsk[], key: string) =>
  api<ChangeRequest[]>('/me/staff-change-requests/batch', {
    method: 'POST',
    body: { requests },
    headers: { 'Idempotency-Key': key },
  });
export const sendStaffContactCode = (id: string) =>
  api<void>(`/me/staff-change-requests/${id}/otp`, { method: 'POST' });
export const verifyStaffContactCode = (id: string, code: string) =>
  api<void>(`/me/staff-change-requests/${id}/otp/verify`, { method: 'POST', body: { code } });

export const STAFF_CHOICES_KEY = ['me', 'staff-change-requests', 'choices'] as const;
export const staffChoices = () => api<StaffChoices>('/me/staff-change-requests/choices');
