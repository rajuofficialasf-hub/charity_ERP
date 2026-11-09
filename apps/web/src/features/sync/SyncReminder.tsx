import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Alert, LinkButton } from '@/ui';
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
      onDismiss={dismiss}
      action={
        withLink ? (
          <LinkButton variant="secondary" to="/sync">
            {t('open')}
          </LinkButton>
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
