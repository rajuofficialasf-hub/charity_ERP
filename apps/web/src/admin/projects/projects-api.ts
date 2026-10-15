import type { ProjectCreate, ProjectStatus, WorkflowKey } from '@css/shared/projects';
import { api } from '../../lib/api';
import { listQuery } from '../list-query';

/** A project as an official sees it (GET /projects, GET /projects/{id}). */
export interface Project {
  id: string;
  code: string;
  year: number;
  name: { bn: string; en: string };
  status: ProjectStatus;
  workflowKey: WorkflowKey;
  applyFrom: string | null;
  applyTo: string | null;
  perVolunteerLimit: number | null;
  dawahEnabled: boolean;
  programId?: string;
  description?: string | null;
  costPerBeneficiary?: string | null;
  targetBeneficiaries?: number | null;
  budgetPlanned?: string | null;
  activatedAt?: string | null;
  closedAt?: string | null;
}

/** The keys of the filters the project list keeps in the page URL. */
export const FILTER_KEYS = ['programId', 'year', 'status'] as const;
export type FilterValues = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

interface PageMeta {
  nextCursor: string | null;
  prevCursor: string | null;
  total?: number;
}

export const PROJECTS_KEY = ['admin', 'projects'] as const;

/** GET /projects: one page for the filters and a cursor. */
export const projectPage = (filters: FilterValues, cursor: string | null) =>
  api<{ data: Project[]; meta: PageMeta }>(
    `/projects${listQuery({ ...filters, cursor: cursor ?? undefined, include: 'total' })}`,
    { envelope: true },
  );

/** The projects a picker offers: the newest 100 the caller reaches, cancelled drafts left out. */
export const pickerProjects = () => api<Project[]>(`/projects${listQuery({ limit: '100' })}`);

export const project = (projectId: string) => api<Project>(`/projects/${projectId}`);

export const createProject = (body: ProjectCreate) =>
  api<Project>('/projects', { method: 'POST', body });
