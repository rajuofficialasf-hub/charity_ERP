import { type Locale, localized } from '@css/shared/i18n';
import { Card } from '@/ui';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useFramedSession } from './frame/session-context';
import { ProjectFacts } from './ProjectFacts';

/**
 * The summary tab of a session, inside the session's frame (`frame/ProjectFrame.tsx`), which
 * reads the session and draws its header, its actions and its tabs: the session's facts.
 */
export function ProjectOverviewPage() {
  const t = useTranslations('admin.projects');
  const locale = useLocale() as Locale;
  const session = useFramedSession();
  if (!session) return null;
  const { project: p } = session;
  return (
    <>
      <DocumentTitle
        title={t('detail.heading', { name: localized(p.name, locale), label: p.sessionLabel })}
      />
      <h2 className="app-sr-only">{t('frame.tab.summary')}</h2>
      <Card title={t('detail.facts')} headingLevel={3}>
        <ProjectFacts project={p} />
      </Card>
    </>
  );
}
