import type { AssignmentCreate, AssignmentUpdate, CandidateFilter } from '@css/shared/projects';
import { api } from '../../../api/client';
import type {
  Assignment,
  AssignmentPage,
  VolunteerCandidate as Candidate,
  VolunteerCandidatePage,
} from '../../../api/schemas';

export type { Assignment, Candidate };
import { listQuery } from '../../list-query';
import { PROJECTS_KEY } from '../projects-api';

export const volunteersKey = (projectId: string) =>
  [...PROJECTS_KEY, 'volunteers', projectId] as const;

/** GET /projects/{id}/volunteers: the assignments in the caller's areas, page by page. */
export const assignments = (projectId: string, cursor: string | null) =>
  api<AssignmentPage>(
    `/projects/${projectId}/volunteers${listQuery({ limit: '100', cursor: cursor ?? undefined })}`,
    { envelope: true },
  );

/** GET /projects/{id}/volunteer-candidates for the filters and a cursor. */
export const candidates = (projectId: string, filter: CandidateFilter, cursor: string | null) =>
  api<VolunteerCandidatePage>(
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
