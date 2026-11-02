import type { IconComponent, IconTileTone } from '@css/ui';
import { Ban, CirclePlay, FilePen, FolderKanban, Hourglass, Lock } from 'lucide-react';
import type { CountKey } from './projects-api';

/** The icon and tone of a project count card: every project, then one per state. */
export const PROJECT_COUNT_LOOK: Record<CountKey, { icon: IconComponent; tone: IconTileTone }> = {
  all: { icon: FolderKanban, tone: 'brand' },
  draft: { icon: FilePen, tone: 'neutral' },
  active: { icon: CirclePlay, tone: 'success' },
  closing: { icon: Hourglass, tone: 'warning' },
  closed: { icon: Lock, tone: 'neutral' },
  cancelled: { icon: Ban, tone: 'neutral' },
};
