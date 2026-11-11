import { type ProjectUpdate, WORKFLOWS_WITHOUT_LIMIT } from '@css/shared/projects';
import { DateField, Form, FormDateField, FormTextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { ApiFailure } from '../../../api/client';
import { useSchemaResolver } from '../../../lib/form-schema';
import type { Project } from '../projects-api';
import { updateProject } from './setup-api';
import { Reseed, SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';

type WindowFields = { applyFrom: string; applyTo: string; limit: string };

/** The changed fields only; an empty date or limit clears it. */
function bodyOf(project: Project, v: WindowFields): ProjectUpdate {
  const out: ProjectUpdate = {};
  const from = v.applyFrom || null;
  const to = v.applyTo || null;
  if (from !== project.applyFrom) out.applyFrom = from;
  if (to !== project.applyTo) out.applyTo = to;
  const value = v.limit === '' ? null : Number(v.limit);
  if (value !== project.perVolunteerLimit) out.perVolunteerLimit = value;
  return out;
}

/**
 * The application window and the per-volunteer limit. Once active the end date moves only by the
 * reasoned extension on the project's page.
 */
export function WindowSection() {
  return <Reseed>{(state) => <WindowForm {...state} />}</Reseed>;
}

function WindowForm({ stale, onStale }: { stale: boolean; onStale: () => void }) {
  const { project, etag, editable, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const orderText = t('window_order');
  // the window ends on or after the day it opens
  const schema = useMemo(
    () =>
      z
        .object({ applyFrom: z.string(), applyTo: z.string(), limit: z.string() })
        .refine((v) => !(v.applyFrom && v.applyTo && v.applyFrom > v.applyTo), {
          path: ['applyTo'],
          message: orderText,
        }),
    [orderText],
  );
  const form = useForm<WindowFields>({
    resolver: useSchemaResolver(schema),
    defaultValues: {
      applyFrom: project.applyFrom ?? '',
      applyTo: project.applyTo ?? '',
      limit: project.perVolunteerLimit === null ? '' : String(project.perVolunteerLimit),
    },
    reValidateMode: 'onSubmit',
  });
  const values = useWatch({ control: form.control }) as WindowFields;
  const noLimit = WORKFLOWS_WITHOUT_LIMIT.includes(project.workflowKey);

  const save = useMutation({
    mutationFn: (v: WindowFields) => updateProject(project.id, etag, bodyOf(project, v)),
    onError: (e) => e instanceof ApiFailure && e.status === 412 && onStale(),
  });
  const order = schema.safeParse(values).success ? undefined : orderText;
  const changed = Object.keys(bodyOf(project, values)).length > 0;
  const store = async () => {
    await save.mutateAsync(form.getValues());
    await refresh();
  };
  const problem = useStepSave({ changed, invalid: order, save: store });
  // the wizard's buttons save the step; Enter in a field only checks it, as before
  const submit = () => undefined;

  return (
    <SetupSection id="window" title={t('section.window')}>
      <Form form={form} onSubmit={submit} label={t('section.window')}>
        <div className="admin-setup-grid">
          <FormDateField
            name="applyFrom"
            label={t('apply_from')}
            disabled={!editable('applyFrom')}
          />
          <Controller
            control={form.control}
            name="applyTo"
            render={({ field }) => (
              <DateField
                label={t('apply_to')}
                hint={project.status === 'active' ? t('apply_to_active') : undefined}
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                // the order is said as soon as the dates are wrong, not only when saving
                error={order}
                disabled={!editable('applyTo')}
              />
            )}
          />
          {!noLimit && (
            <FormTextField
              name="limit"
              type="integer"
              label={t('limit')}
              hint={t('limit_hint')}
              readOnly={!editable('perVolunteerLimit')}
            />
          )}
        </div>
        <SaveNotice mutation={save} problem={problem} stale={stale} />
      </Form>
    </SetupSection>
  );
}
