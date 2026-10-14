import type { PhotoSlot } from '@css/shared/registration';
import { BLOOD_GROUPS, TSHIRT_SIZES, VOLUNTEERING_AREAS } from '@css/shared/registration';
import { DateField, PasswordField, Select, TextField } from '@css/ui';
import { useTranslations } from 'use-intl';
import { PasswordRules } from '../../components/PasswordRules';
import { AddressFields } from './AddressFields';
import { PHOTOS, type RegistrationValues, TEXT_FIELDS } from './form-state';
import { PhotoField } from './PhotoField';
import { EmergencyContactFields, ProfessionFields, SkillsFields } from './ProfileInputs';
import { type Draft, uploadDraftPhoto } from './registration-api';

interface StepProps {
  values: RegistrationValues;
  set: (patch: Partial<RegistrationValues>) => void;
  errors: Record<string, string>;
}

const digits = (max: number) => (v: string) => v.replace(/\D/g, '').slice(0, max);

const TEXT_LABELS = {
  education: 'form.education',
  previousProjects: 'form.previous_projects',
  facebookId: 'form.facebook',
} as const;

/** Volunteer step 2: the mother's name, the NID, WhatsApp, the date of birth, the blood group and the T-shirt size. */
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
      <DateField
        label={t('form.date_of_birth')}
        name="dateOfBirth"
        value={values.dateOfBirth || null}
        onChange={(dateOfBirth) => set({ dateOfBirth: dateOfBirth ?? '' })}
        min="1900-01-01"
        max={new Date().toISOString().slice(0, 10)}
        error={errors.dateOfBirth}
      />
      <Select
        label={t('form.blood_group')}
        name="bloodGroup"
        placeholder={t('form.choose')}
        value={values.bloodGroup || null}
        onChange={(id) => set({ bloodGroup: id ?? '' })}
        options={BLOOD_GROUPS.map((id) => ({ id, label: id }))}
        error={errors.bloodGroup}
      />
      <Select
        label={t('form.tshirt_size')}
        name="tshirtSize"
        placeholder={t('form.choose')}
        value={values.tshirtSize || null}
        onChange={(id) => set({ tshirtSize: id ?? '' })}
        options={TSHIRT_SIZES.map((id) => ({ id, label: id }))}
        error={errors.tshirtSize}
      />
    </div>
  );
}

/** Volunteer step 3: the address and where the person wants to serve. */
export function AddressStep({ values, set, errors }: StepProps) {
  const t = useTranslations('registration');
  return (
    <div className="register-grid">
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
      <Select
        label={t('form.volunteering_area')}
        name="volunteeringArea"
        placeholder={t('form.choose')}
        value={values.volunteeringArea || null}
        onChange={(id) => set({ volunteeringArea: id ?? '' })}
        options={VOLUNTEERING_AREAS.map((id) => ({
          id,
          label: t(`lists.volunteering_area.${id}`),
        }))}
        error={errors.volunteeringArea}
      />
    </div>
  );
}

/** Volunteer step 4: the profession with its own fields, then the optional earlier work details. */
export function ProfessionStep({ values, set, errors }: StepProps) {
  const t = useTranslations('registration');
  return (
    <div className="register-stack">
      <ProfessionFields
        value={values.profession}
        onChange={(profession) => set({ profession })}
        errors={errors}
      />
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
    </div>
  );
}

/** Volunteer step 5: the areas of interest, the vehicle, swimming, the availability and the guardian. */
export function SkillsStep({ values, set, errors }: StepProps) {
  const t = useTranslations('registration');
  return (
    <div className="register-stack">
      <SkillsFields value={values.skills} onChange={(skills) => set({ skills })} errors={errors} />
      <h3 className="register-subtitle">{t('form.emergency_contact')}</h3>
      <EmergencyContactFields
        value={values.emergency}
        onChange={(emergency) => set({ emergency })}
        errors={errors}
      />
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
