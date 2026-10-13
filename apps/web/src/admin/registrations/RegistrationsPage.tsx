import type { Locale } from '@css/shared/i18n';
import { formatDateTime } from '@css/shared/format';
import { Alert, Badge, EmptyState, ErrorState, Table, Tabs, type TableColumn } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canDecideEdits, canOpenAdmin } from '../roles';
import { EditRequests } from './EditRequests';
import { LIST_KEY, type PendingRegistration, pendingRegistrations } from './registrations-api';

/** A message handed over by the detail page after a final decision (the row has left the list). */
export interface ListNotice {
  notice?: string;
}

/**
 * The registrations page of the admin area (SCR-040; plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R7, R10): the pending
 * registrations in the approver's scope and, for edit approvers, the edit requests of approved
 * volunteers. The server decides what each list contains (scope, staff rows only for staff
 * approvers) and refuses every action outside it.
 */
export function RegistrationsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.registrations');
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as ListNotice | null)?.notice;
  const [tab, setTab] = useState('pending');
  if (!me) return null;
  if (!canOpenAdmin(me)) return <ForbiddenContent />;
  return (
    <>
      <DocumentTitle title={t('title')} />
      <h1 className="admin-title">{t('title')}</h1>
      {notice && (
        <Alert
          tone="success"
          live="status"
          onDismiss={() => void navigate(location.pathname, { replace: true, state: null })}
        >
          {notice}
        </Alert>
      )}
      {canDecideEdits(me) ? (
        <Tabs
          label={t('tabs.label')}
          selectedId={tab}
          onChange={setTab}
          items={[
            { id: 'pending', label: t('tabs.pending'), content: <PendingList /> },
            { id: 'edits', label: t('tabs.edits'), content: <EditRequests /> },
          ]}
        />
      ) : (
        <PendingList />
      )}
    </>
  );
}

function PendingList() {
  const t = useTranslations('admin.registrations');
  const tc = useTranslations('common');
  const tr = useTranslations('registration.form.types');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: LIST_KEY, queryFn: pendingRegistrations });
  const kind = (r: PendingRegistration) =>
    r.kind === 'staff' ? t('kind.staff') : t('kind.volunteer');
  const type = (r: PendingRegistration) =>
    r.volunteerType ? tr(r.volunteerType as 'general') : (r.designation ?? '');
  const name = (r: PendingRegistration) => (
    <Link to={`/admin/registrations/${r.userId}`}>{r.displayName}</Link>
  );
  const status = (r: PendingRegistration) => (
    <Badge
      tone={r.status === 'in_correction' ? 'warning' : 'info'}
      label={t(`status.${r.status}`)}
    />
  );
  const columns: TableColumn<PendingRegistration>[] = [
    { id: 'name', header: t('column.name'), cell: name, isRowHeader: true },
    {
      id: 'kind',
      header: t('column.kind'),
      cell: (r) => (
        <>
          <span>{kind(r)}</span>
          <span className="admin-muted block">{type(r)}</span>
        </>
      ),
    },
    { id: 'status', header: t('column.status'), cell: status },
    { id: 'area', header: t('column.area'), cell: (r) => <District row={r} /> },
    {
      id: 'submitted',
      header: t('column.submitted'),
      cell: (r) => formatDateTime(r.submittedAt, locale),
    },
  ];
  return (
    <Table
      label={t('tabs.pending')}
      columns={columns}
      rows={list.data ?? []}
      rowKey={(r) => r.userId}
      rowLabel={(r) => r.displayName}
      loading={list.isPending}
      error={
        list.error ? (
          <ErrorState
            title={tc('state.error.text')}
            requestId={list.error instanceof ApiFailure ? list.error.requestId : undefined}
            onRetry={() => void list.refetch()}
          />
        ) : undefined
      }
      emptyState={<EmptyState icon={UserCheck} title={t('empty')} headingLevel={2} />}
      cardRenderer={(r) => (
        <div className="admin-permission-card">
          {name(r)}
          <span>
            {kind(r)} · {type(r)}
          </span>
          {status(r)}
          <District row={r} />
          <span className="admin-muted">{formatDateTime(r.submittedAt, locale)}</span>
        </div>
      )}
    />
  );
}

function District({ row }: { row: PendingRegistration }) {
  const locale = useLocale() as Locale;
  const name = useLocationName(row.divisionId, row.districtId);
  return <>{name?.[locale] ?? ''}</>;
}
