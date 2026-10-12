import { formatDate } from '@css/shared/format';
import { Card } from '@css/ui';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../components/DocumentTitle';

/**
 * Placeholder of the management dashboard (UX-10: work progress against target first, then
 * alerts, budget and areas); the real dashboards come with T3.3 and T6.1.
 */
export function DashboardPage() {
  const t = useTranslations('admin.dashboard');
  return (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
      <Card>
        <p className="m-0">{t('placeholder')}</p>
        <p className="admin-muted">{t('today', { date: formatDate(new Date()) })}</p>
      </Card>
    </>
  );
}
