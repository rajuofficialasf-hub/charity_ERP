import { type Locale, localized } from '@css/shared/i18n';
import { projectCode, WORKFLOW_KEYS, type WorkflowKey } from '@css/shared/projects';
import { Alert, Button, Modal, NumberField, Select, TextField } from '@css/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../lib/api';
import { PROGRAMS_KEY, programs } from '../programs/programs-api';
import { createProject, type Project } from './projects-api';

/**
 * A new draft project: its code (capital letters, the prefix of its application ids), name, year,
 * program and the workflow it starts from. The rest of the setup follows on the project's page.
 */
export function NewProjectDialog({
  isOpen,
  onClose,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDone: (project: Project) => void;
}) {
  const t = useTranslations('admin.projects.dialog');
  const tw = useTranslations('admin.projects.workflow');
  const tc = useTranslations('common.action');
  const locale = useLocale() as Locale;
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string>();
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [programId, setProgramId] = useState<string | null>(null);
  const [workflowKey, setWorkflowKey] = useState<string | null>(null);
  const list = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs, enabled: isOpen });
  const save = useMutation({
    mutationFn: () =>
      createProject({
        programId: programId!,
        code,
        year: Number(year),
        name: { bn: nameBn.trim(), en: nameEn.trim() },
        source: { kind: 'workflow', workflowKey: workflowKey as WorkflowKey },
      }),
    onSuccess: onDone,
  });
  const submit = () => {
    if (!projectCode.safeParse(code).success) {
      setCodeError(t('code_invalid'));
      return;
    }
    setCodeError(undefined);
    save.mutate();
  };
  const yearOk = /^\d{4}$/.test(year);
  const ready =
    code !== '' &&
    nameBn.trim() !== '' &&
    nameEn.trim() !== '' &&
    yearOk &&
    programId !== null &&
    workflowKey !== null;
  return (
    <Modal
      title={t('title')}
      isOpen={isOpen}
      onClose={onClose}
      dismissible={!save.isPending}
      secondaryAction={
        <Button variant="secondary" onPress={onClose} disabled={save.isPending}>
          {tc('cancel')}
        </Button>
      }
      primaryAction={
        <Button onPress={submit} disabled={!ready} loading={save.isPending}>
          {t('submit')}
        </Button>
      }
    >
      {save.error instanceof ApiFailure && (
        <Alert tone="danger" live="alert">
          {save.error.details[0]?.message ?? save.error.message}
        </Alert>
      )}
      <TextField
        label={t('code')}
        helper={t('code_hint')}
        required
        maxLength={8}
        value={code}
        onChange={setCode}
        error={codeError}
      />
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
      <NumberField label={t('year')} required kind="integer" value={year} onChange={setYear} />
      <Select
        label={t('program')}
        required
        value={programId}
        onChange={setProgramId}
        // only an active program takes a new project
        options={(list.data ?? [])
          .filter((p) => p.active)
          .map((p) => ({ id: p.id, label: `${localized(p.name, locale)} (${p.code})` }))}
      />
      <Select
        label={t('workflow')}
        helper={t('workflow_hint')}
        required
        value={workflowKey}
        onChange={setWorkflowKey}
        searchable={false}
        options={WORKFLOW_KEYS.map((key) => ({ id: key, label: tw(key) }))}
      />
    </Modal>
  );
}
