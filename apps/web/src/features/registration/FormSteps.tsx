import { type PhotoSlot, VOLUNTEER_TYPES, type VolunteerType } from '@css/shared/registration';
import type { Locale } from '@css/shared/i18n';
import { Alert, Button, PasswordField, Select, TextField } from '@css/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PasswordRules } from '../../components/PasswordRules';
import { AddressFields } from './AddressFields';
import { BANK_FIELDS, PHOTOS, type RegistrationValues, TEXT_FIELDS } from './form-state';
import { PhotoField } from './PhotoField';
import {
  type Draft,
  failureOf,
  locations,
  lookupReference,
  uploadDraftPhoto,
} from './registration-api';

interface StepProps {
  values: RegistrationValues;
  set: (patch: Partial<RegistrationValues>) => void;
  errors: Record<string, string>;
}

const digits = (max: number) => (v: string) => v.replace(/\D/g, '').slice(0, max);

const TEXT_LABELS = {
  education: 'form.education',
  experience: 'form.experience',
  workDescription: 'form.work_description',
  previousProjects: 'form.previous_projects',
  facebookId: 'form.facebook',
} as const;
const BANK_LABELS = {
  bankName: 'form.bank_name',
  accountName: 'form.account_name',
  accountNumber: 'form.account_number',
  routingNumber: 'form.routing_number',
} as const;

/** Volunteer step 2: the mother's name, the NID, WhatsApp and the address. */
export function IdentityStep({ values, set, errors }: StepProps) {
  const t = useTranslations('registration');
  return (
    <div className="register-grid">
      <TextField
        label={t('form.mother_name')}
        name="motherName"
        value={values.motherName}
        onChange={(motherName) => set({ motherName })}
        required
        error={errors.motherName}
      />
      <TextField
        label={t('form.nid')}
        name="nid"
        value={values.nid}
        onChange={(v) => set({ nid: digits(17)(v) })}
        inputMode="numeric"
        required
        error={errors.nid}
      />
      <TextField
        label={t('form.whatsapp')}
        name="whatsapp"
        value={values.whatsapp}
        onChange={(v) => set({ whatsapp: digits(11)(v) })}
        inputMode="numeric"
        error={errors.whatsapp}
      />
      <AddressFields
        value={values.address}
        onChange={(address) => set({ address })}
        errors={errors}
      />
      <TextField
        label={t('form.address_line')}
        name="addressLine"
        value={values.addressLine}
        onChange={(addressLine) => set({ addressLine })}
        error={errors.addressLine}
      />
    </div>
  );
}

/** Volunteer step 3: the type (the main volunteer's NID for a team member) and the work details. */
export function WorkStep({ values, set, errors, draft }: StepProps & { draft: Draft }) {
  const t = useTranslations('registration');
  const tl = useTranslations('auth.login');
  const [reference, setReference] = useState<{ name?: string; missing?: boolean; error?: string }>(
    {},
  );
  const check = () => {
    setReference({});
    void lookupReference(draft, values.referenceNid)
      .then(({ name }) => setReference({ name }))
      .catch((failure: unknown) => {
        const f = failureOf(failure, tl('offline'));
        if (f.code === 'permission.not_found') setReference({ missing: true });
        else setReference({ error: f.fields.nid ?? f.message ?? tl('offline') });
      });
  };
  return (
    <div className="register-grid">
      <Select
        label={t('form.type')}
        name="type"
        required
        value={values.type}
        onChange={(id) => id && set({ type: id as VolunteerType })}
        options={VOLUNTEER_TYPES.map((id) => ({ id, label: t(`form.types.${id}`) }))}
        error={errors.type}
      />
      {values.type === 'team_member' && (
        <div className="register-stack">
          <TextField
            label={t('form.reference_nid')}
            name="referenceNid"
            value={values.referenceNid}
            onChange={(v) => {
              // the name shown belongs to the NID it was looked up for
              setReference({});
              set({ referenceNid: digits(17)(v) });
            }}
            inputMode="numeric"
            required
            error={errors.referenceNid ?? reference.error}
            endAction={
              <Button size="sm" variant="secondary" onPress={check}>
                {t('form.reference_check')}
              </Button>
            }
          />
          {reference.name && (
            <Alert tone="success" live="status">
              {t('form.reference_found', { name: reference.name })}
            </Alert>
          )}
          {reference.missing && (
            <Alert tone="warning" live="status">
              {t('form.reference_missing')}
            </Alert>
          )}
        </div>
      )}
      {TEXT_FIELDS.map((key) => (
        <TextField
          key={key}
          label={t(TEXT_LABELS[key])}
          name={key}
          value={values[key]}
          onChange={(v) => set({ [key]: v })}
          error={errors[key]}
        />
      ))}
    </div>
  );
}

/** Official step 2: the designation, the program and the division of the workplace. */
export function WorkplaceStep({ values, set, errors, draft }: StepProps & { draft: Draft }) {
  const t = useTranslations('registration');
  const locale = useLocale() as Locale;
  const divisions = useQuery({
    queryKey: ['locations', 'divisions'],
    queryFn: () => locations(),
    staleTime: 60 * 60_000,
  }).data;
  return (
    <div className="register-grid">
      <TextField
        label={t('form.designation')}
        name="designation"
        value={values.designation}
        onChange={(designation) => set({ designation })}
        required
        error={errors.designation}
      />
      <Select
        label={t('form.program')}
        name="homeProgramId"
        required
        value={values.homeProgramId}
        onChange={(homeProgramId) => set({ homeProgramId })}
        options={(draft.programs ?? []).map((p) => ({ id: p.id, label: p.name[locale] }))}
        error={errors.homeProgramId}
      />
      <Select
        label={t('form.region')}
        name="homeDivisionId"
        required
        value={values.homeDivisionId}
        onChange={(homeDivisionId) => set({ homeDivisionId })}
        options={(divisions ?? []).map((d) => ({ id: d.id, label: d.name[locale] }))}
        error={errors.homeDivisionId}
      />
    </div>
  );
}

/** The bank details (volunteers, optional) and the password. */
export function AccountStep({ values, set, errors, withBank }: StepProps & { withBank: boolean }) {
  const t = useTranslations('registration');
  return (
    <div className="register-stack">
      {withBank && (
        <fieldset className="register-fieldset">
          <legend>{t('form.bank')}</legend>
          <div className="register-grid">
            {BANK_FIELDS.map((key) => (
              <TextField
                key={key}
                label={t(BANK_LABELS[key])}
                name={key}
                value={values.bank[key]}
                onChange={(v) => set({ bank: { ...values.bank, [key]: v } })}
                error={errors[`bank.${key}`]}
              />
            ))}
          </div>
        </fieldset>
      )}
      <div className="register-grid">
        <PasswordField
          label={t('form.password')}
          name="password"
          value={values.password}
          onChange={(password) => set({ password })}
          autoComplete="new-password"
          required
          error={errors.password}
        />
        <PasswordField
          label={t('form.confirm_password')}
          name="confirm"
          value={values.confirm}
          onChange={(confirm) => set({ confirm })}
          autoComplete="new-password"
          required
          error={errors.confirm}
        />
      </div>
      <PasswordRules password={values.password} id="register-rules" />
    </div>
  );
}

const PHOTO_LABELS = {
  photo: 'form.own_photo',
  nid_photo: 'form.nid_photo',
  nid_photo_back: 'form.nid_photo_back',
} as const;

/** The last step (UX-18): the own photo and, for a volunteer, both pages of the NID card. */
export function PhotosStep({
  draft,
  errors,
  onPhoto,
}: {
  draft: Draft;
  errors: Record<string, string>;
  onPhoto: (slot: PhotoSlot, uploaded: boolean) => void;
}) {
  const t = useTranslations('registration');
  return (
    <div className="register-photos">
      {PHOTOS[draft.kind].map((slot) => (
        <PhotoField
          key={slot}
          label={t(PHOTO_LABELS[slot])}
          upload={(photo, source) => uploadDraftPhoto(draft, slot, photo, source)}
          onUploaded={(id) => onPhoto(slot, id !== null)}
          error={errors[slot]}
        />
      ))}
    </div>
  );
}
