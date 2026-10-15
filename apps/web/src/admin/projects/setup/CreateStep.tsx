import { type Locale, localized } from '@css/shared/i18n';
import { projectCode, WORKFLOW_KEYS, type WorkflowKey } from '@css/shared/projects';
import { NumberField, Select, TextField } from '@css/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PROGRAMS_KEY, programs } from '../../programs/programs-api';
import { createProject, type Project } from '../projects-api';
import { SaveNotice, SetupSection, useStepSave } from './setup-context';

/**
 * The first step of a new project: its code (capital letters, the prefix of its application ids),
 * name, year, program and the workflow it starts from. Next creates the draft.
 */
export function CreateStep({ onCreated }: { onCreated: (project: Project) => void }) {
  const t = useTranslations('admin.projects.dialog');
  const ts = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const tw = useTranslations('admin.projects.workflow');
  const locale = useLocale() as Locale;
  const [code, setCode] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [programId, setProgramId] = useState<string | null>(null);
  const [workflowKey, setWorkflowKey] = useState<string | null>(null);
  const list = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs });
  const save = useMutation({
    mutationFn: () =>
      createProject({
        programId: programId!,
        code,
        year: Number(year),
        name: { bn: nameBn.trim(), en: nameEn.trim() },
        source: { kind: 'workflow', workflowKey: workflowKey as WorkflowKey },
      }),
  });
  const codeOk = projectCode.safeParse(code).success;
  const complete =
    nameBn.trim() !== '' &&
    nameEn.trim() !== '' &&
    /^\d{4}$/.test(year) &&
    programId !== null &&
    workflowKey !== null;
  const problem = useStepSave({
    // a new project is always saved: Next creates it
    changed: true,
    invalid: !codeOk ? t('code_invalid') : !complete ? tz('create_invalid') : undefined,
    save: async () => onCreated(await save.mutateAsync()),
  });

  return (
    <SetupSection id="basics" title={ts('section.basics')}>
      <div className="admin-setup-grid">
        <TextField
          label={t('code')}
          helper={t('code_hint')}
          required
          maxLength={8}
          value={code}
          onChange={setCode}
          error={problem === t('code_invalid') ? problem : undefined}
        />
        <NumberField label={t('year')} required kind="integer" value={year} onChange={setYear} />
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
      </div>
      <SaveNotice mutation={save} problem={problem === t('code_invalid') ? undefined : problem} />
    </SetupSection>
  );
}
