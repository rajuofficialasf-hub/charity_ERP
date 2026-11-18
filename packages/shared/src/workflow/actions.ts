/**
 * The actions of the common application cycle (docs/architecture/WORKFLOW_ENGINE.md, "Common
 * application cycle"): each names the states it leaves and the state it reaches. The project's
 * workflow snapshot decides whether the move exists, who may make it and what it checks; this
 * table only translates an action name into a move. The texts an action needs: `reason` for the
 * office, and for a rejection also `message`, the words the volunteer reads.
 */
export const APPLICATION_STATES = [
  'draft',
  'needs_verification',
  'submitted',
  'under_review',
  'reviewed',
  'waitlisted',
  'approved',
  'rejected',
  'implementation',
  'completed',
  'closed',
  'deleted',
] as const;
export type ApplicationState = (typeof APPLICATION_STATES)[number];

export interface ApplicationActionSpec {
  from: readonly ApplicationState[];
  to: ApplicationState;
  /** The texts the action takes; the snapshot's `requires_reason` says whether the reason is mandatory. */
  texts: 'none' | 'reason' | 'reason_and_message';
  /** An action of a later task: the engine refuses it until that task builds it. */
  later?: true;
  /**
   * The move the action makes first when the application stands one step before it: the office
   * sends a submitted application for approval in one press, and the press records the start of
   * the review on its way (docs/architecture/WORKFLOW_ENGINE.md, "Common application cycle").
   */
  leadIn?: { from: ApplicationState; action: string };
}

export const APPLICATION_ACTIONS = {
  submit: { from: ['draft'], to: 'submitted', texts: 'none' },
  review: { from: ['submitted'], to: 'under_review', texts: 'none' },
  send_for_approval: {
    from: ['under_review'],
    to: 'reviewed',
    texts: 'none',
    leadIn: { from: 'submitted', action: 'review' },
  },
  approve: { from: ['reviewed'], to: 'approved', texts: 'none' },
  reject: { from: ['reviewed', 'waitlisted'], to: 'rejected', texts: 'reason_and_message' },
  waitlist: { from: ['reviewed'], to: 'waitlisted', texts: 'reason' },
  pull_from_waitlist: { from: ['waitlisted'], to: 'approved', texts: 'none' },
  delete: { from: ['draft', 'submitted'], to: 'deleted', texts: 'none' },
  // both verifications make the same move; the service binds the existing profile or creates one
  verify_link: { from: ['needs_verification'], to: 'submitted', texts: 'none' },
  verify_create: { from: ['needs_verification'], to: 'submitted', texts: 'none' },
  reject_unverified: { from: ['needs_verification'], to: 'rejected', texts: 'reason' },
  return_to_review: { from: ['rejected'], to: 'reviewed', texts: 'reason' },
} as const satisfies Record<string, ApplicationActionSpec>;

export type ApplicationAction = keyof typeof APPLICATION_ACTIONS;
export const APPLICATION_ACTION_NAMES = Object.keys(APPLICATION_ACTIONS) as ApplicationAction[];

export const isApplicationAction = (value: string): value is ApplicationAction =>
  Object.hasOwn(APPLICATION_ACTIONS, value);

/** The move an action makes first from this state, if any (`leadIn`). */
export function leadInOf(action: ApplicationAction, status: string): ApplicationAction | null {
  const spec: ApplicationActionSpec = APPLICATION_ACTIONS[action];
  return spec.leadIn?.from === status && isApplicationAction(spec.leadIn.action)
    ? spec.leadIn.action
    : null;
}
