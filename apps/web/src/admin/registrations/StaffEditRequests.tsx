import type { Affiliation } from '@css/shared/auth';
import { type Locale, localized } from '@css/shared/i18n';
import { REQUEST_FIELD_LABEL, type StaffEditField } from '@css/shared/registration';
import {
  Alert,
  Button,
  Chip,
  ConfirmDialog,
  DataTable,
  PersonCell,
  Stack,
  type DataTableExtendedColumn,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { FileImage } from '../../components/FileImage';
import { ApiFailure } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import {
  decideStaffEdit,
  STAFF_EDITS_KEY,
  type StaffEditRequestRow,
  staffEditRequests,
} from './registrations-api';
import { LoadError } from '../../components/LoadError';

/**
 * The officials' own change requests for the Department Head and the Monitoring Team
 * (docs/DECISION_LOG.md, the official's own profile of 2026-11-02; GET /staff-edit-requests):
 * who asked, the detail, the value now beside the new one and the reason given; approving applies
 * the change at once, refusing needs a reason. A decider's own request waits for the other role.
 */
export function StaffEditRequests() {
  const { me } = useAuth();
  const t = useTranslations('admin.registrations.staff_edits');
  const te = useTranslations('admin.registrations.edits');
  const tr = useTranslations('admin.registrations');
  const tf = useTranslations('registration');
  const ta = useTranslations('admin.staff.affiliation');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [refusing, setRefusing] = useState<StaffEditRequestRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = useQuery({ queryKey: STAFF_EDITS_KEY, queryFn: staffEditRequests });
  const decide = useMutation({
    mutationFn: ({ row, reason }: { row: StaffEditRequestRow; reason?: string }) =>
      decideStaffEdit(row.id, reason ? { decision: 'reject', reason } : { decision: 'approve' }),
    onMutate: () => setNotice(null),
    onSuccess: (_, { reason }) => {
      setRefusing(null);
      setNotice(reason ? te('rejected') : te('approved'));
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: STAFF_EDITS_KEY }),
  });
  const failure = decide.error instanceof ApiFailure ? decide.error : null;

  const field = (r: StaffEditRequestRow) =>
    r.field in REQUEST_FIELD_LABEL ? tf(REQUEST_FIELD_LABEL[r.field as StaffEditField]) : r.field;
  const who = (r: StaffEditRequestRow) => r.personName;
  const show = (r: StaffEditRequestRow, value: unknown, alt: string): ReactNode => {
    if (value === null || value === undefined || value === '') return t('none');
    if (r.field === 'photo' && typeof value === 'string')
      return <FileImage fileId={value} alt={alt} />;
    if (r.field === 'workplace' && typeof value === 'object') {
      const w = value as { affiliation: Affiliation | null; affiliationUnit: string | null };
      return w.affiliation
        ? [ta(w.affiliation), w.affiliationUnit].filter(Boolean).join(' · ')
        : t('none');
    }
    if (typeof value === 'string' && Object.hasOwn(r.names, value))
      // eslint-disable-next-line security/detect-object-injection -- checked as an own key above
      return localized(r.names[value]!, locale);
    return String(value);
  };
  const own = (r: StaffEditRequestRow) => r.userId === me?.id;
  const actions = (r: StaffEditRequestRow) =>
    own(r) ? (
      <Chip tone="info">{t('own')}</Chip>
    ) : (
      <Stack direction="row" wrap gap={2}>
        <Button
          size="small"
          startIcon="check"
          ariaLabel={te('approve_label', { name: who(r), field: field(r) })}
          disabled={decide.isPending}
          onClick={() => decide.mutate({ row: r })}
        >
          {te('approve')}
        </Button>
        <Button
          size="small"
          variant="secondary"
          startIcon="close"
          ariaLabel={te('reject_label', { name: who(r), field: field(r) })}
          disabled={decide.isPending}
          onClick={() => setRefusing(r)}
        >
          {te('reject')}
        </Button>
      </Stack>
    );
  const person = (r: StaffEditRequestRow) => (
    <PersonCell name={r.personName} secondary={r.personJobId ?? undefined} />
  );
  const columns: DataTableExtendedColumn<StaffEditRequestRow>[] = [
    { id: 'person', header: t('column.person'), cell: person, isRowHeader: true },
    { id: 'field', header: te('column.field'), cell: field },
    {
      id: 'current',
      header: t('column.current'),
      cell: (r) => show(r, r.currentValue, t('photo_now')),
    },
    { id: 'value', header: te('column.value'), cell: (r) => show(r, r.newValue, te('photo')) },
    { id: 'note', header: te('column.note'), cell: (r) => r.note ?? '', priority: 3 },
  ];
  return (
    <div className="admin-panel-section">
      {notice && (
        <Alert tone="success" onDismiss={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {failure && !refusing && (
        <Alert tone="error">{failure.details[0]?.message ?? failure.message}</Alert>
      )}
      <DataTable
        label={tr('tabs.staff_edits')}
        columns={columns}
        rows={list.data ?? []}
        getRowId={(r) => r.id}
        rowLabel={(r) => `${who(r)} · ${field(r)}`}
        rowActions={actions}
        loading={list.isPending}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={t('empty')}
        cardRenderer={(r) => (
          <div className="admin-permission-card">
            {person(r)}
            <span>{field(r)}</span>
            <span>
              {t('column.current')}: {show(r, r.currentValue, t('photo_now'))}
            </span>
            <span>
              {te('column.value')}: {show(r, r.newValue, te('photo'))}
            </span>
            {r.note && <span className="admin-muted">{r.note}</span>}
            {actions(r)}
          </div>
        )}
      />
      <ConfirmDialog
        open={refusing !== null}
        title={refusing ? te('reject_title', { name: who(refusing), field: field(refusing) }) : ''}
        message={
          failure && <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
        }
        tone="danger"
        reasonRequired
        reasonLabel={tr('reason')}
        confirmLabel={te('reject_confirm')}
        pending={decide.isPending}
        onConfirm={(reason) => refusing && decide.mutate({ row: refusing, reason: reason.trim() })}
        onCancel={() => {
          decide.reset();
          setRefusing(null);
        }}
      />
    </div>
  );
}
