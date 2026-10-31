import { formatCount } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Button, ConfirmDialog } from '@css/ui';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { useOffline } from '../../offline/OfflineProvider';
import { loadStore } from '../applications/use-local-records';

/**
 * The warning before a logout that would lose records still on this phone
 * (docs/architecture/OFFLINE_SYNC.md, local storage security): the count, a sync from the
 * dialog, and a second confirmation before anything is wiped. Confirming with nothing left to
 * send logs out at once.
 */
export function LogoutWarning({
  count: initial,
  onConfirm,
  onCancel,
}: {
  count: number;
  /** The person insists; the count is what still waits at that moment. */
  onConfirm: (count: number) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('sync.logout');
  const locale = useLocale() as Locale;
  const { syncNow } = useOffline();
  const [count, setCount] = useState(initial);
  const [step, setStep] = useState<1 | 2>(1);
  const [syncing, setSyncing] = useState(false);

  const syncFirst = async () => {
    setSyncing(true);
    try {
      await syncNow();
      const left = await loadStore()
        .then((s) => s.waitingCount())
        .catch(() => count);
      setCount(left);
      if (left === 0) onConfirm(0);
    } finally {
      setSyncing(false);
    }
  };
  const values = { n: count, count: formatCount(count, locale) };

  return (
    <>
      <ConfirmDialog
        isOpen={step === 1}
        title={t('title')}
        message={
          <>
            <p>{t('body', values)}</p>
            <Button
              variant="secondary"
              size="sm"
              loading={syncing}
              onPress={() => void syncFirst()}
            >
              {t('sync_first')}
            </Button>
          </>
        }
        tone="danger"
        confirmLabel={t('continue')}
        pending={syncing}
        onConfirm={() => setStep(2)}
        onCancel={onCancel}
      />
      <ConfirmDialog
        isOpen={step === 2}
        title={t('title_final')}
        message={t('body_final', values)}
        tone="danger"
        confirmLabel={t('confirm_final')}
        onConfirm={() => onConfirm(count)}
        onCancel={onCancel}
      />
    </>
  );
}
