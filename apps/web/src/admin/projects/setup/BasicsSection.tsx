import { localized, type Locale } from '@css/shared/i18n';
import { type ProjectUpdate, WORKFLOW_KEYS, type WorkflowKey } from '@css/shared/projects';
import { Form, FormSelectField, FormTextField } from '@/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useLocale, useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../../api/client';
import { useSchemaResolver } from '../../../lib/form-schema';
import { PROGRAMS_KEY, programs } from '../../programs/programs-api';
import type { Project } from '../projects-api';
import { updateProject } from './setup-api';
import { Reseed, SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';

type BasicsFields = {
  name: { bn: string; en: string };
  description: string;
  year: string;
  programId: string;
  workflowKey: string;
};

/** What the project's row holds now, as the fields show it. */
const fieldsOf = (project: Project): BasicsFields => ({
  name: { bn: project.name.bn, en: project.name.en },
  description: project.description ?? '',
  year: String(project.year),
  programId: project.programId ?? '',
  workflowKey: project.workflowKey,
});

/** The changed fields only; nothing changed sends nothing. */
function bodyOf(project: Project, v: BasicsFields): ProjectUpdate {
  const out: ProjectUpdate = {};
  const name = { bn: v.name.bn.trim(), en: v.name.en.trim() };
  if (name.bn !== project.name.bn || name.en !== project.name.en) out.name = name;
  const text = v.description.trim();
  if (text !== (project.description ?? '')) out.description = text || null;
  if (Number(v.year) !== project.year) out.year = Number(v.year);
  if (v.programId && v.programId !== project.programId) out.programId = v.programId;
  if (v.workflowKey && v.workflowKey !== project.workflowKey)
    out.workflowKey = v.workflowKey as WorkflowKey;
  return out;
}

/** Name, description, year, program and workflow; the last three only while a draft. */
export function BasicsSection() {
  return <Reseed>{(state) => <BasicsForm {...state} />}</Reseed>;
}

function BasicsForm({ stale, onStale }: { stale: boolean; onStale: () => void }) {
  const { project, etag, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const td = useTranslations('admin.projects.dialog');
  const tz = useTranslations('admin.projects.wizard');
  const tw = useTranslations('admin.projects.workflow');
  const locale = useLocale() as Locale;
  const invalidText = tz('basics_invalid');
  // a name in both languages and a year of four digits, as the step's own notice says
  const schema = useMemo(
    () =>
      z.object({
        name: z.object({ bn: z.string().trim().min(1), en: z.string().trim().min(1) }),
        description: z.string(),
        year: z.string().regex(/^\d{4}$/, { message: invalidText }),
        programId: z.string(),
        workflowKey: z.string(),
      }),
    [invalidText],
  );
  const form = useForm<BasicsFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: fieldsOf(project),
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control }) as BasicsFields;
  // read for a viewer too: the disabled select names the program from this list
  const list = useQuery({ queryKey: PROGRAMS_KEY, queryFn: programs });

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
          <FormTextField
            name="year"
            type="integer"
            label={td('year')}
            required
            readOnly={!editable('year')}
          />
          <FormSelectField
            name="programId"
            label={td('program')}
            disabled={!editable('programId')}
            options={(list.data ?? [])
              .filter((p) => p.active || p.id === project.programId)
              .map((p) => ({ value: p.id, label: localized(p.name, locale) }))}
          />
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
