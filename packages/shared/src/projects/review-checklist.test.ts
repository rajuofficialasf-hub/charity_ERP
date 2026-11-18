import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REVIEW_CHECKLIST,
  reviewCheckAnswerSchema,
  reviewChecklist,
} from './review-checklist.js';

// The review checklist a project keeps with its application form: three starting items and no
// requirement unless the project says otherwise, and the project's own list once it has one.
describe('the review checklist of a project', () => {
  it('starts with the identity, the address and the eligibility, and requires nothing', () => {
    expect(reviewChecklist({})).toEqual(DEFAULT_REVIEW_CHECKLIST);
    expect(reviewChecklist(null)).toEqual(DEFAULT_REVIEW_CHECKLIST);
    expect(DEFAULT_REVIEW_CHECKLIST.required).toBe(false);
    expect(DEFAULT_REVIEW_CHECKLIST.items.map((i) => i.code)).toEqual([
      'identity',
      'address',
      'eligibility',
    ]);
  });

  it('reads the project’s own items and switch, an empty list included', () => {
    const own = {
      required: true,
      items: [{ code: 'land_papers', label: { bn: 'জমির কাগজ দেখা', en: 'Land papers seen' } }],
    };
    expect(reviewChecklist({ mobile: 'optional', review_checklist: own })).toEqual(own);
    expect(reviewChecklist({ review_checklist: { required: true, items: [] } })).toEqual({
      required: true,
      items: [],
    });
  });

  it('reads a malformed checklist as the starting one, never half of it', () => {
    expect(reviewChecklist({ review_checklist: { required: 'yes', items: [] } })).toEqual(
      DEFAULT_REVIEW_CHECKLIST,
    );
  });
});

describe('the answer of one checklist item', () => {
  it('takes a fine item without a comment, and drops a comment it was given', () => {
    expect(reviewCheckAnswerSchema.parse({ result: 'ok', comment: 'ঠিক' })).toEqual({
      result: 'ok',
      comment: null,
    });
  });

  it('asks a problem for its comment, at most 500 characters', () => {
    expect(reviewCheckAnswerSchema.safeParse({ result: 'problem' }).success).toBe(false);
    expect(reviewCheckAnswerSchema.safeParse({ result: 'problem', comment: '  ' }).success).toBe(
      false,
    );
    expect(
      reviewCheckAnswerSchema.safeParse({ result: 'problem', comment: 'x'.repeat(501) }).success,
    ).toBe(false);
    expect(reviewCheckAnswerSchema.parse({ result: 'problem', comment: ' দলিল নেই ' })).toEqual({
      result: 'problem',
      comment: 'দলিল নেই',
    });
  });
});
