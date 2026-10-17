import { formatCount, formatDateTime, formatFileSize } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import { Badge, Card, ErrorState, Skeleton, Table, type TableColumn } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canAdministerSystem } from '../roles';
import { DummyOtpAlert } from '../settings/ChannelsPanel';
import { HEALTH_KEY, type StorageFigure, systemHealth } from './system-api';

const CHECKS = ['database', 'storage', 'queue'] as const;

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
  const health = useQuery({ queryKey: HEALTH_KEY, queryFn: systemHealth, enabled: allowed });
  if (!me) return null;
  if (!allowed) return <ForbiddenContent />;

  const title = (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
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
  const monthColumns: TableColumn<StorageFigure & { month: string }>[] = [
    { id: 'month', header: t('column.month'), cell: (m) => m.month, isRowHeader: true },
    { id: 'count', header: t('column.count'), cell: (m) => formatCount(m.count, locale) },
    { id: 'size', header: t('column.size'), cell: (m) => formatFileSize(m.bytes, locale) },
  ];

  return (
    <>
      {title}
      <DummyOtpAlert on={h.otpDummy} />
      <Card title={t('checks')} headingLevel={2}>
        <ul className="m-0 grid gap-2 p-0" role="list">
          {CHECKS.map((check) => (
            <li key={check} className="flex flex-wrap items-center gap-2">
              <strong>{t(`check.${check}`)}</strong>
              {/* eslint-disable-next-line security/detect-object-injection -- check is one of CHECKS */}
              {h.checks[check] === 'up' ? (
                <Badge tone="success" label={t('up')} />
              ) : (
                <Badge tone="danger" label={t('down')} />
              )}
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid gap-2 sm:grid-cols-[14rem_1fr]">
          <dt className="font-bold">{t('version')}</dt>
          <dd className="m-0" lang="en">
            {h.version}
          </dd>
          <dt className="font-bold">{t('environment')}</dt>
          <dd className="m-0" lang="en">
            {h.environment}
          </dd>
          <dt className="font-bold">{t('audit_partitions')}</dt>
          <dd className="m-0">{h.auditPartitionsUntil ?? t('unknown')}</dd>
        </dl>
      </Card>
      {h.storage ? (
        <>
          <Card title={t('storage')} subtitle={figure(h.storage.total)} headingLevel={2}>
            <p className="admin-muted m-0">
              {t('measured', { date: formatDateTime(h.storage.measuredAt, locale) })}
            </p>
          </Card>
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
        </>
      ) : (
        <Card title={t('storage')} headingLevel={2}>
          <p className="m-0">{t('storage_unknown')}</p>
        </Card>
      )}
    </>
  );
}
