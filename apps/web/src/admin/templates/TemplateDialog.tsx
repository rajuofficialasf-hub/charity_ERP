import { Alert, Button, Modal, Switch, TextArea, TextField } from '@css/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { type Template, updateTemplate } from './templates-api';

/**
 * Renames, describes, deactivates or activates a template. Its contents change only by saving a
 * project onto it; a template is never deleted.
 */
export function TemplateDialog({
  template,
  onClose,
  onDone,
}: {
  template: Template;
  onClose: () => void;
  onDone: (template: Template) => void;
}) {
  const t = useTranslations('admin.templates.dialog');
  const tc = useTranslations('common.action');
  const [nameBn, setNameBn] = useState(template.name.bn);
  const [nameEn, setNameEn] = useState(template.name.en);
  const [description, setDescription] = useState(template.description ?? '');
  const [active, setActive] = useState(template.active);
  const save = useMutation({
    mutationFn: () => {
      const name = { bn: nameBn.trim(), en: nameEn.trim() };
      const renamed = name.bn !== template.name.bn || name.en !== template.name.en;
      const described = description.trim() !== (template.description ?? '');
      return updateTemplate(template.id, {
        ...(renamed ? { name } : {}),
        ...(described ? { description: description.trim() || null } : {}),
        ...(active !== template.active ? { active } : {}),
      });
    },
    onSuccess: onDone,
  });
  const changed =
    nameBn.trim() !== template.name.bn ||
    nameEn.trim() !== template.name.en ||
    description.trim() !== (template.description ?? '') ||
    active !== template.active;
  const ready = nameBn.trim() !== '' && nameEn.trim() !== '' && changed;
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
          {tc('save')}
        </Button>
      }
    >
      {save.error instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {save.error.details[0]?.message ?? save.error.message}
        </Alert>
      )}
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
      <TextArea
        label={t('description')}
        maxLength={2000}
        rows={3}
        value={description}
        onChange={setDescription}
      />
      <Switch isSelected={active} onChange={setActive}>
        {t('active')}
      </Switch>
    </Modal>
  );
}
