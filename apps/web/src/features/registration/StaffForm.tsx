import {
  Alert,
  Button,
  Form,
  FormActions,
  FormSection,
  PasswordField,
  Select,
  TextField,
} from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PasswordRules } from '../../components/PasswordRules';
import { PhotoField } from './PhotoField';
import {
  type Draft,
  failureOf,
  locations,
  submitRegistration,
  uploadDraftPhoto,
} from './registration-api';

/**
 * Step 4 for an official (MASTER_SPEC A5, DECISION_LOG D-088): name, designation, program,
 * division of the workplace, photo and password; no NID, parents or bank details. The programs
 * come with the code verification of an official's draft.
 */
export function StaffForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const t = useTranslations('registration.form');
  const tp = useTranslations('auth.password');
  const tl = useTranslations('auth.login');
  const locale = useLocale();
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [programId, setProgramId] = useState<string | null>(null);
  const [divisionId, setDivisionId] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const divisions = useQuery({
    queryKey: ['locations', 'divisions'],
    queryFn: () => locations(),
    staleTime: 60 * 60_000,
  }).data;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const local: Record<string, string> = {};
    // Two values the user just typed on this device, not a secret check.
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirm) local.confirm = tp('mismatch');
    if (!photo) local.photo = t('missing_photo');
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    setPending(true);
    setErrors({});
    setError(null);
    void submitRegistration(draft, {
      kind: 'staff',
      registrationId: draft.registrationId,
      password,
      name,
      designation,
      homeProgramId: programId ?? '',
      homeDivisionId: divisionId ?? '',
    })
      .then(onDone)
      .catch((failure: unknown) => {
        const f = failureOf(failure, tl('offline'));
        setErrors(f.fields);
        setError(f.message);
      })
      .finally(() => setPending(false));
  };

  return (
    <Form onSubmit={submit} aria-label={t('title')}>
      <FormSection title={t('personal')}>
        <TextField
          label={t('name')}
          name="name"
          value={name}
          onChange={setName}
          required
          error={errors.name}
          autoComplete="name"
        />
        <TextField
          label={t('designation')}
          name="designation"
          value={designation}
          onChange={setDesignation}
          required
          error={errors.designation}
        />
        <Select
          label={t('program')}
          name="homeProgramId"
          required
          value={programId}
          onChange={setProgramId}
          options={(draft.programs ?? []).map((p) => ({ id: p.id, label: p.name[locale] }))}
          error={errors.homeProgramId}
        />
        <Select
          label={t('region')}
          name="homeDivisionId"
          required
          value={divisionId}
          onChange={setDivisionId}
          options={(divisions ?? []).map((d) => ({ id: d.id, label: d.name[locale] }))}
          error={errors.homeDivisionId}
        />
        <PhotoField
          label={t('photo')}
          upload={(blob, source) => uploadDraftPhoto(draft, 'photo', blob, source)}
          onUploaded={setPhoto}
          error={errors.photo}
        />
      </FormSection>
      <FormSection title={t('account')}>
        <PasswordField
          label={t('password')}
          name="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          required
          error={errors.password}
        />
        <PasswordRules password={password} id="register-rules" />
        <PasswordField
          label={t('confirm_password')}
          name="confirm"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
          error={errors.confirm}
        />
      </FormSection>
      {error && (
        <Alert tone="danger" live="alert">
          {error}
        </Alert>
      )}
      <FormActions>
        <Button type="submit" fullWidth loading={pending}>
          {t('submit')}
        </Button>
      </FormActions>
    </Form>
  );
}
