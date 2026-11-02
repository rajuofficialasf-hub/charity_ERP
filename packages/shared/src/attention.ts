import { z } from 'zod';

/**
 * The kinds of "needs your attention" items on the My Work home, and the page each one opens.
 * Each link opens the list that holds the counted records, with the same filter where the list
 * has one; the list may also show records that wait for someone else (a registration sent back
 * to its volunteer, for example).
 */
export const ATTENTION_ROUTES = {
  unread_notifications: '/notifications',
  consent_pending: '/my-projects',
  corrections: '/account/profile',
  edit_answered: '/account/profile',
  registrations_pending: '/admin/volunteers?state=pending',
  staff_registrations_pending: '/admin/registrations',
  edit_requests_pending: '/admin/registrations?tab=edits',
  projects_draft: '/admin/projects?status=draft',
  deadlines_soon: '/admin/projects?status=active&endingSoon=true',
  handovers_open: '/admin/handover',
  // the volunteer's open answers are on their applications
  unlocks_to_fill: '/my-applications',
  // the item opens the oldest waiting application; this is the place when none is named
  unlocks_to_verify: '/admin/projects',
  // the item opens the entry that has waited longest; this is the place when none is named
  verifications_pending: '/admin/projects',
  // the Media Team's home, filtered to what waits
  media_referrals_new: '/media?state=pending',
  media_review_waiting: '/media?stage=ready_to_publish',
  media_sent_back: '/media?stage=in_review',
  media_on_hold: '/media?stage=on_hold',
  // the device's own items: records that could not be sent and photos still to go open the
  // sync centre; records the office is verifying open the volunteer's waiting list
  sync_failed: '/sync',
  sync_verifying: '/my-applications?tab=pending',
  photos_pending: '/sync',
} as const;

export type AttentionKind = keyof typeof ATTENTION_ROUTES;
export const ATTENTION_KINDS = Object.keys(ATTENTION_ROUTES) as AttentionKind[];

export const attentionItemSchema = z.object({
  kind: z.enum(ATTENTION_KINDS as [AttentionKind, ...AttentionKind[]]),
  count: z.number().int().positive(),
  href: z.string(),
});
export type AttentionItem = z.infer<typeof attentionItemSchema>;

/** Days ahead in which the end of an application window counts as near. */
export const DEADLINE_SOON_DAYS = 7;
/** Days back in which a decided edit request is still news to its volunteer. */
export const EDIT_ANSWERED_DAYS = 7;
