import { VOLUNTEER_TYPES, type VolunteerType } from '@css/shared/registration';
import {
  Alert,
  Button,
  Form,
  FormActions,
  FormGrid,
  FormSection,
  PasswordField,
  Select,
  TextField,
} from '@css/ui';
import { type FormEvent, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PasswordRules } from '../../components/PasswordRules';
import { type Address, AddressFields, EMPTY_ADDRESS } from './AddressFields';
import { PhotoField } from './PhotoField';
import {
  type Draft,
  failureOf,
  lookupReference,
  submitRegistration,
  uploadDraftPhoto,
} from './registration-api';

const TEXTS = [
  'education',
  'experience',
  'workDescription',
  'previousProjects',
  'facebookId',
] as const;
const TEXT_LABELS = {
  education: 'education',
  experience: 'experience',
  workDescription: 'work_description',
  previousProjects: 'previous_projects',
  facebookId: 'facebook',
} as const;
const BANK = ['bankName', 'accountName', 'accountNumber', 'routingNumber'] as const;
const BANK_LABELS = {
  bankName: 'bank_name',
  accountName: 'account_name',
  accountNumber: 'account_number',
  routingNumber: 'routing_number',
} as const;

/** Step 4 for a volunteer: the BR-026 fields, the address cascade, the photos and the password. */
export function VolunteerForm({ draft, onDone }: { draft: Draft; onDone: () => void }) {
  const t = useTranslations('registration.form');
  const tp = useTranslations('auth.password');
  const tl = useTranslations('auth.login');
  const [values, setValues] = useState<Record<string, string>>({});
  const [type, setType] = useState<VolunteerType>('general');
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  // the photos travel with the draft; the form only needs to know both are there
  const [photos, setPhotos] = useState({ photo: false, nid_photo: false });
  const [reference, setReference] = useState<{ name?: string; missing?: boolean }>({});
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const value = (key: string) => values[key] ?? '';
  const set = (key: string) => (v: string) => setValues((old) => ({ ...old, [key]: v }));
  const optional = (key: string) => value(key).trim() || undefined;

  const checkReference = () => {
    setReference({});
    setErrors(({ referenceNid: _old, ...rest }) => rest);
    void lookupReference(draft, value('referenceNid'))
      .then(({ name }) => setReference({ name }))
      .catch((failure: unknown) => {
        const f = failureOf(failure, tl('offline'));
        if (f.code === 'permission.not_found') setReference({ missing: true });
        // a malformed NID answers on the field `nid` of the lookup
        else
          setErrors((old) => ({
            ...old,
            referenceNid: f.fields.nid ?? f.message ?? tl('offline'),
          }));
      });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const local: Record<string, string> = {};
    // Two values the user just typed on this device, not a secret check.
    // eslint-disable-next-line security/detect-possible-timing-attacks
    if (password !== confirm) local.confirm = tp('mismatch');
    if (!photos.photo) local.photo = t('missing_photo');
    if (!photos.nid_photo) local.nid_photo = t('missing_photo');
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }
    const bank = Object.fromEntries(
      BANK.map((k) => [k, optional(k)]).filter((e): e is [string, string] => Boolean(e[1])),
    );
    setPending(true);
    setErrors({});
    setError(null);
    void submitRegistration(draft, {
      kind: 'volunteer',
      registrationId: draft.registrationId,
      password,
      name: value('name'),
      fatherName: value('fatherName'),
      motherName: value('motherName'),
      nid: value('nid'),
      whatsapp: optional('whatsapp'),
      type,
      divisionId: address.divisionId ?? '',
      districtId: address.districtId ?? '',
      upazilaId: address.upazilaId ?? '',
      unionId: address.unionId ?? '',
      addressLine: optional('addressLine'),
      education: optional('education'),
      experience: optional('experience'),
      workDescription: optional('workDescription'),
      previousProjects: optional('previousProjects'),
      facebookId: optional('facebookId'),
      bank: Object.keys(bank).length ? bank : undefined,
      referenceNid: type === 'team_member' ? value('referenceNid') : undefined,
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
        <FormGrid>
          <TextField
            label={t('name')}
            name="name"
            value={value('name')}
            onChange={set('name')}
            required
            error={errors.name}
            autoComplete="name"
          />
          <TextField
            label={t('father_name')}
            name="fatherName"
            value={value('fatherName')}
            onChange={set('fatherName')}
            required
            error={errors.fatherName}
          />
          <TextField
            label={t('mother_name')}
            name="motherName"
            value={value('motherName')}
            onChange={set('motherName')}
            required
            error={errors.motherName}
          />
          <TextField
            label={t('nid')}
            name="nid"
            value={value('nid')}
            onChange={(v) => set('nid')(v.replace(/\D/g, '').slice(0, 17))}
            inputMode="numeric"
            required
            error={errors.nid}
          />
          <TextField
            label={t('whatsapp')}
            name="whatsapp"
            value={value('whatsapp')}
            onChange={(v) => set('whatsapp')(v.replace(/\D/g, '').slice(0, 11))}
            inputMode="numeric"
            error={errors.whatsapp}
          />
        </FormGrid>
      </FormSection>
      <FormSection title={t('address')}>
        <FormGrid>
          <AddressFields value={address} onChange={setAddress} errors={errors} />
          <TextField
            label={t('address_line')}
            name="addressLine"
            value={value('addressLine')}
            onChange={set('addressLine')}
            error={errors.addressLine}
          />
        </FormGrid>
      </FormSection>
      <FormSection title={t('work')}>
        <Select
          label={t('type')}
          name="type"
          required
          value={type}
          onChange={(id) => id && setType(id as VolunteerType)}
          options={VOLUNTEER_TYPES.map((id) => ({ id, label: t(`types.${id}`) }))}
          error={errors.type}
        />
        {type === 'team_member' && (
          <div className="auth-shell-stack">
            <TextField
              label={t('reference_nid')}
              name="referenceNid"
              value={value('referenceNid')}
              onChange={(v) => {
                // the name shown belongs to the NID it was looked up for
                setReference({});
                set('referenceNid')(v.replace(/\D/g, '').slice(0, 17));
              }}
              inputMode="numeric"
              required
              error={errors.referenceNid}
            />
            <Button variant="secondary" onPress={checkReference}>
              {t('reference_check')}
            </Button>
            {reference.name && (
              <Alert tone="success" live="status">
                {t('reference_found', { name: reference.name })}
              </Alert>
            )}
            {reference.missing && (
              <Alert tone="warning" live="status">
                {t('reference_missing')}
              </Alert>
            )}
          </div>
        )}
        <FormGrid>
          {TEXTS.map((key) => (
            <TextField
              key={key}
              label={t(TEXT_LABELS[key])}
              name={key}
              value={value(key)}
              onChange={set(key)}
              error={errors[key]}
            />
          ))}
        </FormGrid>
      </FormSection>
      <FormSection title={t('bank')}>
        <FormGrid>
          {BANK.map((key) => (
            <TextField
              key={key}
              label={t(BANK_LABELS[key])}
              name={key}
              value={value(key)}
              onChange={set(key)}
              error={errors[`bank.${key}`]}
            />
          ))}
        </FormGrid>
      </FormSection>
      <FormSection title={t('photos')}>
        <PhotoField
          label={t('photo')}
          upload={(photo, source) => uploadDraftPhoto(draft, 'photo', photo, source)}
          onUploaded={(id) => setPhotos((old) => ({ ...old, photo: id !== null }))}
          error={errors.photo}
        />
        <PhotoField
          label={t('nid_photo')}
          upload={(photo, source) => uploadDraftPhoto(draft, 'nid_photo', photo, source)}
          onUploaded={(id) => setPhotos((old) => ({ ...old, nid_photo: id !== null }))}
          error={errors.nid_photo}
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
