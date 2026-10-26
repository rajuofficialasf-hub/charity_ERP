import { z } from 'zod';
import { LIST_CODE, mediaScriptSchema } from '../jsonb/media.js';
import {
  CONTENT_TYPES,
  MEDIA_PRIORITIES,
  PUBLICATION_STATES,
  REFERRAL_DECISIONS,
  SCRIPT_STATES,
} from './rules.js';
import { LINK_MAX } from './links.js';

/** A code of a reference list (a stage, a production role, a platform). */
const listCode = z.string().regex(LIST_CODE);
const text = (max: number) => z.string().trim().min(1).max(max);
const day = z.iso.date();

/** Every decision but the agreeing one carries its comment or reason. */
const commentUnless = (agree: string) => (d: { decision: string; comment?: string }) =>
  d.decision === agree || d.comment !== undefined;
const commentRequired = { path: ['comment'], message: 'required' };

/** A referral of an approved application, or the same referral sent again after a correction. */
export const referralCreateSchema = z.strictObject({
  priority: z.enum(MEDIA_PRIORITIES),
  note: text(2000),
  story: text(10000).optional(),
});
export type ReferralCreate = z.infer<typeof referralCreateSchema>;

/** A decision on a referral: sending back needs a comment, rejecting a reason. */
export const referralDecisionSchema = z
  .strictObject({
    decision: z.enum(REFERRAL_DECISIONS),
    comment: text(2000).optional(),
  })
  .refine(commentUnless('accept'), commentRequired);
export type ReferralDecisionBody = z.infer<typeof referralDecisionSchema>;

/** A change to a work: its title, stage, content type or script. */
export const workUpdateSchema = z
  .strictObject({
    title: text(200).optional(),
    stageCode: listCode.optional(),
    contentType: z.enum(CONTENT_TYPES).optional(),
    script: mediaScriptSchema.optional(),
    scriptState: z.enum(SCRIPT_STATES).optional(),
  })
  .refine((w) => Object.keys(w).length > 0, { message: 'empty' });
export type WorkUpdate = z.infer<typeof workUpdateSchema>;

/** The whole team of a work, each member with one or more production roles. */
export const membersSchema = z.strictObject({
  members: z
    .array(
      z.strictObject({
        userId: z.uuid(),
        roles: z.array(listCode).min(1).max(10),
      }),
    )
    .max(50)
    .refine((m) => new Set(m.map((x) => x.userId)).size === m.length, { message: 'duplicate' }),
});
export type MembersBody = z.infer<typeof membersSchema>;

const publicationFields = {
  state: z.enum(PUBLICATION_STATES),
  publishedOn: day.optional(),
  link: z.string().trim().min(1).max(LINK_MAX).optional(),
  note: text(2000).optional(),
};
/**
 * A published post needs its link and its date. A change is checked on the stored row with the
 * change applied, so a waiting post cannot become published without them.
 */
export const publishedHasLink = (p: {
  state?: string;
  link?: string | null;
  publishedOn?: string | null;
}) =>
  p.state !== 'published' ||
  (p.link !== undefined &&
    p.link !== null &&
    p.publishedOn !== undefined &&
    p.publishedOn !== null);

export const publicationCreateSchema = z
  .strictObject({ platformCode: listCode, ...publicationFields })
  .refine(publishedHasLink, { path: ['link'], message: 'required' });
export type PublicationCreate = z.infer<typeof publicationCreateSchema>;

export const publicationUpdateSchema = z
  .strictObject({
    state: publicationFields.state.optional(),
    publishedOn: publicationFields.publishedOn,
    link: publicationFields.link,
    note: publicationFields.note,
  })
  .refine((p) => Object.keys(p).length > 0, { message: 'empty' });
export type PublicationUpdate = z.infer<typeof publicationUpdateSchema>;

/** The final review: approve, or send the work back with a comment. */
export const reviewSchema = z
  .strictObject({
    decision: z.enum(['approve', 'send_back']),
    comment: text(2000).optional(),
  })
  .refine(commentUnless('approve'), commentRequired);
export type ReviewBody = z.infer<typeof reviewSchema>;

export const commentSchema = z.strictObject({ body: text(4000) });
