import type { Metadata } from 'next';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { AuthShell } from '../../_components/AuthShell';
import { ResetForm } from './ResetForm';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.reset');
  return { title: t('title') };
}

/** SCR-001 password reset with the OTP step. */
export default function ResetPage() {
  const t = useTranslations('auth.reset');
  return (
    <AuthShell title={t('title')}>
      <ResetForm />
    </AuthShell>
  );
}
