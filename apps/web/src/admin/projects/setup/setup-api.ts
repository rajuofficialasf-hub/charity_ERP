import type {
  AreaCreate,
  ComponentPatch,
  FundSources,
  ProjectRules,
  ProjectUpdate,
  StaffCreate,
  Syllabus,
} from '@css/shared/projects';
import { api } from '../../../lib/api';
import { type Project, PROJECTS_KEY } from '../projects-api';

export { projectWithEtag } from '../projects-api';

export const updateProject = (projectId: string, etag: string, body: ProjectUpdate) =>
  api<Project>(`/projects/${projectId}`, {
    method: 'PATCH',
    body,
    headers: { 'If-Match': etag },
  });

export interface ProjectComponent {
  componentKey: string;
  enabled: boolean;
  settings?: Record<string, unknown>;
  etag?: string;
}
export const components = (projectId: string) =>
  api<ProjectComponent[]>(`/projects/${projectId}/components`);
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

export interface FundSource {
  source: 'zakat' | 'sadaqah' | 'general' | 'donor';
  label: string | null;
  amount: string;
}
export const fundSources = (projectId: string) =>
  api<FundSource[]>(`/projects/${projectId}/fund-sources`);
export const saveFundSources = (projectId: string, body: FundSources) =>
  api<FundSource[]>(`/projects/${projectId}/fund-sources`, { method: 'PATCH', body });

export interface Area {
  id: string;
  locationId: string;
  level: 'division' | 'district';
  locationName: { bn: string; en: string };
  rpmUserId: string;
  rpmName: string;
}
export const areas = (projectId: string) => api<Area[]>(`/projects/${projectId}/areas`);
export const addArea = (projectId: string, body: AreaCreate) =>
  api<Area[]>(`/projects/${projectId}/areas`, { method: 'POST', body });
export const removeArea = (areaId: string) =>
  api<void>(`/project-areas/${areaId}/remove`, { method: 'POST', body: {} });

export interface StaffAccess {
  id: string;
  userId: string;
  displayName: string;
  roleKey: string;
  areaLocationId: string | null;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
}
/** GET /projects/{id}/candidates: officials with a role, by name, for an area or staff access. */
export const candidates = async (projectId: string, role: string, q: string) =>
  (
    await api<{ id: string; displayName: string; designation: string | null }[]>(
      `/projects/${projectId}/candidates?role=${role}&q=${encodeURIComponent(q)}`,
    )
  ).map((c) => ({ ...c, roles: [role] }));

export const staff = (projectId: string) => api<StaffAccess[]>(`/projects/${projectId}/staff`);
export const addStaff = (projectId: string, body: StaffCreate) =>
  api<StaffAccess[]>(`/projects/${projectId}/staff`, { method: 'POST', body });
export const endStaff = (assignmentId: string, reason: string) =>
  api<void>(`/project-staff/${assignmentId}/end`, { method: 'POST', body: { reason } });

export interface Topic {
  id: string;
  title: { bn: string; en: string };
}
export const syllabus = (projectId: string) => api<Topic[]>(`/projects/${projectId}/syllabus`);

/** The four rules texts of a project and their version (0 while none is saved). */
export interface RulesVersion {
  version: number;
  rules: ProjectRules;
}
export const rules = (projectId: string) => api<RulesVersion>(`/projects/${projectId}/rules`);
export const saveSyllabus = (projectId: string, body: Syllabus) =>
  api<Topic[]>(`/projects/${projectId}/syllabus`, { method: 'PUT', body });

/** The query keys of one project's setup parts. */
export const setupKey = (projectId: string, part: string) => [
  ...PROJECTS_KEY,
  'setup',
  projectId,
  part,
];
