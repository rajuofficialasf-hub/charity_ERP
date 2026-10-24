import type { ReadyFormCreate } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Button, Modal, RadioGroup, Select, TextField } from '@css/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
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
  isOpen,
  onClose,
  onCreated,
}: {
  /** The ready forms already there, for the copy. */
  forms: readonly ReadyFormView[];
  isOpen: boolean;
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
    <Modal
      title={tr('new')}
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!create.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={create.isPending}>
          {t('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => create.mutate()} disabled={!ready} loading={create.isPending}>
          {t('create')}
        </Button>
      }
    >
      {create.error instanceof ApiFailure ? (
        <Alert tone="danger" live="alert">
          {create.error.details[0]?.message ?? create.error.message}
        </Alert>
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
        helper={tr('kind_hint')}
        value={kind}
        onChange={(id) => setKind(id === 'other' ? 'other' : 'beneficiary_application')}
        options={[
          { id: 'beneficiary_application', label: t('kind.beneficiary_application') },
          { id: 'other', label: t('kind.other') },
        ]}
      />
      <RadioGroup
        label={tr('start')}
        value={start}
        onChange={(id) => setStart(id === 'copy' ? 'copy' : 'blank')}
        options={[
          { id: 'blank', label: tr('start_blank') },
          { id: 'copy', label: tr('start_copy') },
        ]}
      />
      {start === 'copy' ? (
        <Select
          label={tr('copy_from')}
          required
          value={copyFrom}
          onChange={setCopyFrom}
          helper={published.length === 0 ? tr('copy_none') : undefined}
          options={published.map((f) => ({ id: f.id, label: localized(f.title, locale) }))}
        />
      ) : null}
    </Modal>
  );
}
