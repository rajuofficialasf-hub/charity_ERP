import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ChangePasswordView } from './ChangePasswordView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.password');
  return { title: t('title') };
}

export default function ChangePasswordPage() {
  return <ChangePasswordView />;
}
