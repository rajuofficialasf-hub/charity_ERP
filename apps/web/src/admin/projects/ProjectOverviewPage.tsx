import { formatCount, formatMonth, formatTaka } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Card, Grid, Skeleton, Stack } from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { useAuth } from '../../lib/auth';
import { canSeeProjectOverview } from '../roles';
import { CARDS_KEY, seriesDetail, sessionSummary } from './cards-api';
import { useFramedSession } from './frame/session-context';
import type { Project } from './projects-api';
import { ProjectFacts, type SessionFact } from './ProjectFacts';
import { type Fact, FactTile } from './summary/FactTile';
import { SessionCounts } from './summary/SessionCounts';
import { SessionProgress } from './summary/SessionProgress';

/** The facts shown on cards of their own, which the facts card therefore leaves out. */
const ON_CARDS: readonly SessionFact[] = ['period', 'limit', 'budget', 'program'];

/**
 * The budget's tile, or the target's for a caller the server leaves the budget out for, or none
 * when the session has neither.
 */
function budgetOrTarget(
  p: Project,
  locale: Locale,
  none: string,
  ts: (key: 'budget' | 'target') => string,
): Fact[] {
  if ('budgetPlanned' in p)
    return [
      {
        label: ts('budget'),
        value: p.budgetPlanned ? formatTaka(Number(p.budgetPlanned), locale) : none,
        icon: 'money',
        tone: 'secondary',
      },
    ];
  if (p.targetBeneficiaries === null || p.targetBeneficiaries === undefined) return [];
  return [
    {
      label: ts('target'),
      value: formatCount(p.targetBeneficiaries, locale),
      icon: 'users',
      tone: 'secondary',
    },
  ];
}

/**
 * The summary tab of a session, inside the session's frame (`frame/ProjectFrame.tsx`), which
 * reads the session and draws its header, its actions and its tabs: the period, the limit, the
 * budget (or the target for who may not see the budget) and the program as cards of their own, the other
 * facts once, the whole session's counts for the holders of the overview, and how far the session
 * has come.
 */
export function ProjectOverviewPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.projects');
  const ts = useTranslations('admin.projects.summary');
  const locale = useLocale() as Locale;
  const session = useFramedSession();
  const p = session?.project;
  const overview = Boolean(me && canSeeProjectOverview(me));
  const summary = useQuery({
    queryKey: [...CARDS_KEY, 'session-summary', p?.id],
    queryFn: () => sessionSummary(p!.id),
    enabled: overview && Boolean(p),
  });
  // the program's name, read with the cover by the frame under the same key
  const series = useQuery({
    queryKey: [...CARDS_KEY, 'series-detail', p?.seriesId],
    queryFn: () => seriesDetail(p!.seriesId!),
    enabled: overview && Boolean(p?.seriesId),
  });
  if (!p) return null;
  const none = t('detail.none');
  const program = series.data?.program;
  const stats: Fact[] = [
    {
      label: ts('period'),
      value: ts('months', { from: formatMonth(p.periodFrom), to: formatMonth(p.periodTo) }),
      icon: 'calendar',
    },
    {
      label: ts('limit'),
      value: p.perVolunteerLimit === null ? none : formatCount(p.perVolunteerLimit, locale),
      icon: 'user',
      tone: 'info',
    },
    ...budgetOrTarget(p, locale, none, ts),
    ...(program
      ? [
          {
            label: ts('program'),
            value: localized(program.name, locale),
            icon: 'hand-heart' as const,
            tone: 'warning' as const,
          },
        ]
      : []),
  ];
  return (
    <>
      <DocumentTitle
        title={t('detail.heading', { name: localized(p.name, locale), label: p.sessionLabel })}
      />
      <h2 className="app-sr-only">{t('frame.tab.summary')}</h2>
      <Grid columns={{ base: 1, sm: 2, lg: 4 }} gap={2}>
        {stats.map((stat) => (
          <FactTile key={stat.label} {...stat} />
        ))}
      </Grid>
      <Grid columns={{ base: 1, lg: 2 }} gap={3}>
        <Card title={ts('facts')} headingLevel={3}>
          {/* the program stays among the facts while its tile has no name to show */}
          <ProjectFacts
            project={p}
            leave={program ? ON_CARDS : ON_CARDS.filter((f) => f !== 'program')}
          />
        </Card>
        <Stack gap={3}>
          {summary.data && <SessionCounts projectId={p.id} counts={summary.data} />}
          {summary.isPending && overview && <Skeleton shape="card" />}
          {summary.error && (
            <Card title={ts('counts')} headingLevel={3}>
              <LoadError error={summary.error} onRetry={() => void summary.refetch()} />
            </Card>
          )}
          <SessionProgress project={p} counts={summary.data} />
        </Stack>
      </Grid>
    </>
  );
}
