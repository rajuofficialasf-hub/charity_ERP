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
