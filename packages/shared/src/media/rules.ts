/**
 * The rules of a media referral and its work (docs/plans/2026-10-26-1502-feat-media-team-plan.md):
 * what a referral may do next, which stages a work may move to and who may move it,
 * and when a work may be published. Pure: the services and the screens ask the same questions.
 */

export const MEDIA_PRIORITIES = ['high', 'normal', 'low'] as const;
export type MediaPriority = (typeof MEDIA_PRIORITIES)[number];

export const REFERRAL_STATES = ['pending', 'accepted', 'sent_back', 'rejected'] as const;
export type ReferralState = (typeof REFERRAL_STATES)[number];

export const REFERRAL_DECISIONS = ['accept', 'send_back', 'reject'] as const;
export type ReferralDecision = (typeof REFERRAL_DECISIONS)[number];

/** An application may be referred once it is approved, also later in its life. */
export const REFERABLE_APPLICATION_STATES = [
  'approved',
  'implementation',
  'completed',
  'closed',
] as const;

export const CONTENT_TYPES = ['video', 'photo', 'both'] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const SCRIPT_STATES = ['draft', 'in_review', 'final'] as const;
export type ScriptState = (typeof SCRIPT_STATES)[number];

export const PUBLICATION_STATES = ['waiting', 'published', 'taken_down'] as const;
export type PublicationState = (typeof PUBLICATION_STATES)[number];

/** The stages the rules need; every other stage of the list is an ordinary one the team moves to. */
export const SYSTEM_STAGES = [
  'accepted',
  'ready_to_publish',
  'published',
  'done',
  'in_review',
  'on_hold',
  'cancelled',
] as const;
export type SystemStage = (typeof SYSTEM_STAGES)[number];

export const isSystemStage = (code: string): code is SystemStage =>
  (SYSTEM_STAGES as readonly string[]).includes(code);

/** The state a decision leaves a pending referral in. */
export function decisionState(decision: ReferralDecision): Exclude<ReferralState, 'pending'> {
  return decision === 'accept' ? 'accepted' : decision === 'send_back' ? 'sent_back' : 'rejected';
}

/** Only a pending referral is decided. */
export const mayDecide = (state: ReferralState) => state === 'pending';

/** A referral sent back or rejected may be corrected and sent again; an accepted one is done. */
export const mayResend = (state: ReferralState) => state === 'sent_back' || state === 'rejected';

/** The work's stages no one moves away from. */
const FINAL: readonly string[] = ['done', 'cancelled'];

/**
 * The stages a work at `current` may be moved to by hand. `ordinary` is the active ordinary stages
 * of the list; `director` is the Media Director or the Assistant Director. "accepted" is set only
 * by accepting the referral and "published" only by the first publication after the final review;
 * the final review and its send-back ("in review") have their own actions, as do hold and resume.
 */
export function nextStages(
  current: string,
  ordinary: readonly string[],
  director: boolean,
): string[] {
  if (FINAL.includes(current) || current === 'on_hold') return director ? ['cancelled'] : [];
  if (current === 'published') return director ? ['done', 'cancelled'] : [];
  // a work sent back goes to an ordinary stage first, never straight back to the review
  const team = [...ordinary, ...(current === 'in_review' ? [] : ['ready_to_publish'])].filter(
    (s) => s !== current,
  );
  return director ? [...team, 'on_hold', 'cancelled'] : team;
}

/** Whether a move by hand is allowed. */
export const mayMoveStage = (
  current: string,
  to: string,
  ordinary: readonly string[],
  director: boolean,
) => nextStages(current, ordinary, director).includes(to);

/** The final review is given, or a work sent back, only while it is ready to publish. */
export const mayReview = (stage: string) => stage === 'ready_to_publish';

/**
 * A move back to the team withdraws an approval already given; a hold keeps it for the resume, and
 * a cancel keeps the record of who approved.
 */
export const clearsReview = (to: string) =>
  !['ready_to_publish', 'published', 'done', 'on_hold', 'cancelled'].includes(to);

/**
 * A publication may be marked published only after the final review, while the work is ready to
 * publish or already published; the first one makes the work "published".
 */
export const mayPublish = (stage: string, reviewed: boolean) =>
  reviewed && (stage === 'ready_to_publish' || stage === 'published');
