import { localized, type Locale } from '@css/shared/i18n';
import { editableIn, STAFF_ACCESS_ROLES } from '@css/shared/projects';
import {
  Alert,
  Button,
  Checkbox,
  CheckboxGroup,
  Dialog,
  Form,
  FormTextField,
  IconButton,
  SelectField,
} from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { locations } from '../../../features/registration/registration-api';
import { showFailure, useSchemaResolver } from '../../../lib/form-schema';
import { type PanelUser, UserSearch } from '../../UserSearch';
import {
  addStaff,
  type Area,
  candidates,
  endStaff,
  setStaffDistricts,
  type StaffAccess,
} from './setup-api';
import { SaveRow, SetupSection, useSetup, useStepSave } from './setup-context';

type Role = (typeof STAFF_ACCESS_ROLES)[number];

/**
 * A new access: the role, the person who holds it, the area (or the whole project), the districts
 * of the area (none is the whole area) and its rights.
 */
const ACCESS_SCHEMA = z
  .object({
    roleKey: z.string(),
    person: z.custom<PanelUser | null>(),
    areaId: z.string(),
    districtIds: z.array(z.string()),
    canEdit: z.boolean(),
    canDelete: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!v.roleKey)
      ctx.addIssue({ code: 'custom', path: ['roleKey'], message: 'validation.required' });
    if (!v.person)
      ctx.addIssue({ code: 'custom', path: ['person'], message: 'validation.required' });
  });
type AccessFields = z.infer<typeof ACCESS_SCHEMA>;
const NO_ACCESS: AccessFields = {
  roleKey: '',
  person: null,
  areaId: '',
  districtIds: [],
  canEdit: false,
  canDelete: false,
};

/** A reason of three letters at least, as the server requires. */
const END_SCHEMA = z.object({ reason: z.string().trim().min(3) });
type EndFields = z.infer<typeof END_SCHEMA>;

/** The districts of a division, from the public location list the address fields use. */
function useDistricts(divisionId: string | null) {
  return useQuery({
    queryKey: ['locations', divisionId],
    queryFn: () => locations(divisionId!),
    enabled: divisionId !== null,
    staleTime: 60 * 60_000,
  });
}

/** The districts of an area to tick; none ticked leaves the place its whole area. */
function DistrictChoice({
  divisionId,
  value,
  onChange,
}: {
  divisionId: string;
  value: readonly string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations('admin.projects.setup');
  const locale = useLocale() as Locale;
  const districts = useDistricts(divisionId);
  return (
    <CheckboxGroup
      label={t('staff_districts')}
      hint={t('staff_districts_hint')}
      columns={2}
      value={value}
      onChange={onChange}
      options={(districts.data ?? []).map((d) => ({
        value: d.id,
        label: localized(d.name, locale),
      }))}
    />
  );
}

/**
 * The part of its area a place holds: its districts by name, in the order of the area's own
 * list, or the whole area.
 */
function PlacePart({ access }: { access: StaffAccess }) {
  const t = useTranslations('admin.projects.setup');
  const locale = useLocale() as Locale;
  const held = access.districtIds.length > 0;
  const districts = useDistricts(held ? access.areaLocationId : null);
  if (!held) return <>{t('whole_area')}</>;
  const names = (districts.data ?? [])
    .filter((d) => access.districtIds.includes(d.id))
    .map((d) => localized(d.name, locale));
  return <>{names.join(', ')}</>;
}

/**
 * Staff access on the project: a Project Executive or an Official দায়ী gets view, edit or delete
 * access, in an area or on the whole project, and inside a division in one or several of its
 * districts (docs/security/RBAC.md, "Data scopes and their resolution"). An RPM gives view and
 * edit in its own areas; only the PM gives delete. Ending access takes a reason.
 */
export function StaffSection({
  staff,
  areas,
  manage,
}: {
  staff: StaffAccess[];
  areas: Area[];
  /** The caller gives access here: the PM and the global roles, or an RPM of the project. */
  manage: boolean;
}) {
  const { project, phone, configure, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const tr = useTranslations('admin.projects.setup.role');
  const locale = useLocale() as Locale;
  const form = useForm<AccessFields>({
    resolver: useSchemaResolver(ACCESS_SCHEMA),
    defaultValues: NO_ACCESS,
    reValidateMode: 'onSubmit',
  });
  const { roleKey, person, areaId } = useWatch({ control: form.control }) as AccessFields;
  const [ending, setEnding] = useState<StaffAccess | null>(null);
  const [placing, setPlacing] = useState<StaffAccess | null>(null);
  const can = manage && !phone && editableIn(project.status, 'staff');
  // the areas of the project, once each (a district split among RPMs is listed once)
  const places = [...new Map(areas.map((a) => [a.locationId, a])).values()];
  const placeName = (locationId: string | null) => {
    const area = places.find((a) => a.locationId === locationId);
    return area ? localized(area.locationName, locale) : t('whole_project');
  };
  // districts are chosen inside a division; an area that is itself a district has none
  const isDivision = (locationId: string | null) =>
    places.some((a) => a.locationId === locationId && a.level === 'division');

  const add = useMutation({
    mutationFn: (v: AccessFields) =>
      addStaff(project.id, {
        userId: v.person!.id,
        roleKey: v.roleKey as Role,
        ...(v.areaId ? { areaLocationId: v.areaId } : {}),
        // no district chosen: the place holds its whole area
        districtIds: isDivision(v.areaId) ? v.districtIds : [],
        canView: true,
        canEdit: v.canEdit,
        canDelete: v.canDelete,
      }),
    onSuccess: () => {
      form.reset(NO_ACCESS);
      refresh();
    },
  });
  // Enter in a field submits too; an add already on its way is not sent again
  const submit = (v: AccessFields) => {
    if (!add.isPending) add.mutate(v);
  };

  // an access filled in but not given yet is given when the wizard moves on; half of one stays
  const problem = useStepSave({
    changed: can && Boolean(person || roleKey || areaId),
    invalid: person && roleKey && (configure || areaId) ? undefined : tz('staff_incomplete'),
    save: () => add.mutateAsync(form.getValues()),
  });

  return (
    <SetupSection id="staff" title={t('section.staff')}>
      {staff.length === 0 ? (
        <p className="admin-muted">{t('no_staff')}</p>
      ) : (
        <ul className="admin-setup-list">
          {staff.map((s) => (
            <li key={s.id}>
              <span>
                <strong>{s.displayName}</strong> ·{' '}
                {tr(s.roleKey as (typeof STAFF_ACCESS_ROLES)[number])} ·{' '}
                {placeName(s.areaLocationId)}
                {s.areaLocationId && (
                  <Fragment>
                    {' ('}
                    <PlacePart access={s} />
                    {')'}
                  </Fragment>
                )}{' '}
                ·{' '}
                {[
                  s.canView && t('access.view'),
                  s.canEdit && t('access.edit'),
                  s.canDelete && t('access.delete'),
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
              {can && isDivision(s.areaLocationId) && (
                <IconButton
                  label={t('change_districts', { name: s.displayName })}
                  icon="edit"
                  onClick={() => setPlacing(s)}
                />
              )}
              {manage && !phone && (
                <IconButton
                  label={t('end_access', { name: s.displayName })}
                  icon="user-minus"
                  onClick={() => setEnding(s)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {can && (
        <>
          <h3 className="admin-setup-subtitle">{t('add_staff')}</h3>
          <Form form={form} onSubmit={submit} label={t('add_staff')}>
            <div className="admin-setup-grid">
              <Controller
                control={form.control}
                name="roleKey"
                render={({ field }) => (
                  <SelectField
                    label={t('staff_role')}
                    value={field.value}
                    onChange={(role) => {
                      // the person is looked up among the holders of the role
                      field.onChange(role ?? '');
                      form.setValue('person', null);
                    }}
                    searchable={false}
                    options={STAFF_ACCESS_ROLES.map((r) => ({ value: r, label: tr(r) }))}
                  />
                )}
              />
              {roleKey && (
                <Controller
                  control={form.control}
                  name="person"
                  render={({ field }) => (
                    <UserSearch
                      // a new role starts a new search, without the text of the last one
                      key={roleKey}
                      label={t('person')}
                      selected={field.value}
                      onSelect={field.onChange}
                      search={{
                        key: `${roleKey}:${project.id}`,
                        find: (q) => candidates(project.id, roleKey, q),
                      }}
                    />
                  )}
                />
              )}
              <Controller
                control={form.control}
                name="areaId"
                render={({ field }) => (
                  <SelectField
                    label={t('staff_area')}
                    hint={configure ? t('staff_area_hint') : undefined}
                    value={field.value}
                    onChange={(id) => {
                      // the districts belong to the area they were ticked in
                      field.onChange(id ?? '');
                      form.setValue('districtIds', []);
                    }}
                    searchable={false}
                    options={places.map((a) => ({
                      value: a.locationId,
                      label: localized(a.locationName, locale),
                    }))}
                  />
                )}
              />
            </div>
            {isDivision(areaId) && (
              <Controller
                control={form.control}
                name="districtIds"
                render={({ field }) => (
                  <DistrictChoice
                    divisionId={areaId}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
            )}
            <div className="admin-setup-checks">
              <Checkbox label={t('access.view')} checked onChange={() => undefined} disabled />
              <Controller
                control={form.control}
                name="canEdit"
                render={({ field }) => (
                  <Checkbox
                    label={t('access.edit')}
                    checked={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              {configure && (
                <Controller
                  control={form.control}
                  name="canDelete"
                  render={({ field }) => (
                    <Checkbox
                      label={t('access.delete')}
                      checked={field.value}
                      onChange={field.onChange}
                    />
                  )}
                />
              )}
            </div>
            {problem && <Alert tone="warning">{problem}</Alert>}
            <SaveRow
              mutation={add}
              onSave={() => void form.handleSubmit(submit)()}
              disabled={!person || !roleKey || (!configure && !areaId)}
              label={t('add_staff')}
            />
          </Form>
        </>
      )}
      {placing && (
        <DistrictsDialog
          access={placing}
          onClose={() => setPlacing(null)}
          onDone={() => {
            setPlacing(null);
            refresh();
          }}
        />
      )}
      {ending && (
        <EndAccessDialog
          access={ending}
          onClose={() => setEnding(null)}
          onDone={() => {
            setEnding(null);
            refresh();
          }}
        />
      )}
    </SetupSection>
  );
}

/** The districts of a place given earlier, replaced as a whole; none gives the whole area back. */
function DistrictsDialog({
  access,
  onClose,
  onDone,
}: {
  access: StaffAccess;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin.projects.setup');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const [chosen, setChosen] = useState<string[]>(access.districtIds);
  const save = useMutation({
    mutationFn: () => setStaffDistricts(access.id, chosen),
    onSuccess: onDone,
  });
  const title = t('change_districts', { name: access.displayName });
  return (
    <Dialog
      title={title}
      size="small"
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending}>
            {tc('save')}
          </Button>
        </>
      }
    >
      {save.isError && <Alert tone="error">{ts('text')}</Alert>}
      <DistrictChoice divisionId={access.areaLocationId!} value={chosen} onChange={setChosen} />
    </Dialog>
  );
}

function EndAccessDialog({
  access,
  onClose,
  onDone,
}: {
  access: StaffAccess;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin.projects.setup');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const form = useForm<EndFields>({
    resolver: useSchemaResolver(END_SCHEMA),
    defaultValues: { reason: '' },
    reValidateMode: 'onSubmit',
  });
  const ready = END_SCHEMA.safeParse(useWatch({ control: form.control })).success;
  const pending = form.formState.isSubmitting;
  const title = t('end_access', { name: access.displayName });

  const end = async ({ reason }: EndFields) => {
    try {
      await endStaff(access.id, reason.trim());
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    onDone();
  };

  return (
    <Dialog
      title={title}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button
            variant="danger"
            onClick={() => void form.handleSubmit(end)()}
            disabled={!ready}
            loading={pending}
          >
            {t('end')}
          </Button>
        </>
      }
    >
      <Form
        form={form}
        onSubmit={end}
        label={title}
        error={form.formState.errors.root?.server?.message}
      >
        <FormTextField name="reason" rows={4} label={t('reason')} required maxLength={1000} />
      </Form>
    </Dialog>
  );
}
