import type { ProgramCreate, ProgramUpdate } from '@css/shared/projects';
import type { QueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { CARDS_KEY } from '../projects/cards-api';
import type { Program, ProgramRecord } from '../../api/schemas';

export type { Program };

export const PROGRAMS_KEY = ['admin', 'programs'] as const;

/**
 * Refreshes every read a program write changes: the program list and the cards of the programs
 * and projects tab. Called after each write of the program dialog, also when a later step of the
 * same save failed, so a name already saved shows at once.
 */
export const refreshProgramReads = (queryClient: QueryClient) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: PROGRAMS_KEY }),
    queryClient.invalidateQueries({ queryKey: CARDS_KEY }),
  ]);

/** GET /programs: the programs in the caller's scope (not paginated). */
export const programs = () => api<Program[]>('/programs');

export const createProgram = (body: ProgramCreate) =>
  api<Program>('/programs', { method: 'POST', body });

/** GET /programs/{id} with its version, read when the edit opens. */
export const programWithEtag = (programId: string) =>
  api<ProgramRecord>(`/programs/${programId}`, { envelope: true });

/** PATCH /programs/{id} with the version read when the edit opened (If-Match). */
export const updateProgram = (programId: string, etag: string, body: ProgramUpdate) =>
  api<Program>(`/programs/${programId}`, {
    method: 'PATCH',
    body,
    headers: { 'If-Match': etag },
  });

export const assignPm = (programId: string, pmUserId: string) =>
  api<Program>(`/programs/${programId}/pm`, { method: 'POST', body: { pmUserId } });
