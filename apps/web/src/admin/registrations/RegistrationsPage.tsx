import type { Locale } from '@css/shared/i18n';
import { formatDateTime } from '@css/shared/format';
import {
  Alert,
  Badge,
  EmptyState,
  ErrorState,
  PageHeader,
  PersonCell,
  Table,
  type TableColumn,
  Tabs,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { FilePen, UserCheck, UserPen } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useLocale, useTranslations } from 'use-intl';
import { useLocationName } from '../../components/AddressNames';
import { DocumentTitle } from '../../components/DocumentTitle';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ForbiddenContent } from '../AdminLayout';
import { canApproveStaff, canDecideEdits, canDecideStaffEdits } from '../roles';
import { StatisticsBar } from '../StatisticsBar';
import { EditRequests } from './EditRequests';
import { StaffEditRequests } from './StaffEditRequests';
import {
  EDITS_KEY,
  editRequests,
  LIST_KEY,
  type PendingRegistration,
  pendingStaffRegistrations,
  STAFF_EDITS_KEY,
  staffEditRequests,
} from './registrations-api';

/** A message handed over by the detail page after a final decision (the row has left the list). */
export interface ListNotice {
  notice?: string;
}

/**
 * The registrations page of the admin area (SCR-040; plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R7, R10): the pending
 * registrations in the approver's scope, for edit approvers the edit requests of approved
 * volunteers, and for the Department Head and the Monitoring Team the officials' own change
 * requests. The server decides what each list contains (scope, staff rows only for staff
 * approvers) and refuses every action outside it.
 */
export function RegistrationsPage() {
  const { me } = useAuth();
  const t = useTranslations('admin.registrations');
  const location = useLocation();
  const navigate = useNavigate();
  const notice = (location.state as ListNotice | null)?.notice;
  const [params] = useSearchParams();
  // the home's edit-request item opens its tab
  const asked = params.get('tab');
  const [tab, setTab] = useState(asked === 'edits' || asked === 'staff-edits' ? asked : 'pending');
  // the volunteer registrations live in the volunteer tab now (an older link lands there)
  if (params.get('kind') === 'volunteer')
    return <Navigate to="/admin/volunteers?state=pending" replace />;
  if (!me) return null;
  const staff = canApproveStaff(me);
  const edits = canDecideEdits(me);
  const staffEdits = canDecideStaffEdits(me);
  if (!staff && !edits && !staffEdits) return <ForbiddenContent />;
  const items = [
    ...(staff ? [{ id: 'pending', label: t('tabs.pending'), content: <PendingList /> }] : []),
    ...(edits ? [{ id: 'edits', label: t('tabs.edits'), content: <EditRequests /> }] : []),
    ...(staffEdits
      ? [{ id: 'staff-edits', label: t('tabs.staff_edits'), content: <StaffEditRequests /> }]
      : []),
  ];
  return (
    <>
      <DocumentTitle title={t('title')} />
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('description')} />
      <WaitingCounts staff={staff} edits={edits} staffEdits={staffEdits} />
      {notice && (
        <Alert
          tone="success"
          live="status"
          onDismiss={() => void navigate(location.pathname, { replace: true, state: null })}
        >
          {notice}
        </Alert>
      )}
      {items.length > 1 ? (
        <Tabs
          label={t('tabs.label')}
          selectedId={items.some((i) => i.id === tab) ? tab : items[0]!.id}
          onChange={setTab}
          items={items}
        />
      ) : (
        items[0]!.content
      )}
    </>
  );
}

/** How many registrations and edit requests wait, for the lists the caller decides. */
function WaitingCounts({
  staff,
  edits,
  staffEdits,
}: {
  staff: boolean;
  edits: boolean;
  staffEdits: boolean;
}) {
  const t = useTranslations('admin.registrations');
  // the same reads as the lists below (the staff registrations only), so a tab opens on rows
  // already loaded
  const pending = useQuery({
    queryKey: LIST_KEY,
    queryFn: pendingStaffRegistrations,
    enabled: staff,
  });
  const requests = useQuery({ queryKey: EDITS_KEY, queryFn: editRequests, enabled: edits });
  const staffRequests = useQuery({
    queryKey: STAFF_EDITS_KEY,
    queryFn: staffEditRequests,
    enabled: staffEdits,
  });
  return (
    <StatisticsBar
      label={t('stats.label')}
      loading={
        (staff && pending.isPending) ||
        (edits && requests.isPending) ||
        (staffEdits && staffRequests.isPending)
      }
      items={[
        // a list that could not be read shows its error below, never a count of zero
        ...(staff && !pending.error
          ? [
              {
                key: 'pending',
                label: t('tabs.pending'),
                value: pending.data?.length ?? 0,
                icon: UserCheck,
                tone: 'warning' as const,
              },
            ]
          : []),
        ...(edits && !requests.error
          ? [
              {
                key: 'edits',
                label: t('tabs.edits'),
                value: requests.data?.length ?? 0,
                icon: FilePen,
                tone: 'info' as const,
              },
            ]
          : []),
        ...(staffEdits && !staffRequests.error
          ? [
              {
                key: 'staff-edits',
                label: t('tabs.staff_edits'),
                value: staffRequests.data?.length ?? 0,
                icon: UserPen,
                tone: 'info' as const,
              },
            ]
          : []),
      ]}
    />
  );
}

function PendingList() {
  const t = useTranslations('admin.registrations');
  const tc = useTranslations('common');
  const tr = useTranslations('registration.form.types');
  const locale = useLocale() as Locale;
  const list = useQuery({ queryKey: LIST_KEY, queryFn: pendingStaffRegistrations });
  const kind = (r: PendingRegistration) =>
    r.kind === 'staff' ? t('kind.staff') : t('kind.volunteer');
  const type = (r: PendingRegistration) =>
    r.volunteerType ? tr(r.volunteerType as 'general') : (r.designation ?? '');
  const name = (r: PendingRegistration) => (
    <PersonCell name={r.displayName} href={`/admin/registrations/${r.userId}`} />
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
          <span className="admin-muted admin-line">{type(r)}</span>
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
      layout="panel"
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
