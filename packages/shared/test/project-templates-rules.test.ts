import { describe, expect, it } from 'vitest';
import { COMPONENT_KEYS } from '../src/components.js';
import { componentSettingsSchemas } from '../src/jsonb/component-settings.js';
import {
  acceptsEveryPart,
  ASSIGN_MAX,
  assignmentCreateSchema,
  assignmentUpdateSchema,
  applicationsLeft,
  APPLICATION_CAPABILITIES,
  BD10_COPIED,
  consentSchema,
  copiedSettings,
  defaultPermissionSet,
  definitionOf,
  missingRuleParts,
  NOT_COPIED,
  PERMISSION_SETS,
  permissionSetAllowed,
  PROJECT_BOUND_SETTINGS,
  projectRulesSchema,
  requiredRuleParts,
  RULES_PARTS,
  TEAM_LEAD_TYPES,
  teamCapabilities,
  templateDefinitionSchema,
} from '../src/projects/index.js';
import { VOLUNTEER_TYPES } from '../src/registration/index.js';

const text = (bn: string, en = `${bn} en`) => ({ bn, en });
const allRules = {
  volunteer_duties: text('দায়িত্ব'),
  implementation_process: text('প্রক্রিয়া'),
  daee_duties: text('দায়ীর দায়িত্ব'),
  misconduct: text('অনিয়ম'),
};

describe('the rules texts', () => {
  it('takes the four parts in both languages and nothing else', () => {
    expect(projectRulesSchema.safeParse(allRules).success).toBe(true);
    expect(projectRulesSchema.safeParse({}).success).toBe(true);
    expect(projectRulesSchema.safeParse({ ...allRules, extra: text('x') }).success).toBe(false);
    expect(projectRulesSchema.safeParse({ misconduct: { bn: 'অনিয়ম' } }).success).toBe(false);
    expect(projectRulesSchema.safeParse({ misconduct: text('x'.repeat(10_001)) }).success).toBe(
      false,
    );
  });

  it('needs the Local দায়ী duties only while dawah is on', () => {
    expect(requiredRuleParts(false)).toEqual([
      'volunteer_duties',
      'implementation_process',
      'misconduct',
    ]);
    expect(requiredRuleParts(true)).toEqual([...RULES_PARTS]);
  });

  it('lists the required parts that are empty in either language', () => {
    expect(missingRuleParts(allRules, true)).toEqual([]);
    expect(missingRuleParts({}, false)).toEqual([
      'volunteer_duties',
      'implementation_process',
      'misconduct',
    ]);
    const { daee_duties: _unused, ...withoutDaee } = allRules;
    expect(missingRuleParts(withoutDaee, false)).toEqual([]);
    expect(missingRuleParts(withoutDaee, true)).toEqual(['daee_duties']);
    expect(
      missingRuleParts({ ...allRules, misconduct: { bn: '  ', en: 'Misconduct' } }, false),
    ).toEqual(['misconduct']);
    // rules that cannot be read miss every part
    expect(missingRuleParts('broken', false)).toHaveLength(3);
  });

  it('takes a consent with its version, a decision and each part once', () => {
    expect(consentSchema.parse({ rulesVersion: 2, decision: 'refused' }).parts).toEqual([]);
    expect(
      consentSchema.safeParse({
        rulesVersion: 1,
        decision: 'accepted',
        parts: ['misconduct', 'misconduct'],
      }).success,
    ).toBe(false);
    expect(consentSchema.safeParse({ rulesVersion: 0, decision: 'accepted' }).success).toBe(false);
    expect(consentSchema.safeParse({ rulesVersion: 1, decision: 'maybe' }).success).toBe(false);
  });

  it('accepts only when every part the volunteer had to read is named', () => {
    const three = ['volunteer_duties', 'implementation_process', 'misconduct'] as const;
    expect(acceptsEveryPart(three, false)).toBe(true);
    expect(acceptsEveryPart(three, true)).toBe(false);
    expect(acceptsEveryPart(['volunteer_duties'], false)).toBe(false);
  });
});

describe('templates and copies', () => {
  it('covers BD-10: what a copy takes and what it never takes', () => {
    expect(Object.keys(BD10_COPIED).sort()).toEqual(
      [
        'components_and_settings',
        'dawah_syllabus',
        'document_checklist',
        'expense_categories',
        'form_as_version_1',
        'issue_types',
        'photo_rule',
        'rating_criteria',
        'scoring_criteria',
        'workflow_stages',
      ].sort(),
    );
    // the three without storage yet are the form, the document checklist and the scoring criteria
    expect(
      Object.entries(BD10_COPIED)
        .filter(([, where]) => where === 'later')
        .map(([item]) => item)
        .sort(),
    ).toEqual(['document_checklist', 'form_as_version_1', 'scoring_criteria']);
    // BD-10's list, and the setup parts that belong to one project only
    expect([...NOT_COPIED].sort()).toEqual(
      [
        'applications',
        'beneficiaries',
        'budget_amounts',
        'dates',
        'volunteer_assignments',
        'ratings',
        'categories',
        'logs',
        'quota_targets',
        'fund_sources',
        'areas',
        'staff_access',
      ].sort(),
    );
  });

  it('sorts every settings key into copied or bound to the source project', () => {
    // a new settings key fails here until it is placed in one of the two groups
    const keys = Object.entries(componentSettingsSchemas).flatMap(([definition, schema]) =>
      Object.keys(schema.shape).map((key) => `${definition}.${key}`),
    );
    const bound = Object.entries(PROJECT_BOUND_SETTINGS).flatMap(([component, list]) =>
      (list ?? []).map((key) => `${component}.${key}`),
    );
    expect(bound.sort()).toEqual([
      'application_form.form_ids',
      'public_link.form_ids',
      'public_link.token',
    ]);
    expect(keys.filter((key) => !bound.includes(key)).sort()).toEqual(
      [
        'application_form.beneficiary_class_options',
        'application_form.application_kinds',
        'public_link.enabled',
        'volunteer_assignment.team_members_allowed',
        'photo_rule.rule',
        'photo_rule.source',
        'photo_rule.dedup_identical',
        'stages.list',
        'issue_log.issue_types',
        'volunteer_expenses.categories',
        'rating_criteria.criteria',
        'scoring.criteria',
        'follow_up.questions',
        'dawah.family_attendance',
        'dawah.gender_split',
      ].sort(),
    );
  });

  const source = {
    workflowKey: 'distribution' as const,
    components: COMPONENT_KEYS.map((componentKey) => ({
      componentKey,
      enabled: componentKey === 'distribution' || componentKey === 'public_link',
      settings:
        componentKey === 'distribution'
          ? { rule: 'group' }
          : componentKey === 'public_link'
            ? { enabled: true, token: 'a'.repeat(32), form_ids: [] }
            : componentKey === 'application_form'
              ? {
                  form_ids: ['0190a4c4-0000-7000-8000-000000000001'],
                  beneficiary_class_options: [],
                }
              : {},
    })),
    syllabus: [{ title: text('তাওহীদ') }],
    rules: allRules,
  };

  it('builds a definition of only the copied parts, without the source project links', () => {
    const definition = definitionOf(source);
    expect(Object.keys(definition).sort()).toEqual([
      'components',
      'rules',
      'syllabus',
      'workflowKey',
    ]);
    const settings = (key: string) =>
      definition.components.find((c) => c.componentKey === key)!.settings;
    expect(settings('distribution')).toEqual({ rule: 'group' });
    // a copy never answers on the source's public link or reuses its forms
    expect(settings('public_link')).toEqual({ enabled: true });
    expect(settings('application_form')).toEqual({ beneficiary_class_options: [] });
    expect(definition.syllabus).toEqual([text('তাওহীদ')]);
    expect(definition.rules).toEqual(allRules);
  });

  it('round-trips a definition through its schema and refuses a broken one', () => {
    const definition = definitionOf(source);
    expect(templateDefinitionSchema.parse(JSON.parse(JSON.stringify(definition)))).toEqual(
      definition,
    );
    expect(
      templateDefinitionSchema.safeParse({ ...definition, budget: { cost: '100' } }).success,
    ).toBe(false);
    expect(
      templateDefinitionSchema.safeParse({
        ...definition,
        components: [...definition.components, definition.components[0]],
      }).success,
    ).toBe(false);
    // settings must fit their component, or be empty (a choice left open)
    const withSettings = (componentKey: string, settings: Record<string, unknown>) => ({
      ...definition,
      components: definition.components.map((c) =>
        c.componentKey === componentKey ? { ...c, settings } : c,
      ),
    });
    expect(
      templateDefinitionSchema.safeParse(withSettings('distribution', { rule: 'anything' }))
        .success,
    ).toBe(false);
    expect(templateDefinitionSchema.safeParse(withSettings('distribution', {})).success).toBe(true);
    expect(
      templateDefinitionSchema.safeParse(withSettings('dispatch_receive', { secret: 'x' })).success,
    ).toBe(false);
    // settings of a source that do not fit are copied as none
    expect(
      definitionOf({
        ...source,
        components: [{ componentKey: 'stages', enabled: true, settings: { list: 'broken' } }],
      }).components[0]!.settings,
    ).toEqual({});
    // unreadable rules of a source are copied as none
    expect(definitionOf({ ...source, rules: 'broken' }).rules).toEqual({});
  });

  it('keeps the settings of a component without project-bound keys as they are', () => {
    const settings = { list: [{ key: 'foundation', label: text('ভিত') }] };
    expect(copiedSettings('stages', settings)).toEqual(settings);
  });
});

describe('assignment and teams', () => {
  it('starts the permission set from the volunteer type', () => {
    expect(defaultPermissionSet('general')).toBe('application_distribution');
    expect(defaultPermissionSet('local_daee')).toBe('application_distribution_dawah');
    expect(defaultPermissionSet('both')).toBe('application_distribution_dawah');
    expect(defaultPermissionSet('paid')).toBe('work_progress');
    expect(defaultPermissionSet('team_member')).toBeNull();
    // the default is always a set the type may hold
    for (const type of VOLUNTEER_TYPES) {
      const set = defaultPermissionSet(type);
      if (set) expect(permissionSetAllowed(set, type), type).toBe(true);
    }
  });

  it('gives a set only to the types it is meant for; the dawah set only to a teacher', () => {
    expect(permissionSetAllowed('application_distribution_dawah', 'general')).toBe(false);
    expect(permissionSetAllowed('application_distribution_dawah', 'local_daee')).toBe(true);
    expect(permissionSetAllowed('application_distribution', 'local_daee')).toBe(false);
    expect(permissionSetAllowed('application_distribution', 'both')).toBe(true);
    expect(permissionSetAllowed('application_distribution_dawah', 'both')).toBe(true);
    expect(permissionSetAllowed('work_progress', 'general')).toBe(false);
    expect(permissionSetAllowed('work_progress', 'paid')).toBe(true);
    for (const set of PERMISSION_SETS)
      expect(permissionSetAllowed(set, 'team_member'), set).toBe(false);
  });

  it('lets General and Both volunteers lead a team', () => {
    expect(VOLUNTEER_TYPES.filter((t) => TEAM_LEAD_TYPES.includes(t))).toEqual(['general', 'both']);
  });

  it('follows the team table: a member creates and edits own drafts but never submits', () => {
    const member = teamCapabilities('member');
    expect([...member].sort()).toEqual(['create', 'edit_own_draft', 'view_approved_basic']);
    for (const never of ['submit', 'edit_pending', 'delete_pending', 'delete_draft'] as const)
      expect(member.has(never), never).toBe(false);
    expect([...teamCapabilities('main')].sort()).toEqual([...APPLICATION_CAPABILITIES].sort());
  });

  it('counts the applications left under the limit', () => {
    expect(applicationsLeft(50, 12)).toBe(38);
    expect(applicationsLeft(50, 60)).toBe(0);
    expect(applicationsLeft(null, 12)).toBeNull();
  });
});

describe('assignment requests', () => {
  const id = (n: number) => `0190a4c4-0000-7000-8000-${String(n).padStart(12, '0')}`;
  it('takes up to the maximum of different volunteers, each with a known set', () => {
    const many = (k: number) => ({
      volunteers: Array.from({ length: k }, (_, i) => ({ volunteerId: id(i) })),
    });
    expect(assignmentCreateSchema.parse(many(2)).volunteers[0]).toEqual({
      volunteerId: id(0),
      isPaid: false,
    });
    expect(assignmentCreateSchema.safeParse(many(ASSIGN_MAX)).success).toBe(true);
    expect(assignmentCreateSchema.safeParse(many(ASSIGN_MAX + 1)).success).toBe(false);
    expect(assignmentCreateSchema.safeParse(many(0)).success).toBe(false);
    expect(
      assignmentCreateSchema.safeParse({
        volunteers: [{ volunteerId: id(1) }, { volunteerId: id(1) }],
      }).success,
    ).toBe(false);
    expect(
      assignmentCreateSchema.safeParse({
        volunteers: [{ volunteerId: id(1), permissionSet: 'everything' }],
      }).success,
    ).toBe(false);
  });

  it('changes the set or the paid flag, at least one', () => {
    expect(assignmentUpdateSchema.safeParse({ isPaid: true }).success).toBe(true);
    expect(assignmentUpdateSchema.safeParse({}).success).toBe(false);
    expect(assignmentUpdateSchema.safeParse({ permissionSet: 'work_progress', x: 1 }).success).toBe(
      false,
    );
  });
});
