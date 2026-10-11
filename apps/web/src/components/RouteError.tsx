import { ErrorState } from '@css/ui';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from './DocumentTitle';

/** Route error boundary (RE-CMP-02): a useful page instead of a blank one; details stay in the console. */
export function RouteError() {
  const error = useRouteError();
  const t = useTranslations('common.state');
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) console.error(error);
  return (
    <main id="main" className="account-page">
      <DocumentTitle title={notFound ? t('empty.title') : t('error.text')} />
      <ErrorState
        title={notFound ? t('empty.title') : t('error.text')}
        onRetry={notFound ? undefined : () => window.location.reload()}
      />
    </main>
  );
}
