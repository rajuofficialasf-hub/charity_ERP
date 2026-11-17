import { describe, expect, it } from 'vitest';
import { attentionCounts, moreFor, placeOf, sidebarFor, tabsFor } from './navigation';

const HEAD = { kind: 'staff' as const, roles: ['department_head'] };
const PM = { kind: 'staff' as const, roles: ['program_manager'] };
const ROLES = [
  'department_head',
  'monitoring_team',
  'program_manager',
  'regional_program_manager',
  'project_executive',
  'official_daee',
  'finance_team',
  'media_team',
  'procurement_team',
];

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

describe('the programs and projects tab', () => {
  it('is one destination: no role has the programs of their own in the sidebar or "more"', () => {
    for (const role of ROLES) {
      const me = { kind: 'staff' as const, roles: [role] };
      const keys = [...sidebarFor(me).flatMap((g) => g.items), ...moreFor(me)].map((i) => i.key);
      expect(keys, role).not.toContain('programs');
      expect(
        sidebarFor(me)
          .flatMap((g) => g.items)
          .filter((i) => i.href.startsWith('/admin/projects')),
        role,
      ).toHaveLength(
        [
          'department_head',
          'monitoring_team',
          'program_manager',
          'regional_program_manager',
          'project_executive',
          // the list of its house-construction sessions only
          'procurement_team',
        ].includes(role)
          ? 1
          : 0,
      );
    }
    // the phone's tab opens the same tab under its short name
    expect(tabsFor(PM).find((t) => t.href === '/admin/projects')?.key).toBe('projects_tab');
  });

  it('is the place of the program and project pages under it', () => {
    for (const path of ['/admin/projects/series/x', '/admin/projects/programs/x'])
      expect(placeOf(PM, path)).toMatchObject({ group: 'work', item: { key: 'projects' } });
  });

  it('counts the attention of the list in it', () => {
    expect(
      attentionCounts(PM, [
        { href: '/admin/projects?view=list', count: 2 },
        { href: '/admin/projects?status=draft', count: 1 },
      ]),
    ).toEqual({ projects: 3 });
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
