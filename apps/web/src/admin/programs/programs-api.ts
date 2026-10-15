import type { ProgramCreate, ProgramUpdate } from '@css/shared/projects';
import { api } from '../../lib/api';

/** A program as GET /programs returns it. */
export interface Program {
  id: string;
  code: string;
  name: { bn: string; en: string };
  pmUserId: string | null;
  pmName: string | null;
  active: boolean;
}

export const PROGRAMS_KEY = ['admin', 'programs'] as const;

/** GET /programs: the programs in the caller's scope (not paginated). */
export const programs = () => api<Program[]>('/programs');

export const createProgram = (body: ProgramCreate) =>
  api<Program>('/programs', { method: 'POST', body });

/** PATCH /programs/{id} with the program's current version (If-Match). */
export async function updateProgram(programId: string, body: ProgramUpdate) {
  const current = await api<{ meta: { etag: string } }>(`/programs/${programId}`, {
    envelope: true,
  });
  return api<Program>(`/programs/${programId}`, {
    method: 'PATCH',
    body,
    headers: { 'If-Match': current.meta.etag },
  });
}

export const assignPm = (programId: string, pmUserId: string) =>
  api<Program>(`/programs/${programId}/pm`, { method: 'POST', body: { pmUserId } });
