import type { RegistrationChannel, RegistrationKind } from '@css/shared/registration';
import { Alert, Badge, Button, PhoneField, Spinner, TextField } from '@css/ui';
import { BadgeCheck, Hand } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { EMAIL, MOBILE, type RegistrationValues } from './form-state';

/** Where one contact stands: nothing sent, a code sent, or verified. */
export interface ChannelState {
  sent: boolean;
  verified: boolean;
  code: string;
  busy: boolean;
  error?: string;
  codeError?: string;
}
export const NEW_CHANNEL: ChannelState = { sent: false, verified: false, code: '', busy: false };

const DUMMY_OTP_NOTE = import.meta.env.VITE_OTP_DUMMY === '1';

/**
 * Step 1 (UX-16, the owner's reference image): the name, the father's name (volunteers) and the
 * mobile number and email, each verified inside its own field; the code input opens below the
 * field it belongs to.
 */
export function ContactStep({
  kind,
  values,
  set,
  errors,
  channels,
  exists,
  onSend,
  onCode,
  onChange,
}: {
  kind: RegistrationKind;
  values: RegistrationValues;
  set: (patch: Partial<RegistrationValues>) => void;
  errors: Record<string, string>;
  channels: Record<RegistrationChannel, ChannelState>;
  exists: boolean;
  onSend: (channel: RegistrationChannel) => void;
  onCode: (channel: RegistrationChannel, code: string) => void;
  onChange: (channel: RegistrationChannel) => void;
}) {
  const t = useTranslations('registration');
  const both = channels.sms.verified && channels.email.verified;
  return (
    <>
      <div className="register-grid">
        <TextField
          label={t('form.name')}
          name="name"
          value={values.name}
          onChange={(name) => set({ name })}
          required
          autoComplete="name"
          error={errors.name}
        />
        {kind === 'volunteer' && (
          <TextField
            label={t('form.father_name')}
            name="fatherName"
            value={values.fatherName}
            onChange={(fatherName) => set({ fatherName })}
            required
            error={errors.fatherName}
          />
        )}
        <ContactField
          channel="sms"
          value={values.mobile}
          valid={MOBILE.test(values.mobile)}
          onValue={(mobile) => set({ mobile })}
          state={channels.sms}
          error={errors.mobile}
          onSend={onSend}
          onCode={onCode}
          onChange={onChange}
        />
        <ContactField
          channel="email"
          value={values.email}
          valid={EMAIL.test(values.email)}
          onValue={(email) => set({ email: email.trim() })}
          state={channels.email}
          error={errors.email}
          onSend={onSend}
          onCode={onCode}
          onChange={onChange}
        />
      </div>
      {exists && (
        <Alert tone="warning" live="alert">
          {t('verify.exists')}{' '}
          <a href="/login" className="register-link">
            {t('verify.login')}
          </a>
        </Alert>
      )}
      {!both && (
        <div className="register-notice">
          <span className="register-notice-icon" aria-hidden="true">
            <Hand size={18} />
          </span>
          <div>
            <p className="register-notice-title">{t('verify.notice_title')}</p>
            <p className="m-0">{t('verify.notice')}</p>
            {DUMMY_OTP_NOTE && <p className="register-muted m-0">{t('dummy_note')}</p>}
          </div>
        </div>
      )}
    </>
  );
}

function ContactField({
  channel,
  value,
  valid,
  onValue,
  state,
  error,
  onSend,
  onCode,
  onChange,
}: {
  channel: RegistrationChannel;
  value: string;
  valid: boolean;
  onValue: (value: string) => void;
  state: ChannelState;
  error?: string;
  onSend: (channel: RegistrationChannel) => void;
  onCode: (channel: RegistrationChannel, code: string) => void;
  onChange: (channel: RegistrationChannel) => void;
}) {
  const t = useTranslations('registration');
  const sms = channel === 'sms';
  const action = state.verified ? (
    <Badge tone="success" icon={BadgeCheck} label={t('verify.done')} size="sm" />
  ) : (
    <Button
      size="sm"
      disabled={!valid || state.busy}
      loading={state.busy && !state.sent}
      onPress={() => onSend(channel)}
    >
      {state.sent ? t('verify.resend') : t('verify.button')}
    </Button>
  );
  const field = {
    label: sms ? t('form.mobile') : t('form.email'),
    name: sms ? 'mobile' : 'email',
    value,
    onChange: onValue,
    required: true,
    locked: state.verified,
    error: error ?? state.error,
    endAction: action,
  };
  return (
    <div className="register-contact">
      {sms ? (
        <PhoneField {...field} autoComplete="tel" />
      ) : (
        <TextField {...field} type="email" autoComplete="email" />
      )}
      {state.verified && (
        <Button variant="ghost" size="sm" onPress={() => onChange(channel)}>
          {t('verify.change')}
        </Button>
      )}
      {state.sent && !state.verified && (
        <TextField
          label={sms ? t('verify.code_mobile') : t('verify.code_email')}
          name={sms ? 'mobileCode' : 'emailCode'}
          value={state.code}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          helper={t('verify.sent')}
          onChange={(code) => onCode(channel, code.replace(/\D/g, '').slice(0, 6))}
          error={state.codeError}
          endAction={state.busy ? <Spinner size="sm" /> : undefined}
        />
      )}
    </div>
  );
}
