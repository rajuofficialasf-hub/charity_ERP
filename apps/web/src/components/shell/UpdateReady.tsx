import { Alert, Button } from '@/ui';
import { useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'use-intl';
import { pendingUpdate, subscribeUpdate } from '../../lib/app-update';

const none = () => null;

/** The notice under the header once a new version waits: the reload is the person's to take. */
export function UpdateReady() {
  const reload = useSyncExternalStore(subscribeUpdate, pendingUpdate, none);
  const t = useTranslations('sync.update');
  const [busy, setBusy] = useState(false);
  if (!reload) return null;
  return (
    <div className="app-update">
      <Alert
        tone="info"
        action={
          <Button
            size="small"
            loading={busy}
            onClick={() => {
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
    </div>
  );
}
