import type { Project } from './projects-api';

/** The stages of a session on the summary's strip, in their order. */
export const STAGES = ['draft', 'open', 'ended', 'closing', 'closed'] as const;
export type Stage = (typeof STAGES)[number];

/**
 * The stage a session is at (docs/DECISION_LOG.md, the session's page as a project frame): a
 * draft; while active, taking applications until the window's last day and past it once that day
 * is over (an active session before its window opens already takes them, its start shown by the
 * page; one reopened takes its stage from its window in the same way); closing; closed. A
 * cancelled session has none. `today` is the date in Dhaka, `yyyy-mm-dd`.
 */
export function sessionStage(
  status: Project['status'],
  applyTo: string | null,
  today: string,
): Stage | null {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'active':
      return applyTo !== null && today > applyTo ? 'ended' : 'open';
    case 'closing':
      return 'closing';
    case 'closed':
      return 'closed';
    default:
      return null;
  }
}
