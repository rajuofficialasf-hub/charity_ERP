import { Alert, Dialog, Form, FormTextField, Grid } from '@/ui';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { AddressFields } from '../../features/registration/AddressFields';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import {
  type BeneficiaryProfile,
  type ContactChange,
  type ContactSaved,
  updateContact,
} from './beneficiaries-api';
import { DialogActions } from '../DialogActions';

const place = z.string().nullable();
/**
 * The form holds the values as typed; what changed is sent and the server checks it (the mobile's
 * and the post code's format). The four places of the address are one value, so a refusal of one
 * of them is said above the form.
 */
const CONTACT_SCHEMA = z.object({
  mobile: z.string(),
  address: z.object({ divisionId: place, districtId: place, upazilaId: place, unionId: place }),
  village: z.string(),
  postOffice: z.string(),
  postCode: z.string(),
  landmark: z.string(),
});
type ContactFields = z.infer<typeof CONTACT_SCHEMA>;

const TEXTS = ['village', 'postOffice', 'postCode', 'landmark'] as const;

/** What changed against the profile; the address only once all four places are chosen. */
function changeOf(profile: BeneficiaryProfile, v: ContactFields) {
  const change: ContactChange = {};
  if (v.mobile.trim() !== (profile.mobile ?? '')) change.mobile = v.mobile.trim();
  const { address } = v;
  const placeMoved =
    address.divisionId !== profile.divisionId ||
    address.districtId !== profile.districtId ||
    address.upazilaId !== profile.upazilaId ||
    address.unionId !== (profile.unionId ?? null);
  const addressComplete = Boolean(
    address.divisionId && address.districtId && address.upazilaId && address.unionId,
  );
  if (placeMoved && addressComplete)
    Object.assign(change, {
      divisionId: address.divisionId,
      districtId: address.districtId,
      upazilaId: address.upazilaId,
      unionId: address.unionId,
    });
  for (const key of TEXTS) {
    // eslint-disable-next-line security/detect-object-injection -- a fixed list of field names
    const value = v[key].trim();
    // eslint-disable-next-line security/detect-object-injection -- a fixed list of field names
    if (value && value !== (profile[key] ?? '')) change[key] = value;
  }
  return { change, ready: Object.keys(change).length > 0 && (!placeMoved || addressComplete) };
}

/**
 * Edits the mobile and the address of a beneficiary outside an application, with the version read
 * when the profile opened (If-Match). Only what changed is sent; the four places of the address go
 * together. The name, the father's or husband's name and the identity number are not here: they
 * change only through a correction request.
 */
export function ContactDialog({
  profile,
  etag,
  onClose,
  onDone,
}: {
  profile: BeneficiaryProfile;
  etag: string;
  onClose: () => void;
  onDone: (saved: ContactSaved) => void;
}) {
  const t = useTranslations('admin.beneficiaries.contact');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const form = useForm<ContactFields>({
    resolver: useSchemaResolver(CONTACT_SCHEMA),
    defaultValues: {
      mobile: profile.mobile ?? '',
      address: {
        divisionId: profile.divisionId,
        districtId: profile.districtId,
        upazilaId: profile.upazilaId,
        unionId: profile.unionId ?? null,
      },
      village: profile.village ?? '',
      postOffice: profile.postOffice ?? '',
      postCode: profile.postCode ?? '',
      landmark: profile.landmark ?? '',
    },
    reValidateMode: 'onSubmit',
  });
  const { ready } = changeOf(profile, useWatch({ control: form.control }) as ContactFields);
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;

  const save = async (values: ContactFields) => {
    let saved: ContactSaved;
    try {
      saved = await updateContact(profile.id, etag, changeOf(profile, values).change);
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    onDone(saved);
  };

  return (
    <Dialog
      title={t('title')}
      open
      fullScreenOnPhone
      onClose={onClose}
      dismissible={!pending}
      actions={
        <DialogActions
          cancelLabel={tc('cancel')}
          onCancel={onClose}
          submitLabel={t('save')}
          onSubmit={() => void form.handleSubmit(save)()}
          pending={pending}
          disabled={!ready}
        />
      }
    >
      <Form form={form} onSubmit={save} label={t('title')}>
        {error && <Alert tone="error">{error}</Alert>}
        <FormTextField name="mobile" type="tel" label={t('mobile')} />
        <Controller
          control={form.control}
          name="address"
          render={({ field }) => <AddressFields value={field.value} onChange={field.onChange} />}
        />
        <FormTextField name="village" label={t('village')} maxLength={200} />
        <Grid columns={{ base: 1, sm: 2 }} gap={3}>
          <FormTextField name="postOffice" label={t('post_office')} maxLength={100} />
          <FormTextField name="postCode" label={t('post_code')} maxLength={4} inputMode="numeric" />
        </Grid>
        <FormTextField name="landmark" label={t('landmark')} maxLength={200} />
      </Form>
    </Dialog>
  );
}
