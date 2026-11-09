import { formatCount, formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Card, Chip, EmptyState, LinkButton, Skeleton, Stack, Tabs, Text } from '@/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { LoadError } from '../../components/LoadError';
import { ApiFailure } from '../../lib/api';
import { orCached } from '../../lib/or-cached';
import type { SyncInfo } from '../../offline/applications-store';
import { MY_PROJECTS_KEY, myProjects } from '../projects/my-projects-api';
import { type ApplicationSummary, MY_APPLICATIONS_KEY, myApplications } from './applications-api';
import { stateTone, type Tab, TABS } from './status';
import { SyncBadge } from './SyncBadge';
import { loadStore, useLocalRecords } from './use-local-records';
import './applications.css';

const TAB_IDS = Object.keys(TABS) as Tab[];

/**
 * The volunteer's own applications by state (docs/ui/SCREENS.md, "My applications and application detail"): drafts, the ones
 * waiting at the office, the approved and the refused; each card opens the record. The lists come
 * from the server while there is network and from the phone's data set otherwise; the drafts the
 * server does not know yet sit first among the drafts, and a record on its way carries its badge.
 */
export function MyApplicationsPage() {
  const t = useTranslations('applications.list');
  return <AccountPage title={() => t('title')}>{() => <Lists />}</AccountPage>;
}

/** The server's list, or the phone's when the network is away. */
const listOf = (tab: Tab) =>
  orCached(
    () => myApplications(TABS[tab].join(',')),
    async () => {
      const cached = await (await loadStore()).cachedList(TABS[tab]);
      return cached ? { data: cached, meta: { total: cached.length } } : null;
    },
  );

const projectsOf = () => orCached(myProjects, async () => (await loadStore()).cachedProjects());

function Lists() {
  const t = useTranslations('applications.list');
  const locale = useLocale() as Locale;
  const [params, setParams] = useSearchParams();
  const chosen = (params.get('tab') as Tab | null) ?? 'pending';
  const tab = TAB_IDS.includes(chosen) ? chosen : 'pending';
  const projects = useQuery({ queryKey: MY_PROJECTS_KEY, queryFn: projectsOf });
  const local = useLocalRecords();
  const queries = useQueries({
    queries: TAB_IDS.map((id) => ({
      queryKey: [...MY_APPLICATIONS_KEY, id],
      queryFn: () => listOf(id),
    })),
  });
  const lists = TAB_IDS.map((id, i) => ({ id, query: queries[i]! }));
  const names = new Map((projects.data ?? []).map((p) => [p.projectId, p.name]));
  return (
    <>
      <DocumentTitle title={t('title')} />
      <Tabs
        label={t('tabs')}
        value={tab}
        onChange={(id) => setParams({ tab: id })}
        items={lists.map(({ id, query }) => {
          const own = id === 'draft' ? local.drafts : [];
          // the phone's own drafts show even when the server's list could not be read and the
          // phone holds no data set yet (a first application taken offline)
          const rows = query.data
            ? [...own, ...query.data.data]
            : query.error && own.length
              ? own
              : undefined;
          const total = query.data?.meta.total;
          return {
            value: id,
            label: t(id),
            count: total === undefined ? undefined : formatCount(total + own.length, locale),
            content: (
              <List
                rows={rows}
                pending={query.isPending}
                error={rows ? undefined : query.error}
                retry={() => void query.refetch()}
                nameOf={(projectId) => names.get(projectId) ?? null}
                syncOf={(row) => ('sync' in row ? row.sync : local.syncOf.get(row.id))}
              />
            ),
          };
        })}
      />
    </>
  );
}

function List({
  rows,
  pending,
  error,
  retry,
  nameOf,
  syncOf,
}: {
  rows: ApplicationSummary[] | undefined;
  pending: boolean;
  error: unknown;
  retry: () => void;
  nameOf: (projectId: string) => { bn: string; en: string } | null;
  syncOf: (row: ApplicationSummary & { sync?: SyncInfo }) => SyncInfo | undefined;
}) {
  const t = useTranslations('applications');
  const locale = useLocale() as Locale;
  if (pending) return <Skeleton shape="card" />;
  // the own applications are open only on a project the volunteer works on: without one the
  // server refuses, and the page says where applications come from rather than of a failure
  if (error instanceof ApiFailure && error.status === 403)
    return (
      <EmptyState
        title={t('list.no_project')}
        action={
          <LinkButton variant="secondary" to="/my-projects">
            {t('list.my_projects')}
          </LinkButton>
        }
      />
    );
  if (error || !rows)
    return <LoadError title={t('list.load_failed')} error={error} onRetry={retry} />;
  if (!rows.length) return <EmptyState title={t('list.empty')} />;
  return (
    <ul className="my-applications-list">
      {rows.map((r) => {
        const name = nameOf(r.projectId);
        return (
          <li key={r.id}>
            <Card
              title={r.beneficiaryName ?? t('list.unnamed')}
              headingLevel={2}
              action={
                <LinkButton variant="secondary" to={`/my-applications/${r.id}`}>
                  {t('list.open')}
                </LinkButton>
              }
            >
              <Stack gap={1}>
                <div className="my-application-row">
                  <Text tone="muted">{r.appNo ?? t('list.no_number')}</Text>
                  <Chip tone={stateTone(r.status)}>
                    {t.has(`status.${r.status}` as never)
                      ? t(`status.${r.status}` as never)
                      : r.status}
                  </Chip>
                  <SyncBadge sync={syncOf(r)} />
                </div>
                {name ? <Text>{localized(name, locale)}</Text> : null}
                {r.submittedAt ? <Text tone="muted">{formatDate(r.submittedAt)}</Text> : null}
              </Stack>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
