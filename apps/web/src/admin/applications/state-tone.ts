import type { BadgeTone } from '@css/ui';
import { TABS } from '../../features/applications/status';

/** The tone of a state's badge on the office's pages; the label always says the state as well. */
export function toneOf(status: string): BadgeTone {
  if (TABS.approved.includes(status as (typeof TABS.approved)[number])) return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'draft') return 'neutral';
  return 'info';
}
