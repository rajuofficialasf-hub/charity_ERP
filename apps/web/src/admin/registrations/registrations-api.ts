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

/** One page of a list of this page, with its cursor and, on the first page, its count. */
export interface ListPage<T> {
  data: T[];
  meta: { nextCursor: string | null; total?: number | '10000+' };
}
/** Rows per page of the lists of this page. */
export const LIST_PAGE = 50;
/** The cursor of a later page, or the count asked for with the first one. */
const pageOf = (cursor: string | null) =>
  `limit=${LIST_PAGE}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : '&include=total'}`;

/**
 * The pending staff registrations, page by page. Volunteer registrations are reviewed in the
 * volunteer tab; a staff registration has no correction step.
 */
export const pendingStaffRegistrations = (cursor: string | null) =>
  api<ListPage<PendingRegistration>>(`/registrations?kind=staff&${pageOf(cursor)}`, {
    envelope: true,
  });
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
export const editRequests = (cursor: string | null) =>
  api<ListPage<EditRequestRow>>(`/edit-requests?${pageOf(cursor)}`, { envelope: true });
export const decideEdit = (
  id: string,
  body: { decision: 'approve' } | { decision: 'reject'; reason: string },
) => api<ChangeRequest>(`/edit-requests/${id}/decision`, { method: 'POST', body });
export const roles = () => api<RoleInfo[]>('/roles');

export const STAFF_EDITS_KEY = ['admin', 'staff-edit-requests'] as const;
export const staffEditRequests = (cursor: string | null) =>
  api<ListPage<StaffEditRequestRow>>(`/staff-edit-requests?${pageOf(cursor)}`, {
    envelope: true,
  });
export const decideStaffEdit = (
  id: string,
  body: { decision: 'approve' } | { decision: 'reject'; reason: string },
) => api<ChangeRequest>(`/staff-edit-requests/${id}/decision`, { method: 'POST', body });
