import { describe, expect, it } from 'vitest';
import { attentionCounts, placeOf } from './navigation';

const HEAD = { kind: 'staff' as const, roles: ['department_head'] };
const PM = { kind: 'staff' as const, roles: ['program_manager'] };

describe('placeOf', () => {
  it('finds the destination of a page and its group, also for a page under it', () => {
    expect(placeOf(HEAD, '/admin/audit')).toMatchObject({ group: 'admin', item: { key: 'audit' } });
    expect(placeOf(HEAD, '/admin/volunteers/0190')).toMatchObject({
      group: 'people',
      item: { key: 'volunteers' },
    });
    expect(placeOf(HEAD, '/')).toMatchObject({ group: 'work', item: { key: 'my_work' } });
  });

  it('finds nothing for a page outside the sidebar or a destination the person does not have', () => {
    expect(placeOf(HEAD, '/account/profile')).toBeNull();
    expect(placeOf(PM, '/admin/audit')).toBeNull();
  });
});

describe('attentionCounts', () => {
  it('adds up the counts of one destination and drops the address filters', () => {
    expect(
      attentionCounts(HEAD, [
        { href: '/admin/registrations', count: 2 },
        { href: '/admin/registrations?tab=edits', count: 1 },
        { href: '/admin/projects?status=draft', count: 4 },
      ]),
    ).toEqual({ registrations: 3, projects: 4 });
  });

  it('leaves out what has no destination of the person: the inbox, the home, a list not theirs', () => {
    expect(
      attentionCounts(PM, [
        { href: '/notifications', count: 5 },
        { href: '/', count: 1 },
        { href: '/admin/handover', count: 2 },
      ]),
    ).toEqual({});
  });
});
