import { formatCount, formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Chip,
  type ColorTone,
  DataTable,
  type DataTableExtendedColumn,
  DateField,
  FilterBar,
  Page,
  SelectField,
  Stack,
} from '@/ui';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canAdministerSystem } from '../roles';
import { useTabView } from '../use-tab-view';
import {
  DELIVERIES_KEY,
  DELIVERY_CHANNELS,
  DELIVERY_FILTERS,
  DELIVERY_STATUSES,
  type Delivery,
  deliveriesPage,
} from './notifications-admin-api';
import { LoadError } from '../../components/LoadError';

const CHANNEL_NAMES = ['email', 'sms', 'push'] as const;

const TONE: Record<Delivery['status'], ColorTone> = {
  queued: 'info',
  sending: 'info',
  sent: 'success',
  failed: 'error',
  dry_run: 'neutral',
  suppressed: 'warning',
};

/**
 * The delivery page of the Department Head and the Monitoring Team (docs/ui/SCREENS.md, message
 * deliveries; docs/architecture/NOTIFICATIONS.md, delivery status): every queued email and SMS newest first, by status,
 * channel and dates, with the attempts and the cleaned last error. The server hides most of each
 * address and never sends the text. The filters live in the address.
 */
export function DeliveriesPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.deliveries');
  const locale = useLocale() as Locale;
  const { filters, setFilters, change, cursor, setCursor } = useTabView(DELIVERY_FILTERS);
  const allowed = Boolean(me && canAdministerSystem(me));
  // a stale link with another value shows everything instead of an error
  const status = DELIVERY_STATUSES.find((s) => s === filters.status);
  const channel = DELIVERY_CHANNELS.find((c) => c === filters.channel);
  const query = { ...filters, status, channel };
  const page = useQuery({
    queryKey: [...DELIVERIES_KEY, query, cursor],
    queryFn: () => deliveriesPage(query, cursor),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const rows = page.data?.data ?? [];
  const meta = page.data?.meta;
  const statusBadge = (d: Delivery) => <Chip tone={TONE[d.status]}>{t(`status.${d.status}`)}</Chip>;
  const channelName = (d: Delivery) => {
    const known = CHANNEL_NAMES.find((c) => c === d.channel);
    return known ? t(`channel.${known}`) : d.channel;
  };
  const recipient = (d: Delivery) => d.recipient?.name ?? t('system');
  const columns: DataTableExtendedColumn<Delivery>[] = [
    {
      id: 'time',
      header: t('column.time'),
      cell: (d) => formatDateTime(d.createdAt, locale),
      isRowHeader: true,
    },
    {
      id: 'template',
      header: t('column.template'),
      cell: (d) => <code lang="en">{d.templateKey}</code>,
    },
    { id: 'recipient', header: t('column.recipient'), cell: recipient },
    {
      id: 'address',
      header: t('column.address'),
      cell: (d) => <span lang="en">{d.address}</span>,
      priority: 2,
    },
    { id: 'channel', header: t('column.channel'), cell: channelName, priority: 2 },
    { id: 'status', header: t('column.status'), cell: statusBadge },
    {
      id: 'attempts',
      header: t('column.attempts'),
      cell: (d) => formatCount(d.attempts, locale),
      priority: 3,
    },
    {
      id: 'error',
      header: t('column.error'),
      cell: (d) => (d.lastError ? <span lang="en">{d.lastError}</span> : '—'),
      priority: 3,
    },
  ];

  return (
    <>
      <DocumentTitle title={t('title')} />
      <Page
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('intro')}
        documentTitle={false}
      />
      <DataTable
        label={t('table')}
        columns={columns}
        rows={rows}
        getRowId={(d) => d.id}
        rowLabel={(d) => `${formatDateTime(d.createdAt, locale)} ${d.templateKey}`}
        loading={page.isPending}
        error={
          page.error ? (
            <LoadError error={page.error} onRetry={() => void page.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        toolbar={
          <FilterBar
            chips={[
              { id: 'all', label: t('status.all') },
              ...DELIVERY_STATUSES.map((s) => ({ id: s, label: t(`status.${s}`) })),
            ]}
            activeChip={status ?? 'all'}
            onChipChange={(id) => change({ status: id === 'all' ? undefined : id })}
            onClearFilters={() => setFilters(status ? { status } : {})}
          >
            <>
              <SelectField
                label={t('channel.label')}
                options={[
                  { value: 'all', label: t('channel.all') },
                  ...DELIVERY_CHANNELS.map((c) => ({ value: c, label: t(`channel.${c}`) })),
                ]}
                value={channel ?? 'all'}
                onChange={(id) => change({ channel: id && id !== 'all' ? id : undefined })}
              />
              <DateField
                label={t('from')}
                value={filters.from ?? ''}
                onChange={(from) => change({ from: from || undefined })}
              />
              <DateField
                label={t('to')}
                value={filters.to ?? ''}
                onChange={(to) => change({ to: to || undefined })}
              />
            </>
          </FilterBar>
        }
        cursorPagination={
          meta
            ? {
                hasNext: meta.nextCursor !== null,
                hasPrevious: meta.prevCursor !== null,
                onNext: () => setCursor(meta.nextCursor),
                onPrevious: () => setCursor(meta.prevCursor),
              }
            : undefined
        }
        cardRenderer={(d) => (
          <div className="admin-permission-card">
            <Stack direction="row" wrap align="center" gap={2}>
              <code lang="en">{d.templateKey}</code>
              {statusBadge(d)}
            </Stack>
            <span>
              {recipient(d)} · <span lang="en">{d.address}</span> · {channelName(d)}
            </span>
            <span>{formatDateTime(d.createdAt, locale)}</span>
            <span>{t('attempts', { count: formatCount(d.attempts, locale) })}</span>
            {d.lastError && <span lang="en">{d.lastError}</span>}
          </div>
        )}
      />
    </>
  );
}
