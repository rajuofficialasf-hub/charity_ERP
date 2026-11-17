import type { QueryClient } from '@tanstack/react-query';
import type {
  AreaCreate,
  ComponentPatch,
  FundSources,
  ProjectRules,
  ProjectUpdate,
  QuotaTargets,
  StaffCreate,
  Syllabus,
} from '@css/shared/projects';
import { api } from '../../../api/client';
import type {
  Area,
  FundSource,
  Project,
  ProjectComponent,
  ProjectFormView,
  Quota,
  RulesVersion,
  StaffAccess,
  StaffCandidate,
  Topic,
} from '../../../api/schemas';
import { PROJECTS_KEY } from '../projects-api';

export type { Area, FundSource, ProjectComponent, Quota, RulesVersion, StaffAccess, Topic };
/** A form of the project as the setup reads it: whether a version is published, and its kind. */
export type ProjectForm = ProjectFormView;

export { projectWithEtag } from '../projects-api';

export const updateProject = (projectId: string, etag: string, body: ProjectUpdate) =>
  api<Project>(`/projects/${projectId}`, {
    method: 'PATCH',
    body,
    headers: { 'If-Match': etag },
  });

export const components = (projectId: string) =>
  api<ProjectComponent[]>(`/projects/${projectId}/components`);

export const forms = (projectId: string) => api<ProjectForm[]>(`/projects/${projectId}/forms`);
export const updateComponent = (
  projectId: string,
  componentKey: string,
  etag: string,
  body: ComponentPatch,
) =>
  api<ProjectComponent>(`/projects/${projectId}/components/${componentKey}`, {
    method: 'PATCH',
    body,
    headers: { 'If-Match': etag },
  });

export const fundSources = (projectId: string) =>
  api<FundSource[]>(`/projects/${projectId}/fund-sources`);
export const saveFundSources = (projectId: string, body: FundSources) =>
  api<FundSource[]>(`/projects/${projectId}/fund-sources`, { method: 'PATCH', body });

export const areas = (projectId: string) => api<Area[]>(`/projects/${projectId}/areas`);
export const addArea = (projectId: string, body: AreaCreate) =>
  api<Area[]>(`/projects/${projectId}/areas`, { method: 'POST', body });
export const quotas = (projectId: string) => api<Quota[]>(`/projects/${projectId}/quotas`);
export const saveQuotas = (projectId: string, body: QuotaTargets) =>
  api<Quota[]>(`/projects/${projectId}/quotas`, { method: 'PATCH', body });
export const removeArea = (areaId: string) =>
  api<void>(`/project-areas/${areaId}/remove`, { method: 'POST', body: {} });

/** GET /projects/{id}/candidates: officials with a role, by name, for an area or staff access. */
export const candidates = async (projectId: string, role: string, q: string) =>
  (
    await api<StaffCandidate[]>(
      `/projects/${projectId}/candidates?role=${role}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    )
  ).map((c) => ({ ...c, roles: [role] }));

export const staff = (projectId: string) => api<StaffAccess[]>(`/projects/${projectId}/staff`);
export const addStaff = (projectId: string, body: StaffCreate) =>
  api<StaffAccess[]>(`/projects/${projectId}/staff`, { method: 'POST', body });
export const endStaff = (assignmentId: string, reason: string) =>
  api<void>(`/project-staff/${assignmentId}/end`, { method: 'POST', body: { reason } });

export const syllabus = (projectId: string) => api<Topic[]>(`/projects/${projectId}/syllabus`);

export const rules = (projectId: string) => api<RulesVersion>(`/projects/${projectId}/rules`);
export const saveRules = (projectId: string, body: ProjectRules) =>
  api<RulesVersion>(`/projects/${projectId}/rules`, { method: 'PUT', body });
export const saveSyllabus = (projectId: string, body: Syllabus) =>
  api<Topic[]>(`/projects/${projectId}/syllabus`, { method: 'PUT', body });

/** The query keys of one project's setup parts. */
/**
 * Puts a component the server answered a save with into the project's list at once, so a dialog
 * reopened before the list is read again shows what was saved and carries its new version.
 */
export function keepSavedComponent(
  queries: QueryClient,
  projectId: string,
  saved: ProjectComponent,
): void {
  queries.setQueryData<ProjectComponent[]>(setupKey(projectId, 'components'), (list) =>
    list?.map((c) => (c.componentKey === saved.componentKey ? saved : c)),
  );
}

export const setupKey = (projectId: string, part: string) => [
  ...PROJECTS_KEY,
  'setup',
  projectId,
  part,
];
