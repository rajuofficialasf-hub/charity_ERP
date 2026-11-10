import { USER_STATES } from '@css/shared/auth';
import { z } from 'zod';
import { dateTime, versionedOf } from './common';

/** The kinds of pending work a handover moves, in the order the page shows them. */
export const handoverCategorySchema = z.enum([
  'reviews_approvals',
  'projects',
  'documents',
  'issues',
  'followups',
]);
export type HandoverCategory = z.infer<typeof handoverCategorySchema>;

/** One piece of pending work (`GET /users/{userId}/handover`). */
export const pendingItemSchema = z.object({
  category: handoverCategorySchema,
  itemType: z.string(),
  itemId: z.uuid(),
  projectId: z.uuid().nullable(),
  label: z.string(),
});
export type PendingItem = z.infer<typeof pendingItemSchema>;

/** An official's handover: the work still on them and, once done, when it was completed. */
export const handoverViewSchema = z.object({
  id: z.uuid().nullable(),
  fromUserId: z.uuid(),
  pending: z.array(pendingItemSchema),
  outstandingCount: z.number().int(),
  completedAt: dateTime.nullable(),
});
export type HandoverView = z.infer<typeof handoverViewSchema>;

/** The official whose work is handed over, with the version a deactivation carries back. */
export const handoverAccountSchema = versionedOf(
  z.object({ id: z.uuid(), displayName: z.string(), state: z.enum(USER_STATES) }),
);
export type HandoverAccount = z.infer<typeof handoverAccountSchema>;
