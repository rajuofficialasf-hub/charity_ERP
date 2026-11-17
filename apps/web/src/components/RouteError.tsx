import { Page } from '@/ui';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from './DocumentTitle';
import { LoadFailed } from './LoadFailed';

/** Route error boundary: a useful page instead of a blank one; details stay in the console. */
export function RouteError() {
  const error = useRouteError();
  const t = useTranslations('common.state');
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) {
    console.error(error);
    return <LoadFailed onRetry={() => window.location.reload()} />;
  }
  return (
    <main id="main" className="account-page">
      <DocumentTitle title={t('empty.title')} />
      <div>
        <Page title={t('empty.title')} documentTitle={false} />
      </div>
    </main>
  );
}
