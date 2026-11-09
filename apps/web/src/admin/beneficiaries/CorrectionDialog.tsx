import { isBirthRegNumber, isNidNumber, normalizeIdentityNumber } from '@css/shared/beneficiaries';
import { Alert, Button, Dialog, SelectField, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { type BeneficiaryProfile, type LockedField, requestCorrection } from './beneficiaries-api';

const FIELDS: LockedField[] = ['name', 'father_or_husband_name', 'nid', 'birth_reg'];
const isNumber = (field: LockedField | null) => field === 'nid' || field === 'birth_reg';

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
  const te = useTranslations('errors.validation');
  const tc = useTranslations('common.action');
  const [field, setField] = useState<LockedField | null>(null);
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>();
  const send = useMutation({
    mutationFn: (newValue: string) =>
      requestCorrection(profile.id, { field: field!, newValue, reason: reason.trim() }),
    onSuccess: onDone,
  });
  const failure = send.error instanceof ApiFailure ? send.error : null;
  const values: Record<LockedField, string | null | undefined> = {
    name: profile.name,
    father_or_husband_name: profile.fatherOrHusbandName,
    nid: profile.nid,
    birth_reg: profile.birthReg,
  };
  // eslint-disable-next-line security/detect-object-injection -- one of the four locked fields
  const current = field ? values[field] : null;
  const submit = () => {
    // typed numbers may carry Bengali digits, spaces or hyphens; the server takes plain digits
    const newValue = isNumber(field) ? normalizeIdentityNumber(value) : value.trim();
    if (field === 'nid' && !isNidNumber(newValue)) return setError(te('nid_format'));
    if (field === 'birth_reg' && !isBirthRegNumber(newValue))
      return setError(te('birth_reg_format'));
    send.mutate(newValue);
  };
  const ready = field !== null && value.trim().length > 0 && reason.trim().length >= 3;
  return (
    <Dialog
      title={t('title')}
      open
      onClose={onClose}
      dismissible={!send.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={send.isPending}>
            {tc('cancel')}
          </Button>
          <Button onClick={submit} disabled={!ready} loading={send.isPending}>
            {t('send')}
          </Button>
        </>
      }
    >
      {failure && <Alert tone="error">{failure.details[0]?.message ?? failure.message}</Alert>}
      <SelectField
        label={t('field')}
        required
        value={field ?? ''}
        options={FIELDS.map((f) => ({ value: f, label: tf(f) }))}
        onChange={(id) => {
          setField((id as LockedField) || null);
          setError(undefined);
        }}
      />
      <TextField
        label={t('new_value')}
        hint={current ? t('current', { value: current }) : undefined}
        type={isNumber(field) ? 'nid' : 'text'}
        required
        maxLength={200}
        value={value}
        error={error}
        onChange={(next) => {
          setValue(next);
          setError(undefined);
        }}
      />
      <TextField
        rows={4}
        label={t('reason')}
        required
        maxLength={1000}
        value={reason}
        onChange={setReason}
      />
    </Dialog>
  );
}
