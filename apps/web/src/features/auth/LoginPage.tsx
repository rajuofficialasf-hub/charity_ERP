import { Skeleton } from '@/ui';
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslations } from 'use-intl';
import { AuthShell } from '../../components/AuthShell';
import { DocumentTitle } from '../../components/DocumentTitle';

// The form with its validation library loads beside the page, so the first route stays within
// the first-load budget (docs/testing/PERFORMANCE.md).
const LoginForm = lazy(async () => ({ default: (await import('./LoginForm')).LoginForm }));

/** The login page (docs/ui/SCREENS.md "Login and password reset"). `?ended=revoked|logout` says why the previous session ended. */
export function LoginPage() {
  const t = useTranslations('auth.login');
  const [params] = useSearchParams();
  return (
    <AuthShell title={t('title')}>
      <DocumentTitle title={t('title')} />
      <Suspense fallback={<Skeleton shape="card" />}>
        <LoginForm ended={params.get('ended') ?? undefined} />
      </Suspense>
    </AuthShell>
  );
}
