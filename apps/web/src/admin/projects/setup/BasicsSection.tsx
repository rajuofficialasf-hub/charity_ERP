import { localized, type Locale } from '@css/shared/i18n';
import { type ProjectUpdate, WORKFLOW_KEYS, type WorkflowKey } from '@css/shared/projects';
import { NumberField, Select, TextArea, TextField } from '@css/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { ApiFailure } from '../../../lib/api';
import { PROGRAMS_KEY, programs } from '../../programs/programs-api';
import { updateProject } from './setup-api';
import { Reseed, SaveRow, SetupSection, useSetup } from './setup-context';

/** Name, description, year, program and workflow; the last three only while a draft. */
export function BasicsSection() {
  return <Reseed>{(state) => <BasicsForm {...state} />}</Reseed>;
}

function BasicsForm({ stale, onStale }: { stale: boolean; onStale: () => void }) {
  const { project, etag, editable, refresh, configure } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const td = useTranslations('admin.projects.dialog');
  const tw = useTranslations('admin.projects.workflow');
  const locale = useLocale() as Locale;
  const [nameBn, setNameBn] = useState(project.name.bn);
  const [nameEn, setNameEn] = useState(project.name.en);
  const [description, setDescription] = useState(project.description ?? '');
  const [year, setYear] = useState(String(project.year));
  const [programId, setProgramId] = useState<string | null>(project.programId ?? null);
  const [workflowKey, setWorkflowKey] = useState<string | null>(project.workflowKey);
  const list = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs, enabled: configure });

  const body = (): ProjectUpdate => {
    const out: ProjectUpdate = {};
    const name = { bn: nameBn.trim(), en: nameEn.trim() };
    if (name.bn !== project.name.bn || name.en !== project.name.en) out.name = name;
    const text = description.trim();
    if (text !== (project.description ?? '')) out.description = text || null;
    if (Number(year) !== project.year) out.year = Number(year);
    if (programId && programId !== project.programId) out.programId = programId;
    if (workflowKey && workflowKey !== project.workflowKey)
      out.workflowKey = workflowKey as WorkflowKey;
    return out;
  };
  const save = useMutation({
    mutationFn: () => updateProject(project.id, etag, body()),
    onSuccess: refresh,
    onError: (e) => e instanceof ApiFailure && e.status === 412 && onStale(),
  });
  const changed = Object.keys(body()).length > 0;
  const ready = nameBn.trim() !== '' && nameEn.trim() !== '' && /^\d{4}$/.test(year);
  const canSave = editable('name') || editable('description') || editable('year');

  return (
    <SetupSection id="basics" title={t('section.basics')}>
      <div className="admin-setup-grid">
        <TextField
          label={td('name_bn')}
          required
          maxLength={200}
          value={nameBn}
          onChange={setNameBn}
          readOnly={!editable('name')}
        />
        <TextField
          label={td('name_en')}
          required
          maxLength={200}
          lang="en"
          value={nameEn}
          onChange={setNameEn}
          readOnly={!editable('name')}
        />
        <NumberField
          label={td('year')}
          required
          kind="integer"
          value={year}
          onChange={setYear}
          readOnly={!editable('year')}
        />
        <Select
          label={td('program')}
          value={programId}
          onChange={setProgramId}
          disabled={!editable('programId')}
          options={(list.data ?? [])
            .filter((p) => p.active || p.id === project.programId)
            .map((p) => ({ id: p.id, label: localized(p.name, locale) }))}
        />
        <Select
          label={td('workflow')}
          helper={editable('workflowKey') ? t('workflow_change') : undefined}
          value={workflowKey}
          onChange={setWorkflowKey}
          disabled={!editable('workflowKey')}
          searchable={false}
          options={WORKFLOW_KEYS.map((key) => ({ id: key, label: tw(key) }))}
        />
      </div>
      <TextArea
        label={t('description')}
        maxLength={2000}
        value={description}
        onChange={setDescription}
        readOnly={!editable('description')}
      />
      {canSave && (
        <SaveRow
          mutation={save}
          onSave={() => save.mutate()}
          disabled={!changed || !ready}
          stale={stale}
        />
      )}
    </SetupSection>
  );
}
