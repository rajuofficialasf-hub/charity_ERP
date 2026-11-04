import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Dialog, RadioGroup, SelectField, TextField } from '@/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { saveAsTemplate, type Template, templates, TEMPLATES_KEY } from './templates-api';

type Mode = 'new' | 'replace';

/**
 * Saves a project's setup as a template (BR-064): a new template with its name, or in place of an
 * existing one, which keeps its name and gets this project's components, settings, syllabus and
 * rules. Projects made from the template before stay as they are.
 */
export function SaveTemplateDialog({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: (template: Template) => void;
}) {
  const t = useTranslations('admin.templates.save');
  const td = useTranslations('admin.templates.dialog');
  const tw = useTranslations('admin.projects.workflow');
  const tc = useTranslations('common.action');
  const locale = useLocale() as Locale;
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('new');
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const library = useQuery({
    queryKey: [...TEMPLATES_KEY, true],
    queryFn: () => templates(true),
    enabled: mode === 'replace',
  });
  const save = useMutation({
    mutationFn: () =>
      saveAsTemplate(
        projectId,
        mode === 'replace'
          ? { templateId: templateId! }
          : {
              name: { bn: nameBn.trim(), en: nameEn.trim() },
              ...(description.trim() ? { description: description.trim() } : {}),
            },
      ),
    onSuccess: (template) => {
      void queryClient.invalidateQueries({ queryKey: TEMPLATES_KEY });
      onDone(template);
    },
  });
  const ready =
    mode === 'replace' ? templateId !== null : nameBn.trim() !== '' && nameEn.trim() !== '';
  return (
    <Dialog
      title={t('title')}
      open
      onClose={onClose}
      dismissible={!save.isPending}
      actions={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            {tc('cancel')}
          </Button>
          <Button onClick={() => save.mutate()} disabled={!ready} loading={save.isPending}>
            {t('submit')}
          </Button>
        </>
      }
    >
      {save.error instanceof ApiFailure && (
        <Alert tone="error">{save.error.details[0]?.message ?? save.error.message}</Alert>
      )}
      <RadioGroup
        label={t('mode')}
        value={mode}
        onChange={(value) => setMode(value as Mode)}
        options={[
          { value: 'new', label: t('mode_new') },
          { value: 'replace', label: t('mode_replace') },
        ]}
      />
      {mode === 'new' ? (
        <>
          <TextField
            label={td('name_bn')}
            required
            maxLength={200}
            value={nameBn}
            onChange={setNameBn}
          />
          <TextField
            label={td('name_en')}
            required
            maxLength={200}
            lang="en"
            value={nameEn}
            onChange={setNameEn}
          />
          <TextField
            label={td('description')}
            maxLength={2000}
            rows={3}
            value={description}
            onChange={setDescription}
          />
        </>
      ) : (
        <SelectField
          label={t('template')}
          hint={t('replace_hint')}
          required
          value={templateId ?? ''}
          onChange={(v) => setTemplateId(v || null)}
          disabled={!library.data}
          options={(library.data ?? []).map((tpl) => ({
            value: tpl.id,
            label: `${localized(tpl.name, locale)} (${tw(tpl.workflowKey)})`,
          }))}
        />
      )}
    </Dialog>
  );
}
