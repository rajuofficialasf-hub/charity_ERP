import type { PhotoSlot } from '@css/shared/registration';
import { PasswordField, TextField } from '@css/ui';
import { useTranslations } from 'use-intl';
import { PasswordRules } from '../../components/PasswordRules';
import { AddressFields } from './AddressFields';
import { PHOTOS, type RegistrationValues, TEXT_FIELDS } from './form-state';
import { PhotoField } from './PhotoField';
import { type Draft, uploadDraftPhoto } from './registration-api';

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

/** Volunteer step 3: the work details (all optional). */
export function WorkStep({ values, set, errors }: StepProps) {
  const t = useTranslations('registration');
  return (
    <div className="register-grid">
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

/** The password, checked while it is typed (O-64). */
export function AccountStep({ values, set, errors }: StepProps) {
  const t = useTranslations('registration');
  return (
    <div className="register-stack">
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
