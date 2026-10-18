import { z } from 'zod';

/**
 * The kinds of "needs your attention" items on the My Work home, and the page each one opens.
 * An item is counted as the list it opens counts it.
 */
export const ATTENTION_ROUTES = {
  unread_notifications: '/notifications',
  consent_pending: '/my-projects',
  corrections: '/account/profile',
  edit_answered: '/account/profile',
  registrations_pending: '/admin/registrations',
  edit_requests_pending: '/admin/registrations',
  projects_draft: '/admin/projects?status=draft',
  deadlines_soon: '/admin/projects?status=active',
  handovers_open: '/admin/handover',
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
