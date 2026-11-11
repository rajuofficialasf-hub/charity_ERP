import { PERMISSION_SETS, type PermissionSet } from '@css/shared/projects';
import {
  Button,
  DataTable,
  Dialog,
  Form,
  FormSelectField,
  Switch,
  TextField,
  type DataTableExtendedColumn,
} from '@/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { type Address, AddressFields } from '../../../features/registration/AddressFields';
import { ApiFailure } from '../../../api/client';
import { showFailure, useSchemaResolver } from '../../../lib/form-schema';
import { assign, type Assignment, type Candidate, candidates } from './project-volunteers-api';
import { LoadError } from '../../../components/LoadError';

const BY_TYPE = 'by_type';
const NO_AREA: Address = { divisionId: null, districtId: null, upazilaId: null, unionId: null };

/** The filter of the candidates, the volunteers chosen among them, one set for all, the paid flag. */
const ASSIGN_SCHEMA = z.object({
  area: z.custom<Address>(),
  q: z.string(),
  volunteerIds: z.array(z.string()).min(1),
  permissionSet: z.enum([BY_TYPE, ...PERMISSION_SETS]),
  isPaid: z.boolean(),
});
type AssignFields = z.infer<typeof ASSIGN_SCHEMA>;

/**
 * Assigns several volunteers of the caller's areas at once: the approved, not
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
  const form = useForm<AssignFields>({
    resolver: useSchemaResolver(ASSIGN_SCHEMA),
    defaultValues: {
      area: NO_AREA,
      q: '',
      volunteerIds: [],
      permissionSet: BY_TYPE,
      isPaid: false,
    },
    reValidateMode: 'onSubmit',
  });
  const { area, q, volunteerIds } = useWatch({ control: form.control }) as AssignFields;
  const pending = form.formState.isSubmitting;
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
  const save = async (v: AssignFields) => {
    let assigned: Assignment[];
    try {
      assigned = await assign(projectId, {
        volunteers: v.volunteerIds.map((volunteerId) => ({
          volunteerId,
          ...(v.permissionSet !== BY_TYPE
            ? { permissionSet: v.permissionSet as PermissionSet }
            : {}),
          isPaid: markPaid && v.isPaid,
        })),
      });
    } catch (failure) {
      // the one set chosen goes to every volunteer: a set refused for any of them is the set's
      const set =
        failure instanceof ApiFailure
          ? failure.details.find((d) => d.path?.endsWith('.permissionSet'))
          : undefined;
      if (set) form.setError('permissionSet', { type: 'server', message: set.message });
      else showFailure(form, failure, tc('state.error.text'));
      return;
    }
    onDone(assigned);
  };
  /** A choice is made among the volunteers on screen: a new filter starts a new choice. */
  const changeFilter = (apply: () => void) => {
    apply();
    form.setValue('volunteerIds', []);
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
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('action.cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(save)()}
            disabled={volunteerIds.length === 0}
            loading={pending}
          >
            {td('submit')}
          </Button>
        </>
      }
    >
      <Controller
        control={form.control}
        name="area"
        render={({ field }) => (
          <AddressFields
            optional
            value={field.value}
            onChange={(a) => changeFilter(() => field.onChange(a))}
          />
        )}
      />
      <Controller
        control={form.control}
        name="q"
        render={({ field }) => (
          <TextField
            label={td('search')}
            maxLength={100}
            value={field.value}
            onChange={(value) => changeFilter(() => field.onChange(value))}
          />
        )}
      />
      <DataTable
        label={td('candidates')}
        columns={columns}
        rows={list.data?.rows ?? []}
        getRowId={(c) => c.volunteerId}
        rowLabel={(c) => c.displayName}
        loading={list.isPending}
        selectionMode="multiple"
        selectedIds={new Set(volunteerIds)}
        onSelectionChange={(ids) => form.setValue('volunteerIds', [...ids])}
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
      {/* the filters and the list stay outside the form element: Enter in the search sends nothing */}
      <Form
        form={form}
        onSubmit={save}
        label={td('title')}
        error={form.formState.errors.root?.server?.message}
      >
        <p className="admin-muted">{td('selected', { count: String(volunteerIds.length) })}</p>
        <FormSelectField
          name="permissionSet"
          label={td('set')}
          searchable={false}
          options={[
            { value: BY_TYPE, label: td('set_by_type') },
            ...PERMISSION_SETS.map((s) => ({ value: s, label: t(`set.${s}`) })),
          ]}
        />
        {markPaid && (
          <Controller
            control={form.control}
            name="isPaid"
            render={({ field }) => (
              <Switch label={td('paid')} checked={field.value} onChange={field.onChange} />
            )}
          />
        )}
      </Form>
    </Dialog>
  );
}
