import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SessionsView } from './SessionsView';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('auth.sessions');
  return { title: t('title') };
}

export default function SessionsPage() {
  return <SessionsView />;
}
