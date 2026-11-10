import type { Consent } from '@css/shared/projects';
import { api } from '../../api/client';
import type { MyProject, MyProjectDetail, Team, TeamMember } from '../../api/schemas';

export type { MyProject, MyProjectDetail, Team, TeamMember };

export const MY_PROJECTS_KEY = ['me', 'projects'] as const;

export const myProjects = () => api<MyProject[]>('/me/projects');
export const myProject = (projectId: string) => api<MyProjectDetail>(`/me/projects/${projectId}`);
export const consent = (projectId: string, body: Consent) =>
  api<MyProject>(`/me/projects/${projectId}/consent`, { method: 'POST', body });

export const team = (projectId: string) => api<Team>(`/me/projects/${projectId}/team`);
export const addToTeam = (projectId: string, memberVolunteerIds: string[]) =>
  api<Team>(`/me/projects/${projectId}/team`, { method: 'POST', body: { memberVolunteerIds } });
export const removeFromTeam = (projectId: string, volunteerId: string) =>
  api<void>(`/me/projects/${projectId}/team/${volunteerId}/remove`, { method: 'POST' });
