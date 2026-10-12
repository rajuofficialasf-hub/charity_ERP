import { Alert, Button } from '@css/ui';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { AuthShell } from '../../components/AuthShell';
import { DocumentTitle } from '../../components/DocumentTitle';
import { CodeStep } from './CodeStep';
import type { Draft } from './registration-api';
import { StaffForm } from './StaffForm';
import { StartStep } from './StartStep';
import { VolunteerForm } from './VolunteerForm';

type Step = 'start' | 'codes' | 'form' | 'done';
const STEP_NUMBER: Record<Step, number> = { start: 1, codes: 2, form: 3, done: 4 };

/**
 * SCR-002 registration (AUTH.md 2; plan
 * docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, R1 to R5): contacts →
 * the two codes → the form of the chosen kind → submitted. Phone first; the draft token stays in
 * memory, so a reload starts again with the same contacts (the draft and its photos are kept for
 * 24 hours).
 */
export function RegisterPage() {
  const t = useTranslations('registration');
  const [step, setStep] = useState<Step>('start');
  const [draft, setDraft] = useState<Draft | null>(null);

  const title = step === 'form' ? t('form.title') : step === 'done' ? t('done.title') : t('title');
  return (
    <AuthShell title={title}>
      <DocumentTitle title={title} />
      {step !== 'done' && (
        <p className="m-0" aria-live="polite">
          {t('step', { current: STEP_NUMBER[step], total: 3 })}
        </p>
      )}
      {step === 'start' && (
        <StartStep
          onStarted={(started) => {
            setDraft(started);
            setStep('codes');
          }}
        />
      )}
      {step === 'codes' && draft && (
        <CodeStep
          draft={draft}
          onVerified={(verified) => {
            setDraft(verified);
            setStep('form');
          }}
        />
      )}
      {step === 'form' &&
        draft &&
        (draft.kind === 'staff' ? (
          <StaffForm draft={draft} onDone={() => setStep('done')} />
        ) : (
          <VolunteerForm draft={draft} onDone={() => setStep('done')} />
        ))}
      {step === 'done' && (
        <div className="auth-shell-stack">
          <Alert tone="success" live="status">
            {t('done.text')}
          </Alert>
          <Button href="/login" fullWidth>
            {t('done.login')}
          </Button>
        </div>
      )}
      {step !== 'done' && (
        <Button variant="ghost" href="/login">
          {t('back_to_login')}
        </Button>
      )}
    </AuthShell>
  );
}
