import { useTranslations } from 'use-intl';
import { AuthShell } from '../../components/AuthShell';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ResetForm } from './ResetForm';

/** SCR-001 password reset with the OTP step. */
export function ResetPage() {
  const t = useTranslations('auth.reset');
  return (
    <AuthShell title={t('title')}>
      <DocumentTitle title={t('title')} />
      <ResetForm />
    </AuthShell>
  );
}
