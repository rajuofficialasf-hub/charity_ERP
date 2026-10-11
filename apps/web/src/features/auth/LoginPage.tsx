import { useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { AuthShell } from '../../components/AuthShell';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoginForm } from './LoginForm';

/** SCR-001 login. `?ended=revoked|logout` says why the previous session ended. */
export function LoginPage() {
  const t = useTranslations('auth.login');
  const [params] = useSearchParams();
  return (
    <AuthShell title={t('title')}>
      <DocumentTitle title={t('title')} />
      <LoginForm ended={params.get('ended') ?? undefined} />
    </AuthShell>
  );
}
