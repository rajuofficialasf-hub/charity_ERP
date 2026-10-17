import type { SmsProviderSetting } from '@css/shared/settings';
import {
  Alert,
  Badge,
  Button,
  Card,
  ErrorState,
  Form,
  FormGrid,
  Skeleton,
  Switch,
  TextField,
} from '@css/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { type Channels, CHANNELS_KEY, channels, setSms } from './settings-api';

/** The red production warning while the fixed development code stands in for SMS and email. */
export function DummyOtpAlert({ on }: { on: boolean }) {
  const t = useTranslations('admin.settings.channels');
  return on ? (
    <Alert tone="danger" title={t('dummy_title')}>
      {t('dummy_text')}
    </Alert>
  ) : (
    <Alert tone="success">{t('dummy_off')}</Alert>
  );
}

function SmsForm({ data, onSaved }: { data: Channels; onSaved: () => void }) {
  const t = useTranslations('admin.settings.channels');
  const ts = useTranslations('admin.settings');
  const [v, setV] = useState<SmsProviderSetting>(data.sms.config);
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => setSms(v),
    onSuccess: (next) => {
      queryClient.setQueryData(CHANNELS_KEY, next);
      onSaved();
    },
  });
  const failure = save.error instanceof ApiFailure ? save.error : undefined;
  const detail = (path: string) => failure?.details.find((d) => d.path === path)?.message;
  const text = (value: string) => (value.trim() === '' ? null : value.trim());
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate();
  };
  return (
    <Form onSubmit={submit} aria-label={t('sms_title')}>
      <FormGrid>
        <TextField
          label={t('provider')}
          helper={t('provider_hint')}
          lang="en"
          maxLength={40}
          value={v.provider ?? ''}
          onChange={(provider) => setV({ ...v, provider: text(provider) })}
          error={detail('provider')}
        />
        <TextField
          label={t('sender')}
          lang="en"
          maxLength={20}
          value={v.senderId ?? ''}
          onChange={(senderId) => setV({ ...v, senderId: text(senderId) })}
          error={detail('senderId')}
        />
        <TextField
          label={t('endpoint')}
          helper={t('endpoint_hint')}
          lang="en"
          maxLength={500}
          value={v.endpoint ?? ''}
          onChange={(endpoint) => setV({ ...v, endpoint: text(endpoint) })}
          error={detail('endpoint')}
        />
      </FormGrid>
      <Switch isSelected={v.enabled} onChange={(enabled) => setV({ ...v, enabled })}>
        {t('enabled')}
      </Switch>
      {failure && !failure.details.length && (
        <Alert tone="danger" live="alert">
          {failure.message}
        </Alert>
      )}
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
  const tc = useTranslations('common');
  const query = useQuery({ queryKey: CHANNELS_KEY, queryFn: channels });
  if (query.isPending) return <Skeleton count={4} />;
  if (query.error)
    return (
      <ErrorState
        title={tc('state.error.text')}
        requestId={query.error instanceof ApiFailure ? query.error.requestId : undefined}
        onRetry={() => void query.refetch()}
      />
    );
  const { smtp, sms, otpDummy } = query.data;
  const yesNo = (value: boolean) => (value ? t('yes') : t('no'));
  return (
    <div className="grid gap-4">
      <DummyOtpAlert on={otpDummy} />
      <Card title={t('smtp_title')} subtitle={t('smtp_hint')} headingLevel={2}>
        <dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <dt className="font-bold">{t('smtp_host')}</dt>
          <dd className="m-0" lang="en">
            {smtp.host}
          </dd>
          <dt className="font-bold">{t('smtp_port')}</dt>
          <dd className="m-0">{smtp.port}</dd>
          <dt className="font-bold">{t('smtp_secure')}</dt>
          <dd className="m-0">{yesNo(smtp.secure)}</dd>
          <dt className="font-bold">{t('smtp_from')}</dt>
          <dd className="m-0" lang="en">
            {smtp.from}
          </dd>
          <dt className="font-bold">{t('smtp_login')}</dt>
          <dd className="m-0">{smtp.loginSet ? t('login_set') : t('login_missing')}</dd>
        </dl>
      </Card>
      <Card title={t('sms_title')} subtitle={t('sms_hint')} headingLevel={2}>
        <dl className="grid gap-2 sm:grid-cols-[12rem_1fr]">
          <dt className="font-bold">{t('sms_mode')}</dt>
          <dd className="m-0">{t(`mode.${sms.mode}`)}</dd>
          <dt className="font-bold">{t('key')}</dt>
          <dd className="m-0">
            <Badge
              tone={sms.keyPresent ? 'success' : 'warning'}
              label={sms.keyPresent ? t('key_present') : t('key_missing')}
            />
          </dd>
        </dl>
        <SmsForm data={query.data} onSaved={onSaved} />
      </Card>
    </div>
  );
}
