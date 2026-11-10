import { type SmsProviderSetting, smsProviderSettingSchema } from '@css/shared/settings';
import {
  Alert,
  Button,
  Card,
  Chip,
  DescriptionList,
  Form,
  FormTextField,
  Grid,
  Skeleton,
  Stack,
  Switch,
} from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Controller, useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { type Channels, CHANNELS_KEY, channels, setSms } from './settings-api';
import { LoadError } from '../../components/LoadError';

/** The red production warning while the fixed development code stands in for SMS and email. */
export function DummyOtpAlert({ on }: { on: boolean }) {
  const t = useTranslations('admin.settings.channels');
  return on ? (
    <Alert tone="error" title={t('dummy_title')}>
      {t('dummy_text')}
    </Alert>
  ) : (
    <Alert tone="success">{t('dummy_off')}</Alert>
  );
}

/** The SMS fields as typed: the body sent is trimmed, with empty text as null. */
type SmsFields = { provider: string; senderId: string; endpoint: string; enabled: boolean };
const text = (value: string) => (value.trim() === '' ? null : value.trim());
const bodyOf = (v: SmsFields): SmsProviderSetting => ({
  provider: text(v.provider),
  senderId: text(v.senderId),
  endpoint: text(v.endpoint),
  enabled: v.enabled,
});
/** The setting's own rules, checked on the body the fields make. */
const SMS_SCHEMA = z
  .object({
    provider: z.string(),
    senderId: z.string(),
    endpoint: z.string(),
    enabled: z.boolean(),
  })
  .transform(bodyOf)
  .pipe(smsProviderSettingSchema);

function SmsForm({ data, onSaved }: { data: Channels; onSaved: () => void }) {
  const t = useTranslations('admin.settings.channels');
  const ts = useTranslations('admin.settings');
  const te = useTranslations('common.state.error');
  const form = useForm<SmsFields>({
    resolver: useSchemaResolver(SMS_SCHEMA),
    defaultValues: {
      provider: data.sms.config.provider ?? '',
      senderId: data.sms.config.senderId ?? '',
      endpoint: data.sms.config.endpoint ?? '',
      enabled: data.sms.config.enabled,
    },
    reValidateMode: 'onSubmit',
  });
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (v: SmsFields) => setSms(bodyOf(v)),
    onSuccess: (next) => {
      queryClient.setQueryData(CHANNELS_KEY, next);
      onSaved();
    },
    onError: (failure) => showFailure(form, failure, te('text')),
  });
  // Enter in a field submits too; a save already on its way is not sent again
  const submit = (v: SmsFields) => {
    if (!save.isPending) save.mutate(v);
  };
  return (
    <Form
      form={form}
      onSubmit={submit}
      label={t('sms_title')}
      error={form.formState.errors.root?.server?.message}
    >
      <Grid columns={{ base: 1, md: 2 }} gap={3}>
        <FormTextField
          name="provider"
          label={t('provider')}
          hint={t('provider_hint')}
          lang="en"
          maxLength={40}
        />
        <FormTextField name="senderId" label={t('sender')} lang="en" maxLength={20} />
        <FormTextField
          name="endpoint"
          label={t('endpoint')}
          hint={t('endpoint_hint')}
          lang="en"
          maxLength={500}
        />
      </Grid>
      <Controller
        control={form.control}
        name="enabled"
        render={({ field }) => (
          <Switch label={t('enabled')} checked={field.value} onChange={field.onChange} />
        )}
      />
      <div className="admin-form-actions">
        <Button type="submit" loading={save.isPending}>
          {ts('save')}
        </Button>
      </div>
    </Form>
  );
}

/** SMTP read-only, the SMS adapter configuration and the dummy OTP state; no secret is shown. */
export function ChannelsPanel({ onSaved }: { onSaved: () => void }) {
  const t = useTranslations('admin.settings.channels');
  const query = useQuery({ queryKey: CHANNELS_KEY, queryFn: channels });
  if (query.isPending) return <Skeleton count={4} />;
  if (query.error) return <LoadError error={query.error} onRetry={() => void query.refetch()} />;
  const { smtp, sms, otpDummy } = query.data;
  const yesNo = (value: boolean) => (value ? t('yes') : t('no'));
  return (
    <Stack gap={4}>
      <DummyOtpAlert on={otpDummy} />
      <Card title={t('smtp_title')} headingLevel={2}>
        <p className="admin-muted">{t('smtp_hint')}</p>
        <DescriptionList
          items={[
            { label: t('smtp_host'), value: <span lang="en">{smtp.host}</span> },
            { label: t('smtp_port'), value: smtp.port },
            { label: t('smtp_secure'), value: yesNo(smtp.secure) },
            { label: t('smtp_from'), value: <span lang="en">{smtp.from}</span> },
            { label: t('smtp_login'), value: smtp.loginSet ? t('login_set') : t('login_missing') },
          ]}
        />
      </Card>
      <Card title={t('sms_title')} headingLevel={2}>
        <p className="admin-muted">{t('sms_hint')}</p>
        <DescriptionList
          items={[
            { label: t('sms_mode'), value: t(`mode.${sms.mode}`) },
            {
              label: t('key'),
              value: (
                <Chip tone={sms.keyPresent ? 'success' : 'warning'}>
                  {sms.keyPresent ? t('key_present') : t('key_missing')}
                </Chip>
              ),
            },
          ]}
        />
        <SmsForm data={query.data} onSaved={onSaved} />
      </Card>
    </Stack>
  );
}
