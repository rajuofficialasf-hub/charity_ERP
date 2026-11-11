import type { InvitationIssued } from '@css/shared/auth';
import { Alert, Button, Dialog, Form, FormTextField, Text } from '@/ui';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { renewLink, type StaffMember } from './staff-api';

/** The corrected email is optional; the server checks it when one is written. */
const RENEW_SCHEMA = z.object({ email: z.string().max(254) });
type RenewFields = z.infer<typeof RENEW_SCHEMA>;

/**
 * A new set-password link for an official who has not set a password yet: the open link
 * stops working. A corrected email, when the first one was mistyped, goes with it.
 */
export function RenewLinkDialog({
  official,
  onClose,
  onDone,
}: {
  official: StaffMember;
  onClose: () => void;
  onDone: (issued: InvitationIssued) => void;
}) {
  const t = useTranslations('admin.staff.renew');
  const tc = useTranslations('common.action');
  const form = useForm<RenewFields>({
    resolver: useSchemaResolver(RENEW_SCHEMA),
    defaultValues: { email: '' },
    reValidateMode: 'onSubmit',
  });
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;

  const send = async ({ email }: RenewFields) => {
    let issued: InvitationIssued;
    try {
      issued = await renewLink(official.id, email.trim().toLowerCase() || undefined);
    } catch (failure) {
      showFailure(form, failure, t('offline'));
      return;
    }
    onDone(issued);
  };

  return (
    <Dialog
      title={t('title', { name: official.displayName })}
      open
      onClose={onClose}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => void form.handleSubmit(send)()} loading={pending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      <Form form={form} onSubmit={send} label={t('title', { name: official.displayName })}>
        {error && <Alert tone="error">{error}</Alert>}
        <Text>{t('explain')}</Text>
        <FormTextField
          name="email"
          label={t('email')}
          hint={t('email_hint')}
          type="email"
          maxLength={254}
          lang="en"
        />
      </Form>
    </Dialog>
  );
}
