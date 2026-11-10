import type { CorrectionField } from '@css/shared/registration';
import { api } from '../../api/client';
import type {
  ChangeRequest,
  EditRequestRow,
  PendingRegistration,
  RegistrationDetailView,
  RoleInfo,
  StaffEditRequestRow,
} from '../../api/schemas';

export type {
  EditRequestRow,
  PendingRegistration,
  RegistrationDetailView,
  RoleInfo,
  StaffEditRequestRow,
};

export const LIST_KEY = ['admin', 'registrations'] as const;
export const detailKey = (userId: string) => ['admin', 'registrations', userId] as const;
export const EDITS_KEY = ['admin', 'edit-requests'] as const;

/**
 * The pending staff registrations (the first 100). Volunteer registrations are reviewed in the
 * volunteer tab; a staff registration has no correction step.
 */
export const pendingStaffRegistrations = () =>
  api<PendingRegistration[]>('/registrations?limit=100&kind=staff');
export const registrationDetail = (userId: string) =>
  api<RegistrationDetailView>(`/registrations/${userId}`);
export const approve = (userId: string) =>
  api<unknown>(`/registrations/${userId}/approve`, { method: 'POST' });
export const reject = (userId: string, reason: string) =>
  api<void>(`/registrations/${userId}/reject`, { method: 'POST', body: { reason } });
export const requestCorrections = (userId: string, fields: CorrectionField[], note: string) =>
  api<ChangeRequest[]>(`/registrations/${userId}/correction-requests`, {
    method: 'POST',
    body: { fields, note },
  });
export const decideStaff = (
  userId: string,
  body: { decision: 'approve'; roleKey: string } | { decision: 'reject'; reason: string },
) => api<unknown>(`/staff-registrations/${userId}/decision`, { method: 'POST', body });
export const block = (volunteerId: string, reason: string) =>
  api<unknown>(`/volunteers/${volunteerId}/block`, { method: 'POST', body: { reason } });
export const unblock = (volunteerId: string, reason: string) =>
  api<unknown>(`/volunteers/${volunteerId}/unblock`, { method: 'POST', body: { reason } });
export const editRequests = () => api<EditRequestRow[]>('/edit-requests?limit=100');
export const decideEdit = (
  id: string,
  body: { decision: 'approve' } | { decision: 'reject'; reason: string },
) => api<ChangeRequest>(`/edit-requests/${id}/decision`, { method: 'POST', body });
export const roles = () => api<RoleInfo[]>('/roles');

export const STAFF_EDITS_KEY = ['admin', 'staff-edit-requests'] as const;
export const staffEditRequests = () => api<StaffEditRequestRow[]>('/staff-edit-requests?limit=100');
export const decideStaffEdit = (
  id: string,
  body: { decision: 'approve' } | { decision: 'reject'; reason: string },
) => api<ChangeRequest>(`/staff-edit-requests/${id}/decision`, { method: 'POST', body });
