import { type ProjectUpdate, WORKFLOWS_WITHOUT_LIMIT } from '@css/shared/projects';
import { DateField, TextField } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../../api/client';
import { updateProject } from './setup-api';
import { Reseed, SaveNotice, SetupSection, useSetup, useStepSave } from './setup-context';

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
  const [from, setFrom] = useState(project.applyFrom);
  const [to, setTo] = useState(project.applyTo);
  const [limit, setLimit] = useState(
    project.perVolunteerLimit === null ? '' : String(project.perVolunteerLimit),
  );
  const noLimit = WORKFLOWS_WITHOUT_LIMIT.includes(project.workflowKey);

  const body = (): ProjectUpdate => {
    const out: ProjectUpdate = {};
    if (from !== project.applyFrom) out.applyFrom = from;
    if (to !== project.applyTo) out.applyTo = to;
    const value = limit === '' ? null : Number(limit);
    if (value !== project.perVolunteerLimit) out.perVolunteerLimit = value;
    return out;
  };
  const save = useMutation({
    mutationFn: () => updateProject(project.id, etag, body()),
    onError: (e) => e instanceof ApiFailure && e.status === 412 && onStale(),
  });
  const order = from && to && from > to ? t('window_order') : undefined;
  const problem = useStepSave({
    changed: Object.keys(body()).length > 0,
    invalid: order,
    save: async () => {
      await save.mutateAsync();
      await refresh();
    },
  });

  return (
    <SetupSection id="window" title={t('section.window')}>
      <div className="admin-setup-grid">
        <DateField
          label={t('apply_from')}
          value={from ?? ''}
          onChange={(v) => setFrom(v || null)}
          disabled={!editable('applyFrom')}
        />
        <DateField
          label={t('apply_to')}
          hint={project.status === 'active' ? t('apply_to_active') : undefined}
          value={to ?? ''}
          onChange={(v) => setTo(v || null)}
          error={order}
          disabled={!editable('applyTo')}
        />
        {!noLimit && (
          <TextField
            type="integer"
            label={t('limit')}
            hint={t('limit_hint')}
            value={limit}
            onChange={setLimit}
            readOnly={!editable('perVolunteerLimit')}
          />
        )}
      </div>
      <SaveNotice mutation={save} problem={problem} stale={stale} />
    </SetupSection>
  );
}
