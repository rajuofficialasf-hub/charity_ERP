import { useTranslations } from 'use-intl';
import { AuthShell } from '../../components/AuthShell';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ResetForm } from './ResetForm';

/** The password reset with the OTP step (docs/ui/SCREENS.md "Login and password reset"). */
export function ResetPage() {
  const t = useTranslations('auth.reset');
  return (
    <AuthShell title={t('title')}>
      <DocumentTitle title={t('title')} />
      <ResetForm />
    </AuthShell>
  );
}
