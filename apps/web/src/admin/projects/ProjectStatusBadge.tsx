import type { ProjectStatus } from '@css/shared/projects';
import { Badge, type BadgeTone } from '@css/ui';
import { useTranslations } from 'use-intl';

const TONE: Record<ProjectStatus, BadgeTone> = {
  draft: 'neutral',
  active: 'success',
  closing: 'warning',
  closed: 'neutral',
  cancelled: 'neutral',
};

/** A project's state, always with its name (never by colour alone). */
export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const t = useTranslations('admin.projects.status');
  // eslint-disable-next-line security/detect-object-injection -- a ProjectStatus key of a constant table
  return <Badge variant="dot" tone={TONE[status]} label={t(status)} />;
}
