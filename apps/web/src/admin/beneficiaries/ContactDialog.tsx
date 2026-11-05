import { Alert, Button, Dialog, Grid, Stack, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { AddressFields } from '../../features/registration/AddressFields';
import { ApiFailure } from '../../lib/api';
import {
  type BeneficiaryProfile,
  type ContactChange,
  type ContactSaved,
  updateContact,
} from './beneficiaries-api';

type Address = {
  divisionId: string | null;
  districtId: string | null;
  upazilaId: string | null;
  unionId: string | null;
};

const TEXTS = ['village', 'postOffice', 'postCode', 'landmark'] as const;
type TextKey = (typeof TEXTS)[number];

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
  const [mobile, setMobile] = useState(profile.mobile ?? '');
  const [address, setAddress] = useState<Address>({
    divisionId: profile.divisionId,
    districtId: profile.districtId,
    upazilaId: profile.upazilaId,
    unionId: profile.unionId ?? null,
  });
  const [texts, setTexts] = useState<Record<TextKey, string>>({
    village: profile.village ?? '',
    postOffice: profile.postOffice ?? '',
    postCode: profile.postCode ?? '',
    landmark: profile.landmark ?? '',
  });

  const change: ContactChange = {};
  if (mobile.trim() !== (profile.mobile ?? '')) change.mobile = mobile.trim();
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
    const value = texts[key].trim();
    // eslint-disable-next-line security/detect-object-injection -- a fixed list of field names
    if (value && value !== (profile[key] ?? '')) change[key] = value;
  }

  const save = useMutation({
    mutationFn: () => updateContact(profile.id, etag, change),
    onSuccess: onDone,
  });
  const failure = save.error instanceof ApiFailure ? save.error : null;
  const fieldError = (path: string) =>
    failure?.details.find((d) => d.path === path || d.path?.endsWith(`.${path}`))?.message;
  const ready = Object.keys(change).length > 0 && (!placeMoved || addressComplete);
  const setText = (key: TextKey) => (value: string) => setTexts((v) => ({ ...v, [key]: value }));

  return (
    <Dialog
      title={t('title')}
      open
      fullScreenOnPhone
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!ready} loading={save.isPending}>
            {t('save')}
          </Button>
        </>
      }
    >
      {failure && <Alert tone="error">{failure.message}</Alert>}
      <Stack gap={3}>
        <TextField
          type="tel"
          label={t('mobile')}
          value={mobile}
          onChange={setMobile}
          error={fieldError('mobile')}
        />
        <AddressFields value={address} onChange={setAddress} />
        <TextField
          label={t('village')}
          value={texts.village}
          maxLength={200}
          onChange={setText('village')}
          error={fieldError('village')}
        />
        <Grid columns={{ base: 1, sm: 2 }} gap={3}>
          <TextField
            label={t('post_office')}
            value={texts.postOffice}
            maxLength={100}
            onChange={setText('postOffice')}
          />
          <TextField
            label={t('post_code')}
            value={texts.postCode}
            maxLength={4}
            inputMode="numeric"
            onChange={setText('postCode')}
            error={fieldError('postCode')}
          />
        </Grid>
        <TextField
          label={t('landmark')}
          value={texts.landmark}
          maxLength={200}
          onChange={setText('landmark')}
        />
      </Stack>
    </Dialog>
  );
}
