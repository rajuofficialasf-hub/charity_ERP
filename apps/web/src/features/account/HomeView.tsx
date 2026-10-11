import { Alert } from '@css/ui';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';

/** Signed-in placeholder home; the role-based home "My Work" replaces it in T1.15. */
export function HomeView() {
  const t = useTranslations('auth');
  const tc = useTranslations('common.app');
  return (
    <AccountPage title={(me) => t('home.welcome', { name: me.displayName })}>
      {(me) => (
        <>
          <DocumentTitle title={tc('name')} />
          {me.state === 'pending' && <Alert tone="info">{t('account.pending')}</Alert>}
          <p className="m-0">{t('account.signed_in_as', { name: me.displayName })}</p>
          <p className="m-0">{t('home.placeholder')}</p>
        </>
      )}
    </AccountPage>
  );
}
