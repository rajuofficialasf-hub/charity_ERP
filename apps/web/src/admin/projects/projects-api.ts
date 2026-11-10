import { PROJECT_STATUSES, type ProjectCreate, type ProjectStatus } from '@css/shared/projects';
import { api } from '../../api/client';
import type { Project, ProjectPage, ProjectRecord } from '../../api/schemas';

export type { Project };
import { listQuery } from '../list-query';

/** The keys of the filters the project list keeps in the page URL. */
export const FILTER_KEYS = ['programId', 'year', 'status', 'endingSoon'] as const;
export type FilterValues = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

export const PROJECTS_KEY = ['admin', 'projects'] as const;

/** GET /projects: one page for the filters and a cursor. */
export const projectPage = (filters: FilterValues, cursor: string | null) =>
  api<ProjectPage>(
    `/projects${listQuery({ ...filters, cursor: cursor ?? undefined, include: 'total' })}`,
    { envelope: true },
  );

/** A count card of the list: every project (cancelled drafts left out, as in the list) or one state. */
export type CountKey = 'all' | ProjectStatus;

/**
 * The number of projects per state for the program, year and window filters, the chosen state left
 * out so each card keeps its number; each count is read as a page of one row with its total.
 */
export const projectCounts = (filters: FilterValues): Promise<{ key: CountKey; total: number }[]> =>
  Promise.all(
    (['all', ...PROJECT_STATUSES] as const).map((key) =>
      api<ProjectPage>(
        `/projects${listQuery({
          ...filters,
          status: key === 'all' ? undefined : key,
          limit: '1',
          include: 'total',
        })}`,
        { envelope: true },
      ).then((page) => ({ key, total: page.meta.total ?? page.data.length })),
    ),
  );

/** The projects a picker offers: the newest 100 the caller reaches, cancelled drafts left out. */
export const pickerProjects = () => api<Project[]>(`/projects${listQuery({ limit: '100' })}`);

export const project = (projectId: string) => api<Project>(`/projects/${projectId}`);

export const createProject = (body: ProjectCreate) =>
  api<Project>('/projects', { method: 'POST', body });

/** The project with its version, for the If-Match of a write. */
export const projectWithEtag = (projectId: string) =>
  api<ProjectRecord>(`/projects/${projectId}`, { envelope: true });

/** The lifecycle moves (POST /projects/{id}/<action>), each with the project's version. */
export type LifecycleAction = 'activate' | 'extend-deadline' | 'start-closing' | 'close' | 'reopen';
export const moveProject = (
  projectId: string,
  action: LifecycleAction,
  etag: string,
  body?: { reason: string; newApplyTo?: string },
) =>
  api<Project>(`/projects/${projectId}/${action}`, {
    method: 'POST',
    // activation takes no body
    ...(body ? { body } : {}),
    headers: { 'If-Match': etag },
  });

/** A draft that was never activated is cancelled with a reason. */
export const cancelProject = (projectId: string, reason: string) =>
  api<Project>(`/projects/${projectId}/cancel`, { method: 'POST', body: { reason } });
