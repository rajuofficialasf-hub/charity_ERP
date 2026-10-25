import type { BadgeTone } from '@css/ui';

/** The tabs of "আমার আবেদন" and the states each one holds (docs/ui/SCREENS.md, "My applications and application detail"). */
export const TABS = {
  draft: ['draft'],
  pending: ['submitted', 'under_review', 'reviewed', 'waitlisted', 'needs_verification'],
  approved: ['approved', 'implementation', 'completed', 'closed'],
  rejected: ['rejected'],
} as const;
export type Tab = keyof typeof TABS;

/** The tone of a state's badge; the label always says the state as well. */
export function toneOf(status: string): BadgeTone {
  if (TABS.approved.includes(status as (typeof TABS.approved)[number])) return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'draft') return 'neutral';
  return 'info';
}
