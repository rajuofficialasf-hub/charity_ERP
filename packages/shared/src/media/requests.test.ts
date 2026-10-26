import { describe, expect, it } from 'vitest';
import {
  commentSchema,
  consentRecordSchema,
  membersSchema,
  publicationCreateSchema,
  publicationUpdateSchema,
  publishedHasLink,
  referralCreateSchema,
  referralDecisionSchema,
  reviewSchema,
  workUpdateSchema,
} from './requests';

const U = '01900000-0000-7000-8000-000000000001';

describe('the media request bodies', () => {
  it('take a referral with a priority and a note, the story optional', () => {
    expect(referralCreateSchema.safeParse({ priority: 'high', note: 'নোট' }).success).toBe(true);
    expect(
      referralCreateSchema.safeParse({ priority: 'high', note: 'নোট', story: 'গল্প' }).success,
    ).toBe(true);
    expect(referralCreateSchema.safeParse({ priority: 'urgent', note: 'নোট' }).success).toBe(false);
    expect(referralCreateSchema.safeParse({ priority: 'low', note: '  ' }).success).toBe(false);
    expect(
      referralCreateSchema.safeParse({ priority: 'low', note: 'নোট', projectId: U }).success,
    ).toBe(false);
  });

  it('ask a comment to send back or reject, and none to accept', () => {
    expect(referralDecisionSchema.safeParse({ decision: 'accept' }).success).toBe(true);
    expect(referralDecisionSchema.safeParse({ decision: 'send_back' }).success).toBe(false);
    expect(referralDecisionSchema.safeParse({ decision: 'reject', comment: 'কারণ' }).success).toBe(
      true,
    );
    expect(reviewSchema.safeParse({ decision: 'send_back' }).success).toBe(false);
    expect(reviewSchema.safeParse({ decision: 'approve' }).success).toBe(true);
  });

  it('take a change to a work, never an empty one or an unknown script part', () => {
    expect(workUpdateSchema.safeParse({ stageCode: 'editing' }).success).toBe(true);
    expect(workUpdateSchema.safeParse({}).success).toBe(false);
    expect(workUpdateSchema.safeParse({ script: { summary: 'সার' } }).success).toBe(true);
    expect(workUpdateSchema.safeParse({ script: { plot: 'x' } }).success).toBe(false);
    expect(workUpdateSchema.safeParse({ contentType: 'audio' }).success).toBe(false);
  });

  it('take a team with at least one role each and no one twice', () => {
    expect(
      membersSchema.safeParse({ members: [{ userId: U, roles: ['cinematographer'] }] }).success,
    ).toBe(true);
    expect(membersSchema.safeParse({ members: [{ userId: U, roles: [] }] }).success).toBe(false);
    expect(
      membersSchema.safeParse({
        members: [
          { userId: U, roles: ['director'] },
          { userId: U, roles: ['video_editor'] },
        ],
      }).success,
    ).toBe(false);
  });

  it('ask a published post for its link and date', () => {
    expect(
      publicationCreateSchema.safeParse({ platformCode: 'asf_youtube', state: 'waiting' }).success,
    ).toBe(true);
    expect(
      publicationCreateSchema.safeParse({ platformCode: 'asf_youtube', state: 'published' })
        .success,
    ).toBe(false);
    expect(
      publicationCreateSchema.safeParse({
        platformCode: 'asf_youtube',
        state: 'published',
        link: 'https://youtu.be/dQw4w9WgXcQ',
        publishedOn: '2026-10-26',
      }).success,
    ).toBe(true);
  });

  it('refuse an empty change to a publication, and check a change on the stored row', () => {
    expect(publicationUpdateSchema.safeParse({}).success).toBe(false);
    expect(publicationUpdateSchema.safeParse({ state: 'published' }).success).toBe(true);
    const stored = { state: 'waiting', link: null, publishedOn: null };
    expect(publishedHasLink({ ...stored, state: 'published' })).toBe(false);
    expect(
      publishedHasLink({
        ...stored,
        state: 'published',
        link: 'https://youtu.be/dQw4w9WgXcQ',
        publishedOn: '2026-10-26',
      }),
    ).toBe(true);
  });

  it('take a comment of at most 4000 characters', () => {
    expect(commentSchema.safeParse({ body: 'শুটিং 2 নভেম্বর' }).success).toBe(true);
    expect(commentSchema.safeParse({ body: ' ' }).success).toBe(false);
    expect(commentSchema.safeParse({ body: 'ক'.repeat(4001) }).success).toBe(false);
  });

  it('take consent with its channels', () => {
    expect(consentRecordSchema.safeParse({ granted: true, channels: ['video'] }).success).toBe(
      true,
    );
    expect(consentRecordSchema.safeParse({ granted: true, channels: ['Video!'] }).success).toBe(
      false,
    );
  });
});
