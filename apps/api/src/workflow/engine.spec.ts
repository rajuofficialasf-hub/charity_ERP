import { APPLICATION_ACTIONS, APPLICATION_ACTION_NAMES } from '@css/shared';
import { describe, expect, it } from 'vitest';
import { loadAccessRegistry } from '../access/registry';
import { assertWorkflowNamesKnown, DECLARED_GUARDS, isBuiltGuard } from './registry';
import { mergedWorkflowDefinitions } from './templates';

// The engine's configuration: the action table against the templates, and the registry that
// keeps a template from naming what nobody built.
const definitions = mergedWorkflowDefinitions();
const common = definitions.find((d) => d.template === '_common')!;
const froms = (from: string | string[]) => (Array.isArray(from) ? from : [from]);

describe('the action table', () => {
  it('maps every action to exactly one transition of the common cycle, per state it leaves', () => {
    for (const action of APPLICATION_ACTION_NAMES) {
      const spec = APPLICATION_ACTIONS[action];
      for (const from of spec.from) {
        const matches = (common.transitions ?? []).filter(
          (t) => t.to === spec.to && froms(t.from).includes(from),
        );
        expect(matches, `${action} from ${from}`).toHaveLength(1);
        expect(matches[0]!.permission, `${action} needs a permission`).toBeDefined();
      }
    }
  });

  it('holds the return of a rejected application, the waitlist, the pull and both verifications', () => {
    expect(APPLICATION_ACTIONS.return_to_review).toMatchObject({
      from: ['rejected'],
      to: 'reviewed',
    });
    expect(APPLICATION_ACTIONS.waitlist).toEqual({
      from: ['reviewed'],
      to: 'waitlisted',
      texts: 'reason',
    });
    expect(APPLICATION_ACTIONS.pull_from_waitlist).toEqual({
      from: ['waitlisted'],
      to: 'approved',
      texts: 'none',
    });
    // both verifications make the same move; the service tells a link from a new profile
    expect(APPLICATION_ACTIONS.verify_link.to).toBe('submitted');
    expect(APPLICATION_ACTIONS.verify_create.to).toBe('submitted');
    expect(Object.values(APPLICATION_ACTIONS).some((a) => 'later' in a)).toBe(false);
    expect(APPLICATION_ACTIONS.reject.texts).toBe('reason_and_message');
  });
});

describe('the templates at version 3', () => {
  it('are all at version 3 and name only built or declared guards, effects and permissions', () => {
    for (const d of definitions) expect(d.version, d.template).toBe(3);
    const permissions = loadAccessRegistry();
    expect(() =>
      assertWorkflowNamesKnown(definitions, permissions.isKnownPermission),
    ).not.toThrow();
  });

  it('refuse a decision by the person who brought the application, in every template', () => {
    const decisions = ['approved', 'rejected', 'waitlisted'];
    for (const d of definitions) {
      if (d.template === '_common') continue;
      for (const t of d.transitions ?? []) {
        const decision =
          decisions.includes(t.to) && !froms(t.from).includes('needs_verification') && !t.auto;
        if (decision)
          expect(t.guards, `${d.template}: ${froms(t.from).join('/')} → ${t.to}`).toContain(
            'actor.not_creator',
          );
      }
    }
  });

  it('name no transition of the review cycle that reaches a declared guard', () => {
    const inScope = [
      'submitted',
      'under_review',
      'reviewed',
      'waitlisted',
      'approved',
      'rejected',
      'deleted',
    ];
    for (const t of common.transitions ?? []) {
      if (!inScope.includes(t.to) || t.auto) continue;
      for (const g of t.guards ?? []) expect(isBuiltGuard(g), `${t.to}: ${g}`).toBe(true);
    }
  });

  it('fails the check for a name nobody built or declared', () => {
    const broken = structuredClone(common);
    broken.transitions![0]!.guards = ['person.is_nice'];
    broken.transitions![1]!.effects = ['teleport:home'];
    broken.transitions![2]!.permission = 'application.wish';
    expect(() => assertWorkflowNamesKnown([broken], () => false)).toThrow(
      /unknown guard person\.is_nice[\s\S]*unknown effect teleport:home[\s\S]*unknown permission application\.wish/,
    );
    expect(DECLARED_GUARDS).toContain('photos.required_per_rule');
  });
});
