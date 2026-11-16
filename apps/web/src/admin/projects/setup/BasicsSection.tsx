import { localized, type Locale } from '@css/shared/i18n';
import {
  type ProjectUpdate,
  sessionPeriod,
  WORKFLOW_KEYS,
  type WorkflowKey,
} from '@css/shared/projects';
import { DescriptionList, Form, FormSelectField, FormTextField, MonthField } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../../api/client';
import { useSchemaResolver } from '../../../lib/form-schema';
import { CARDS_KEY, programCards } from '../cards-api';
import type { Project } from '../projects-api';
import { updateProject } from './setup-api';
import { Reseed, SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';

type BasicsFields = {
  name: { bn: string; en: string };
  description: string;
  periodFrom: string;
  periodTo: string;
  workflowKey: string;
};

/** What the project's row holds now, as the fields show it. */
const fieldsOf = (project: Project): BasicsFields => ({
  name: { bn: project.name.bn, en: project.name.en },
  description: project.description ?? '',
  periodFrom: project.periodFrom,
  periodTo: project.periodTo,
  workflowKey: project.workflowKey,
});

/** The changed fields only; nothing changed sends nothing. */
function bodyOf(project: Project, v: BasicsFields): ProjectUpdate {
  const out: ProjectUpdate = {};
  const name = { bn: v.name.bn.trim(), en: v.name.en.trim() };
  if (name.bn !== project.name.bn || name.en !== project.name.en) out.name = name;
  const text = v.description.trim();
  if (text !== (project.description ?? '')) out.description = text || null;
  // the two months go together
  if (v.periodFrom !== project.periodFrom || v.periodTo !== project.periodTo) {
    out.periodFrom = v.periodFrom;
    out.periodTo = v.periodTo;
  }
  if (v.workflowKey && v.workflowKey !== project.workflowKey)
    out.workflowKey = v.workflowKey as WorkflowKey;
  return out;
}

/**
 * Name, description, the period and the workflow, the period and the workflow only while a draft;
 * the code and the program are shown and never sent: they belong to the session's series.
 */
export function BasicsSection() {
  return <Reseed>{(state) => <BasicsForm {...state} />}</Reseed>;
}

function BasicsForm({ stale, onStale }: { stale: boolean; onStale: () => void }) {
  const { project, etag, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const td = useTranslations('admin.projects.dialog');
  const tc = useTranslations('admin.projects.column');
  const tz = useTranslations('admin.projects.wizard');
  const tw = useTranslations('admin.projects.workflow');
  const locale = useLocale() as Locale;
  const invalidText = tz('basics_invalid');
  // a name in both languages and a period a session may have
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.object({ bn: z.string().trim().min(1), en: z.string().trim().min(1) }),
          description: z.string(),
          periodFrom: z.string(),
          periodTo: z.string(),
          workflowKey: z.string(),
        })
        .refine(
          (v) =>
            sessionPeriod.safeParse({ periodFrom: v.periodFrom, periodTo: v.periodTo }).success,
        ),
    [],
  );
  const form = useForm<BasicsFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: fieldsOf(project),
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control }) as BasicsFields;
  // the program's name, read from the cards every official of the setup may read
  const cards = useQuery({ queryKey: [...CARDS_KEY, 'programs'], queryFn: programCards });
  const program = cards.data?.find((g) => g.id === project.programId);

  const save = useMutation({
    mutationFn: (v: BasicsFields) => updateProject(project.id, etag, bodyOf(project, v)),
    onError: (e) => e instanceof ApiFailure && e.status === 412 && onStale(),
  });
  const changed = Object.keys(bodyOf(project, values)).length > 0;
  const store = async () => {
    await save.mutateAsync(form.getValues());
    await refresh();
  };
  const problem = useStepSave({
    changed,
    invalid: schema.safeParse(values).success ? undefined : invalidText,
    save: store,
  });
  // the wizard's buttons save the step; Enter in a field only checks it, as before
  const submit = () => undefined;

  return (
    <SetupSection id="basics" title={t('section.basics')}>
      <Form form={form} onSubmit={submit} label={t('section.basics')}>
        <DescriptionList
          layout="grid"
          columns={3}
          items={[
            { label: td('code'), value: project.code },
            { label: td('program'), value: program ? localized(program.name, locale) : '' },
            { label: tc('session'), value: project.sessionLabel },
          ]}
        />
        <div className="admin-setup-grid">
          <FormTextField
            name="name.bn"
            label={td('name_bn')}
            required
            maxLength={200}
            readOnly={!editable('name')}
          />
          <FormTextField
            name="name.en"
            label={td('name_en')}
            required
            maxLength={200}
            lang="en"
            readOnly={!editable('name')}
          />
          {(['periodFrom', 'periodTo'] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field }) => (
                <MonthField
                  label={name === 'periodFrom' ? td('period_from') : td('period_to')}
                  hint={name === 'periodTo' && editable('period') ? td('period_hint') : undefined}
                  required
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={!editable('period')}
                />
              )}
            />
          ))}
          <FormSelectField
            name="workflowKey"
            label={td('workflow')}
            hint={editable('workflowKey') ? t('workflow_change') : undefined}
            disabled={!editable('workflowKey')}
            searchable={false}
            options={WORKFLOW_KEYS.map((key) => ({ value: key, label: tw(key) }))}
          />
        </div>
        <FormTextField
          name="description"
          rows={4}
          label={t('description')}
          maxLength={2000}
          readOnly={!editable('description')}
        />
        <SaveNotice mutation={save} problem={problem} stale={stale} />
      </Form>
    </SetupSection>
  );
}
