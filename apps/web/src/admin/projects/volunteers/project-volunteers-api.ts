import type {
  AssignmentCreate,
  AssignmentUpdate,
  CandidateFilter,
  PermissionSet,
} from '@css/shared/projects';
import type { VolunteerType } from '@css/shared/registration';
import { api } from '../../../lib/api';
import { listQuery } from '../../list-query';
import { PROJECTS_KEY } from '../projects-api';

/** An assignment as GET /projects/{id}/volunteers returns it. */
export interface Assignment {
  id: string;
  volunteerId: string;
  displayName: string;
  type: VolunteerType;
  regionLocationId: string;
  permissionSet: PermissionSet;
  isPaid: boolean;
  consentStatus: 'pending' | 'accepted';
  consentAt: string | null;
  applicationsCounted: number;
  assignedAt: string;
}

/** A volunteer the caller may assign: name, type and area only. */
export interface Candidate {
  volunteerId: string;
  displayName: string;
  type: VolunteerType;
  divisionId: string;
  districtId: string;
  upazilaId: string;
  unionId: string;
  defaultPermissionSet: PermissionSet | null;
}

interface PageMeta {
  nextCursor: string | null;
}

export const volunteersKey = (projectId: string) =>
  [...PROJECTS_KEY, 'volunteers', projectId] as const;

/** GET /projects/{id}/volunteers: the assignments in the caller's areas, page by page. */
export const assignments = (projectId: string, cursor: string | null) =>
  api<{ data: Assignment[]; meta: PageMeta }>(
    `/projects/${projectId}/volunteers${listQuery({ limit: '100', cursor: cursor ?? undefined })}`,
    { envelope: true },
  );

/** GET /projects/{id}/volunteer-candidates for the filters and a cursor. */
export const candidates = (projectId: string, filter: CandidateFilter, cursor: string | null) =>
  api<{ data: Candidate[]; meta: PageMeta }>(
    `/projects/${projectId}/volunteer-candidates${listQuery({
      ...filter,
      limit: '50',
      cursor: cursor ?? undefined,
    })}`,
    { envelope: true },
  );

export const assign = (projectId: string, body: AssignmentCreate) =>
  api<Assignment[]>(`/projects/${projectId}/volunteers`, { method: 'POST', body });

export const changeAssignment = (assignmentId: string, body: AssignmentUpdate) =>
  api<Assignment>(`/project-volunteers/${assignmentId}`, { method: 'PATCH', body });

export const endAssignment = (assignmentId: string, reason: string) =>
  api<void>(`/project-volunteers/${assignmentId}/end`, { method: 'POST', body: { reason } });

/** POST /projects/{id}/grants: the "if RPM grants" extras of a staff member on the project. */
export const setProjectGrants = (
  projectId: string,
  body: { userId: string; permissions: string[]; reason: string },
) => api<unknown>(`/projects/${projectId}/grants`, { method: 'POST', body });
