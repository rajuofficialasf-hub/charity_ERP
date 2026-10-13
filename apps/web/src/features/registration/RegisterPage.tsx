import type { PhotoSlot, RegistrationChannel, RegistrationKind } from '@css/shared/registration';
import { Alert, Button, PageBand, Stepper } from '@css/ui';
import { ArrowLeft, ArrowRight, Send } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { DocumentTitle } from '../../components/DocumentTitle';
import { TopBar } from '../../components/TopBar';
import { type ChannelState, ContactStep, NEW_CHANNEL } from './ContactStep';
import {
  checkStep,
  EMPTY_VALUES,
  type Problem,
  type RegistrationValues,
  STEPS,
  type StepKey,
  stepOf,
  submitBody,
} from './form-state';
import { AccountStep, IdentityStep, PhotosStep, WorkStep } from './FormSteps';
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
 * SCR-002 registration on one page (UX-16, UX-18; AUTH.md 2, DECISION_LOG D-090; plan
 * docs/plans/2026-10-13-0922-feat-registration-redesign-plan.md, R1 to R6, R11): a green title
 * band, the kind, a step indicator and one card per step. The mobile and the email are verified
 * inside their own fields; the next step opens once both are. Everything stays in the page; a
 * reload starts a new draft.
 */
export function RegisterPage() {
  const t = useTranslations('registration');
  const tr = useTranslations();
  const tl = useTranslations('auth.login');
  const [kind, setKind] = useState<RegistrationKind>('volunteer');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [channels, setChannels] = useState<Channels>(NEW_CHANNELS);
  const [values, setValues] = useState<RegistrationValues>(EMPTY_VALUES);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  // the draft being started, so a second press does not start a second one
  const starting = useRef<Promise<Draft> | null>(null);

  const steps = STEPS[kind];
  const key: StepKey = steps[step] ?? 'contact';
  const offline = tl('offline');
  const set = (patch: Partial<RegistrationValues>) => setValues((v) => ({ ...v, ...patch }));
  const channel = (c: RegistrationChannel, patch: Partial<ChannelState>) =>
    setChannels((old) => ({ ...old, [c]: { ...old[c], ...patch } }));
  // the draft holds its token only once both contacts are verified (D-090)
  const verified = Boolean(draft?.token) && channels.sms.verified && channels.email.verified;
  const busy = channels.sms.busy || channels.email.busy;
  /** What a refused call says: its own message, the first field message, else the generic text. */
  const messageOf = (f: ReturnType<typeof failureOf>) =>
    f.message ?? Object.values(f.fields)[0] ?? tr('common.state.error.text');

  /** A contact typed again after its code was sent: the earlier code no longer counts. */
  const setContact = (c: RegistrationChannel, value: string) => {
    set(c === 'sms' ? { mobile: value } : { email: value });
    if (channels[c].sent && !channels[c].verified) channel(c, { ...NEW_CHANNEL });
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
    setChannels(NEW_CHANNELS);
    setError(message);
  };

  const send = (c: RegistrationChannel) => {
    setExists(false);
    setError(null);
    channel(c, { busy: true, error: undefined, codeError: undefined, code: '' });
    const address = c === 'sms' ? values.mobile : values.email;
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

  const code = (c: RegistrationChannel, value: string) => {
    channel(c, { code: value, codeError: undefined });
    if (value.length !== 6 || !draft || channels[c].busy) return;
    channel(c, { busy: true });
    void verifyCode(draft.registrationId, c, value)
      .then((result) => {
        channel(c, { busy: false, verified: true, sent: false, code: '' });
        if (result.registrationToken) setDraft({ ...draft, token: result.registrationToken });
      })
      .catch((failure: unknown) => {
        const f = failureOf(failure, offline);
        if (f.code === 'registration.account_exists') {
          setExists(true);
          return setChannels(NEW_CHANNELS);
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
    if (!draft?.token) channel(c, { ...NEW_CHANNEL, address: channels[c].address });
  };

  const switchKind = (next: RegistrationKind) => {
    // a draft being started belongs to the current kind
    if (next === kind || verified || busy) return;
    setKind(next);
    setDraft(null);
    setChannels(NEW_CHANNELS);
    setErrors({});
  };

  const translated = (problems: Record<string, Problem>) =>
    Object.fromEntries(Object.entries(problems).map(([field, problem]) => [field, tr(problem)]));

  const next = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || (key === 'contact' && !verified)) return;
    const problems = checkStep(key, kind, values);
    if (Object.keys(problems).length) {
      setErrors(translated(problems));
      return;
    }
    setErrors({});
    setError(null);
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    if (!draft) return;
    setPending(true);
    void submitRegistration(draft, submitBody(kind, draft.registrationId, values))
      .then(() => setDone(true))
      .catch((failure: unknown) => {
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
        setErrors(fields);
        // the message also shows above the buttons, so no refusal goes unseen
        setError(messageOf(f));
      })
      .finally(() => setPending(false));
  };

  const photo = (slot: PhotoSlot, ok: boolean) =>
    setValues((v) => ({ ...v, photos: { ...v.photos, [slot]: ok } }));

  const title = done ? t('done.title') : t(`band.${kind}`);
  if (done)
    return (
      <>
        <TopBar />
        <main id="main" className="register-page">
          <DocumentTitle title={title} />
          <section className="register-card">
            <PageBand title={title} subtitle={t('done.text')} />
            <div className="register-body register-done">
              <Button href="/login">{t('done.login')}</Button>
            </div>
          </section>
        </main>
      </>
    );

  const stepNames = steps.map((s) => t(`steps.${s}`));
  const canNext = key !== 'contact' || verified;
  return (
    <>
      <TopBar />
      <main id="main" className="register-page">
        <DocumentTitle title={title} />
        <section className="register-card">
          <PageBand title={title} subtitle={t(`band.${kind}_line`)}>
            <div className="register-kind" role="group" aria-label={t('kind.label')}>
              {(['volunteer', 'staff'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className="register-kind-option"
                  aria-pressed={kind === k}
                  disabled={(verified || busy) && kind !== k}
                  onClick={() => switchKind(k)}
                >
                  {t(`kind.${k}`)}
                </button>
              ))}
            </div>
          </PageBand>
          <form className="register-body" onSubmit={next} noValidate aria-label={title}>
            <Stepper label={t('steps.label')} steps={stepNames} current={step} />
            <fieldset className="register-section">
              <legend className="register-section-title">{stepNames[step]}</legend>
              {key === 'contact' && (
                <ContactStep
                  kind={kind}
                  values={values}
                  set={set}
                  errors={errors}
                  channels={channels}
                  exists={exists}
                  onSend={send}
                  onCode={code}
                  onChange={change}
                  onContact={setContact}
                  canChange={!draft?.token}
                />
              )}
              {key === 'identity' && <IdentityStep values={values} set={set} errors={errors} />}
              {key === 'work' && <WorkStep values={values} set={set} errors={errors} />}
              {key === 'account' && <AccountStep values={values} set={set} errors={errors} />}
              {key === 'photos' && draft && (
                <PhotosStep draft={draft} errors={errors} onPhoto={photo} />
              )}
            </fieldset>
            {error && (
              <Alert tone="danger" live="alert">
                {error}
              </Alert>
            )}
            <div className="register-actions">
              {step > 0 && (
                <Button
                  variant="secondary"
                  icon={ArrowLeft}
                  onPress={() => {
                    setErrors({});
                    setStep(step - 1);
                  }}
                >
                  {t('nav.back')}
                </Button>
              )}
              {step < steps.length - 1 ? (
                <Button type="submit" icon={ArrowRight} disabled={!canNext}>
                  {t('nav.next')}
                </Button>
              ) : (
                <Button type="submit" icon={Send} loading={pending}>
                  {t('form.submit')}
                </Button>
              )}
            </div>
          </form>
        </section>
        <footer className="register-foot">
          <span>
            {t('have_account')}{' '}
            <a href="/login" className="register-link">
              {t('verify.login')}
            </a>
          </span>
        </footer>
      </main>
    </>
  );
}
