import type { PhotoSlot, RegistrationChannel, RegistrationKind } from '@css/shared/registration';
import { Alert, Button, Form, Icon, LinkButton, ProgressBar } from '@/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { type Path, useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { DocumentTitle } from '../../components/DocumentTitle';
import { TopBar } from '../../components/TopBar';
import { flatErrors, useSchemaResolver } from '../../lib/form-schema';
import { type ChannelState, ContactStep, NEW_CHANNEL } from './ContactStep';
import {
  checkStep,
  EMPTY_FORM,
  type RegistrationForm,
  STEPS,
  type StepKey,
  stepOf,
  submitBody,
} from './form-state';
import {
  AccountStep,
  AddressStep,
  EducationStep,
  IdentityStep,
  PhotosStep,
  ProfessionStep,
  SkillsStep,
} from './FormSteps';
import {
  type Draft,
  failureOf,
  sendCode,
  startDraft,
  submitRegistration,
  verifyCode,
} from './registration-api';
import './register.css';

type Channels = Record<RegistrationChannel, ChannelState>;
const NEW_CHANNELS: Channels = { sms: NEW_CHANNEL, email: NEW_CHANNEL };

/**
 * The checks of the open step (`checkStep`) as the form's schema, each problem under its field in
 * the person's language; nothing is checked while the contacts still wait for their codes.
 */
function useStepSchema(step: StepKey, kind: RegistrationKind, waiting: boolean) {
  const tr = useTranslations();
  return useMemo(
    () =>
      z.custom<RegistrationForm>().superRefine((values, ctx) => {
        if (waiting) return;
        for (const [field, problem] of Object.entries(checkStep(step, kind, values)))
          ctx.addIssue({ code: 'custom', path: [field], message: tr(problem) });
      }),
    [step, kind, waiting, tr],
  );
}

/**
 * The screen "Registration with two OTP steps" of docs/ui/SCREENS.md (docs/architecture/AUTH.md,
 * "Registration with two OTPs"): a green title band, the kind, a step indicator and one card per
 * step. The mobile and the email are verified inside their own fields; the next step opens once
 * both are. Everything stays in the page; a reload starts a new draft.
 */
export function RegisterPage() {
  const t = useTranslations('registration');
  const tr = useTranslations();
  const tl = useTranslations('auth.login');
  // officials no longer register themselves: the admin creates their account
  const kind: RegistrationKind = 'volunteer';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [channels, setChannels] = useState<Channels>(NEW_CHANNELS);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [done, setDone] = useState(false);
  // the draft being started, so a second press does not start a second one
  const starting = useRef<Promise<Draft> | null>(null);

  const steps = STEPS[kind];
  const key: StepKey = steps[step] ?? 'contact';
  const offline = tl('offline');
  const channel = (c: RegistrationChannel, patch: Partial<ChannelState>) =>
    setChannels((old) => ({ ...old, [c]: { ...old[c], ...patch } }));
  // the draft holds its token only once both contacts are verified
  const verified = Boolean(draft?.token) && channels.sms.verified && channels.email.verified;
  // the values stay in the page's memory only, never in the device's storage
  const form = useForm<RegistrationForm>({
    resolver: useSchemaResolver(useStepSchema(key, kind, key === 'contact' && !verified)),
    defaultValues: EMPTY_FORM,
    // once a step was checked, a field's error goes as soon as its value is right
    reValidateMode: 'onChange',
  });
  // each step starts unchecked, so typing into a new step shows no error before its Next; the
  // values stay, and so does an error the server put on a field of the step shown
  useEffect(() => {
    form.reset(form.getValues(), { keepErrors: true, keepDefaultValues: true });
  }, [step, form]);
  const errors = flatErrors(form.formState.errors);
  const pending = form.formState.isSubmitting;
  /** What a refused call says: its own message, the first field message, else the generic text. */
  const messageOf = (f: ReturnType<typeof failureOf>) =>
    f.message ?? Object.values(f.fields)[0] ?? tr('common.state.error.text');

  /** A sent code no longer counts: its field empties. */
  const clearCode = (c: RegistrationChannel) => form.setValue(`codes.${c}`, '');
  const resetChannels = () => {
    setChannels(NEW_CHANNELS);
    clearCode('sms');
    clearCode('email');
  };

  /** A contact typed again after its code was sent: the earlier code no longer counts. */
  const contactEdited = (c: RegistrationChannel) => {
    if (!channels[c].sent || channels[c].verified) return;
    channel(c, { ...NEW_CHANNEL });
    clearCode(c);
  };

  const ensureDraft = async (): Promise<Draft> => {
    if (draft) return draft;
    starting.current ??= startDraft(kind).then((s) => {
      const next: Draft = { registrationId: s.registrationId, kind };
      setDraft(next);
      return next;
    });
    try {
      return await starting.current;
    } finally {
      starting.current = null;
    }
  };

  /** A refused draft (expired or gone) starts again from the contacts. */
  const restart = (message: string) => {
    setDraft(null);
    resetChannels();
    setError(message);
  };

  const send = (c: RegistrationChannel) => {
    setExists(false);
    setError(null);
    channel(c, { busy: true, error: undefined, codeError: undefined });
    clearCode(c);
    const address = form.getValues(c === 'sms' ? 'mobile' : 'email');
    void ensureDraft()
      .then((d) => sendCode(d.registrationId, c, address))
      .then(() => channel(c, { busy: false, sent: true, address }))
      .catch((failure: unknown) => {
        const f = failureOf(failure, offline);
        // the server already holds this very address as verified
        if (f.code === 'registration.already_verified' && channels[c].address === address)
          return channel(c, { busy: false, verified: true, sent: false });
        if (f.code === 'registration.draft_expired' || f.code === 'permission.not_found')
          return restart(messageOf(f));
        channel(c, { busy: false, error: f.fields.address ?? messageOf(f) });
      });
  };

  /** The code as it is typed: the sixth digit sends it to be checked. */
  const code = (c: RegistrationChannel, value: string) => {
    channel(c, { codeError: undefined });
    if (value.length !== 6 || !draft || channels[c].busy) return;
    channel(c, { busy: true });
    void verifyCode(draft.registrationId, c, value)
      .then((result) => {
        channel(c, { busy: false, verified: true, sent: false });
        clearCode(c);
        if (result.registrationToken) setDraft({ ...draft, token: result.registrationToken });
      })
      .catch((failure: unknown) => {
        const f = failureOf(failure, offline);
        if (f.code === 'registration.account_exists') {
          setExists(true);
          return resetChannels();
        }
        if (f.code === 'registration.draft_expired') return restart(messageOf(f));
        channel(c, { busy: false, codeError: f.fields.code ?? messageOf(f) });
      });
  };

  /**
   * "Change" on a contact verified while the other is not: its field opens again and the next code
   * verifies the new one. Once both are verified the draft holds its token and takes no change.
   */
  const change = (c: RegistrationChannel) => {
    if (draft?.token) return;
    channel(c, { ...NEW_CHANNEL, address: channels[c].address });
    clearCode(c);
  };

  /** The open step passed its checks: the next step opens, or the last one sends the registration. */
  const next = async (values: RegistrationForm) => {
    if (key === 'contact' && !verified) return;
    setError(null);
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!draft) return;
    try {
      await submitRegistration(draft, submitBody(kind, draft.registrationId, values));
      setDone(true);
    } catch (failure) {
      const f = failureOf(failure, offline);
      // an expired or spent draft cannot be submitted again: back to the contacts
      if (
        [
          'registration.draft_expired',
          'registration.token_invalid',
          'permission.not_found',
        ].includes(f.code)
      ) {
        setStep(0);
        return restart(messageOf(f));
      }
      const fields = Object.fromEntries(Object.entries(f.fields).filter(([path]) => path));
      if (f.code === 'registration.nid_exists') fields.nid = messageOf(f);
      const first = Object.keys(fields)[0];
      if (first) setStep(stepOf(kind, first));
      for (const [path, message] of Object.entries(fields))
        form.setError(path as Path<RegistrationForm>, { type: 'server', message });
      // the message also shows above the buttons, so no refusal goes unseen
      setError(messageOf(f));
    }
  };

  const photo = (slot: PhotoSlot, ok: boolean) => form.setValue(`photos.${slot}`, ok);

  const title = done ? t('done.title') : t(`band.${kind}`);
  const stepNames = steps.map((s) => t(`steps.${s}`));
  if (done)
    return (
      <>
        <TopBar showBrand={false} />
        <main id="main" className="register-page">
          <DocumentTitle title={title} />
          <RegisterBrand title={title} line={t('done.text')} />
          <section className="register-side">
            <div className="register-panel register-done">
              <span className="register-done-mark" aria-hidden="true">
                <Icon name="check" size={28} />
              </span>
              <LinkButton to="/login">{t('done.login')}</LinkButton>
            </div>
          </section>
        </main>
      </>
    );

  const canNext = key !== 'contact' || verified;
  return (
    <>
      <TopBar showBrand={false} />
      <main id="main" className="register-page">
        <DocumentTitle title={title} />
        <RegisterBrand
          title={title}
          line={t(`band.${kind}_line`)}
          note={t('staff_by_admin')}
          steps={stepNames}
          current={step}
        />
        <section className="register-side">
          <p className="register-have">
            {t('have_account')}{' '}
            <a href="/login" className="register-link">
              {t('verify.login')}
            </a>
          </p>
          <Form form={form} onSubmit={next} label={title}>
            <div className="register-panel">
              <ProgressBar
                label={t('progress', { current: step + 1, total: steps.length })}
                value={step + 1}
                max={steps.length}
                size="small"
                showValue={false}
              />
              <div className="register-step-head">
                <h2 className="register-step-title">{stepNames[step]}</h2>
                <p className="register-muted">{t(`hint.${key}`)}</p>
              </div>
              <fieldset className="register-section">
                <legend className="register-sr-only">{stepNames[step]}</legend>
                {key === 'contact' && (
                  <ContactStep
                    kind={kind}
                    channels={channels}
                    exists={exists}
                    onSend={send}
                    onCode={code}
                    onChange={change}
                    onContactEdited={contactEdited}
                    canChange={!draft?.token}
                  />
                )}
                {key === 'identity' && <IdentityStep />}
                {key === 'address' && <AddressStep errors={errors} />}
                {key === 'education' && <EducationStep errors={errors} />}
                {key === 'profession' && <ProfessionStep errors={errors} />}
                {key === 'skills' && <SkillsStep errors={errors} />}
                {key === 'account' && <AccountStep />}
                {key === 'photos' && draft && (
                  <PhotosStep draft={draft} errors={errors} onPhoto={photo} />
                )}
              </fieldset>
              {error && <Alert tone="error">{error}</Alert>}
              <div className="register-actions">
                {step > 0 && (
                  <Button
                    variant="secondary"
                    startIcon="arrow-left"
                    onClick={() => {
                      form.clearErrors();
                      setStep(step - 1);
                    }}
                  >
                    {t('nav.back')}
                  </Button>
                )}
                {step < steps.length - 1 ? (
                  <Button type="submit" endIcon="arrow-right" disabled={!canNext}>
                    {t('nav.next')}
                  </Button>
                ) : (
                  <Button type="submit" startIcon="send" loading={pending}>
                    {t('form.submit')}
                  </Button>
                )}
              </div>
            </div>
          </Form>
        </section>
      </main>
    </>
  );
}

/**
 * The brand panel of the registration: the logo, the page title and its line, and the steps as a
 * list, done ones ticked and the current one lit. On a phone it is a short band above the form and the list stays for screen
 * readers only.
 */
function RegisterBrand(props: {
  title: string;
  line: string;
  note?: string;
  steps?: string[];
  current?: number;
}) {
  const t = useTranslations('registration');
  const { steps = [], current = 0 } = props;
  return (
    <aside className="register-brand">
      <a href="/" className="register-logo">
        <img src="/brand/logo.svg" alt={t('logo_alt')} width={113} height={72} />
      </a>
      <div className="register-brand-text">
        <span className="register-badge">{t('badge')}</span>
        <h1 className="register-title">{props.title}</h1>
        <p className="register-line">{props.line}</p>
      </div>
      {steps.length > 0 && (
        <ol className="register-steps" aria-label={t('steps.label')}>
          {steps.map((name, i) => (
            <li
              key={name}
              className="register-step"
              data-state={i < current ? 'done' : i === current ? 'current' : 'next'}
              aria-current={i === current ? 'step' : undefined}
            >
              <span className="register-step-dot" aria-hidden="true">
                {i < current ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <span>{name}</span>
              {i < current && <span className="register-sr-only">{t('step_done')}</span>}
            </li>
          ))}
        </ol>
      )}
      {props.note && <p className="register-brand-note">{props.note}</p>}
    </aside>
  );
}
