import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { useTranslations } from 'next-intl';
import { AuthShell } from '../_components/AuthShell';
import { LoginForm } from './LoginForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.login');
  return { title: t('title') };
}

function LoginScreen({ ended }: { ended?: string }) {
  const t = useTranslations('auth.login');
  return (
    <AuthShell title={t('title')}>
      <LoginForm ended={ended} />
    </AuthShell>
  );
}

/** SCR-001 login. `?ended=revoked|logout` says why the previous session ended. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ ended?: string }>;
}) {
  const { ended } = await searchParams;
  return <LoginScreen ended={ended} />;
}
