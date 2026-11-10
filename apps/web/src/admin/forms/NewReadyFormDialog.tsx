import type { ReadyFormCreate } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Button, Dialog, RadioGroup, SelectField, TextField } from '@/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../api/client';
import { createReadyForm, type FormKind, READY_KEY, type ReadyFormView } from './forms-api';

/** A key for a new ready form from its English name: small letters, digits and underscores. */
export function readyKeyOf(nameEn: string, stamp: string): string {
  const base = nameEn
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^[^a-z]+|_+$/g, '')
    .slice(0, 30);
  return `${base || 'form'}_${stamp}`.slice(0, 40);
}

/**
 * Starts a ready form outside the projects: its name in both languages, what it is for, and an
 * empty start (one section) or a copy of another ready form's published version.
 */
export function NewReadyFormDialog({
  forms,
  open,
  onClose,
  onCreated,
}: {
  /** The ready forms already there, for the copy. */
  forms: readonly ReadyFormView[];
  open: boolean;
  onClose: () => void;
  onCreated: (formId: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const tr = useTranslations('forms.ready');
  const locale = useLocale() as Locale;
  const queries = useQueryClient();
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [kind, setKind] = useState<FormKind>('beneficiary_application');
  const [start, setStart] = useState<'blank' | 'copy'>('blank');
  const [copyFrom, setCopyFrom] = useState<string | null>(null);
  const published = forms.filter((f) => f.publishedVersionId !== null);
  const source: ReadyFormCreate['source'] | null =
    start === 'blank' ? { kind: 'blank' } : copyFrom ? { kind: 'copy', formId: copyFrom } : null;
  const create = useMutation({
    mutationFn: () =>
      createReadyForm({
        key: readyKeyOf(nameEn, Date.now().toString(36)),
        title: { bn: nameBn.trim(), en: nameEn.trim() },
        kind,
        source: source!,
      }),
    onSuccess: async (made) => {
      await queries.invalidateQueries({ queryKey: READY_KEY });
      onCreated(made.id);
    },
  });
  const ready = nameBn.trim() !== '' && nameEn.trim() !== '' && source !== null;
  return (
    <Dialog
      title={tr('new')}
      open={open}
      onClose={onClose}
      dismissible={!create.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            {t('cancel')}
          </Button>
          <Button onClick={() => create.mutate()} disabled={!ready} loading={create.isPending}>
            {t('create')}
          </Button>
        </>
      }
    >
      {create.error instanceof ApiFailure ? (
        <Alert tone="error">{create.error.details[0]?.message ?? create.error.message}</Alert>
      ) : null}
      <TextField
        label={t('name_bn')}
        required
        maxLength={200}
        value={nameBn}
        onChange={setNameBn}
      />
      <TextField
        label={t('name_en')}
        required
        maxLength={200}
        lang="en"
        value={nameEn}
        onChange={setNameEn}
      />
      <RadioGroup
        label={tr('kind')}
        hint={tr('kind_hint')}
        value={kind}
        onChange={(id) => setKind(id === 'other' ? 'other' : 'beneficiary_application')}
        options={[
          { value: 'beneficiary_application', label: t('kind.beneficiary_application') },
          { value: 'other', label: t('kind.other') },
        ]}
      />
      <RadioGroup
        label={tr('start')}
        value={start}
        onChange={(id) => setStart(id === 'copy' ? 'copy' : 'blank')}
        options={[
          { value: 'blank', label: tr('start_blank') },
          { value: 'copy', label: tr('start_copy') },
        ]}
      />
      {start === 'copy' ? (
        <SelectField
          label={tr('copy_from')}
          required
          value={copyFrom ?? ''}
          onChange={(v) => setCopyFrom(v || null)}
          hint={published.length === 0 ? tr('copy_none') : undefined}
          options={published.map((f) => ({ value: f.id, label: localized(f.title, locale) }))}
        />
      ) : null}
    </Dialog>
  );
}
