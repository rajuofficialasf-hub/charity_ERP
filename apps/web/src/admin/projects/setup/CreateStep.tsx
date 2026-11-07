import { type Locale, localized } from '@css/shared/i18n';
import {
  type ProjectCreate,
  projectCode,
  WORKFLOW_KEYS,
  type WorkflowKey,
} from '@css/shared/projects';
import { RadioGroup, SelectField, TextField } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PROGRAMS_KEY, programs } from '../../programs/programs-api';
import { templates, TEMPLATES_KEY } from '../../templates/templates-api';
import { createProject, pickerProjects, type Project, PROJECTS_KEY } from '../projects-api';
import { SaveNotice, SetupSection, useStepSave } from './setup-context';

type SourceKind = ProjectCreate['source']['kind'];
const SOURCE_KINDS: readonly SourceKind[] = ['workflow', 'template', 'copy'];

/**
 * The first step of a new project: its code (capital letters, the prefix of its application ids),
 * name, year, program, and where it starts: a workflow, a master template, or a copy of a previous
 * project (BD-10; a template or a copy brings the components, settings, syllabus and rules). Next
 * creates the draft.
 */
export function CreateStep({ onCreated }: { onCreated: (project: Project) => void }) {
  const t = useTranslations('admin.projects.dialog');
  const ts = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const tw = useTranslations('admin.projects.workflow');
  const tsrc = useTranslations('admin.projects.source');
  const locale = useLocale() as Locale;
  const [code, setCode] = useState('');
  const [nameBn, setNameBn] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [programId, setProgramId] = useState<string | null>(null);
  const [workflowKey, setWorkflowKey] = useState<WorkflowKey | null>(null);
  const [kind, setKind] = useState<SourceKind>('workflow');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [copyOf, setCopyOf] = useState<string | null>(null);
  const list = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs });
  const library = useQuery({
    queryKey: [...TEMPLATES_KEY, false],
    queryFn: () => templates(),
    enabled: kind === 'template',
  });
  const earlier = useQuery({
    queryKey: [...PROJECTS_KEY, 'picker'],
    queryFn: pickerProjects,
    enabled: kind === 'copy',
  });
  /** The source the chosen starting point names, or null while nothing is picked. */
  const source = (): ProjectCreate['source'] | null => {
    if (kind === 'template') return templateId ? { kind, templateId } : null;
    if (kind === 'copy') return copyOf ? { kind, projectId: copyOf } : null;
    return workflowKey ? { kind, workflowKey } : null;
  };
  const save = useMutation({
    mutationFn: () =>
      createProject({
        programId: programId!,
        code,
        year: Number(year),
        name: { bn: nameBn.trim(), en: nameEn.trim() },
        source: source()!,
      }),
  });
  const codeOk = projectCode.safeParse(code).success;
  const complete =
    nameBn.trim() !== '' &&
    nameEn.trim() !== '' &&
    /^\d{4}$/.test(year) &&
    programId !== null &&
    source() !== null;
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
          hint={t('code_hint')}
          required
          maxLength={8}
          value={code}
          onChange={setCode}
          error={!codeOk ? problem : undefined}
        />
        <TextField type="integer" label={t('year')} required value={year} onChange={setYear} />
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
        <SelectField
          label={t('program')}
          required
          value={programId ?? ''}
          onChange={(v) => setProgramId(v || null)}
          // a list still loading cannot be opened empty
          disabled={!list.data}
          // only an active program takes a new project
          options={(list.data ?? [])
            .filter((p) => p.active)
            .map((p) => ({ value: p.id, label: `${localized(p.name, locale)} (${p.code})` }))}
        />
      </div>
      <RadioGroup
        label={tsrc('label')}
        orientation="horizontal"
        value={kind}
        onChange={(value) => setKind(value as SourceKind)}
        options={SOURCE_KINDS.map((k) => ({ value: k, label: tsrc(k) }))}
      />
      <div className="admin-setup-grid">
        {kind === 'workflow' && (
          <SelectField
            label={t('workflow')}
            hint={t('workflow_hint')}
            required
            value={workflowKey ?? ''}
            onChange={(value) => setWorkflowKey(WORKFLOW_KEYS.find((k) => k === value) ?? null)}
            searchable={false}
            options={WORKFLOW_KEYS.map((key) => ({ value: key, label: tw(key) }))}
          />
        )}
        {kind === 'template' && (
          <SelectField
            label={tsrc('template_field')}
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
        {kind === 'copy' && (
          <SelectField
            label={tsrc('copy_field')}
            hint={tsrc('copy_hint')}
            required
            value={copyOf ?? ''}
            onChange={(v) => setCopyOf(v || null)}
            disabled={!earlier.data}
            options={(earlier.data ?? []).map((p) => ({
              value: p.id,
              label: tsrc('project_option', {
                name: localized(p.name, locale),
                code: p.code,
                year: String(p.year),
              }),
            }))}
          />
        )}
      </div>
      <SaveNotice mutation={save} problem={codeOk ? problem : undefined} />
    </SetupSection>
  );
}
