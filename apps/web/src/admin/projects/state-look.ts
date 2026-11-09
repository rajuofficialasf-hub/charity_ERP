import type { ColorTone, ExtendedIconName } from '@/ui';
import type { CountKey } from './projects-api';

/** The icon and tone of a project count card: every project, then one per state. */
export const PROJECT_COUNT_LOOK: Record<CountKey, { icon: ExtendedIconName; tone: ColorTone }> = {
  all: { icon: 'project', tone: 'primary' },
  draft: { icon: 'file-edit', tone: 'neutral' },
  active: { icon: 'play', tone: 'success' },
  closing: { icon: 'hourglass', tone: 'warning' },
  closed: { icon: 'lock', tone: 'neutral' },
  cancelled: { icon: 'block', tone: 'neutral' },
};
