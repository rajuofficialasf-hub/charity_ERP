import { api } from '../../lib/api';
import { listQuery } from '../list-query';

/** One active device session as GET /sessions/active returns it (never a token or an address). */
export interface ActiveSession {
  id: string;
  person: { id: string; name: string; kind: 'staff' | 'volunteer'; systemOwner: boolean };
  deviceName: string | null;
  platform: string | null;
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
}

export interface PageMeta {
  nextCursor: string | null;
  prevCursor: string | null;
}

export interface StorageFigure {
  count: number;
  bytes: number;
}

export interface SystemHealth {
  ready: boolean;
  checks: { database: 'up' | 'down'; storage: 'up' | 'down'; queue: 'up' | 'down' };
  version: string;
  environment: string;
  otpDummy: boolean;
  auditPartitionsUntil: string | null;
  storage: {
    total: StorageFigure;
    byKind: (StorageFigure & { kind: string })[];
    byMonth: (StorageFigure & { month: string })[];
    measuredAt: string;
  } | null;
}

export const SESSIONS_KEY = ['admin', 'sessions', 'active'] as const;
export const HEALTH_KEY = ['admin', 'health'] as const;

/** GET /sessions/active: newest started first, with a search by person and the account kind. */
export const activeSessions = (q: string, kind: string | undefined, cursor: string | null) =>
  api<{ data: ActiveSession[]; meta: PageMeta }>(
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
