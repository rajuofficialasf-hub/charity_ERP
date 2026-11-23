import { isBirthRegNumber, isNidNumber, normalizeIdentityNumber } from '@css/shared/beneficiaries';
import { Alert, Dialog, Form, FormTextField, SelectField, TextField } from '@/ui';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { type BeneficiaryProfile, type LockedField, requestCorrection } from './beneficiaries-api';
import { DialogActions } from '../DialogActions';

const FIELDS: LockedField[] = ['name', 'father_or_husband_name', 'nid', 'birth_reg'];
const isNumber = (field: string) => field === 'nid' || field === 'birth_reg';

/** The value as it is sent: typed numbers may carry Bengali digits, spaces or hyphens. */
const sentValue = (field: string, value: string) =>
  isNumber(field) ? normalizeIdentityNumber(value) : value.trim();

/** A number in its format; the server checks the rest again. */
const CORRECTION_SCHEMA = z
  .object({ field: z.string(), newValue: z.string(), reason: z.string() })
  .superRefine((v, ctx) => {
    const value = sentValue(v.field, v.newValue);
    if (v.field === 'nid' && !isNidNumber(value))
      ctx.addIssue({ code: 'custom', path: ['newValue'], message: 'validation.nid_format' });
    if (v.field === 'birth_reg' && !isBirthRegNumber(value))
      ctx.addIssue({ code: 'custom', path: ['newValue'], message: 'validation.birth_reg_format' });
  });
type CorrectionFields = z.infer<typeof CORRECTION_SCHEMA>;

/**
 * Asks another official to correct a locked field of a beneficiary (the name, the father's or
 * husband's name, the NID or the birth registration), with the new value and a reason. The
 * change happens only when the request is approved.
 */
export function CorrectionDialog({
  profile,
  onClose,
  onDone,
}: {
  profile: BeneficiaryProfile;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin.beneficiaries.correction');
  const tf = useTranslations('admin.beneficiaries.profile.fields');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const form = useForm<CorrectionFields>({
    resolver: useSchemaResolver(CORRECTION_SCHEMA),
    defaultValues: { field: '', newValue: '', reason: '' },
    reValidateMode: 'onSubmit',
  });
  const [field, value, reason] = useWatch({
    control: form.control,
    name: ['field', 'newValue', 'reason'],
  });
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;
  const values: Record<LockedField, string | null | undefined> = {
    name: profile.name,
    father_or_husband_name: profile.fatherOrHusbandName,
    nid: profile.nid,
    birth_reg: profile.birthReg,
  };
  const current = FIELDS.includes(field as LockedField) ? values[field as LockedField] : null;
  const ready = field !== '' && value.trim().length > 0 && reason.trim().length >= 3;

  const send = async (v: CorrectionFields) => {
    try {
      await requestCorrection(profile.id, {
        field: v.field as LockedField,
        newValue: sentValue(v.field, v.newValue),
        reason: v.reason.trim(),
      });
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    onDone();
  };

  return (
    <Dialog
      title={t('title')}
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <DialogActions
          cancelLabel={tc('cancel')}
          onCancel={onClose}
          submitLabel={t('send')}
          onSubmit={() => void form.handleSubmit(send)()}
          pending={pending}
          disabled={!ready}
        />
      }
    >
      <Form form={form} onSubmit={send} label={t('title')}>
        {error && <Alert tone="error">{error}</Alert>}
        <Controller
          control={form.control}
          name="field"
          render={({ field: picked, fieldState }) => (
            <SelectField
              label={t('field')}
              required
              value={picked.value}
              options={FIELDS.map((f) => ({ value: f, label: tf(f) }))}
              error={fieldState.error?.message}
              onChange={(id) => {
                picked.onChange(id);
                // the format asked for changes with the field
                form.clearErrors('newValue');
              }}
            />
          )}
        />
        <Controller
          control={form.control}
          name="newValue"
          render={({ field: typed, fieldState }) => (
            <TextField
              label={t('new_value')}
              hint={current ? t('current', { value: current }) : undefined}
              type={isNumber(field) ? 'nid' : 'text'}
              required
              maxLength={200}
              value={typed.value}
              error={fieldState.error?.message}
              onBlur={typed.onBlur}
              onChange={(next) => {
                typed.onChange(next);
                form.clearErrors('newValue');
              }}
            />
          )}
        />
        <FormTextField name="reason" rows={4} label={t('reason')} required maxLength={1000} />
      </Form>
    </Dialog>
  );
}
