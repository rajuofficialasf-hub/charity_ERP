import type { RegistrationChannel, RegistrationKind } from '@css/shared/registration';
import { Alert, Button, Chip, FormTextField, Icon, Spinner, Text, TextField } from '@/ui';
import { useController } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { EMAIL, MOBILE, type RegistrationForm } from './form-state';

/** Where one contact stands: nothing sent, a code sent, or verified. The code itself is in the form. */
export interface ChannelState {
  sent: boolean;
  /** The address the last code went to (the one a verification belongs to). */
  address?: string;
  verified: boolean;
  busy: boolean;
  error?: string;
  codeError?: string;
}
export const NEW_CHANNEL: ChannelState = { sent: false, verified: false, busy: false };

const DUMMY_OTP_NOTE = import.meta.env.VITE_OTP_DUMMY === '1';

const sixDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/**
 * Step 1 (docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md; the owner's reference
 * image): the name, the father's name (volunteers) or the designation
 * (officials) and the
 * mobile number and email, each verified inside its own field; the code input opens below the
 * field it belongs to.
 */
export function ContactStep({
  kind,
  channels,
  exists,
  onSend,
  onCode,
  onChange,
  onContactEdited,
  canChange,
}: {
  kind: RegistrationKind;
  channels: Record<RegistrationChannel, ChannelState>;
  exists: boolean;
  onSend: (channel: RegistrationChannel) => void;
  onCode: (channel: RegistrationChannel, code: string) => void;
  onChange: (channel: RegistrationChannel) => void;
  /** The contact was typed again (its value is already in the form). */
  onContactEdited: (channel: RegistrationChannel) => void;
  canChange: boolean;
}) {
  const t = useTranslations('registration');
  const both = channels.sms.verified && channels.email.verified;
  const field = { onSend, onCode, onChange, onEdited: onContactEdited, canChange };
  return (
    <>
      <div className="register-grid">
        <FormTextField label={t('form.name')} name="name" required autoComplete="name" />
        {kind === 'volunteer' ? (
          <FormTextField label={t('form.father_name')} name="fatherName" required />
        ) : (
          <FormTextField label={t('form.designation')} name="designation" required />
        )}
        <ContactField {...field} channel="sms" state={channels.sms} />
        <ContactField {...field} channel="email" state={channels.email} />
      </div>
      {exists && (
        <Alert tone="warning">
          {t('verify.exists')}{' '}
          <a href="/login" className="register-link">
            {t('verify.login')}
          </a>
        </Alert>
      )}
      {!both && (
        <div className="register-notice">
          <span className="register-notice-icon" aria-hidden="true">
            <Icon name="hand" size={18} />
          </span>
          <div>
            <p className="register-notice-title">{t('verify.notice_title')}</p>
            <Text>{t('verify.notice')}</Text>
            {DUMMY_OTP_NOTE && <Text size="small">{t('dummy_note')}</Text>}
          </div>
        </div>
      )}
    </>
  );
}

/** A contact bound to the form, its verify button inside it and, once a code is sent, the code. */
function ContactField({
  channel,
  state,
  onSend,
  onCode,
  onChange,
  onEdited,
  canChange,
}: {
  channel: RegistrationChannel;
  state: ChannelState;
  onSend: (channel: RegistrationChannel) => void;
  onCode: (channel: RegistrationChannel, code: string) => void;
  onChange: (channel: RegistrationChannel) => void;
  onEdited: (channel: RegistrationChannel) => void;
  canChange: boolean;
}) {
  const t = useTranslations('registration');
  const sms = channel === 'sms';
  const contact = useController<RegistrationForm, 'mobile' | 'email'>({
    name: sms ? 'mobile' : 'email',
  });
  const code = useController<RegistrationForm, `codes.${RegistrationChannel}`>({
    name: `codes.${channel}`,
  });
  const value = contact.field.value;
  const valid = sms ? MOBILE.test(value) : EMAIL.test(value);
  const action = state.verified ? (
    <Chip tone="success">
      <Icon name="verified" size={16} />
      {t('verify.done')}
    </Chip>
  ) : (
    <Button
      size="small"
      disabled={!valid || state.busy}
      loading={state.busy && !state.sent}
      onClick={() => onSend(channel)}
    >
      {state.sent ? t('verify.resend') : t('verify.button')}
    </Button>
  );
  const field = {
    label: sms ? t('form.mobile') : t('form.email'),
    name: contact.field.name,
    value,
    onChange: (typed: string) => {
      contact.field.onChange(sms ? typed : typed.trim());
      onEdited(channel);
    },
    onBlur: contact.field.onBlur,
    required: true,
    locked: state.verified,
    error: contact.fieldState.error?.message ?? state.error,
    endAction: action,
  };
  return (
    <div className="register-contact" data-testid="register-contact">
      {sms ? (
        <TextField type="tel" {...field} autoComplete="tel" />
      ) : (
        <TextField {...field} type="email" autoComplete="email" />
      )}
      {state.verified && canChange && (
        <Button variant="text" size="small" onClick={() => onChange(channel)}>
          {t('verify.change')}
        </Button>
      )}
      {state.sent && !state.verified && (
        <TextField
          label={sms ? t('verify.code_mobile') : t('verify.code_email')}
          name={sms ? 'mobileCode' : 'emailCode'}
          value={code.field.value}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          hint={t('verify.sent')}
          onChange={(typed) => {
            const digits = sixDigits(typed);
            code.field.onChange(digits);
            onCode(channel, digits);
          }}
          onBlur={code.field.onBlur}
          error={state.codeError}
          endAction={state.busy ? <Spinner label={t('verify.checking')} /> : undefined}
        />
      )}
    </div>
  );
}
