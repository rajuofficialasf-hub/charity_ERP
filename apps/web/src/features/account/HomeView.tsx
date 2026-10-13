import { Alert, Button } from '@css/ui';
import { useTranslations } from 'use-intl';
import { canOpenAdmin } from '../../admin/roles';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';

/** Signed-in placeholder home; the role-based home "My Work" replaces it in T1.15. */
export function HomeView() {
  const t = useTranslations('auth');
  const tc = useTranslations('common.app');
  const ta = useTranslations('admin');
  const tr = useTranslations('registration');
  return (
    <AccountPage title={(me) => t('home.welcome', { name: me.displayName })}>
      {(me) => (
        <>
          <DocumentTitle title={tc('name')} />
          {me.state === 'pending' && <Alert tone="info">{t('account.pending')}</Alert>}
          {me.kind === 'volunteer' && (
            <div>
              <Button variant="secondary" href="/account/profile">
                {tr('profile.link')}
              </Button>
            </div>
          )}
          {canOpenAdmin(me) && (
            <div>
              <Button variant="primary" href="/admin">
                {ta('open')}
              </Button>
            </div>
          )}
        </>
      )}
    </AccountPage>
  );
}
