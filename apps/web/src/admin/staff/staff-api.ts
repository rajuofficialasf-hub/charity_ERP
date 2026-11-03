import type {
  Affiliation,
  InvitationIssued,
  StaffCreateRequest,
  StaffProfileRequest,
  UserState,
} from '@css/shared/auth';
import { api } from '../../lib/api';

/** An official as the user list returns it (GET /users; DECISION_LOG D-097). */
export interface StaffMember {
  id: string;
  displayName: string;
  kind: 'staff' | 'volunteer';
  state: UserState;
  designation: string | null;
  roles: string[];
  jobId: string | null;
  affiliation: Affiliation | null;
  affiliationUnit: string | null;
  homeProgramId: string | null;
  homeDivisionId: string | null;
  supervisorUserId: string | null;
  /** Created by the admin and the set-password link not used yet. */
  awaitingPassword: boolean;
  /** The official's uploaded photo; null shows the initial. */
  photoFileId: string | null;
}

export interface StaffPage {
  data: StaffMember[];
  meta: { nextCursor: string | null };
}

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
  api<StaffPage & { meta: { total?: number } }>(
    `/users?kind=staff&affiliation=${affiliation}&limit=1&include=total`,
    { envelope: true },
  ).then((page) => page.meta.total ?? page.data.length);

/** The official and its version, read when the profile edit opens (If-Match). */
export const staffWithEtag = (userId: string) =>
  api<{ data: StaffMember; meta: { etag: string } }>(`/users/${userId}`, { envelope: true });

/** GET /users/{userId} as the official's profile reads it: the contact and the last sign-in too. */
export interface StaffDetail extends StaffMember {
  mobile: string | null;
  email: string | null;
  lastLoginAt: string | null;
  isSystemOwner: boolean;
}

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
    `/users?kind=staff&affiliation=department&state=active&limit=20&q=${encodeURIComponent(text)}`,
  );

/** One official in the organogram with those who report to them inside the same part. */
export interface OrganogramNode {
  userId: string;
  displayName: string;
  jobId: string | null;
  designation: string | null;
  roles: string[];
  state: 'pending' | 'active' | 'blocked';
  homeDivisionId: string | null;
  /** The official's uploaded photo; null shows the initial. */
  photoFileId: string | null;
  reports: OrganogramNode[];
}

/** GET /organogram: the department's own staff by program and supervisor (BR-263). */
export interface Organogram {
  leadership: OrganogramNode[];
  programs: {
    programId: string;
    code: string;
    name: { bn: string; en: string };
    active: boolean;
    members: OrganogramNode[];
  }[];
  unplaced: OrganogramNode[];
}

export const organogram = () => api<Organogram>('/organogram');
