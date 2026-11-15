import { isBirthRegNumber, isNidNumber, normalizeIdentityNumber } from '@css/shared/beneficiaries';
import { identityColumn } from '@css/shared/forms';
import { Alert, Button, Dialog, Form, FormSelectField, FormTextField, Text } from '@/ui';
import { useQuery } from '@tanstack/react-query';
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
 * merge. The write carries the profile's version from when the official compared the two: the
 * profile page hands in the version it shows; on the review page the dialog reads it once as it
 * opens, and the button waits for that read, so a profile changed while the dialog was open is
 * refused as stale rather than overwritten.
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
  /** The profile's version as the caller read it; read here as the dialog opens when not given. */
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
  // read once as the dialog opens, never again while it stays open: the key sits outside every
  // list or profile key, so no invalidation after another write refreshes it
  const opened = useQuery({
    queryKey: ['identity-dialog-version', beneficiaryId],
    queryFn: async () => (await beneficiaryProfile(beneficiaryId)).meta.etag ?? '',
    enabled: etag === undefined,
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
  const version = etag ?? opened.data;
  // the profile that holds the number, where the server named it to this official
  const [holder, setHolder] = useState<string | null>(null);
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;
  const ready = kind !== '' && typed.trim().length > 0 && version !== undefined;

  const send = async (v: IdentityFields) => {
    setHolder(null);
    try {
      if (version === undefined) return;
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
        {opened.isError && !error && <Alert tone="error">{ts('text')}</Alert>}
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
