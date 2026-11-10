import type { PhotoSlot } from '@css/shared/registration';
import { BLOOD_GROUPS, TSHIRT_SIZES, VOLUNTEERING_AREAS } from '@css/shared/registration';
import { Checkbox, DateField, SelectField, TextField } from '@/ui';
import { useTranslations } from 'use-intl';
import { PasswordRules } from '../../components/PasswordRules';
import { AddressFields } from './AddressFields';
import { PHOTOS, type RegistrationValues } from './form-state';
import { PhotoField } from './PhotoField';
import {
  EducationFields,
  PermanentAddressFields,
  ProfessionFields,
  SkillsFields,
} from './ProfileInputs';
import { type Draft, uploadDraftPhoto } from './registration-api';

interface StepProps {
  values: RegistrationValues;
  set: (patch: Partial<RegistrationValues>) => void;
  errors: Record<string, string>;
}

const digits = (max: number) => (v: string) => v.replace(/\D/g, '').slice(0, max);

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
      <TextField
        label={t('form.facebook')}
        name="facebookId"
        value={values.facebookId}
        onChange={(facebookId) => set({ facebookId })}
        error={errors.facebookId}
      />
      <DateField
        label={t('form.date_of_birth')}
        name="dateOfBirth"
        value={values.dateOfBirth || ''}
        onChange={(dateOfBirth) => set({ dateOfBirth: dateOfBirth ?? '' })}
        min="1900-01-01"
        max={new Date().toISOString().slice(0, 10)}
        error={errors.dateOfBirth}
      />
      <SelectField
        label={t('form.blood_group')}
        name="bloodGroup"
        placeholder={t('form.choose')}
        value={values.bloodGroup || ''}
        onChange={(id) => set({ bloodGroup: id ?? '' })}
        options={BLOOD_GROUPS.map((id) => ({ value: id, label: id }))}
        error={errors.bloodGroup}
      />
      <SelectField
        label={t('form.tshirt_size')}
        name="tshirtSize"
        placeholder={t('form.choose')}
        value={values.tshirtSize || ''}
        onChange={(id) => set({ tshirtSize: id ?? '' })}
        options={TSHIRT_SIZES.map((id) => ({ value: id, label: id }))}
        error={errors.tshirtSize}
      />
    </div>
  );
}

/** Volunteer step 3: the present address, the permanent address and where the person wants to serve. */
export function AddressStep({ values, set, errors }: StepProps) {
  const t = useTranslations('registration');
  return (
    <div className="register-stack">
      <h3>{t('form.address_present')}</h3>
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
      </div>
      <h3>{t('form.address_permanent')}</h3>
      <Checkbox
        label={t('form.same_address')}
        checked={values.permanentSame}
        onChange={(permanentSame) => set({ permanentSame })}
      />
      {!values.permanentSame && (
        <div className="register-grid">
          <PermanentAddressFields
            value={values.permanent}
            onChange={(permanent) => set({ permanent })}
            errors={errors}
          />
        </div>
      )}
      <SelectField
        label={t('form.volunteering_area')}
        name="volunteeringArea"
        placeholder={t('form.choose')}
        value={values.volunteeringArea || ''}
        onChange={(id) => set({ volunteeringArea: id ?? '' })}
        options={VOLUNTEERING_AREAS.map((id) => ({
          value: id,
          label: t(`lists.volunteering_area.${id}`),
        }))}
        error={errors.volunteeringArea}
      />
    </div>
  );
}

/** Volunteer step 4: the education (all optional). */
export function EducationStep({ values, set, errors }: StepProps) {
  return (
    <EducationFields
      value={values.education}
      onChange={(education) => set({ education })}
      errors={errors}
    />
  );
}

/** Volunteer step 5: the profession with the fields of that profession only. */
export function ProfessionStep({ values, set, errors }: StepProps) {
  return (
    <ProfessionFields
      value={values.profession}
      onChange={(profession) => set({ profession })}
      errors={errors}
    />
  );
}

/** Volunteer step 6: the areas of interest, the vehicle, swimming, the availability and the full-time answer. */
export function SkillsStep({ values, set, errors }: StepProps) {
  return (
    <SkillsFields value={values.skills} onChange={(skills) => set({ skills })} errors={errors} />
  );
}

/** The password, checked while it is typed. */
export function AccountStep({ values, set, errors }: StepProps) {
  const t = useTranslations('registration');
  return (
    <div className="register-stack">
      <div className="register-grid">
        <TextField
          type="password"
          label={t('form.password')}
          name="password"
          value={values.password}
          onChange={(password) => set({ password })}
          autoComplete="new-password"
          required
          error={errors.password}
        />
        <TextField
          type="password"
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

/** The last step: the own photo and, for a volunteer, both pages of the NID card. */
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
