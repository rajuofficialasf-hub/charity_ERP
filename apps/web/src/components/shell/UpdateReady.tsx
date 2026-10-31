import { Alert, Button } from '@css/ui';
import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';
import { pendingUpdate, subscribeUpdate } from '../../lib/app-update';

const none = () => null;

/** The banner under the app bar once a new version waits: the reload is the person's to take. */
export function UpdateReady() {
  const reload = useSyncExternalStore(subscribeUpdate, pendingUpdate, none);
  const t = useTranslations('sync.update');
  const [busy, setBusy] = useState(false);
  if (!reload) return null;
  return (
    <Alert
      tone="info"
      variant="banner"
      live="status"
      action={
        <Button
          size="sm"
          loading={busy}
          onPress={() => {
            setBusy(true);
            reload();
          }}
        >
          {t('reload')}
        </Button>
      }
    >
      {t('ready')}
    </Alert>
  );
}
