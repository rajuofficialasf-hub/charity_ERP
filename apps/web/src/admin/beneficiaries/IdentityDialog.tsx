import { isBirthRegNumber, isNidNumber, normalizeIdentityNumber } from '@css/shared/beneficiaries';
import { identityColumn } from '@css/shared/forms';
import { Alert, Button, Dialog, Form, FormSelectField, FormTextField, Text } from '@/ui';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Link } from 'react-router';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../api/client';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { addIdentity, beneficiaryProfile, type IdentityKind } from './beneficiaries-api';
import { comparePath } from './duplicates/merge-api';

const KINDS: IdentityKind[] = ['nid', 'birth_reg'];

/** A number in its kind's format; the server checks the rest again. */
const IDENTITY_SCHEMA = z.object({ kind: z.string(), number: z.string() }).superRefine((v, ctx) => {
  const number = normalizeIdentityNumber(v.number);
  if (v.kind === 'nid' && !isNidNumber(number))
    ctx.addIssue({ code: 'custom', path: ['number'], message: 'validation.nid_format' });
  if (v.kind === 'birth_reg' && !isBirthRegNumber(number))
    ctx.addIssue({ code: 'custom', path: ['number'], message: 'validation.birth_reg_format' });
});
type IdentityFields = z.infer<typeof IDENTITY_SCHEMA>;

/**
 * Adds the identity document to a profile that has none, once the official has compared the two
 * (docs/ui/SCREENS.md, the 360° profile and the application review). The number may come from an
 * application of the person, which the write names. A number another profile holds is refused;
 * where the server names that profile, the dialog links the comparison of the two, the way to a
 * merge. The profile's version is the one read when the dialog opened: the profile page hands it
 * in, the review page lets the dialog read it.
 */
export function IdentityDialog({
  beneficiaryId,
  etag,
  number = '',
  applicationId,
  onClose,
  onDone,
}: {
  beneficiaryId: string;
  /** The profile's version as the caller read it; read here when not given. */
  etag?: string;
  /** The number an application carries, to start from. */
  number?: string;
  applicationId?: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin.beneficiaries.identity');
  const tf = useTranslations('admin.beneficiaries.profile.fields');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const form = useForm<IdentityFields>({
    resolver: useSchemaResolver(IDENTITY_SCHEMA),
    defaultValues: { kind: number ? identityColumn(number) : '', number },
    reValidateMode: 'onSubmit',
  });
  const [kind, typed] = useWatch({ control: form.control, name: ['kind', 'number'] });
  // the profile that holds the number, where the server named it to this official
  const [holder, setHolder] = useState<string | null>(null);
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;
  const ready = kind !== '' && typed.trim().length > 0;

  const send = async (v: IdentityFields) => {
    setHolder(null);
    try {
      const version = etag ?? (await beneficiaryProfile(beneficiaryId)).meta.etag ?? '';
      await addIdentity(beneficiaryId, version, {
        kind: v.kind as IdentityKind,
        number: normalizeIdentityNumber(v.number),
        ...(applicationId ? { applicationId } : {}),
      });
    } catch (failure) {
      if (failure instanceof ApiFailure && failure.code === 'beneficiary.identity_taken')
        setHolder(
          failure.details.find((d) => d.params?.beneficiaryId)?.params?.beneficiaryId ?? null,
        );
      showFailure(form, failure, ts('text'));
      return;
    }
    onDone();
  };

  return (
    <Dialog
      title={t('title')}
      size="small"
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(send)()}
            disabled={!ready}
            loading={pending}
          >
            {t('confirm')}
          </Button>
        </>
      }
    >
      <Form form={form} onSubmit={send} label={t('title')}>
        <Text tone="muted">{t('help')}</Text>
        {error && <Alert tone="error">{error}</Alert>}
        <FormSelectField
          name="kind"
          label={t('kind')}
          required
          options={KINDS.map((k) => ({ value: k, label: tf(k) }))}
        />
        <FormTextField name="number" label={t('number')} type="nid" required maxLength={20} />
        {holder && <Link to={comparePath(beneficiaryId, holder)}>{t('compare')}</Link>}
      </Form>
    </Dialog>
  );
}
