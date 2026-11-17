import { Button, Page } from '@/ui';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from './DocumentTitle';

/**
 * The page of a screen that could not be drawn: the error's title as the page's and the document's,
 * announced, with the button that tries again (a reload for a route error, a new load for a page
 * whose chunk failed).
 */
export function LoadFailed({ onRetry, trying = false }: { onRetry: () => void; trying?: boolean }) {
  const t = useTranslations('common.state');
  const tc = useTranslations('common.action');
  return (
    <main id="main" className="account-page">
      <DocumentTitle title={t('error.text')} />
      <div role="alert">
        <Page title={t('error.text')} documentTitle={false}>
          <div>
            <Button variant="secondary" onClick={onRetry} loading={trying}>
              {tc('retry')}
            </Button>
          </div>
        </Page>
      </div>
    </main>
  );
}
