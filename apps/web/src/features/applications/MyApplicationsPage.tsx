import { formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Stack, Tabs, Text } from '@css/ui';
import { useQueries, useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { AccountPage } from '../../components/AccountPage';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import type { SyncInfo } from '../../offline/applications-store';
import { MY_PROJECTS_KEY, myProjects } from '../projects/my-projects-api';
import { type ApplicationSummary, MY_APPLICATIONS_KEY, myApplications } from './applications-api';
import { type Tab, TABS, toneOf } from './status';
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
  myApplications(TABS[tab].join(',')).catch(async (error: unknown) => {
    const store = await loadStore();
    const cached = await store.cachedList(TABS[tab]).catch(() => null);
    if (cached) return { data: cached, meta: { total: cached.length } };
    throw error;
  });

const projectsOf = () =>
  myProjects().catch(async (error: unknown) => {
    const store = await loadStore();
    const cached = await store.cachedProjects().catch(() => null);
    if (cached) return cached;
    throw error;
  });

function Lists() {
  const t = useTranslations('applications.list');
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
        selectedId={tab}
        onChange={(id) => setParams({ tab: id })}
        items={lists.map(({ id, query }) => {
          const own = id === 'draft' ? local.drafts : [];
          const rows = query.data ? [...own, ...query.data.data] : undefined;
          const total = query.data?.meta.total;
          return {
            id,
            label: t(id),
            count: total === undefined ? undefined : total + own.length,
            content: (
              <List
                rows={rows}
                pending={query.isPending}
                error={query.error}
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
  if (error || !rows)
    return (
      <ErrorState
        title={t('list.load_failed')}
        requestId={error instanceof ApiFailure ? error.requestId : undefined}
        onRetry={retry}
      />
    );
  if (!rows.length)
    return <EmptyState icon={ClipboardList} title={t('list.empty')} headingLevel={2} />;
  return (
    <ul className="my-applications-list">
      {rows.map((r) => {
        const name = nameOf(r.projectId);
        return (
          <li key={r.id}>
            <Card
              title={r.beneficiaryName ?? t('list.unnamed')}
              headingLevel={2}
              actions={
                <Button variant="secondary" size="sm" href={`/my-applications/${r.id}`}>
                  {t('list.open')}
                </Button>
              }
            >
              <Stack gap={1}>
                <div className="my-application-row">
                  <Text tone="muted">{r.appNo ?? t('list.no_number')}</Text>
                  <Badge
                    tone={toneOf(r.status)}
                    label={
                      t.has(`status.${r.status}` as never)
                        ? t(`status.${r.status}` as never)
                        : r.status
                    }
                  />
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
