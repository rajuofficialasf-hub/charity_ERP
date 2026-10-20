import type { VolunteerFilter, VolunteerRow, VolunteerStatistics } from '@css/shared/volunteers';
import type { DeviceSession } from '@css/shared/auth';
import type { VolunteerType } from '@css/shared/registration';
import { api } from '../../lib/api';
import { listQuery } from '../list-query';

/** The keys of the filters the volunteer tab keeps in the page URL (the search stays out). */
export const FILTER_KEYS = [
  'divisionId',
  'districtId',
  'upazilaId',
  'unionId',
  'type',
  'state',
  'projectId',
  'category',
  'blocked',
] as const satisfies readonly (keyof VolunteerFilter)[];

export type FilterValues = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

interface PageMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  total?: number | '10000+';
}

/** GET /volunteers: one page of the tab for the filters, the search and a cursor. */
export function volunteerPage(filters: FilterValues, q: string, cursor: string | null) {
  return api<{ data: VolunteerRow[]; meta: PageMeta }>(
    `/volunteers${listQuery({ ...filters, q: q || undefined, cursor: cursor ?? undefined, include: 'total' })}`,
    { envelope: true },
  );
}

/** GET /volunteers/statistics for the same filters and search. */
export function volunteerStatistics(filters: FilterValues, q: string) {
  return api<VolunteerStatistics>(
    `/volunteers/statistics${listQuery({ ...filters, q: q || undefined })}`,
  );
}

export const VOLUNTEERS_KEY = ['admin', 'volunteers'] as const;

/** GET /volunteers/{volunteerId}: the official view; protected parts are absent, not empty. */
export interface VolunteerProfile {
  id: string;
  userId: string;
  displayName: string;
  type: VolunteerType;
  state: 'pending' | 'active' | 'blocked' | 'deactivated';
  mobile: string | null;
  email: string | null;
  whatsapp: string | null;
  fatherName: string;
  motherName: string;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId: string;
  addressLine: string | null;
  facebookId: string | null;
  education: string | null;
  experience: string | null;
  workDescription: string | null;
  previousProjects: string | null;
  tshirtSize: string | null;
  volunteeringArea: string | null;
  profession: string | null;
  professionDetails: Record<string, unknown>;
  interestAreas: string[];
  vehicle: string | null;
  canSwim: boolean | null;
  availability: string | null;
  emergencyFullTime: boolean | null;
  educationDetails: Record<string, unknown>;
  permanentAddress: Record<string, unknown> | null;
  bloodGroup?: string | null;
  dateOfBirth?: string | null;
  nid?: string;
  nidPhotoFileId?: string | null;
  nidPhotoBackFileId?: string | null;
  bank?: Partial<
    Record<'bankName' | 'accountName' | 'accountNumber' | 'branchName' | 'routingNumber', string>
  >;
  photoFileId: string | null;
  registeredAt: string;
  approvedAt: string | null;
  projects: {
    id: string;
    code: string;
    nameBn: string;
    nameEn: string;
    year: number;
    permissionSet: string;
    isPaid: boolean;
    assignedAt: string;
  }[];
  team: { id: string; displayName: string; type: string; state: string }[];
  category?: 'A' | 'B' | 'C' | 'D' | null;
  inactiveFlag?: boolean;
  ratings?: { projectId: string; workKind: string; finalScores: unknown; finalizedAt: string }[];
  blocklist: { blocked: boolean; blockedAt?: string; reason?: string };
  actions: {
    /** The caller decides on this pending registration (a correction may hold it now). */
    review: boolean;
    approve: boolean;
    requestCorrection: boolean;
    block: boolean;
    unblock: boolean;
    viewSessions: boolean;
    revokeSessions: boolean;
  };
}

export const volunteerProfile = (volunteerId: string) =>
  api<VolunteerProfile>(`/volunteers/${volunteerId}`);
export const profileKey = (volunteerId: string) => [...VOLUNTEERS_KEY, 'profile', volunteerId];

/** GET /users/{userId}/sessions and the revoke with its reason (`session.revoke_user`). */
export const userSessions = (userId: string) => api<DeviceSession[]>(`/users/${userId}/sessions`);
export const revokeUserSession = (userId: string, sessionId: string, reason: string) =>
  api<void>(`/users/${userId}/sessions/${sessionId}/revoke`, {
    method: 'POST',
    body: { reason },
  });
