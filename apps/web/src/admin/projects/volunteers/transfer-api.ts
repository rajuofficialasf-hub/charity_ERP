import { api } from '../../../api/client';
import type { TransferCandidate, TransferResult } from '../../../api/schemas';
import { PROJECTS_KEY } from '../projects-api';

export type { TransferCandidate, TransferResult };

export const transferCandidatesKey = (projectId: string, volunteerId: string) =>
  [...PROJECTS_KEY, 'transfer', projectId, volunteerId] as const;

/** GET /projects/{id}/volunteers/{volunteerId}/applications: the picker of the old volunteer's applications. */
export const transferCandidates = (projectId: string, volunteerId: string) =>
  api<TransferCandidate[]>(`/projects/${projectId}/volunteers/${volunteerId}/applications`);

/** POST /projects/{id}/transfers under an idempotency key, so a repeat answers the same move. */
export const transferApplications = (
  projectId: string,
  key: string,
  body: {
    fromVolunteerId: string;
    toVolunteerId: string;
    applicationIds: string[];
    reason: string;
    moveTeam: boolean;
    assign: boolean;
  },
) =>
  api<TransferResult>(`/projects/${projectId}/transfers`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
  });
