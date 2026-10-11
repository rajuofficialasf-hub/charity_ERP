import { useTranslations } from 'next-intl';

// Placeholder home of the scaffold (T1.1). The role-based home "My Work" replaces it in T1.15.
export default function HomePage() {
  const t = useTranslations('common.app');
  return (
    <main>
      <h1>{t('name')}</h1>
      <p>{t('organization')}</p>
    </main>
  );
}
