import type {
  Affiliation,
  InvitationIssued,
  StaffCreateRequest,
  StaffProfileRequest,
} from '@css/shared/auth';
import type { ExtraAreaRequest, RoleChangeRequest } from '@css/shared/access';
import { api } from '../../api/client';
import type {
  ExtraArea,
  Organogram,
  RoleHistoryRow,
  OrganogramNode,
  StaffDetail,
  StaffMember,
  StaffPage,
  StaffRecord,
} from '../../api/schemas';

export type {
  ExtraArea,
  Organogram,
  OrganogramNode,
  RoleHistoryRow,
  StaffDetail,
  StaffMember,
  StaffPage,
};

export const STAFF_KEY = ['admin', 'staff'] as const;

export interface StaffQuery {
  affiliation: Affiliation;
  programId?: string | null;
  role?: string | null;
  q?: string;
  cursor?: string | null;
}

/** One page of the officials of an affiliation, with the filters of the directory. */
export function staffPage(query: StaffQuery) {
  const params = new URLSearchParams({
    kind: 'staff',
    affiliation: query.affiliation,
    limit: '50',
  });
  if (query.programId) params.set('programId', query.programId);
  if (query.role) params.set('role', query.role);
  if (query.q && query.q.trim().length >= 2) params.set('q', query.q.trim().slice(0, 100));
  if (query.cursor) params.set('cursor', query.cursor);
  return api<StaffPage>(`/users?${params.toString()}`, { envelope: true });
}

/** How many officials an affiliation has in the caller's scope (the counts above the tabs). */
export const staffCount = (affiliation: Affiliation) =>
  api<StaffPage>(`/users?kind=staff&affiliation=${affiliation}&limit=1&include=total`, {
    envelope: true,
  }).then((page) => page.meta.total ?? page.data.length);

/** The official and its version, read when the profile edit opens (If-Match). */
export const staffWithEtag = (userId: string) =>
  api<StaffRecord>(`/users/${userId}`, { envelope: true });

export const staffDetail = (userId: string) => api<StaffDetail>(`/users/${userId}`);
export const staffDetailKey = (userId: string) => [...STAFF_KEY, 'detail', userId] as const;

export const createOfficial = (body: StaffCreateRequest) =>
  api<InvitationIssued>('/users', { method: 'POST', body });

/** A new set-password link, to a corrected email when one is given. */
export const renewLink = (userId: string, email?: string) =>
  api<InvitationIssued>(`/users/${userId}/invitation`, {
    method: 'POST',
    body: email ? { email } : {},
  });

export const updateProfile = (userId: string, etag: string, body: StaffProfileRequest) =>
  api<StaffMember>(`/users/${userId}/profile`, {
    method: 'PUT',
    body,
    headers: { 'If-Match': etag },
  });

/** Active department officials for the supervisor search. */
export const findSupervisors = (text: string) =>
  api<StaffMember[]>(
    `/users?kind=staff&affiliation=department&state=active&limit=50${text ? `&q=${encodeURIComponent(text)}` : ''}`,
  );

export const organogram = () => api<Organogram>('/organogram');

export const roleHistoryKey = (userId: string) => [...STAFF_KEY, 'roles', userId] as const;
/** The roles a person holds or held, the newest first, with who gave and who ended each. */
export const roleHistory = (userId: string) => api<RoleHistoryRow[]>(`/users/${userId}/roles`);
/** Another role in place of the present one, with the version read when the dialog opened. */
export const changeRole = (userId: string, etag: string, body: RoleChangeRequest) =>
  api<StaffDetail>(`/users/${userId}/role`, {
    method: 'POST',
    body,
    headers: { 'If-Match': etag },
  });

export const extraAreasKey = (userId: string) => [...STAFF_KEY, 'extra-areas', userId] as const;
/** The extra areas an official holds or held for volunteers, the live ones first. */
export const extraAreas = (userId: string) => api<ExtraArea[]>(`/users/${userId}/extra-areas`);
/** A division, a district or the whole country, with the reason. */
export const giveExtraArea = (userId: string, body: ExtraAreaRequest) =>
  api<ExtraArea[]>(`/users/${userId}/extra-areas`, { method: 'POST', body });
export const endExtraArea = (userId: string, areaId: string, reason: string) =>
  api<ExtraArea[]>(`/users/${userId}/extra-areas/${areaId}/end`, {
    method: 'POST',
    body: { reason },
  });
