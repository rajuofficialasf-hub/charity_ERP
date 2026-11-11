import type { PhotoSlot } from '@css/shared/registration';
import { BLOOD_GROUPS, TSHIRT_SIZES, VOLUNTEERING_AREAS } from '@css/shared/registration';
import { Checkbox, FormDateField, FormSelectField, FormTextField } from '@/ui';
import { Controller, useFormContext, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { PasswordRules } from '../../components/PasswordRules';
import { AddressFields } from './AddressFields';
import { PHOTOS, type RegistrationForm } from './form-state';
import { PhotoField } from './PhotoField';
import {
  EducationFields,
  PermanentAddressFields,
  ProfessionFields,
  SkillsFields,
} from './ProfileInputs';
import { type Draft, uploadDraftPhoto } from './registration-api';

/**
 * The steps read and write the registration form of the page around them; a group of inputs (the
 * address, the education, the profession, the skills) takes its messages as one record by path.
 */
interface StepProps {
  errors: Record<string, string>;
}

const digits = (max: number) => (v: string) => v.replace(/\D/g, '').slice(0, max);

/** The page's registration form, for the groups bound by a Controller. */
const useRegistrationForm = () => useFormContext<RegistrationForm>();

/** Volunteer step 2: the mother's name, the NID, WhatsApp, the date of birth, the blood group and the T-shirt size. */
export function IdentityStep() {
  const t = useTranslations('registration');
  return (
    <div className="register-grid">
      <FormTextField label={t('form.mother_name')} name="motherName" required />
      <FormTextField
        label={t('form.nid')}
        name="nid"
        normalize={digits(17)}
        inputMode="numeric"
        required
      />
      <FormTextField
        label={t('form.whatsapp')}
        name="whatsapp"
        normalize={digits(11)}
        inputMode="numeric"
      />
      <FormTextField label={t('form.facebook')} name="facebookId" />
      <FormDateField
        label={t('form.date_of_birth')}
        name="dateOfBirth"
        min="1900-01-01"
        max={new Date().toISOString().slice(0, 10)}
      />
      <FormSelectField
        label={t('form.blood_group')}
        name="bloodGroup"
        placeholder={t('form.choose')}
        options={BLOOD_GROUPS.map((id) => ({ value: id, label: id }))}
      />
      <FormSelectField
        label={t('form.tshirt_size')}
        name="tshirtSize"
        placeholder={t('form.choose')}
        options={TSHIRT_SIZES.map((id) => ({ value: id, label: id }))}
      />
    </div>
  );
}

/** Volunteer step 3: the present address, the permanent address and where the person wants to serve. */
export function AddressStep({ errors }: StepProps) {
  const t = useTranslations('registration');
  const { control } = useRegistrationForm();
  const permanentSame = useWatch({ control, name: 'permanentSame' });
  return (
    <div className="register-stack">
      <h3>{t('form.address_present')}</h3>
      <div className="register-grid">
        <Controller
          control={control}
          name="address"
          render={({ field }) => (
            <AddressFields value={field.value} onChange={field.onChange} errors={errors} />
          )}
        />
        <FormTextField label={t('form.address_line')} name="addressLine" />
      </div>
      <h3>{t('form.address_permanent')}</h3>
      <Controller
        control={control}
        name="permanentSame"
        render={({ field }) => (
          <Checkbox
            label={t('form.same_address')}
            checked={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {!permanentSame && (
        <div className="register-grid">
          <Controller
            control={control}
            name="permanent"
            render={({ field }) => (
              <PermanentAddressFields
                value={field.value}
                onChange={field.onChange}
                errors={errors}
              />
            )}
          />
        </div>
      )}
      <FormSelectField
        label={t('form.volunteering_area')}
        name="volunteeringArea"
        placeholder={t('form.choose')}
        options={VOLUNTEERING_AREAS.map((id) => ({
          value: id,
          label: t(`lists.volunteering_area.${id}`),
        }))}
      />
    </div>
  );
}

/** Volunteer step 4: the education (all optional). */
export function EducationStep({ errors }: StepProps) {
  const { control } = useRegistrationForm();
  return (
    <Controller
      control={control}
      name="education"
      render={({ field }) => (
        <EducationFields value={field.value} onChange={field.onChange} errors={errors} />
      )}
    />
  );
}

/** Volunteer step 5: the profession with the fields of that profession only. */
export function ProfessionStep({ errors }: StepProps) {
  const { control } = useRegistrationForm();
  return (
    <Controller
      control={control}
      name="profession"
      render={({ field }) => (
        <ProfessionFields value={field.value} onChange={field.onChange} errors={errors} />
      )}
    />
  );
}

/** Volunteer step 6: the areas of interest, the vehicle, swimming, the availability and the full-time answer. */
export function SkillsStep({ errors }: StepProps) {
  const { control } = useRegistrationForm();
  return (
    <Controller
      control={control}
      name="skills"
      render={({ field }) => (
        <SkillsFields value={field.value} onChange={field.onChange} errors={errors} />
      )}
    />
  );
}

/** The password, checked while it is typed. */
export function AccountStep() {
  const t = useTranslations('registration');
  const password = useWatch({ control: useRegistrationForm().control, name: 'password' });
  return (
    <div className="register-stack">
      <div className="register-grid">
        <FormTextField
          type="password"
          label={t('form.password')}
          name="password"
          autoComplete="new-password"
          required
        />
        <FormTextField
          type="password"
          label={t('form.confirm_password')}
          name="confirm"
          autoComplete="new-password"
          required
        />
      </div>
      <PasswordRules password={password} id="register-rules" />
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
