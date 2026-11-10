import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Form, IconButton } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import {
  type Address,
  AddressFields,
  EMPTY_ADDRESS,
} from '../../../features/registration/AddressFields';
import { ApiFailure } from '../../../api/client';
import { useSchemaResolver } from '../../../lib/form-schema';
import { type PanelUser, UserSearch } from '../../UserSearch';
import { addArea, type Area, candidates, removeArea } from './setup-api';
import { SaveRow, SetupSection, useSetup, useStepSave } from './setup-context';

/** A new area: a division or a district, and its RPM. */
const AREA_SCHEMA = z
  .object({ place: z.custom<Address>(), rpm: z.custom<PanelUser | null>() })
  .superRefine((v, ctx) => {
    if (!v.place.divisionId)
      ctx.addIssue({ code: 'custom', path: ['place'], message: 'validation.required' });
    if (!v.rpm) ctx.addIssue({ code: 'custom', path: ['rpm'], message: 'validation.required' });
  });
type AreaFields = z.infer<typeof AREA_SCHEMA>;
const NO_AREA: AreaFields = { place: EMPTY_ADDRESS, rpm: null };

/**
 * The project's areas, each a division or a district with its RPM; a district may be split among
 * RPMs. An area whose location still carries staff access stays until that access ends.
 */
export function AreasSection({ areas }: { areas: Area[] }) {
  const { project, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const locale = useLocale() as Locale;
  const form = useForm<AreaFields>({
    resolver: useSchemaResolver(AREA_SCHEMA),
    defaultValues: NO_AREA,
    reValidateMode: 'onSubmit',
  });
  const { place, rpm } = useWatch({ control: form.control }) as AreaFields;
  const can = editable('areas');

  const add = useMutation({
    mutationFn: (v: AreaFields) =>
      addArea(project.id, {
        locationId: (v.place.districtId ?? v.place.divisionId)!,
        rpmUserId: v.rpm!.id,
      }),
    onSuccess: () => {
      form.reset(NO_AREA);
      refresh();
    },
  });
  const submit = (v: AreaFields) => add.mutate(v);
  const remove = useMutation({ mutationFn: removeArea, onSuccess: refresh });
  // an area filled in but not added yet is added when the wizard moves on; half of one stays
  const problem = useStepSave({
    changed: can && Boolean(place.divisionId || rpm),
    invalid: place.divisionId && rpm ? undefined : tz('area_incomplete'),
    save: () => add.mutateAsync(form.getValues()),
  });

  return (
    <SetupSection id="areas" title={t('section.areas')}>
      {areas.length === 0 ? (
        <p className="admin-muted">{t('no_areas')}</p>
      ) : (
        <ul className="admin-setup-list">
          {areas.map((a) => (
            <li key={a.id}>
              <span>
                <strong>{localized(a.locationName, locale)}</strong> · {t(`level.${a.level}`)} ·{' '}
                {a.rpmName}
              </span>
              {can && (
                <IconButton
                  label={t('remove_area', { name: localized(a.locationName, locale) })}
                  icon="delete"

                  disabled={remove.isPending && remove.variables === a.id}
                  onClick={() => remove.mutate(a.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.error instanceof ApiFailure && <Alert tone="error">{remove.error.message}</Alert>}
      {can && (
        <>
          <h3 className="admin-setup-subtitle">{t('add_area')}</h3>
          <Form form={form} onSubmit={submit} label={t('add_area')}>
            <div className="admin-setup-grid">
              <Controller
                control={form.control}
                name="place"
                render={({ field }) => (
                  <AddressFields
                    optional
                    levels={2}
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              <Controller
                control={form.control}
                name="rpm"
                render={({ field }) => (
                  <UserSearch
                    label={t('rpm')}
                    helper={t('rpm_hint')}
                    selected={field.value}
                    onSelect={field.onChange}
                    search={{
                      key: `rpm:${project.id}`,
                      find: (q) => candidates(project.id, 'regional_program_manager', q),
                    }}
                  />
                )}
              />
            </div>
            {problem && <Alert tone="warning">{problem}</Alert>}
            <SaveRow
              mutation={add}
              onSave={() => void form.handleSubmit(submit)()}
              disabled={!place.divisionId || !rpm}
              label={t('add_area')}
            />
          </Form>
        </>
      )}
    </SetupSection>
  );
}
