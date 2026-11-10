import { api } from '../../api/client';
import type {
  ActiveSession,
  ActiveSessionPage,
  StorageFigure,
  SystemHealth,
} from '../../api/schemas';
import { listQuery } from '../list-query';

export type { ActiveSession, StorageFigure, SystemHealth };

export const SESSIONS_KEY = ['admin', 'sessions', 'active'] as const;
export const HEALTH_KEY = ['admin', 'health'] as const;

/** GET /sessions/active: newest started first, with a search by person and the account kind. */
export const activeSessions = (q: string, kind: string | undefined, cursor: string | null) =>
  api<ActiveSessionPage>(
    `/sessions/active${listQuery({ q: q || undefined, kind, cursor: cursor ?? undefined })}`,
    { envelope: true },
  );

/** POST /users/{userId}/sessions/{sessionId}/revoke with a reason (the Main Admin's are refused). */
export const endSession = (userId: string, sessionId: string, reason: string) =>
  api<void>(
    `/users/${encodeURIComponent(userId)}/sessions/${encodeURIComponent(sessionId)}/revoke`,
    { method: 'POST', body: { reason } },
  );

export const systemHealth = () => api<SystemHealth>('/admin/health');
