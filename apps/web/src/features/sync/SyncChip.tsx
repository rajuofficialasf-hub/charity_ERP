import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Button } from '@css/ui';
import { CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { useAuth } from '../../lib/auth';
import { useOffline } from '../../offline/OfflineProvider';
import './sync.css';

/**
 * The sync chip of the app bar (docs/ui/SCREENS.md, SCR-005): a volunteer's count of records
 * still on this phone, red when some could not be sent; a tap opens the sync centre. Officials
 * keep nothing on the phone and see no chip.
 */
export function SyncChip() {
  const { me } = useAuth();
  const { status } = useOffline();
  const t = useTranslations('sync.chip');
  const locale = useLocale() as Locale;
  if (me?.kind !== 'volunteer') return null;
  const waiting = status.pending + status.syncing + status.failed;
  const count = formatCount(waiting, locale);
  const label =
    waiting === 0
      ? t('label')
      : status.failed > 0
        ? t('label_failed', { count, failed: formatCount(status.failed, locale) })
        : t('label_count', { count });
  const icon = status.state === 'syncing' ? RefreshCw : status.failed > 0 ? CloudOff : CloudUpload;
  return (
    <span className="sync-chip">
      <Button variant="ghost" icon={icon} iconOnly href="/sync">
        {label}
      </Button>
      {waiting > 0 && (
        <span
          className={
            status.failed > 0 ? 'sync-chip-count sync-chip-count-failed' : 'sync-chip-count'
          }
          aria-hidden="true"
        >
          {waiting > 99 ? `${formatCount(99, locale)}+` : count}
        </span>
      )}
    </span>
  );
}
