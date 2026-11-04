import type { ColorTone } from '@/ui';
import type { BadgeTone } from '@css/ui';
import type { useTranslations } from 'use-intl';

type StatusTranslator = ReturnType<typeof useTranslations<'applications.status'>>;

/** The state's name in the reader's language; a state the catalogue lacks shows its code. */
export const stateLabel = (ts: StatusTranslator, status: string) =>
  ts.has(status as never) ? ts(status as never) : status;

/** The tabs of "আমার আবেদন" and the states each one holds (docs/ui/SCREENS.md, "My applications and application detail"). */
export const TABS = {
  draft: ['draft'],
  pending: ['submitted', 'under_review', 'reviewed', 'waitlisted', 'needs_verification'],
  approved: ['approved', 'implementation', 'completed', 'closed'],
  rejected: ['rejected'],
} as const;
export type Tab = keyof typeof TABS;

/** The tone of a state's chip; the label always says the state as well. */
export function stateTone(status: string): ColorTone {
  if (TABS.approved.includes(status as (typeof TABS.approved)[number])) return 'success';
  if (status === 'rejected') return 'error';
  if (status === 'draft') return 'neutral';
  return 'info';
}

/** The same tone for the earlier set's badge, on the office's pages until they move. */
export function toneOf(status: string): BadgeTone {
  if (TABS.approved.includes(status as (typeof TABS.approved)[number])) return 'success';
  if (status === 'rejected') return 'danger';
  if (status === 'draft') return 'neutral';
  return 'info';
}
