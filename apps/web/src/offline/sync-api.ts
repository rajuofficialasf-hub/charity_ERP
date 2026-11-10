import type { LocationView } from '@css/shared';
import type { SyncBatchRequest, SyncBatchResponse } from '@css/shared/sync';
import { api } from '../api/client';
import type { SnapshotView } from '../api/schemas';

export type { SnapshotView };

/** One batch of offline records under its idempotency key. */
export const postBatch = (body: SyncBatchRequest, key: string) =>
  api<SyncBatchResponse>('/sync/batch', {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': key },
  });

/** The changes since the phone's cursor; `afterId` continues a page. */
export const pullSnapshot = (since?: string, afterId?: string | null) => {
  const query = new URLSearchParams();
  if (since) query.set('since', since);
  if (afterId) query.set('afterId', afterId);
  const text = query.toString();
  return text ? api<SnapshotView>(`/sync/snapshot?${text}`) : api<SnapshotView>('/sync/snapshot');
};

/** The whole locations master, pulled only when its version changed. */
export const locationsAll = () => api<LocationView[]>('/locations/all');
