import { formatDate } from '@css/shared/format';
import { type Locale, localized } from '@css/shared/i18n';
import { MEDIA_PRIORITIES, REFERRAL_STATES } from '@css/shared/media';
import {
  Button,
  Chip,
  DataTable,
  SelectField,
  Stack,
  Text,
  type DataTableExtendedColumn,
} from '@/ui';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { MEDIA_KEY, type MediaWorkRow, mediaWorks } from './media-api';
import { useMediaLabels } from './use-media-lists';
import { LoadError } from '../../components/LoadError';

/** The filters the list keeps in the address, so a link or a reload opens the same view. */
const FILTERS = ['programId', 'stage', 'priority', 'state'] as const;

/**
 * The referrals and their works the caller reaches, newest first: beneficiary, program and
 * project, team, stage, last update, priority and decision; each row opens its work page.
 */
export function WorksList({ programs }: { programs: { id: string; name: string }[] }) {
  const t = useTranslations('media');
  const locale = useLocale() as Locale;
  const labels = useMediaLabels();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const query = new URLSearchParams();
  for (const key of FILTERS) {
    const value = params.get(key);
    if (value) query.set(key, value);
  }
  query.set('limit', '25');
  const list = useInfiniteQuery({
    queryKey: [...MEDIA_KEY, 'works', query.toString()],
    queryFn: ({ pageParam }) =>
      mediaWorks(
        pageParam
          ? `${query.toString()}&cursor=${encodeURIComponent(pageParam)}`
          : query.toString(),
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.meta.nextCursor ?? null,
  });
  const change = (key: (typeof FILTERS)[number], value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const open = (row: MediaWorkRow) => void navigate(`/media/referrals/${row.referralId}`);
  const stage = (row: MediaWorkRow) =>
    row.stageCode ? labels.stage(row.stageCode) : t(`state.${row.state}`);
  const team = (row: MediaWorkRow) =>
    row.members.length ? row.members.map((m) => m.name).join(', ') : t('home.no_team');
  const place = (row: MediaWorkRow) =>
    `${localized(row.program.name, locale)} · ${localized(row.project.name, locale)}`;
  const priority = (row: MediaWorkRow) => (
    <Chip tone={row.priority === 'high' ? 'warning' : 'neutral'}>
      {t(`priority.${row.priority}`)}
    </Chip>
  );
  const columns: DataTableExtendedColumn<MediaWorkRow>[] = [
    {
      id: 'beneficiary',
      header: t('home.column.beneficiary'),
      isRowHeader: true,
      cell: (r) => (
        <Link to={`/media/referrals/${r.referralId}`}>{r.title ?? r.beneficiaryName}</Link>
      ),
    },
    { id: 'program', header: t('home.column.program'), cell: place, priority: 3 },
    { id: 'team', header: t('home.column.team'), cell: team, priority: 2 },
    { id: 'stage', header: t('home.column.stage'), cell: stage },
    {
      id: 'updated',
      header: t('home.column.updated'),
      cell: (r) => formatDate(r.updatedAt),
      priority: 3,
    },
    { id: 'priority', header: t('home.column.priority'), cell: priority, priority: 2 },
    {
      id: 'decision',
      header: t('home.column.decision'),
      cell: (r) => t(`state.${r.state}`),
      priority: 3,
    },
  ];
  const rows = list.data?.pages.flatMap((p) => p.data) ?? [];
  const filtered = FILTERS.some((k) => params.get(k));
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={2} wrap>
        <SelectField
          label={t('home.filter.program')}
          value={params.get('programId') ?? ''}
          options={programs.map((p) => ({ value: p.id, label: p.name }))}
          onChange={(id) => change('programId', id)}
        />
        <SelectField
          label={t('home.filter.stage')}
          value={params.get('stage') ?? ''}
          options={labels.stages.map((s) => ({
            value: s.code,
            label: localized(s.label, locale),
          }))}
          onChange={(id) => change('stage', id)}
        />
        <SelectField
          label={t('home.filter.priority')}
          value={params.get('priority') ?? ''}
          options={MEDIA_PRIORITIES.map((p) => ({ value: p, label: t(`priority.${p}`) }))}
          onChange={(id) => change('priority', id)}
        />
        <SelectField
          label={t('home.filter.state')}
          value={params.get('state') ?? ''}
          options={REFERRAL_STATES.map((s) => ({ value: s, label: t(`state.${s}`) }))}
          onChange={(id) => change('state', id)}
        />
        {filtered ? (
          <Button variant="text" size="small" onClick={() => setParams(new URLSearchParams())}>
            {t('home.filter.clear')}
          </Button>
        ) : null}
      </Stack>
      <DataTable
        label={t('home.works')}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.referralId}
        rowLabel={(r) => r.title ?? r.beneficiaryName}
        onRowOpen={open}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('home.empty')}
        emptyDescription={t('home.empty_hint')}
        cardRenderer={(r) => (
          <Stack gap={1}>
            <Link to={`/media/referrals/${r.referralId}`}>
              <strong>{r.title ?? r.beneficiaryName}</strong>
            </Link>
            <Text size="small" tone="muted">
              {place(r)}
            </Text>
            <Stack direction="row" gap={2} wrap>
              <Chip tone="info">{stage(r)}</Chip>
              {priority(r)}
            </Stack>
            <Text size="small">{team(r)}</Text>
          </Stack>
        )}
      />
      {list.hasNextPage ? (
        <Button
          variant="secondary"
          onClick={() => void list.fetchNextPage()}
          loading={list.isFetchingNextPage}
        >
          {t('home.more')}
        </Button>
      ) : null}
    </Stack>
  );
}
