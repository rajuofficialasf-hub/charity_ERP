import { PERMISSION_SETS, type PermissionSet } from '@css/shared/projects';
import {
  Alert,
  Button,
  DataTable,
  Dialog,
  SelectField,
  Switch,
  TextField,
  type DataTableExtendedColumn,
} from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { type Address, AddressFields } from '../../../features/registration/AddressFields';
import { ApiFailure } from '../../../api/client';
import { assign, type Assignment, type Candidate, candidates } from './project-volunteers-api';
import { LoadError } from '../../../components/LoadError';

const BY_TYPE = 'by_type';
const NO_AREA: Address = { divisionId: null, districtId: null, upazilaId: null, unionId: null };

/**
 * Assigns several volunteers of the caller's areas at once (BR-037, BR-038): the approved, not
 * blocked volunteers the server offers, filtered by area and searched by name or mobile, with one
 * permission set for all (by default the one of each volunteer's type) and, for the RPM, the paid
 * flag. A set a type cannot hold is refused by the server; each assignment can be changed later.
 */
export function AssignDialog({
  projectId,
  markPaid,
  onClose,
  onDone,
}: {
  projectId: string;
  /** The caller may mark volunteers as paid (the RPM and the global roles). */
  markPaid: boolean;
  onClose: () => void;
  onDone: (assigned: Assignment[]) => void;
}) {
  const t = useTranslations('admin.projects.volunteers');
  const td = useTranslations('admin.projects.volunteers.dialog');
  const tc = useTranslations('common');
  const [area, setArea] = useState<Address>(NO_AREA);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [set, setSet] = useState<string>(BY_TYPE);
  const [paid, setPaid] = useState(false);
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const filter = {
    ...(area.districtId ? { districtId: area.districtId } : {}),
    ...(area.upazilaId ? { upazilaId: area.upazilaId } : {}),
    ...(area.unionId ? { unionId: area.unionId } : {}),
    ...(q.trim().length >= 2 ? { q: q.trim() } : {}),
  };
  const list = useQuery({
    queryKey: ['admin', 'volunteer-candidates', projectId, filter, pages],
    queryFn: async () => {
      const rows: Candidate[] = [];
      let next: string | null = null;
      for (const cursor of pages) {
        const page = await candidates(projectId, filter, cursor);
        rows.push(...page.data);
        next = page.meta.nextCursor;
      }
      return { rows, next };
    },
  });
  const save = useMutation({
    mutationFn: () =>
      assign(projectId, {
        volunteers: [...selected].map((volunteerId) => ({
          volunteerId,
          ...(set !== BY_TYPE ? { permissionSet: set as PermissionSet } : {}),
          isPaid: markPaid && paid,
        })),
      }),
    onSuccess: onDone,
  });
  const changeFilter = (apply: () => void) => {
    apply();
    // a choice is made among the volunteers on screen: a new filter starts a new choice
    setSelected(new Set());
    setPages([null]);
  };
  const columns: DataTableExtendedColumn<Candidate>[] = [
    { id: 'name', header: t('column.name'), cell: (c) => c.displayName, isRowHeader: true },
    { id: 'type', header: t('column.type'), cell: (c) => t(`type.${c.type}`) },
    {
      id: 'set',
      header: t('column.set'),
      cell: (c) => (c.defaultPermissionSet ? t(`set.${c.defaultPermissionSet}`) : ''),
      priority: 2,
    },
  ];
  return (
    <Dialog
      title={td('title')}
      size="large"
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {tc('action.cancel')}
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={selected.size === 0}
            loading={save.isPending}
          >
            {td('submit')}
          </Button>
        </>
      }
    >
      {save.error instanceof ApiFailure && (
        <Alert tone="error">{save.error.details[0]?.message ?? save.error.message}</Alert>
      )}
      <AddressFields optional value={area} onChange={(a) => changeFilter(() => setArea(a))} />
      <TextField
        label={td('search')}
        maxLength={100}
        value={q}
        onChange={(value) => changeFilter(() => setQ(value))}
      />
      <DataTable
        label={td('candidates')}
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(c) => c.volunteerId}
        rowLabel={(c) => c.displayName}
        loading={list.isPending}
        selectionMode="multiple"
        selectedIds={selected}
        onSelectionChange={setSelected}
        error={
          list.error ? (
            <LoadError error={list.error} onRetry={() => void list.refetch()} />
          ) : undefined
        }
        emptyTitle={td('no_candidates')}
        cardRenderer={(c) => (
          <div className="admin-permission-card">
            <strong>{c.displayName}</strong>
            <span>{t(`type.${c.type}`)}</span>
          </div>
        )}
      />
      {list.data?.next && (
        <Button variant="text" size="small" onClick={() => setPages([...pages, list.data!.next])}>
          {td('more')}
        </Button>
      )}
      <p className="admin-muted">{td('selected', { count: String(selected.size) })}</p>
      <SelectField
        label={td('set')}
        value={set}
        onChange={(value) => setSet(value ?? BY_TYPE)}
        searchable={false}
        options={[
          { value: BY_TYPE, label: td('set_by_type') },
          ...PERMISSION_SETS.map((s) => ({ value: s, label: t(`set.${s}`) })),
        ]}
      />
      {markPaid && <Switch label={td('paid')} checked={paid} onChange={setPaid} />}
    </Dialog>
  );
}
