import { Alert, Button, ConfirmDialog, DataTable, Stack, type DataTableExtendedColumn } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDate } from '@css/shared/format';
import { useTranslations } from 'use-intl';
import {
  EducationText,
  PermanentAddressText,
  ProfessionText,
  SkillsText,
} from '../../features/account/DetailValues';
import { FIELD_LABEL, type RequestField } from '../../features/account/profile-api';
import { ApiFailure } from '../../api/client';
import { type AddressIds, AddressNames } from '../../components/AddressNames';
import { decideEdit, EDITS_KEY, type EditRequestRow, editRequests } from './registrations-api';
import { LoadError } from '../../components/LoadError';
import { OpenablePhoto } from '../../features/photos/OpenablePhoto';

const PHOTO_FIELDS = new Set(['photo', 'nid_photo']);

/**
 * The edit requests of approved volunteers in scope (GET /edit-requests): who asked, the detail,
 * the new value and the reason given; approving applies the value at once, refusing needs a reason.
 * NID and bank values arrive only for roles that may see them.
 */
export function EditRequests() {
  const t = useTranslations('admin.registrations.edits');
  const tr = useTranslations('admin.registrations');
  const tf = useTranslations('registration');
  const queryClient = useQueryClient();
  const [refusing, setRefusing] = useState<EditRequestRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const list = useQuery({ queryKey: EDITS_KEY, queryFn: editRequests });
  const decide = useMutation({
    mutationFn: ({ row, reason }: { row: EditRequestRow; reason?: string }) =>
      decideEdit(row.id, reason ? { decision: 'reject', reason } : { decision: 'approve' }),
    onMutate: () => setNotice(null),
    onSuccess: (_, { reason }) => {
      setRefusing(null);
      setNotice(reason ? t('rejected') : t('approved'));
    },
    // also after a refusal (decided meanwhile by another approver): the list shows what is open
    onSettled: () => void queryClient.invalidateQueries({ queryKey: EDITS_KEY }),
  });
  const failure = decide.error instanceof ApiFailure ? decide.error : null;

  const field = (r: EditRequestRow) =>
    r.field in FIELD_LABEL ? tf(FIELD_LABEL[r.field as RequestField]) : r.field;
  const who = (r: EditRequestRow) => r.volunteerName ?? '';
  const value = (r: EditRequestRow) => {
    if (r.newValue === undefined || r.newValue === null) return tr('hidden');
    if (PHOTO_FIELDS.has(r.field) && typeof r.newValue === 'string')
      return <OpenablePhoto photos={[{ fileId: r.newValue, alt: t('photo') }]} index={0} />;
    if (r.field === 'address') return <AddressNames address={r.newValue as AddressIds} />;
    // the personal, profession and skills groups are shown as labelled text, never as raw ids or "[object Object]"
    if (r.field === 'profession') {
      const v = r.newValue as { profession: string; details?: Record<string, unknown> };
      return <ProfessionText profession={v.profession} details={v.details ?? {}} />;
    }
    if (r.field === 'skills') {
      const v = r.newValue as {
        interestAreas?: string[];
        vehicle?: string;
        canSwim?: boolean;
        availability?: string;
        emergencyFullTime?: boolean;
      };
      return (
        <SkillsText
          interestAreas={v.interestAreas ?? []}
          vehicle={v.vehicle ?? null}
          canSwim={v.canSwim ?? null}
          availability={v.availability ?? null}
          emergencyFullTime={v.emergencyFullTime ?? null}
        />
      );
    }
    if (r.field === 'educationDetails')
      return <EducationText education={r.newValue as Record<string, unknown>} />;
    if (r.field === 'permanentAddress')
      return <PermanentAddressText address={r.newValue as Record<string, unknown>} />;
    if (r.field === 'dateOfBirth' && typeof r.newValue === 'string') return formatDate(r.newValue);
    if (r.field === 'volunteeringArea' && typeof r.newValue === 'string')
      return tf(`lists.volunteering_area.${r.newValue}` as 'lists.volunteering_area.anywhere');
    if (typeof r.newValue === 'object')
      return Object.values(r.newValue as Record<string, string>)
        .filter(Boolean)
        .join(', ');
    return String(r.newValue);
  };
  const actions = (r: EditRequestRow) => (
    <Stack direction="row" wrap gap={2}>
      <Button
        size="small"
        startIcon="check"
        ariaLabel={t('approve_label', { name: who(r), field: field(r) })}
        disabled={decide.isPending}
        onClick={() => decide.mutate({ row: r })}
      >
        {t('approve')}
      </Button>
      <Button
        size="small"
        variant="secondary"
        startIcon="close"
        ariaLabel={t('reject_label', { name: who(r), field: field(r) })}
        disabled={decide.isPending}
        onClick={() => setRefusing(r)}
      >
        {t('reject')}
      </Button>
    </Stack>
  );
  const columns: DataTableExtendedColumn<EditRequestRow>[] = [
    { id: 'volunteer', header: t('column.volunteer'), cell: who, isRowHeader: true },
    { id: 'field', header: t('column.field'), cell: field },
    { id: 'value', header: t('column.value'), cell: value },
    { id: 'note', header: t('column.note'), cell: (r) => r.note ?? '' },
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
        label={tr('tabs.edits')}
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
            <strong>{who(r)}</strong>
            <span>{field(r)}</span>
            <span>{value(r)}</span>
            {r.note && <span className="admin-muted">{r.note}</span>}
          </div>
        )}
      />
      <ConfirmDialog
        open={refusing !== null}
        title={refusing ? t('reject_title', { name: who(refusing), field: field(refusing) }) : ''}
        message={
          failure && <p className="admin-error">{failure.details[0]?.message ?? failure.message}</p>
        }
        tone="danger"
        reasonRequired
        reasonLabel={tr('reason')}
        confirmLabel={t('reject_confirm')}
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
