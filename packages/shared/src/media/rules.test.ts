import { describe, expect, it } from 'vitest';
import {
  clearsReview,
  consentAllows,
  decisionState,
  isSystemStage,
  mayDecide,
  mayMoveStage,
  mayPublish,
  mayResend,
  mayReview,
  nextStages,
  withdrawnChannels,
} from './rules';

const ORDINARY = [
  'planning',
  'script',
  'shooting_preparation',
  'shooting_done',
  'editing',
  'internal_review',
];

describe('a referral', () => {
  it('is decided only while pending, into the state of its decision', () => {
    expect(mayDecide('pending')).toBe(true);
    for (const state of ['accepted', 'sent_back', 'rejected'] as const)
      expect(mayDecide(state), state).toBe(false);
    expect(decisionState('accept')).toBe('accepted');
    expect(decisionState('send_back')).toBe('sent_back');
    expect(decisionState('reject')).toBe('rejected');
  });

  it('is sent again only after it was sent back or rejected', () => {
    expect(mayResend('sent_back')).toBe(true);
    expect(mayResend('rejected')).toBe(true);
    expect(mayResend('pending')).toBe(false);
    expect(mayResend('accepted')).toBe(false);
  });
});

describe('the stages of a work', () => {
  it('lets the team move forward and back among the ordinary stages and to ready to publish', () => {
    expect(nextStages('script', ORDINARY, false)).toEqual([
      'planning',
      'shooting_preparation',
      'shooting_done',
      'editing',
      'internal_review',
      'ready_to_publish',
    ]);
    expect(mayMoveStage('editing', 'planning', ORDINARY, false)).toBe(true);
    // from the first stage and back from a send-back or ready to publish
    expect(mayMoveStage('accepted', 'planning', ORDINARY, false)).toBe(true);
    expect(mayMoveStage('in_review', 'editing', ORDINARY, false)).toBe(true);
    // a work sent back is reworked before it is ready again
    expect(mayMoveStage('in_review', 'ready_to_publish', ORDINARY, false)).toBe(false);
    expect(mayMoveStage('ready_to_publish', 'editing', ORDINARY, false)).toBe(true);
  });

  it('never moves anyone to accepted, published or in review by hand', () => {
    for (const to of ['accepted', 'published', 'in_review'])
      for (const director of [false, true])
        expect(mayMoveStage('editing', to, ORDINARY, director), `${to} ${director}`).toBe(false);
  });

  it('keeps done, on hold and cancelled for the directors', () => {
    for (const to of ['done', 'on_hold', 'cancelled'])
      expect(mayMoveStage('editing', to, ORDINARY, false), to).toBe(false);
    expect(mayMoveStage('editing', 'on_hold', ORDINARY, true)).toBe(true);
    expect(mayMoveStage('editing', 'cancelled', ORDINARY, true)).toBe(true);
    expect(nextStages('published', ORDINARY, true)).toEqual(['done', 'cancelled']);
    expect(nextStages('published', ORDINARY, false)).toEqual([]);
  });

  it('moves nothing out of done or cancelled, and a work on hold only by resuming it', () => {
    expect(nextStages('done', ORDINARY, true)).toEqual(['cancelled']);
    expect(nextStages('cancelled', ORDINARY, false)).toEqual([]);
    expect(nextStages('on_hold', ORDINARY, false)).toEqual([]);
    expect(nextStages('on_hold', ORDINARY, true)).toEqual(['cancelled']);
  });

  it('tells the stages the rules need from the ordinary ones', () => {
    for (const s of [
      'accepted',
      'ready_to_publish',
      'published',
      'done',
      'in_review',
      'on_hold',
      'cancelled',
    ])
      expect(isSystemStage(s), s).toBe(true);
    expect(isSystemStage('editing')).toBe(false);
  });

  it('reviews only a work ready to publish, and a move back to the team withdraws the approval', () => {
    expect(mayReview('ready_to_publish')).toBe(true);
    expect(mayReview('editing')).toBe(false);
    expect(clearsReview('editing')).toBe(true);
    expect(clearsReview('on_hold')).toBe(true);
    expect(clearsReview('published')).toBe(false);
    expect(clearsReview('done')).toBe(false);
  });

  it('publishes only after the final review, while ready to publish or published', () => {
    expect(mayPublish('ready_to_publish', false)).toBe(false);
    expect(mayPublish('ready_to_publish', true)).toBe(true);
    expect(mayPublish('published', true)).toBe(true);
    expect(mayPublish('editing', true)).toBe(false);
  });
});

describe('the media consent', () => {
  const given = { granted: true, channels: ['facebook', 'video'] };

  it('allows a channel only while consent is given for it', () => {
    expect(consentAllows(given, 'video')).toBe(true);
    expect(consentAllows(given, 'print')).toBe(false);
    expect(consentAllows(null, 'video')).toBe(false);
    expect(consentAllows({ granted: false, channels: ['video'] }, 'video')).toBe(false);
  });

  it('names the channels a change withdraws, all of them when consent is taken back', () => {
    expect(withdrawnChannels(given, { granted: true, channels: ['facebook'] })).toEqual(['video']);
    expect(withdrawnChannels(given, { granted: false, channels: [] })).toEqual([
      'facebook',
      'video',
    ]);
    expect(withdrawnChannels(null, { granted: true, channels: [] })).toEqual([]);
    expect(
      withdrawnChannels(given, { granted: true, channels: ['facebook', 'video', 'print'] }),
    ).toEqual([]);
  });
});
