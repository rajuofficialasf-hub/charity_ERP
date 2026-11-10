import type { LocationView } from '@css/shared';
import type { SyncBatchRequest, SyncBatchResponse } from '@css/shared/sync';
import type {
  ApplicationForm,
  ApplicationSummary,
} from '../features/applications/applications-api';
import type { MyProject } from '../features/projects/my-projects-api';
import { api } from '../api/client';

/** The data set the server answers for a phone (`GET /sync/snapshot`), one page at a time. */
export interface SnapshotView {
  serverTime: string;
  nextSince: string;
  nextAfterId: string | null;
  hasMore: boolean;
  projects: MyProject[];
  /** The published application form of each project, each with its project. */
  formVersions: (ApplicationForm & { projectId: string })[];
  applications: ApplicationSummary[];
  /** Every own application the server still lists: the phone drops what is missing here. */
  applicationIds: string[];
  locationsVersion: string;
}

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
  return api<SnapshotView>(`/sync/snapshot${text ? `?${text}` : ''}`);
};

/** The whole locations master, pulled only when its version changed. */
export const locationsAll = () => api<LocationView[]>('/locations/all');
