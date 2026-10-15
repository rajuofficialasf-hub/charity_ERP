/** The states of a project (docs/MASTER_SPEC.md, A6 "Project lifecycle"; DECISION_LOG D-095). */
export const PROJECT_STATUSES = ['draft', 'active', 'closing', 'closed', 'cancelled'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectAction = 'activate' | 'cancel' | 'start_closing' | 'close' | 'reopen';

/**
 * The only moves a project makes. Closing is two steps (new applications stop, then everything
 * stops); a reopen returns a closing or a closed project to active; only a draft that was never
 * activated is cancelled.
 */
export const PROJECT_TRANSITIONS: Record<
  ProjectAction,
  { from: readonly ProjectStatus[]; to: ProjectStatus }
> = {
  activate: { from: ['draft'], to: 'active' },
  cancel: { from: ['draft'], to: 'cancelled' },
  start_closing: { from: ['active'], to: 'closing' },
  close: { from: ['closing'], to: 'closed' },
  reopen: { from: ['closing', 'closed'], to: 'active' },
};

/** The status an action leads to from this status, or null when the action is not allowed. */
export function transitionFor(action: ProjectAction, status: ProjectStatus): ProjectStatus | null {
  // eslint-disable-next-line security/detect-object-injection -- action is a ProjectAction
  const move = PROJECT_TRANSITIONS[action];
  return move.from.includes(status) ? move.to : null;
}

/** What makes a project this project: fixed once it has been active. */
export const IDENTITY_FIELDS = ['code', 'programId', 'year', 'workflowKey'] as const;

/** A setup field, or a setup part saved on its own (components, areas, staff, ...). */
export type SetupField =
  | (typeof IDENTITY_FIELDS)[number]
  | 'name'
  | 'description'
  | 'applyFrom'
  | 'applyTo'
  | 'perVolunteerLimit'
  | 'costPerBeneficiary'
  | 'targetBeneficiaries'
  | 'components'
  | 'fundSources'
  | 'areas'
  | 'staff'
  | 'syllabus';

/** The window moves only through the reasoned deadline extension once a project is active. */
const FIXED_WHEN_ACTIVE: readonly SetupField[] = [...IDENTITY_FIELDS, 'applyFrom', 'applyTo'];

/**
 * Whether a setup field may change in this status: everything in a draft; everything but the
 * identity and the window while active; nothing while closing, closed or cancelled.
 */
export function editableIn(status: ProjectStatus, field: SetupField): boolean {
  if (status === 'draft') return true;
  if (status === 'active') return !FIXED_WHEN_ACTIVE.includes(field);
  return false;
}
