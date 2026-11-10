import { Button, Page } from '@/ui';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from './DocumentTitle';

/** Route error boundary: a useful page instead of a blank one; details stay in the console. */
export function RouteError() {
  const error = useRouteError();
  const t = useTranslations('common.state');
  const tc = useTranslations('common.action');
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  if (!notFound) console.error(error);
  return (
    <main id="main" className="account-page">
      <DocumentTitle title={notFound ? t('empty.title') : t('error.text')} />
      <div role={notFound ? undefined : 'alert'}>
        <Page title={notFound ? t('empty.title') : t('error.text')} documentTitle={false}>
          {!notFound && (
            <div>
              <Button variant="secondary" onClick={() => window.location.reload()}>
                {tc('retry')}
              </Button>
            </div>
          )}
        </Page>
      </div>
    </main>
  );
}
