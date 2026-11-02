import { Alert, Button } from '@css/ui';
import { Download } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { dismissHint, promptInstall, useInstall } from './install';

/**
 * The nudge to install the app on the volunteer's home: the browser's prompt where there is one
 * (Android Chrome), the steps of the share sheet on an iPhone; nothing once installed or put away.
 */
export function InstallHint() {
  const t = useTranslations('sync.install');
  const { way, dismissed } = useInstall();
  if (way === 'none' || dismissed) return null;
  return (
    <Alert
      tone="info"
      title={t('title')}
      onDismiss={dismissHint}
      action={
        way === 'prompt' ? (
          <Button size="sm" icon={Download} onPress={() => void promptInstall()}>
            {t('button')}
          </Button>
        ) : undefined
      }
    >
      {way === 'prompt' ? t('body') : t('ios_steps')}
    </Alert>
  );
}
