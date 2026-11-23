import { toEnglishDigits } from '@css/shared';
import { isoDateInDhaka } from '@css/shared/format';
import { NISAB_MAX_DAYS_AHEAD, nisabAddSchema, type NisabVersionView } from '@css/shared/settings';
import { Dialog, Form, FormDateField, FormTextField } from '@/ui';
import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import type { z } from 'zod';
import { showFailure, useSchemaResolver } from '../../lib/form-schema';
import { addNisab } from './nisab-api';
import { DialogActions } from '../DialogActions';

const DAY = 86_400_000;
/** The request's rules, the basis note held as typed (empty when none is written). */
const NISAB_SCHEMA = nisabAddSchema.required();
type NisabFields = z.infer<typeof NISAB_SCHEMA>;

/** Only the digits and the point of an amount, Bengali digits written in English ones. */
const amountOf = (typed: string) => toEnglishDigits(typed).replace(/[^0-9.]/g, '');

/**
 * Adds a nisab version: an amount in Taka and an effective date from today (Dhaka) to a year
 * ahead, after the latest version; a version is never edited afterwards.
 */
export function NisabDialog({
  latest,
  onClose,
  onDone,
}: {
  /** The latest version not withdrawn, whose date the new one must follow. */
  latest?: NisabVersionView;
  onClose: () => void;
  onDone: (version: NisabVersionView) => void;
}) {
  const t = useTranslations('admin.nisab.dialog');
  const tc = useTranslations('common.action');
  const ts = useTranslations('common.state.error');
  // the day the dialog opened fixes today and the latest allowed date
  const [{ today, latestAllowed }] = useState(() => {
    const now = Date.now();
    return {
      today: isoDateInDhaka(new Date(now)),
      latestAllowed: isoDateInDhaka(new Date(now + NISAB_MAX_DAYS_AHEAD * DAY)),
    };
  });
  const form = useForm<NisabFields>({
    resolver: useSchemaResolver(NISAB_SCHEMA),
    defaultValues: { value: '', effectiveFrom: '', basisNote: '' },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control });
  const pending = form.formState.isSubmitting;
  const earliest =
    latest && latest.effectiveFrom >= today
      ? isoDateInDhaka(new Date(Date.parse(`${latest.effectiveFrom}T12:00:00Z`) + DAY))
      : today;

  const save = async ({ value, effectiveFrom, basisNote }: NisabFields) => {
    let version: NisabVersionView;
    try {
      version = await addNisab({
        value: value.trim(),
        effectiveFrom,
        ...(basisNote.trim() ? { basisNote: basisNote.trim() } : {}),
      });
    } catch (failure) {
      showFailure(form, failure, ts('text'));
      return;
    }
    onDone(version);
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
          submitLabel={tc('save')}
          onSubmit={() => void form.handleSubmit(save)()}
          pending={pending}
          disabled={!values.value || !values.effectiveFrom}
        />
      }
    >
      <p className="admin-muted">{t('hint')}</p>
      <Form
        form={form}
        onSubmit={save}
        label={t('title')}
        error={form.formState.errors.root?.server?.message}
      >
        <FormTextField
          name="value"
          label={t('value')}
          hint={t('value_hint')}
          required
          inputMode="numeric"
          maxLength={15}
          normalize={amountOf}
        />
        <FormDateField
          name="effectiveFrom"
          label={t('effective_from')}
          hint={t('effective_hint')}
          required
          min={earliest}
          max={latestAllowed}
        />
        <FormTextField name="basisNote" label={t('basis')} hint={t('basis_hint')} maxLength={500} />
      </Form>
    </Dialog>
  );
}
