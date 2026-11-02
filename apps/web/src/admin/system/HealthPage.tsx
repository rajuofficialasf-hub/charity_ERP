import { formatCount, formatDateTime, formatFileSize } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  Card,
  Disclosure,
  ErrorState,
  type IconComponent,
  IconTile,
  PageHeader,
  Skeleton,
  Table,
  type TableColumn,
  Text,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import { Database, HardDrive, ListChecks, Server } from 'lucide-react';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canAdministerSystem } from '../roles';
import { DummyOtpAlert } from '../settings/ChannelsPanel';
import { HEALTH_KEY, type StorageFigure, systemHealth } from './system-api';

const CHECKS = ['database', 'storage', 'queue'] as const;
const CHECK_ICON: Record<(typeof CHECKS)[number], IconComponent> = {
  database: Database,
  storage: HardDrive,
  queue: ListChecks,
};

/**
 * The health of the system for the Department Head and the Monitoring Team (docs/DECISION_LOG.md,
 * the admin and settings decision of 2026-10-17): the database, the file storage and the job
 * queue, the version, the dummy OTP state, how far the audit partitions reach, and the storage
 * growth from the file records for the IT team.
 */
export function HealthPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.health');
  const tc = useTranslations('common');
  const locale = useLocale() as Locale;
  const allowed = Boolean(me && canAdministerSystem(me));
  // never from the cache: an outage must show as soon as the page opens
  const health = useQuery({
    queryKey: HEALTH_KEY,
    queryFn: systemHealth,
    enabled: allowed,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const title = (
    <>
      <DocumentTitle title={t('title')} />
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
    </>
  );
  if (health.isPending)
    return (
      <>
        {title}
        <Skeleton count={6} />
      </>
    );
  if (health.error)
    return (
      <>
        {title}
        <ErrorState
          title={tc('state.error.text')}
          requestId={health.error instanceof ApiFailure ? health.error.requestId : undefined}
          onRetry={() => void health.refetch()}
        />
      </>
    );
  const h = health.data;
  const figure = (f: StorageFigure) =>
    t('figure', { count: formatCount(f.count, locale), size: formatFileSize(f.bytes, locale) });
  const kindColumns: TableColumn<StorageFigure & { kind: string }>[] = [
    {
      id: 'kind',
      header: t('column.kind'),
      cell: (k) => <span lang="en">{k.kind}</span>,
      isRowHeader: true,
    },
    { id: 'count', header: t('column.count'), cell: (k) => formatCount(k.count, locale) },
    { id: 'size', header: t('column.size'), cell: (k) => formatFileSize(k.bytes, locale) },
  ];
  type Bucket = StorageFigure & { bucket: string; monthGrowth: number | null };
  const growth = (b: Bucket) =>
    b.monthGrowth === null
      ? t('growth_unknown')
      : `${b.monthGrowth < 0 ? '−' : '+'}${formatFileSize(Math.abs(b.monthGrowth), locale)}`;
  const bucketColumns: TableColumn<Bucket>[] = [
    {
      id: 'bucket',
      header: t('column.bucket'),
      cell: (b) => <span lang="en">{b.bucket}</span>,
      isRowHeader: true,
    },
    { id: 'count', header: t('column.count'), cell: (b) => formatCount(b.count, locale) },
    { id: 'size', header: t('column.size'), cell: (b) => formatFileSize(b.bytes, locale) },
    { id: 'growth', header: t('column.growth'), cell: growth },
  ];
  const monthColumns: TableColumn<StorageFigure & { month: string }>[] = [
    { id: 'month', header: t('column.month'), cell: (m) => m.month, isRowHeader: true },
    { id: 'count', header: t('column.count'), cell: (m) => formatCount(m.count, locale) },
    { id: 'size', header: t('column.size'), cell: (m) => formatFileSize(m.bytes, locale) },
  ];

  return (
    <>
      {title}
      <DummyOtpAlert on={h.otpDummy} />
      <ul aria-label={t('checks')} className="admin-stats admin-health-checks">
        {CHECKS.map((check) => {
          // eslint-disable-next-line security/detect-object-injection -- check is one of CHECKS
          const up = h.checks[check] === 'up';
          return (
            <li key={check} className="admin-health-tile">
              <span className="admin-health-label">{t(`check.${check}`)}</span>
              {/* eslint-disable-next-line security/detect-object-injection -- check is one of CHECKS */}
              <IconTile icon={CHECK_ICON[check]} tone={up ? 'success' : 'danger'} />
              <strong className={up ? 'admin-health-value' : 'admin-health-value is-down'}>
                {up ? t('up') : t('down')}
              </strong>
            </li>
          );
        })}
        <li className="admin-health-tile">
          <span className="admin-health-label">{t('environment')}</span>
          <IconTile icon={Server} tone="warning" />
          <strong className="admin-health-value" lang="en">
            {h.environment}
          </strong>
          <span className="admin-health-note" lang="en">
            {t('build', { version: h.version })}
          </span>
        </li>
      </ul>
      <div className="admin-split">
        <div className="admin-split-main">
          {h.storage ? (
            <>
              <Card title={t('storage')} subtitle={figure(h.storage.total)} headingLevel={2}>
                <MonthBars months={h.storage.byMonth} />
                <Text className="admin-muted">
                  {t('measured', { date: formatDateTime(h.storage.measuredAt, locale) })}
                </Text>
              </Card>
              <Table
                label={t('by_bucket')}
                columns={bucketColumns}
                rows={h.storage.byBucket}
                rowKey={(b) => b.bucket}
                rowLabel={(b) => b.bucket}
                cardRenderer={(b) => (
                  <div className="admin-permission-card">
                    <strong lang="en">{b.bucket}</strong>
                    <span>{figure(b)}</span>
                    <span>{t('growth', { size: growth(b) })}</span>
                  </div>
                )}
              />
              <Table
                label={t('by_kind')}
                columns={kindColumns}
                rows={h.storage.byKind}
                rowKey={(k) => k.kind}
                rowLabel={(k) => k.kind}
                cardRenderer={(k) => (
                  <div className="admin-permission-card">
                    <strong lang="en">{k.kind}</strong>
                    <span>{figure(k)}</span>
                  </div>
                )}
              />
              {/* the figures of the bars, for reading them exactly and for screen readers */}
              <Disclosure title={t('by_month')} headingLevel={2}>
                <Table
                  label={t('by_month')}
                  columns={monthColumns}
                  rows={h.storage.byMonth}
                  rowKey={(m) => m.month}
                  rowLabel={(m) => m.month}
                  cardRenderer={(m) => (
                    <div className="admin-permission-card">
                      <strong>{m.month}</strong>
                      <span>{figure(m)}</span>
                    </div>
                  )}
                />
              </Disclosure>
            </>
          ) : (
            <Card title={t('storage')} headingLevel={2}>
              <Text>{t('storage_unknown')}</Text>
            </Card>
          )}
        </div>
        <aside className="admin-split-side" aria-label={t('audit_partitions')}>
          <Card accent title={t('audit_partitions')} headingLevel={2}>
            <Text>{h.auditPartitionsUntil ?? t('unknown')}</Text>
          </Card>
        </aside>
      </div>
    </>
  );
}

/**
 * The files added each month as one bar a month, the tallest month full height: a picture of the
 * growth only (hidden from screen readers); the month table below holds the figures.
 */
function MonthBars({ months }: { months: (StorageFigure & { month: string })[] }) {
  const locale = useLocale() as Locale;
  const top = Math.max(1, ...months.map((m) => m.bytes));
  return (
    <ol className="admin-month-bars" aria-hidden="true">
      {months.map((m) => (
        <li key={m.month} title={`${m.month}: ${formatFileSize(m.bytes, locale)}`}>
          <span
            className="admin-month-bar"
            style={{ '--bar': `${(m.bytes / top) * 100}%` } as CSSProperties}
          />
          <span className="admin-month-name">{m.month.slice(5)}</span>
        </li>
      ))}
    </ol>
  );
}
