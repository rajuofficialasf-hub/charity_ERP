import { toEnglishDigits } from '@css/shared';
import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import {
  type GeneralSettingKey,
  localizationSettingSchema,
  monitoringThresholdsSchema,
  organisationSettingSchema,
} from '@css/shared/settings';
import { Button, Card, Form, FormSelectField, FormTextField, Grid } from '@/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { type FieldValues, useForm, type UseFormReturn } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { PUBLIC_SETTINGS_KEY } from '../../lib/public-settings';
import {
  type GeneralSettings,
  type SettingEntry,
  SETTINGS_KEY,
  updateSetting,
} from './settings-api';

/**
 * Saves one setting key from its form: the server's field messages, named under `value.<field>`,
 * go under their fields, and a refusal of nothing in particular shows above the form. Enter in a
 * field submits too; a save already on its way is not sent again.
 */
function useSave<T extends FieldValues>(
  key: GeneralSettingKey,
  form: UseFormReturn<T>,
  onSaved: () => void,
) {
  const queryClient = useQueryClient();
  const ts = useTranslations('common.state.error');
  const save = useMutation({
    mutationFn: (value: unknown) => updateSetting(key, value as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      // the organisation and the default language are also public
      void queryClient.invalidateQueries({ queryKey: PUBLIC_SETTINGS_KEY });
      onSaved();
    },
    onError: (failure) => showFailure(form, failure, ts('text'), { under: 'value' }),
  });
  const send = (value: unknown) => {
    if (!save.isPending) save.mutate(value);
  };
  return { send, pending: save.isPending };
}

/** When the value last changed, or that the default is still in force. */
function Changed({ entry }: { entry: SettingEntry }) {
  const t = useTranslations('admin.settings');
  const locale = useLocale() as Locale;
  return (
    <p className="admin-muted">
      {entry.updatedAt
        ? t('last_changed', { date: formatDateTime(entry.updatedAt, locale) })
        : t('default_in_force')}
    </p>
  );
}

/** A setting's form: a refusal above, the fields, and the save button. */
function SettingForm<T extends FieldValues>({
  form,
  label,
  onSubmit,
  pending,
  children,
}: {
  form: UseFormReturn<T>;
  label: string;
  onSubmit: (values: T) => void;
  pending: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('admin.settings');
  return (
    <Form
      form={form}
      onSubmit={onSubmit}
      label={label}
      error={form.formState.errors.root?.server?.message}
    >
      {children}
      <div className="admin-form-actions">
        <Button type="submit" loading={pending}>
          {t('save')}
        </Button>
      </div>
    </Form>
  );
}

type OrganisationFields = GeneralSettings['organisation']['value'];

/** The Foundation's and the department's names, the address and the contact. */
export function OrganisationForm({
  entry,
  onSaved,
}: {
  entry: GeneralSettings['organisation'];
  onSaved: () => void;
}) {
  const t = useTranslations('admin.settings.organisation');
  const form = useForm<OrganisationFields>({
    resolver: useSchemaResolver(organisationSettingSchema),
    defaultValues: entry.value,
    reValidateMode: 'onSubmit',
  });
  const { send, pending } = useSave('organisation', form, onSaved);
  return (
    <Card>
      <p className="admin-muted">{t('hint')}</p>
      <Changed entry={entry} />
      <SettingForm form={form} label={t('form')} onSubmit={send} pending={pending}>
        <Grid columns={{ base: 1, md: 2 }} gap={3}>
          <FormTextField
            name="foundationName.bn"
            label={t('foundation_bn')}
            required
            maxLength={200}
          />
          <FormTextField
            name="foundationName.en"
            label={t('foundation_en')}
            required
            maxLength={200}
            lang="en"
          />
          <FormTextField
            name="departmentName.bn"
            label={t('department_bn')}
            required
            maxLength={200}
          />
          <FormTextField
            name="departmentName.en"
            label={t('department_en')}
            required
            maxLength={200}
            lang="en"
          />
          <FormTextField name="address.bn" label={t('address_bn')} required maxLength={500} />
          <FormTextField
            name="address.en"
            label={t('address_en')}
            required
            maxLength={500}
            lang="en"
          />
          <FormTextField name="phone" label={t('phone')} required inputMode="tel" maxLength={11} />
          <FormTextField name="email" label={t('email')} type="email" required maxLength={254} />
        </Grid>
      </SettingForm>
    </Card>
  );
}

type LanguageFields = GeneralSettings['localization']['value'];

/** The language of a device without a choice and of a new official created without one. */
export function LanguageForm({
  entry,
  onSaved,
}: {
  entry: GeneralSettings['localization'];
  onSaved: () => void;
}) {
  const t = useTranslations('admin.settings.language');
  const tl = useTranslations('common.language');
  const form = useForm<LanguageFields>({
    resolver: useSchemaResolver(localizationSettingSchema),
    defaultValues: entry.value,
    reValidateMode: 'onSubmit',
  });
  const { send, pending } = useSave('localization', form, onSaved);
  return (
    <Card>
      <Changed entry={entry} />
      <SettingForm form={form} label={t('form')} onSubmit={send} pending={pending}>
        <FormSelectField
          name="defaultLanguage"
          label={t('default')}
          hint={t('hint')}
          required
          options={[
            { value: 'bn', label: tl('bn') },
            { value: 'en', label: tl('en') },
          ]}
        />
      </SettingForm>
    </Card>
  );
}

const THRESHOLD_FIELDS = [
  'reviewPendingDays',
  'approvalPendingDays',
  'noUpdateDays',
  'inactiveVolunteerDays',
  'budgetAlertPercent',
] as const;
type ThresholdFields = Record<(typeof THRESHOLD_FIELDS)[number], string>;
const LABEL = {
  reviewPendingDays: 'review_pending_days',
  approvalPendingDays: 'approval_pending_days',
  noUpdateDays: 'no_update_days',
  inactiveVolunteerDays: 'inactive_volunteer_days',
  budgetAlertPercent: 'budget_alert_percent',
} as const;

/** The thresholds as typed, each held to the setting's own rule for its number. */
const THRESHOLDS_SCHEMA = z.object({
  reviewPendingDays: z
    .string()
    .transform(Number)
    .pipe(monitoringThresholdsSchema.shape.reviewPendingDays),
  approvalPendingDays: z
    .string()
    .transform(Number)
    .pipe(monitoringThresholdsSchema.shape.approvalPendingDays),
  noUpdateDays: z.string().transform(Number).pipe(monitoringThresholdsSchema.shape.noUpdateDays),
  inactiveVolunteerDays: z
    .string()
    .transform(Number)
    .pipe(monitoringThresholdsSchema.shape.inactiveVolunteerDays),
  budgetAlertPercent: z
    .string()
    .transform(Number)
    .pipe(monitoringThresholdsSchema.shape.budgetAlertPercent),
});
const digitsOnly = (value: string) => toEnglishDigits(value).replace(/[^0-9]/g, '');

/** When the monitoring work raises an alert; the alerts themselves come with the monitoring work. */
export function ThresholdsForm({
  entry,
  onSaved,
}: {
  entry: GeneralSettings['monitoring.thresholds'];
  onSaved: () => void;
}) {
  const t = useTranslations('admin.settings.thresholds');
  const form = useForm<ThresholdFields>({
    resolver: useSchemaResolver(THRESHOLDS_SCHEMA),
    defaultValues: Object.fromEntries(
      // eslint-disable-next-line security/detect-object-injection -- f is one of THRESHOLD_FIELDS
      THRESHOLD_FIELDS.map((f) => [f, String(entry.value[f])]),
    ) as ThresholdFields,
    reValidateMode: 'onSubmit',
  });
  const { send, pending } = useSave('monitoring.thresholds', form, onSaved);
  const submit = (v: ThresholdFields) =>
    // eslint-disable-next-line security/detect-object-injection -- f is one of THRESHOLD_FIELDS
    send(Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f, Number(v[f])])));
  return (
    <Card>
      <p className="admin-muted">{t('intro')}</p>
      <Changed entry={entry} />
      <SettingForm form={form} label={t('form')} onSubmit={submit} pending={pending}>
        <Grid columns={{ base: 1, md: 2 }} gap={3}>
          {THRESHOLD_FIELDS.map((field) => (
            <FormTextField
              key={field}
              name={field}
              // eslint-disable-next-line security/detect-object-injection -- typed keys
              label={t(LABEL[field])}
              hint={field === 'budgetAlertPercent' ? t('percent_hint') : t('days_hint')}
              required
              inputMode="numeric"
              maxLength={3}
              normalize={digitsOnly}
            />
          ))}
        </Grid>
      </SettingForm>
    </Card>
  );
}
