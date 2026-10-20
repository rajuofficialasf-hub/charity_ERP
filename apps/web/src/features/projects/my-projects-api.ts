import type { Consent, PermissionSet, RulesPart } from '@css/shared/projects';
import type { VolunteerType } from '@css/shared/registration';
import { api } from '../../lib/api';

/** One of the caller's running projects (GET /me/projects). */
export interface MyProject {
  projectId: string;
  code: string;
  year: number;
  name: { bn: string; en: string };
  status: 'active' | 'closing';
  applyFrom: string | null;
  applyTo: string | null;
  perVolunteerLimit: number | null;
  dawahEnabled: boolean;
  via: 'assignment' | 'team';
  permissionSet: PermissionSet | null;
  isPaid: boolean;
  consentStatus: 'pending' | 'accepted';
  rulesVersion: number;
  applicationsCounted: number;
  applicationsLeft: number | null;
  /** The caller may build a team here (an assigned General or দাঈ-স্বেচ্ছাসেবক volunteer). */
  leadsTeam: boolean;
}

/** The project with the rules parts to read (GET /me/projects/{id}). */
export interface MyProjectDetail extends MyProject {
  rules: { version: number; parts: { part: RulesPart; text: { bn: string; en: string } }[] };
}

export interface TeamMember {
  volunteerId: string;
  displayName: string;
  type: VolunteerType;
  consentStatus: 'pending' | 'accepted';
  addedAt: string;
}
export interface Team {
  members: TeamMember[];
  candidates: { volunteerId: string; displayName: string; type: VolunteerType }[];
}

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
