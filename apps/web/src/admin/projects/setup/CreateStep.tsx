import { type Locale, localized } from '@css/shared/i18n';
import { type ProjectCreate, projectCode, WORKFLOW_KEYS } from '@css/shared/projects';
import { Form, FormSelectField, FormTextField, RadioGroup, TextField } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../../lib/form-schema';
import { PROGRAMS_KEY, programs } from '../../programs/programs-api';
import { templates, TEMPLATES_KEY } from '../../templates/templates-api';
import { createProject, pickerProjects, type Project, PROJECTS_KEY } from '../projects-api';
import { SaveNotice, SetupSection, useStepSave } from './setup-context';

type SourceKind = ProjectCreate['source']['kind'];
const SOURCE_KINDS: readonly SourceKind[] = ['workflow', 'template', 'copy'];

/** The new draft's fields as typed; the starting point names the one choice of its kind. */
const CREATE_SCHEMA = z.object({
  code: projectCode,
  name: z.object({ bn: z.string().trim().min(1), en: z.string().trim().min(1) }),
  year: z.string().regex(/^\d{4}$/),
  programId: z.string().min(1),
  kind: z.enum(['workflow', 'template', 'copy']),
  workflowKey: z.string(),
  templateId: z.string(),
  copyOf: z.string(),
});
type CreateFields = z.infer<typeof CREATE_SCHEMA>;

/** The source the chosen starting point names, or null while nothing is picked. */
function sourceOf(v: CreateFields): ProjectCreate['source'] | null {
  if (v.kind === 'template')
    return v.templateId ? { kind: v.kind, templateId: v.templateId } : null;
  if (v.kind === 'copy') return v.copyOf ? { kind: v.kind, projectId: v.copyOf } : null;
  const workflowKey = WORKFLOW_KEYS.find((k) => k === v.workflowKey);
  return workflowKey ? { kind: v.kind, workflowKey } : null;
}

/**
 * The first step of a new project: its code (capital letters, the prefix of its application ids),
 * name, year, program, and where it starts: a workflow, a master template, or a copy of a previous
 * project (a template or a copy brings the components, settings, syllabus and rules). Next
 * creates the draft.
 */
export function CreateStep({ onCreated }: { onCreated: (project: Project) => void }) {
  const t = useTranslations('admin.projects.dialog');
  const ts = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const tw = useTranslations('admin.projects.workflow');
  const tsrc = useTranslations('admin.projects.source');
  const locale = useLocale() as Locale;
  const form = useForm<CreateFields>({
    resolver: useSchemaResolver(CREATE_SCHEMA),
    defaultValues: {
      code: '',
      name: { bn: '', en: '' },
      year: String(new Date().getFullYear()),
      programId: '',
      kind: 'workflow',
      workflowKey: '',
      templateId: '',
      copyOf: '',
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control }) as CreateFields;
  const kind = values.kind;
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
  const save = useMutation({
    mutationFn: (v: CreateFields) =>
      createProject({
        programId: v.programId,
        code: v.code,
        year: Number(v.year),
        name: { bn: v.name.bn.trim(), en: v.name.en.trim() },
        source: sourceOf(v)!,
      }),
  });
  const codeOk = projectCode.safeParse(values.code).success;
  const complete = CREATE_SCHEMA.safeParse(values).success && sourceOf(values) !== null;
  const problem = useStepSave({
    // a new project is always saved: Next creates it
    changed: true,
    invalid: !codeOk ? t('code_invalid') : !complete ? tz('create_invalid') : undefined,
    save: async () => onCreated(await save.mutateAsync(form.getValues())),
  });
  // the wizard's Next creates the draft; Enter in a field only checks it, as before
  const submit = () => undefined;

  return (
    <SetupSection id="basics" title={ts('section.basics')}>
      <Form form={form} onSubmit={submit} label={ts('section.basics')}>
        <div className="admin-setup-grid">
          <Controller
            control={form.control}
            name="code"
            render={({ field }) => (
              <TextField
                label={t('code')}
                hint={t('code_hint')}
                required
                maxLength={8}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                // the step's notice of a wrong code is said at the code itself
                error={!codeOk ? problem : undefined}
              />
            )}
          />
          <FormTextField name="year" type="integer" label={t('year')} required />
          <FormTextField name="name.bn" label={t('name_bn')} required maxLength={200} />
          <FormTextField name="name.en" label={t('name_en')} required maxLength={200} lang="en" />
          <FormSelectField
            name="programId"
            label={t('program')}
            required
            // a list still loading cannot be opened empty
            disabled={!list.data}
            // only an active program takes a new project
            options={(list.data ?? [])
              .filter((p) => p.active)
              .map((p) => ({ value: p.id, label: `${localized(p.name, locale)} (${p.code})` }))}
          />
        </div>
        <Controller
          control={form.control}
          name="kind"
          render={({ field }) => (
            <RadioGroup
              label={tsrc('label')}
              orientation="horizontal"
              value={field.value}
              onChange={(value) => field.onChange(value as SourceKind)}
              options={SOURCE_KINDS.map((k) => ({ value: k, label: tsrc(k) }))}
            />
          )}
        />
        <div className="admin-setup-grid">
          {kind === 'workflow' && (
            <FormSelectField
              name="workflowKey"
              label={t('workflow')}
              hint={t('workflow_hint')}
              required
              searchable={false}
              options={WORKFLOW_KEYS.map((key) => ({ value: key, label: tw(key) }))}
            />
          )}
          {kind === 'template' && (
            <FormSelectField
              name="templateId"
              label={tsrc('template_field')}
              required
              disabled={!library.data}
              options={(library.data ?? []).map((tpl) => ({
                value: tpl.id,
                label: `${localized(tpl.name, locale)} (${tw(tpl.workflowKey)})`,
              }))}
            />
          )}
          {kind === 'copy' && (
            <FormSelectField
              name="copyOf"
              label={tsrc('copy_field')}
              hint={tsrc('copy_hint')}
              required
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
      </Form>
    </SetupSection>
  );
}
