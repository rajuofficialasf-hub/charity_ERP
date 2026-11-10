import type { VolunteerFilter, VolunteerStatistics } from '@css/shared/volunteers';
import type { DeviceSession } from '@css/shared/auth';
import { api } from '../../api/client';
import type { VolunteerPage, VolunteerProfile } from '../../api/schemas';
import { listQuery } from '../list-query';
import { PAGE_SIZE, pageParams } from '../list-paging';

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

/** GET /volunteers: one page of the tab for the filters and the search, by number or cursor. */
export function volunteerPage(
  filters: FilterValues,
  q: string,
  page: number,
  cursor: string | null,
) {
  return api<VolunteerPage>(
    `/volunteers${listQuery({
      ...filters,
      q: q || undefined,
      ...pageParams(page, cursor),
      limit: String(PAGE_SIZE),
      include: 'total',
    })}`,
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

export type { VolunteerProfile };

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
