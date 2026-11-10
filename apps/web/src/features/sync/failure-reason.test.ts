import { describe, expect, it } from 'vitest';
import { failureReason } from './failure-reason';

const known: Record<string, string> = {
  'application.answer_not_in_list': '“{question}” প্রশ্নের উত্তরটি এখন আর তালিকায় নেই।',
  'sync.deadline_passed': 'প্রকল্পের শেষ তারিখ পার হয়ে গেছে।',
};
const te = Object.assign(
  (key: never, values?: never) => {
    const values_ = (values ?? {}) as Record<string, string>;
    return known[key as string]!.replace(/\{(\w+)\}/g, (_, name: string) => values_[name] ?? '');
  },
  { has: (key: never) => key in known },
);

describe('the reason of a refused record', () => {
  it('words a known code with the values it names', () => {
    expect(
      failureReason(te, 'application.answer_not_in_list', { question: 'লিঙ্গ' }, 'অজানা'),
    ).toBe('“লিঙ্গ” প্রশ্নের উত্তরটি এখন আর তালিকায় নেই।');
    expect(failureReason(te, 'sync.deadline_passed', null, 'অজানা')).toBe(
      'প্রকল্পের শেষ তারিখ পার হয়ে গেছে।',
    );
  });

  it('falls back for an unknown code or none', () => {
    expect(failureReason(te, 'something.else', null, 'অজানা')).toBe('অজানা');
    expect(failureReason(te, null, null, 'অজানা')).toBe('অজানা');
  });
});
