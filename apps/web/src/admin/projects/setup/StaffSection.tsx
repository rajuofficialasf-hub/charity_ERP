import { localized, type Locale } from '@css/shared/i18n';
import { editableIn, STAFF_ACCESS_ROLES } from '@css/shared/projects';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  Form,
  FormSelectField,
  FormTextField,
  IconButton,
  SelectField,
} from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../../lib/form-schema';
import { type PanelUser, UserSearch } from '../../UserSearch';
import { addStaff, type Area, candidates, endStaff, type StaffAccess } from './setup-api';
import { SaveRow, SetupSection, useSetup, useStepSave } from './setup-context';

type Role = (typeof STAFF_ACCESS_ROLES)[number];

/** A new access: the role, the person who holds it, the area (or the whole project) and its rights. */
const ACCESS_SCHEMA = z
  .object({
    roleKey: z.string(),
    person: z.custom<PanelUser | null>(),
    areaId: z.string(),
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
  canEdit: false,
  canDelete: false,
};

/** A reason of three letters at least, as the server requires. */
const END_SCHEMA = z.object({ reason: z.string().trim().min(3) });
type EndFields = z.infer<typeof END_SCHEMA>;

/**
 * Staff access on the project: a Project Executive or an Official দায়ী gets view, edit or delete
 * access, in an area or on the whole project. An RPM gives view and edit in its own
 * areas; only the PM gives delete. Ending access takes a reason.
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
  const can = manage && !phone && editableIn(project.status, 'staff');
  // the areas of the project, once each (a district split among RPMs is listed once)
  const places = [...new Map(areas.map((a) => [a.locationId, a])).values()];
  const placeName = (locationId: string | null) => {
    const area = places.find((a) => a.locationId === locationId);
    return area ? localized(area.locationName, locale) : t('whole_project');
  };

  const add = useMutation({
    mutationFn: (v: AccessFields) =>
      addStaff(project.id, {
        userId: v.person!.id,
        roleKey: v.roleKey as Role,
        ...(v.areaId ? { areaLocationId: v.areaId } : {}),
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
                {placeName(s.areaLocationId)} ·{' '}
                {[
                  s.canView && t('access.view'),
                  s.canEdit && t('access.edit'),
                  s.canDelete && t('access.delete'),
                ]
                  .filter(Boolean)
                  .join(', ')}
              </span>
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
              <FormSelectField
                name="areaId"
                label={t('staff_area')}
                hint={configure ? t('staff_area_hint') : undefined}
                searchable={false}
                options={places.map((a) => ({
                  value: a.locationId,
                  label: localized(a.locationName, locale),
                }))}
              />
            </div>
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
