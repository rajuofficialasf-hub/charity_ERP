import { Alert } from '@css/ui';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { InstallHint } from '../sync/InstallHint';
import { SyncReminder } from '../sync/SyncReminder';
import { AttentionList } from './AttentionList';
import { ComingLater, LiveWidgetCard } from './HomeWidgets';
import './home.css';
import { isLater, widgetsFor } from './widgets';

/**
 * The My Work home of every account (docs/ui/SCREENS.md, "My Work home per role"): "needs your
 * attention" first, then the widgets of the person's roles in a fixed order; a widget whose module
 * comes later shows a quiet "coming later" card.
 */
export function MyWorkPage() {
  const t = useTranslations('auth');
  const tc = useTranslations('common.app');
  return (
    <AccountPage title={(me) => t('home.welcome', { name: me.displayName })} wide>
      {(me) => (
        <>
          <DocumentTitle title={tc('name')} />
          {me.state === 'pending' && <Alert tone="info">{t('account.pending')}</Alert>}
          {me.kind === 'volunteer' && <InstallHint />}
          <SyncReminder withLink />
          <div className="my-work">
            <AttentionList />
            {widgetsFor(me).map((widget) =>
              isLater(widget) ? (
                <ComingLater key={widget} widget={widget} />
              ) : (
                <LiveWidgetCard key={widget} widget={widget} me={me} />
              ),
            )}
          </div>
        </>
      )}
    </AccountPage>
  );
}
