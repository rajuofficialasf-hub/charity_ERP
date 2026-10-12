import type { CorrectionField } from '@css/shared/registration';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { ChangeRequest } from '../../features/account/profile-api';
import { locations } from '../../features/registration/registration-api';

/** A row of GET /registrations (pending volunteers in scope, staff for staff approvers). */
export interface PendingRegistration {
  userId: string;
  kind: 'volunteer' | 'staff';
  displayName: string;
  status: 'awaiting_review' | 'in_correction';
  submittedAt: string;
  volunteerType: string | null;
  divisionId: string | null;
  districtId: string | null;
  designation: string | null;
}

type Bank = Record<'bankName' | 'accountName' | 'accountNumber' | 'routingNumber', string | null>;

/**
 * GET /registrations/{userId}. The NID, the NID photo and the bank details are absent (not empty)
 * when the approver's role may not see them (RBAC.md 6).
 */
export interface RegistrationDetailView extends PendingRegistration {
  mobile: string | null;
  email: string | null;
  photoFileId: string | null;
  homeProgramId: string | null;
  homeDivisionId: string | null;
  volunteer: {
    id: string;
    type: string;
    fatherName: string;
    motherName: string;
    whatsapp: string | null;
    divisionId: string;
    districtId: string;
    upazilaId: string;
    unionId: string;
    addressLine: string | null;
    education: string | null;
    experience: string | null;
    workDescription: string | null;
    previousProjects: string | null;
    facebookId: string | null;
    nid?: string;
    nidPhotoFileId?: string | null;
    bank?: Bank;
    photoFileId: string | null;
    referenceVolunteerId: string | null;
  } | null;
  blocklisted: boolean;
  corrections: ChangeRequest[];
}

/** An edit request as the approvers' list returns it, with the volunteer's name. */
export interface EditRequestRow extends ChangeRequest {
  volunteerName?: string;
}

export interface RoleInfo {
  key: string;
  name: { bn: string; en: string };
  kind: 'official' | 'volunteer';
  globalScope: boolean;
}

export const LIST_KEY = ['admin', 'registrations'] as const;
export const detailKey = (userId: string) => ['admin', 'registrations', userId] as const;
export const EDITS_KEY = ['admin', 'edit-requests'] as const;

export const pendingRegistrations = () => api<PendingRegistration[]>('/registrations?limit=100');
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

/**
 * The name of one location, read from its parent's public list (the cache the address cascade
 * of the registration form uses); `parentId` undefined means the divisions.
 */
export function useLocationName(parentId: string | null | undefined, id: string | null) {
  const enabled = parentId !== null && id !== null;
  const list = useQuery({
    queryKey: ['locations', parentId ?? 'divisions'],
    queryFn: () => locations(parentId ?? undefined),
    enabled,
    staleTime: 60 * 60_000,
  });
  return enabled ? list.data?.find((l) => l.id === id)?.name : undefined;
}
