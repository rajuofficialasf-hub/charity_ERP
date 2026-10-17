import { type Locale, localized } from '@css/shared/i18n';
import { Alert, Button, Modal, RadioGroup, Select, TextArea, TextField } from '@css/ui';
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
    <Modal
      title={t('title')}
      isOpen
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={() => save.mutate()} disabled={!ready} loading={save.isPending}>
          {t('submit')}
        </Button>
      }
    >
      {save.error instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {save.error.details[0]?.message ?? save.error.message}
        </Alert>
      )}
      <RadioGroup
        label={t('mode')}
        value={mode}
        onChange={(value) => setMode(value as Mode)}
        options={[
          { id: 'new', label: t('mode_new') },
          { id: 'replace', label: t('mode_replace') },
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
          <TextArea
            label={td('description')}
            maxLength={2000}
            rows={3}
            value={description}
            onChange={setDescription}
          />
        </>
      ) : (
        <Select
          label={t('template')}
          helper={t('replace_hint')}
          required
          value={templateId}
          onChange={setTemplateId}
          disabled={!library.data}
          options={(library.data ?? []).map((tpl) => ({
            id: tpl.id,
            label: `${localized(tpl.name, locale)} (${tw(tpl.workflowKey)})`,
          }))}
        />
      )}
    </Modal>
  );
}
