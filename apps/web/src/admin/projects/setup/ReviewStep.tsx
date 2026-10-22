import { Alert, Button } from '@css/ui';
import { ArrowRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { ApiFailure } from '../../../lib/api';
import { ProjectFacts } from '../ProjectFacts';
import { useMissingLabel } from './missing';
import { SetupSection, useSetup } from './setup-context';
import { type StepId, stepOfMissing } from './wizard-steps';

/**
 * The last step: the project's facts, what activation still needs (each item opens its step), and
 * the server's answer when an activation was refused. The activate button is in the action bar.
 */
export function ReviewStep({
  missing,
  activation,
  formHref,
  onOpen,
}: {
  /** The missing items; null when the caller cannot see every part the check reads. */
  missing: string[] | null;
  activation: unknown;
  /** Where a missing published form is made: the project's form in the builder. */
  formHref: string;
  onOpen: (step: StepId) => void;
}) {
  const { project } = useSetup();
  const t = useTranslations('admin.projects.wizard');
  const ts = useTranslations('admin.projects.setup');
  const label = useMissingLabel();
  const refused =
    activation instanceof ApiFailure && activation.code === 'workflow.guard.project_setup_complete'
      ? activation.details.flatMap((d) => (d.path ? [d.path] : []))
      : [];
  const open = refused.length ? refused : (missing ?? []);
  // an active project, an unknown check (a part did not load), a complete draft, or what is missing
  let state: ReactNode;
  if (project.status !== 'draft') state = <p className="admin-muted">{ts('summary_active')}</p>;
  else if (missing === null) state = null;
  else if (open.length === 0) state = <Alert tone="success">{t('ready')}</Alert>;
  else
    state = (
      <div className="admin-wizard-missing" role={refused.length ? 'alert' : undefined}>
        <p className="admin-setup-subtitle">{t('missing_title')}</p>
        <ul>
          {open.map((item) => (
            <li key={item}>
              <span>{label(item)}</span>
              {item === 'form' ? (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ArrowRight}
                  iconPosition="end"
                  href={formHref}
                >
                  {ts('open_forms')}
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  icon={ArrowRight}
                  iconPosition="end"
                  onPress={() => onOpen(stepOfMissing(item))}
                >
                  {t('open_step')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    );

  return (
    <SetupSection id="review" title={t('review')}>
      <ProjectFacts project={project} />
      {state}
      {activation instanceof ApiFailure && refused.length === 0 && (
        <Alert tone="danger" live="alert">
          {activation.message}
        </Alert>
      )}
    </SetupSection>
  );
}
