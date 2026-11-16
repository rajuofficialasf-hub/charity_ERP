import { PROJECT_STATUSES, type ProjectCreate, type ProjectStatus } from '@css/shared/projects';
import { api } from '../../api/client';
import type { Project, ProjectPage, ProjectRecord } from '../../api/schemas';

export type { Project };
import { listQuery } from '../list-query';

/** The keys of the filters the project list keeps in the page URL. */
export const FILTER_KEYS = ['programId', 'seriesId', 'year', 'status', 'endingSoon'] as const;
export type FilterValues = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/**
 * What the programs and projects tab keeps in its address: the view (`view=list`) and the
 * filters of the list. An address with any list filter opens the list, as the links of the home's
 * attention items and of the notifications carry one.
 */
export const LIST_KEYS = [...FILTER_KEYS, 'view'] as const;
export const opensList = (params: URLSearchParams) =>
  params.get('view') === 'list' || FILTER_KEYS.some((key) => params.has(key));

/** The list filters of the tab's address, the view left out. */
export const listFiltersOf = (
  values: Partial<Record<(typeof LIST_KEYS)[number], string>>,
): FilterValues =>
  Object.fromEntries(FILTER_KEYS.flatMap((key) => (values[key] ? [[key, values[key]]] : [])));

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

/** What the setup's first step asks for a new project. */
export interface NewProject {
  programId: string;
  code: string;
  year: number;
  name: { bn: string; en: string };
  source: ProjectCreate['source'];
}

/** The series made for a first step whose session was then refused, by program and code. */
const madeSeries = new Map<string, string>();

/**
 * Creates a project as the setup's first step asks for it: the project series (program, code and
 * names), then its first session for the whole of the year. A series whose session was refused is
 * kept for the next try of the same step, so the code is not taken by the try before.
 */
export async function createProject(body: NewProject): Promise<Project> {
  const key = `${body.programId}:${body.code}`;
  const seriesId =
    madeSeries.get(key) ??
    (
      await api<{ id: string }>('/project-series', {
        method: 'POST',
        body: { programId: body.programId, code: body.code, name: body.name },
      })
    ).id;
  madeSeries.set(key, seriesId);
  const session: ProjectCreate = {
    seriesId,
    periodFrom: `${body.year}-01`,
    periodTo: `${body.year}-12`,
    source: body.source,
  };
  const project = await api<Project>('/projects', { method: 'POST', body: session });
  madeSeries.delete(key);
  return project;
}

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
