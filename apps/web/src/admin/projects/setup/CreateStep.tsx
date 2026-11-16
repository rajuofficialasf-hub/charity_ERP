import { type Locale, localized } from '@css/shared/i18n';
import { type ProjectCreate, sessionPeriod, WORKFLOW_KEYS } from '@css/shared/projects';
import { DescriptionList, Form, FormSelectField, MonthField, RadioGroup } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { useSchemaResolver } from '../../../lib/form-schema';
import { templates, TEMPLATES_KEY } from '../../templates/templates-api';
import type { ProjectSeries } from '../cards-api';
import { createSession, pickerProjects, type Project, PROJECTS_KEY } from '../projects-api';
import { SaveNotice, SetupSection, useStepSave } from './setup-context';

type SourceKind = ProjectCreate['source']['kind'];
const SOURCE_KINDS: readonly SourceKind[] = ['workflow', 'template', 'copy'];

/** The new draft's fields as typed; the starting point names the one choice of its kind. */
const CREATE_SCHEMA = z.object({
  periodFrom: z.string(),
  periodTo: z.string(),
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

/** Whether two months make a period a session may have. */
const periodOk = (v: { periodFrom: string; periodTo: string }) =>
  sessionPeriod.safeParse({ periodFrom: v.periodFrom, periodTo: v.periodTo }).success;

/**
 * The first step of a session of a project series: the series' code, name and program are shown,
 * never typed; the step asks for the session's start and end month, and where its setup starts: a
 * workflow, a master template, or a copy of a previous project (a template or a copy brings the
 * components, settings, syllabus and rules). Next creates the draft.
 */
export function CreateStep({
  series,
  onCreated,
}: {
  series: ProjectSeries;
  onCreated: (project: Project) => void;
}) {
  const t = useTranslations('admin.projects.dialog');
  const tp = useTranslations('admin.projects');
  const ts = useTranslations('admin.projects.setup');
  const tz = useTranslations('admin.projects.wizard');
  const tw = useTranslations('admin.projects.workflow');
  const tsrc = useTranslations('admin.projects.source');
  const locale = useLocale() as Locale;
  const form = useForm<CreateFields>({
    resolver: useSchemaResolver(CREATE_SCHEMA),
    defaultValues: {
      // the whole of this year until changed
      periodFrom: `${new Date().getFullYear()}-01`,
      periodTo: `${new Date().getFullYear()}-12`,
      kind: 'workflow',
      workflowKey: '',
      templateId: '',
      copyOf: '',
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control }) as CreateFields;
  const kind = values.kind;
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
      createSession({
        seriesId: series.id,
        periodFrom: v.periodFrom,
        periodTo: v.periodTo,
        source: sourceOf(v)!,
      }),
  });
  const filled = Boolean(values.periodFrom && values.periodTo);
  const wrongPeriod = filled && !periodOk(values);
  const complete = CREATE_SCHEMA.safeParse(values).success && sourceOf(values) !== null;
  const problem = useStepSave({
    // a new session is always saved: Next creates it
    changed: true,
    invalid: wrongPeriod
      ? tz('period_invalid')
      : !filled || !complete
        ? tz('create_invalid')
        : undefined,
    save: async () => onCreated(await save.mutateAsync(form.getValues())),
  });
  // the wizard's Next creates the draft; Enter in a field only checks it, as before
  const submit = () => undefined;

  return (
    <SetupSection id="basics" title={ts('section.basics')}>
      <Form form={form} onSubmit={submit} label={ts('section.basics')}>
        <DescriptionList
          layout="grid"
          columns={3}
          items={[
            { label: t('code'), value: series.code },
            { label: tp('column.name'), value: localized(series.name, locale) },
            { label: t('program'), value: localized(series.program.name, locale) },
          ]}
        />
        <div className="admin-setup-grid">
          {(['periodFrom', 'periodTo'] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <MonthField
                  label={name === 'periodFrom' ? t('period_from') : t('period_to')}
                  hint={name === 'periodTo' ? t('period_hint') : undefined}
                  required
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  // a wrong period is said at its end month
                  error={name === 'periodTo' && wrongPeriod ? problem : undefined}
                />
              )}
            />
          ))}
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
                  label: p.sessionLabel,
                }),
              }))}
            />
          )}
        </div>
        <SaveNotice mutation={save} problem={wrongPeriod ? undefined : problem} />
      </Form>
    </SetupSection>
  );
}
