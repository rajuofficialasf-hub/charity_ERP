import type { ApplicationState } from './actions.js';

/**
 * Whether an application says its person was helped (docs/BUSINESS_RULES.md, BR-307; the states in
 * docs/architecture/workflow-templates/_common.yaml). The one reading of it, used by the name
 * lookup at entry and by the help history on the profile:
 * - `always`: the approval and the states only an approved application reaches. Until the
 *   distribution module records what was received, an approved application counts as help.
 * - `never`: an application not decided yet, waitlisted, rejected or deleted.
 * - `if_delivered`: a closed application. A project's close closes every application not yet
 *   rejected or deleted, drafts and waiting ones too, and gives the ones still in implementation
 *   the template's not-delivered outcome (docs/architecture/WORKFLOW_ENGINE.md, "Common application
 *   cycle"). So a closed application counts only when it was approved before the close (its
 *   approval time is kept) and its outcome is not a not-delivered one.
 */
export const HELP_BY_STATE = {
  draft: 'never',
  needs_verification: 'never',
  submitted: 'never',
  under_review: 'never',
  reviewed: 'never',
  waitlisted: 'never',
  approved: 'always',
  rejected: 'never',
  implementation: 'always',
  completed: 'always',
  closed: 'if_delivered',
  deleted: 'never',
} as const satisfies Record<ApplicationState, 'always' | 'never' | 'if_delivered'>;

const statesOf = (kind: 'always' | 'if_delivered') =>
  Object.entries(HELP_BY_STATE)
    .filter(([, counting]) => counting === kind)
    .map(([state]) => state as ApplicationState);

/** The states that count as help whatever else the application says. */
export const HELPED_STATES: readonly ApplicationState[] = statesOf('always');

/** The states that count only with an approval behind them and a delivered outcome. */
export const HELPED_IF_DELIVERED_STATES: readonly ApplicationState[] = statesOf('if_delivered');

/**
 * The outcomes a project's close gives an application that was never delivered: each workflow
 * template's `not_delivered_outcome` (a test reads the templates against this list).
 */
export const NOT_DELIVERED_OUTCOMES = [
  'not_distributed',
  'not_built',
  'not_installed',
  'not_supported',
] as const;

/** What the counting reads of one application. */
export interface HelpFacts {
  status: string;
  /** When the application was approved; kept through a project's close. */
  approvedAt: Date | string | null;
  outcome: string | null;
}

/** Whether the text is a state the counting knows; any other state counts nothing. */
const isCountedState = (status: string): status is keyof typeof HELP_BY_STATE =>
  Object.hasOwn(HELP_BY_STATE, status);

/** Whether the application counts as one time its person was helped. */
export function countsAsHelped(a: HelpFacts): boolean {
  if (!isCountedState(a.status)) return false;
  const kind = HELP_BY_STATE[a.status];
  if (kind === 'always') return true;
  if (kind !== 'if_delivered') return false;
  return (
    a.approvedAt !== null &&
    (a.outcome === null || !(NOT_DELIVERED_OUTCOMES as readonly string[]).includes(a.outcome))
  );
}

/** One application of a person, with its project and the project's year. */
export interface HelpApplication extends HelpFacts {
  projectId: string;
  year: number;
}

export interface HelpYear {
  year: number;
  /** The times helped that year, in every project. */
  count: number;
  /** Each project of the year with its times helped, in the order first met. */
  projects: { projectId: string; count: number }[];
}

export interface HelpSummary {
  /** Every time the person was helped. */
  total: number;
  /** The year of the earliest help; null when never helped. */
  firstYear: number | null;
  /** The times helped in the given year. */
  thisYear: number;
  /** The years with help, newest first. */
  years: HelpYear[];
  /** Helped more than once in one year. */
  repeatedInYear: boolean;
  /** Helped more than once in one project. */
  repeatedInProject: boolean;
}

/** How often a person was helped, from their applications; only the counted ones are read. */
export function helpSummary(
  applications: readonly HelpApplication[],
  thisYear: number,
): HelpSummary {
  const years = new Map<number, HelpYear>();
  for (const a of applications) {
    if (!countsAsHelped(a)) continue;
    const y = years.get(a.year) ?? { year: a.year, count: 0, projects: [] };
    y.count += 1;
    const p = y.projects.find((x) => x.projectId === a.projectId);
    if (p) p.count += 1;
    else y.projects.push({ projectId: a.projectId, count: 1 });
    years.set(a.year, y);
  }
  const list = [...years.values()].sort((a, b) => b.year - a.year);
  return {
    total: list.reduce((sum, y) => sum + y.count, 0),
    firstYear: list.at(-1)?.year ?? null,
    thisYear: years.get(thisYear)?.count ?? 0,
    years: list,
    repeatedInYear: list.some((y) => y.count > 1),
    repeatedInProject: list.some((y) => y.projects.some((p) => p.count > 1)),
  };
}
