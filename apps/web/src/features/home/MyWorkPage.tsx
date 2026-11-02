import { Alert } from '@css/ui';
import { useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { InstallHint } from '../sync/InstallHint';
import { SyncReminder } from '../sync/SyncReminder';
import { AttentionList } from './AttentionList';
import { ComingLater, LiveWidgetCard, ProjectStates } from './HomeWidgets';
import { TodayBanner } from './TodayBanner';
import './home.css';
import { isLater, widgetsFor } from './widgets';

/**
 * The My Work home of every account (docs/ui/SCREENS.md, "My Work home per role"): the day at a
 * glance, a Program Manager's project counts, then "needs your attention" and the latest
 * notifications beside the other widgets of the person's roles in a fixed order; a widget whose
 * module comes later shows a quiet "coming later" card.
 */
export function MyWorkPage() {
  const t = useTranslations('auth');
  const th = useTranslations('home.page');
  const tn = useTranslations('nav');
  const tc = useTranslations('common.app');
  return (
    <AccountPage
      // the page is named for what it holds; it greets no one
      title={() => tn('my_work')}
      eyebrow={th('eyebrow')}
      description={th('description')}
      wide
    >
      {(me) => {
        const widgets = widgetsFor(me);
        // the counts by state lead the page; the notifications sit beside the attention list
        const main = widgets.filter((w) => w !== 'project_states' && w !== 'notifications');
        return (
          <>
            <DocumentTitle title={tc('name')} />
            {me.state === 'pending' && <Alert tone="info">{t('account.pending')}</Alert>}
            {me.kind === 'volunteer' && <InstallHint />}
            <SyncReminder withLink />
            <TodayBanner />
            {widgets.includes('project_states') && <ProjectStates />}
            <div className="my-work">
              <div className="my-work-side">
                <AttentionList />
                {widgets.includes('notifications') && (
                  <LiveWidgetCard widget="notifications" me={me} />
                )}
              </div>
              {main.length > 0 && (
                <div className="my-work-main">
                  {main.map((widget) =>
                    isLater(widget) ? (
                      <ComingLater key={widget} widget={widget} />
                    ) : (
                      <LiveWidgetCard key={widget} widget={widget} me={me} />
                    ),
                  )}
                </div>
              )}
            </div>
          </>
        );
      }}
    </AccountPage>
  );
}
