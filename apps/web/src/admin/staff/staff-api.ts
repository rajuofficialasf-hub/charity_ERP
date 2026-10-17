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

/** The official and its version, read when the profile edit opens (If-Match). */
export const staffWithEtag = (userId: string) =>
  api<{ data: StaffMember; meta: { etag: string } }>(`/users/${userId}`, { envelope: true });

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
