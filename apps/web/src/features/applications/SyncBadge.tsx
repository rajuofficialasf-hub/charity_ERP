import { Chip, type ColorTone } from '@/ui';
import { useTranslations } from 'use-intl';
import type { SyncInfo } from '../../offline/applications-store';

/** The way a record stands on its way to the server, as a chip beside its state. */
export function SyncBadge({ sync }: { sync: SyncInfo | undefined }) {
  const t = useTranslations('applications.sync');
  if (!sync) return null;
  const shown = labelOf(sync);
  if (!shown) return null;
  return <Chip tone={shown.tone}>{t(shown.key)}</Chip>;
}

function labelOf(sync: SyncInfo): {
  key: 'pending' | 'syncing' | 'failed' | 'verifying' | 'photos_pending';
  tone: ColorTone;
} | null {
  if (sync.state === 'failed') return { key: 'failed', tone: 'error' };
  if (sync.state === 'syncing') return { key: 'syncing', tone: 'info' };
  if (sync.state === 'pending') return { key: 'pending', tone: 'warning' };
  if (sync.verificationReason) return { key: 'verifying', tone: 'info' };
  if (sync.photosPending) return { key: 'photos_pending', tone: 'warning' };
  return null;
}
