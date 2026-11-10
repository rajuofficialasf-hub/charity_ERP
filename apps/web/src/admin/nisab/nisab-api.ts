import type { NisabAdd, NisabVersionView } from '@css/shared/settings';
import { api } from '../../api/client';

export const NISAB_KEY = ['admin', 'nisab'] as const;

/** GET /nisab-versions: newest effective date first, the one in force today marked. */
export const nisabVersions = () => api<NisabVersionView[]>('/nisab-versions');

export const addNisab = (body: NisabAdd) =>
  api<NisabVersionView>('/nisab-versions', { method: 'POST', body });

export const withdrawNisab = (id: string, reason: string) =>
  api<NisabVersionView>(`/nisab-versions/${encodeURIComponent(id)}/withdraw`, {
    method: 'POST',
    body: { reason },
  });
