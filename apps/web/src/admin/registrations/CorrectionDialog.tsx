import {
  CORRECTION_FIELDS,
  type CorrectionField,
  registrationCorrectionCreateSchema,
} from '@css/shared/registration';
import { Alert, Button, CheckboxGroup, Dialog, Form, FormTextField } from '@/ui';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import type { z } from 'zod';
import { FIELD_LABEL } from '../../features/account/profile-api';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { requestCorrections } from './registrations-api';

type CorrectionFields = z.input<typeof registrationCorrectionCreateSchema>;
const EMPTY: CorrectionFields = { fields: [], note: '' };

/**
 * Asks the registrant to correct the checked fields, with one note (POST
 * /registrations/{userId}/correction-requests). Only the checked fields reopen for the registrant.
 */
export function CorrectionDialog({
  userId,
  open,
  onClose,
  onDone,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('admin.registrations');
  const tf = useTranslations('registration');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  const form = useForm<CorrectionFields>({
    resolver: useSchemaResolver(registrationCorrectionCreateSchema),
    defaultValues: EMPTY,
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const pending = form.formState.isSubmitting;
  const error = form.formState.errors.root?.server?.message;
  // the request's own rules: a field ticked and a note of three letters at least
  const ready = registrationCorrectionCreateSchema.safeParse(values).success;

  const send = async ({ fields, note }: CorrectionFields) => {
    try {
      await requestCorrections(userId, fields, note.trim());
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    form.reset(EMPTY);
    onDone();
  };
  const close = () => {
    form.reset(EMPTY);
    onClose();
  };

  return (
    <Dialog
      title={t('correct')}
      open={open}
      onClose={close}
      dismissible={!pending}
      actions={
        <>
          <Button variant="secondary" onClick={close} disabled={pending}>
            {tc('cancel')}
          </Button>
          <Button
            onClick={() => void form.handleSubmit(send)()}
            disabled={!ready}
            loading={pending}
          >
            {t('correct_send')}
          </Button>
        </>
      }
    >
      <Form form={form} onSubmit={send} label={t('correct')}>
        {error && <Alert tone="error">{error}</Alert>}
        <Controller
          control={form.control}
          name="fields"
          render={({ field, fieldState }) => (
            <CheckboxGroup
              label={t('correct_fields')}
              required
              columns={2}
              value={field.value}
              onChange={(ids) => field.onChange(ids as CorrectionField[])}
              error={fieldState.error?.message}
              options={CORRECTION_FIELDS.map((f) => ({ value: f, label: tf(FIELD_LABEL[f]) }))}
            />
          )}
        />
        <FormTextField name="note" rows={4} label={t('correct_note')} required maxLength={1000} />
      </Form>
    </Dialog>
  );
}
