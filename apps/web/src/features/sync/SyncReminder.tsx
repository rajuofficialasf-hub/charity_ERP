import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button } from '@css/ui';
import { useLocale, useTranslations } from 'use-intl';
import { useSyncReminder } from './use-sync-store';

/**
 * The notice about records waiting on this phone for a day or more, on the home and in the sync
 * centre; `withLink` adds the way to the centre where the notice is not already there.
 */
export function SyncReminder({ withLink = false }: { withLink?: boolean }) {
  const { reminder, dismiss } = useSyncReminder();
  const t = useTranslations('sync.reminder');
  const locale = useLocale() as Locale;
  if (!reminder) return null;
  return (
    <Alert
      tone="warning"
      title={t('title')}
      live="status"
      onDismiss={dismiss}
      action={
        withLink ? (
          <Button variant="secondary" size="sm" href="/sync">
            {t('open')}
          </Button>
        ) : undefined
      }
    >
      {t('body', {
        n: reminder.count,
        count: formatCount(reminder.count, locale),
        days: formatCount(reminder.days, locale),
      })}
    </Alert>
  );
}
