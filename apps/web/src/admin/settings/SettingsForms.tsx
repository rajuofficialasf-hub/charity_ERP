import { toEnglishDigits } from '@css/shared';
import { formatDateTime } from '@css/shared/format';
import type { Locale } from '@css/shared/i18n';
import type {
  GeneralSettingKey,
  LocalizationSetting,
  MonitoringThresholds,
  OrganisationSetting,
} from '@css/shared/settings';
import { Alert, Button, Card, Grid, SelectField, TextField } from '@/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { PUBLIC_SETTINGS_KEY } from '../../lib/public-settings';
import { type SettingEntry, SETTINGS_KEY, updateSetting } from './settings-api';

/** Saves one setting key and reports the field errors the server names under `value.<field>`. */
function useSave<K extends GeneralSettingKey>(key: K, onSaved: () => void) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (value: unknown) => updateSetting(key, value as never),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });
      // the organisation and the default language are also public
      void queryClient.invalidateQueries({ queryKey: PUBLIC_SETTINGS_KEY });
      onSaved();
    },
  });
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  const fieldError = (field: string) =>
    failure?.details.find((d) => d.path === `value.${field}`)?.message;
  const general = failure && !failure.details.some((d) => d.path?.startsWith('value.'));
  return { save, fieldError, generalError: general ? failure.message : undefined };
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

function SaveRow({ pending, error }: { pending: boolean; error?: string }) {
  const t = useTranslations('admin.settings');
  return (
    <>
      {error && <Alert tone="error">{error}</Alert>}
      <div className="admin-form-actions">
        <Button type="submit" loading={pending}>
          {t('save')}
        </Button>
      </div>
    </>
  );
}

const submitWith = (fn: () => void) => (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  fn();
};

/** The Foundation's and the department's names, the address and the contact. */
export function OrganisationForm({
  entry,
  onSaved,
}: {
  entry: SettingEntry<OrganisationSetting>;
  onSaved: () => void;
}) {
  const t = useTranslations('admin.settings.organisation');
  const [v, setV] = useState(entry.value);
  const { save, fieldError, generalError } = useSave('organisation', onSaved);
  const text = (group: 'foundationName' | 'departmentName' | 'address', lang: 'bn' | 'en') => ({
    // eslint-disable-next-line security/detect-object-injection -- typed keys
    value: v[group][lang],
    // eslint-disable-next-line security/detect-object-injection -- typed keys
    onChange: (value: string) => setV({ ...v, [group]: { ...v[group], [lang]: value } }),
    error: fieldError(group),
    ...(lang === 'en' ? { lang: 'en' } : {}),
  });
  return (
    <Card>
      <p className="admin-muted">{t('hint')}</p>
      <Changed entry={entry} />
      <form
        method="post"
        noValidate
        onSubmit={submitWith(() => save.mutate(v))}
        aria-label={t('form')}
      >
        <Grid columns={{ base: 1, md: 2 }} gap={3}>
          <TextField
            label={t('foundation_bn')}
            required
            maxLength={200}
            {...text('foundationName', 'bn')}
          />
          <TextField
            label={t('foundation_en')}
            required
            maxLength={200}
            {...text('foundationName', 'en')}
          />
          <TextField
            label={t('department_bn')}
            required
            maxLength={200}
            {...text('departmentName', 'bn')}
          />
          <TextField
            label={t('department_en')}
            required
            maxLength={200}
            {...text('departmentName', 'en')}
          />
          <TextField label={t('address_bn')} required maxLength={500} {...text('address', 'bn')} />
          <TextField label={t('address_en')} required maxLength={500} {...text('address', 'en')} />
          <TextField
            label={t('phone')}
            required
            inputMode="tel"
            maxLength={11}
            value={v.phone}
            onChange={(phone) => setV({ ...v, phone })}
            error={fieldError('phone')}
          />
          <TextField
            label={t('email')}
            type="email"
            required
            maxLength={254}
            value={v.email}
            onChange={(email) => setV({ ...v, email })}
            error={fieldError('email')}
          />
        </Grid>
        <SaveRow pending={save.isPending} error={generalError} />
      </form>
    </Card>
  );
}

/** The language of a device without a choice and of a new official created without one. */
export function LanguageForm({
  entry,
  onSaved,
}: {
  entry: SettingEntry<LocalizationSetting>;
  onSaved: () => void;
}) {
  const t = useTranslations('admin.settings.language');
  const tl = useTranslations('common.language');
  const [language, setLanguage] = useState(entry.value.defaultLanguage);
  const { save, generalError } = useSave('localization', onSaved);
  return (
    <Card>
      <Changed entry={entry} />
      <form
        method="post"
        noValidate
        onSubmit={submitWith(() => save.mutate({ defaultLanguage: language }))}
        aria-label={t('form')}
      >
        <SelectField
          label={t('default')}
          hint={t('hint')}
          required
          options={[
            { value: 'bn', label: tl('bn') },
            { value: 'en', label: tl('en') },
          ]}
          value={language}
          onChange={(id) => setLanguage(id === 'en' ? 'en' : 'bn')}
        />
        <SaveRow pending={save.isPending} error={generalError} />
      </form>
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
const LABEL = {
  reviewPendingDays: 'review_pending_days',
  approvalPendingDays: 'approval_pending_days',
  noUpdateDays: 'no_update_days',
  inactiveVolunteerDays: 'inactive_volunteer_days',
  budgetAlertPercent: 'budget_alert_percent',
} as const;

/** When the monitoring work raises an alert; the alerts themselves come with the monitoring work. */
export function ThresholdsForm({
  entry,
  onSaved,
}: {
  entry: SettingEntry<MonitoringThresholds>;
  onSaved: () => void;
}) {
  const t = useTranslations('admin.settings.thresholds');
  const [v, setV] = useState<Record<string, string>>(
    // eslint-disable-next-line security/detect-object-injection -- f is one of THRESHOLD_FIELDS
    Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f, String(entry.value[f])])),
  );
  const { save, fieldError, generalError } = useSave('monitoring.thresholds', onSaved);
  const submit = () =>
    // eslint-disable-next-line security/detect-object-injection -- f is one of THRESHOLD_FIELDS
    save.mutate(Object.fromEntries(THRESHOLD_FIELDS.map((f) => [f, Number(v[f])])));
  return (
    <Card>
      <p className="admin-muted">{t('intro')}</p>
      <Changed entry={entry} />
      <form method="post" noValidate onSubmit={submitWith(submit)} aria-label={t('form')}>
        <Grid columns={{ base: 1, md: 2 }} gap={3}>
          {THRESHOLD_FIELDS.map((field) => (
            <TextField
              key={field}
              // eslint-disable-next-line security/detect-object-injection -- typed keys
              label={t(LABEL[field])}
              hint={field === 'budgetAlertPercent' ? t('percent_hint') : t('days_hint')}
              required
              inputMode="numeric"
              maxLength={3}
              // eslint-disable-next-line security/detect-object-injection -- typed keys
              value={v[field] ?? ''}
              onChange={(value) =>
                setV({ ...v, [field]: toEnglishDigits(value).replace(/[^0-9]/g, '') })
              }
              error={fieldError(field)}
            />
          ))}
        </Grid>
        <SaveRow pending={save.isPending} error={generalError} />
      </form>
    </Card>
  );
}
