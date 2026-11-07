import type { FormSource } from '@css/shared/forms';
import { localized, type Locale } from '@css/shared/i18n';
import { Alert, Button, Dialog, RadioGroup, SelectField, TextField } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { pickerProjects, PROJECTS_KEY } from '../projects/projects-api';
import { createForm, FORMS_KEY, library, projectForms } from './forms-api';

type Kind = FormSource['kind'];

/**
 * Starts a new form of the project from a library template, from the mandatory core alone, or as
 * a copy of the published form of another project the caller reaches (the server refuses any
 * other). The first form of a project is its default application form.
 */
export function NewFormDialog({
  projectId,
  firstForm,
  open,
  onClose,
  onCreated,
}: {
  projectId: string;
  firstForm: boolean;
  open: boolean;
  onClose: () => void;
  onCreated: (formId: string) => void;
}) {
  const t = useTranslations('forms.builder');
  const locale = useLocale() as Locale;
  const queries = useQueryClient();
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [kind, setKind] = useState<Kind>('template');
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [copyProject, setCopyProject] = useState<string | null>(null);
  const [copyForm, setCopyForm] = useState<string | null>(null);
  const lib = useQuery({ queryKey: [...FORMS_KEY, 'library'], queryFn: library, enabled: open });
  const projects = useQuery({
    queryKey: [...PROJECTS_KEY, 'picker'],
    queryFn: pickerProjects,
    enabled: open && kind === 'copy',
  });
  const sourceForms = useQuery({
    queryKey: [...FORMS_KEY, copyProject],
    queryFn: () => projectForms(copyProject!),
    enabled: open && kind === 'copy' && copyProject !== null,
  });
  const published = (sourceForms.data ?? []).filter((f) => f.publishedVersionId !== null);
  const source: FormSource | null =
    kind === 'blank'
      ? { kind: 'blank' }
      : kind === 'template'
        ? templateKey
          ? { kind: 'template', templateKey }
          : null
        : copyForm
          ? { kind: 'copy', formId: copyForm }
          : null;
  const create = useMutation({
    mutationFn: () =>
      createForm(projectId, {
        // the first form is the project's application form; another gets a key of its own
        key: firstForm ? 'default' : `form_${Date.now().toString(36)}`,
        title: { bn: nameBn.trim(), en: nameEn.trim() },
        source: source!,
      }),
    onSuccess: async (made) => {
      await queries.invalidateQueries({ queryKey: [...FORMS_KEY, projectId] });
      onCreated(made.id);
    },
  });
  const ready = nameBn.trim() !== '' && nameEn.trim() !== '' && source !== null;
  return (
    <Dialog
      title={t('new_title')}
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
        label={t('source')}
        value={kind}
        onChange={(id) => setKind(id as Kind)}
        options={[
          { value: 'template', label: t('source_template') },
          { value: 'blank', label: t('source_blank') },
          { value: 'copy', label: t('source_copy') },
        ]}
      />
      {kind === 'template' ? (
        <SelectField
          label={t('template')}
          required
          value={templateKey ?? ''}
          onChange={(v) => setTemplateKey(v || null)}
          options={(lib.data?.templates ?? []).map((tpl) => ({
            value: tpl.key,
            label: localized(tpl.name, locale),
          }))}
        />
      ) : null}
      {kind === 'copy' ? (
        <>
          <SelectField
            label={t('copy_project')}
            required
            value={copyProject ?? ''}
            onChange={(id) => {
              setCopyProject(id);
              setCopyForm(null);
            }}
            options={(projects.data ?? [])
              .filter((p) => p.id !== projectId)
              .map((p) => ({ value: p.id, label: `${localized(p.name, locale)} (${p.year})` }))}
          />
          {copyProject ? (
            <SelectField
              label={t('copy_form')}
              required
              value={copyForm ?? ''}
              onChange={(v) => setCopyForm(v || null)}
              hint={sourceForms.isSuccess && published.length === 0 ? t('copy_none') : undefined}
              options={published.map((f) => ({ value: f.id, label: localized(f.title, locale) }))}
            />
          ) : null}
        </>
      ) : null}
    </Dialog>
  );
}
