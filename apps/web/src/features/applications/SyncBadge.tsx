import { Badge, type BadgeTone } from '@css/ui';
import { useTranslations } from 'use-intl';
import type { SyncInfo } from '../../offline/applications-store';

/** The way a record stands on its way to the server, as a badge beside its state. */
export function SyncBadge({ sync }: { sync: SyncInfo | undefined }) {
  const t = useTranslations('applications.sync');
  if (!sync) return null;
  const shown = labelOf(sync);
  if (!shown) return null;
  return <Badge tone={shown.tone} label={t(shown.key)} />;
}

function labelOf(sync: SyncInfo): {
  key: 'pending' | 'syncing' | 'failed' | 'verifying' | 'photos_pending';
  tone: BadgeTone;
} | null {
  if (sync.state === 'failed') return { key: 'failed', tone: 'danger' };
  if (sync.state === 'syncing') return { key: 'syncing', tone: 'info' };
  if (sync.state === 'pending') return { key: 'pending', tone: 'warning' };
  if (sync.verificationReason) return { key: 'verifying', tone: 'info' };
  if (sync.photosPending) return { key: 'photos_pending', tone: 'warning' };
  return null;
}
