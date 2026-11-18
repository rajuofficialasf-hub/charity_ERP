import { EmptyState } from '@/ui';
import { type Locale, localized } from '@css/shared/i18n';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../../components/DocumentTitle';
import { useFramedSession } from './session-context';
import type { SoonTab } from './tabs';

const ICONS = new Map([
  ['distribution', 'folder'],
  ['reports', 'dashboard'],
  ['activity', 'file'],
] as const);

/**
 * The page of a tab whose work is not built yet (distribution, reports, activity): it says the
 * page is coming and what will show there, inside the session's frame.
 */
export function ComingSoonPage({ tab }: { tab: SoonTab }) {
  const t = useTranslations('admin.projects.frame');
  const locale = useLocale() as Locale;
  const session = useFramedSession();
  return (
    <>
      {session && (
        <DocumentTitle
          title={t('doc_title', {
            tab: t(`tab.${tab}`),
            name: localized(session.project.name, locale),
          })}
        />
      )}
      <EmptyState title={t('soon.title')} description={t(`soon.${tab}`)} icon={ICONS.get(tab)} />
    </>
  );
}

/** The distribution tab, until distribution is built. */
export const DistributionSoonPage = () => <ComingSoonPage tab="distribution" />;
/** The reports tab, until the reports are built. */
export const ReportsSoonPage = () => <ComingSoonPage tab="reports" />;
/** The activity tab, until the activity of a project is built. */
export const ActivitySoonPage = () => <ComingSoonPage tab="activity" />;
