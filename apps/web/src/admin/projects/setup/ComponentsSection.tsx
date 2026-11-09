import { COMPONENT_SETTINGS_DEFINITION, type ComponentKey, isComponentKey } from '@css/shared';
import { Alert, IconButton, LinkButton, Switch } from '@/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../../api/client';
import { ComponentDrawer } from './ComponentDrawer';
import { type ProjectComponent, updateComponent } from './setup-api';
import { SetupSection, useSetup } from './setup-context';

/** 'settings' the scoring of applications reads; they are configured with the quotas (Phase 2). */
const NOT_HERE = new Set(['scoring']);

/** Whether a component has settings this screen edits. */
const hasSettings = (key: string) => {
  if (!isComponentKey(key)) return false;
  // eslint-disable-next-line security/detect-object-injection -- a ComponentKey of a constant table
  const definition = COMPONENT_SETTINGS_DEFINITION[key];
  return definition !== undefined && !NOT_HERE.has(definition);
};

/**
 * The components of the project as switches, each with its settings when it has some:
 * only what is switched on comes into the project. The photo rule is a project-wide setting kept
 * with the distribution component, so its settings stay open while that component is off.
 */
export function ComponentsSection({
  components,
  formHref,
}: {
  components: ProjectComponent[];
  /** The project's form in the builder, which the application form component leads to. */
  formHref: string;
}) {
  const { project, editable, phone, refresh } = useSetup();
  const t = useTranslations('admin.projects.setup');
  const tk = useTranslations('admin.projects.component');
  const [open, setOpen] = useState<ProjectComponent | null>(null);
  const can = editable('components');
  const toggle = useMutation({
    mutationFn: (c: ProjectComponent) =>
      updateComponent(project.id, c.componentKey, c.etag ?? '', { enabled: !c.enabled }),
    onSettled: refresh,
  });
  const on = components.filter((c) => c.enabled).length;

  return (
    <SetupSection id="components" title={t('section.components')}>
      <p className="admin-muted">{t('components_hint', { on: String(on) })}</p>
      {toggle.error instanceof ApiFailure && (
        <Alert tone={toggle.error.status === 412 ? 'warning' : 'error'}>
          {toggle.error.status === 412 ? t('stale') : toggle.error.message}
        </Alert>
      )}
      <ul className="admin-setup-components">
        {components.map((c) => (
          <li key={c.componentKey}>
            <Switch
              label={tk(c.componentKey as ComponentKey)}
              checked={c.enabled}
              onChange={() => toggle.mutate(c)}
              disabled={toggle.isPending || !can}
              hint={can ? undefined : t('locked')}
            />
            {c.componentKey === 'application_form' && (
              <LinkButton variant="text" startIcon="file" to={formHref}>
                {t('open_forms')}
              </LinkButton>
            )}
            {hasSettings(c.componentKey) && !phone && (
              <IconButton
                label={t('settings_of', { name: tk(c.componentKey as ComponentKey) })}
                icon="settings"

                onClick={() => setOpen(c)}
              />
            )}
          </li>
        ))}
      </ul>
      {open && (
        <ComponentDrawer
          component={open}
          readOnly={!can}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            refresh();
          }}
        />
      )}
    </SetupSection>
  );
}
