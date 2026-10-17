import {
  isDemoName,
  isFakeBirthReg,
  isFakeEmail,
  isFakeMobile,
  isFakeNid,
  mergeWorkflowTemplates,
  workflowDefinitionSchema,
} from '@css/shared';
import { SETTING_DEFAULTS } from '@css/shared/settings';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { readPermissionsFile } from '../../seed/sets/base/access';
import { deriveTransitions, readWorkflowTemplates } from '../../seed/sets/base/workflows';
import { DEMO_STAFF } from '../../seed/sets/demo';
import { runSeed, type SeedReport } from '../../seed/run';
import { cloneTemplate } from './support/db';

// Seed framework (T1.3): deterministic, idempotent, fake data only, never outside dev/test.
let db: Client;
let url: string;
let drop: () => Promise<void>;
let first: SeedReport;

const SEEDED_TABLES = [
  'users',
  'locations',
  'reference_lists',
  'roles',
  'permissions',
  'workflow_definitions',
  'workflow_transitions',
  'notification_templates',
  'form_library_fields',
  'form_library_sections',
  'project_templates',
  'settings',
  'programs',
  'user_roles',
  'volunteers',
  'beneficiaries',
  'projects',
  'id_sequences',
  'project_areas',
  'project_components',
];

async function contentHash(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const table of SEEDED_TABLES) {
    const { rows } = await db.query(
      `SELECT md5(coalesce(string_agg(row_to_json(t)::text, '|' ORDER BY row_to_json(t)::text), '')) AS h, count(*)::int AS n FROM "${table}" t`,
    );
    out[table] = `${rows[0].n}:${rows[0].h}`;
  }
  return out;
}

beforeAll(async () => {
  ({ client: db, url, drop } = await cloneTemplate(inject('templateDb')));
  first = await runSeed(db, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: url });
}, 180_000);
afterAll(async () => drop());

describe('seed runner', () => {
  it('is idempotent: a second run changes nothing, not even updated_at', async () => {
    expect(first.totals.inserted).toBeGreaterThan(700);
    const before = await contentHash();
    const second = await runSeed(db, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: url });
    expect({ inserted: second.totals.inserted, updated: second.totals.updated }).toEqual({
      inserted: 0,
      updated: 0,
    });
    expect(await contentHash()).toEqual(before);
  });

  it('refuses production and databases outside the dev/test pattern (BR-024, BD-49)', async () => {
    await expect(
      runSeed(db, ['base'], { NODE_ENV: 'production', DATABASE_URL: url }),
    ).rejects.toThrow(/NODE_ENV is production/);
    await expect(
      runSeed(db, ['base'], {
        NODE_ENV: 'test',
        DATABASE_URL: url.replace(/\/[^/]+$/, '/postgres'),
      }),
    ).rejects.toThrow(/not a css_erp_dev, css_erp_test or css_erp_perf database/);
  });

  it('leaves the seed markers the production guard looks for (O-46 item 8)', async () => {
    const { rows } = await db.query(
      `SELECT key FROM settings WHERE key LIKE 'seed.marker.%' ORDER BY key`,
    );
    expect(rows.map((r) => r.key)).toEqual(['seed.marker.base', 'seed.marker.demo']);
  });
});

describe('base set', () => {
  it('roles and permissions match permissions.yaml exactly', async () => {
    const file = readPermissionsFile();
    const roles = (
      await db.query('SELECT key, name_bn, name_en, kind, global_scope FROM roles ORDER BY key')
    ).rows;
    expect(roles).toEqual(
      Object.entries(file.roles)
        .map(([key, r]) => ({
          key,
          name_bn: r.name_bn,
          name_en: r.name_en,
          kind: r.kind,
          global_scope: r.global_scope,
        }))
        .sort((a, b) => a.key.localeCompare(b.key)),
    );
    const permissions = (
      await db.query('SELECT name, module, sensitive, description FROM permissions ORDER BY name')
    ).rows;
    expect(permissions).toEqual(
      file.permissions
        .map((p) => ({
          name: p.name,
          module: p.module,
          sensitive: p.sensitive,
          description: p.description,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    expect(roles).toHaveLength(15);
    expect(permissions).toHaveLength(145);
  });

  it('stores every workflow template merged and valid, with all its transitions', async () => {
    const templates = readWorkflowTemplates();
    const { rows } = await db.query(
      `SELECT d.key, d.definition, count(t.id)::int AS transitions FROM workflow_definitions d LEFT JOIN workflow_transitions t ON t.workflow_definition_id = d.id GROUP BY d.id ORDER BY d.key COLLATE "C"`,
    );
    // Code-point order on both sides: the database's default collation differs per platform.
    expect(rows.map((r) => r.key)).toEqual(templates.map((t) => t.template).sort());
    for (const r of rows) {
      expect(workflowDefinitionSchema.safeParse(r.definition).success).toBe(true);
      expect(r.transitions).toBe(
        deriveTransitions(mergeWorkflowTemplates(r.key, templates)).length,
      );
    }
  });

  it('seeds the reference lists, notification templates and the two current forms', async () => {
    const lists = (
      await db.query(
        'SELECT list_key, count(*)::int AS n FROM reference_lists GROUP BY list_key ORDER BY list_key',
      )
    ).rows;
    expect(Object.fromEntries(lists.map((l) => [l.list_key, l.n]))).toEqual({
      application_kind_default: 2,
      beneficiary_class_default: 8,
      consent_channel: 5,
      education_level: 6,
      expense_category_default: 5,
      gender: 2,
      issue_type_default: 6,
      marital_status: 6,
      payment_method: 4,
      relationship: 17,
    });
    const notif = (
      await db.query(
        `SELECT count(DISTINCT key)::int AS keys, count(*) FILTER (WHERE locale = 'bn')::int AS bn, count(*) FILTER (WHERE locale = 'en')::int AS en FROM notification_templates`,
      )
    ).rows[0];
    expect(notif.bn).toBe(notif.en);
    expect(notif.keys).toBe(31);
    const forms = (await db.query('SELECT key, project_type FROM project_templates ORDER BY key'))
      .rows;
    expect(forms).toEqual([
      { key: 'form_distribution', project_type: 'distribution' },
      { key: 'form_self_reliance_construction', project_type: 'implementation_evidence' },
    ]);
    expect((await db.query('SELECT count(*)::int AS n FROM form_library_sections')).rows[0].n).toBe(
      10,
    );
  });

  it('seeds every setting with its decided default, once', async () => {
    const rows = (
      await db.query("SELECT key, value FROM settings WHERE key NOT LIKE 'seed.%' ORDER BY key")
    ).rows;
    expect(Object.fromEntries(rows.map((r) => [r.key, r.value]))).toEqual(SETTING_DEFAULTS);
    expect(SETTING_DEFAULTS['monitoring.thresholds']).toMatchObject({
      reviewPendingDays: 7,
      approvalPendingDays: 5,
      noUpdateDays: 7,
      inactiveVolunteerDays: 14,
      budgetAlertPercent: 90,
    });
    // a value the admin changed stays when the seed runs again
    const setReview = (days: number) =>
      db.query(
        `UPDATE settings SET value = jsonb_set(value, '{reviewPendingDays}', $1::jsonb) WHERE key = 'monitoring.thresholds'`,
        [String(days)],
      );
    await setReview(9);
    try {
      await runSeed(db, ['base'], { NODE_ENV: 'test', DATABASE_URL: url });
      const kept = (
        await db.query(`SELECT value FROM settings WHERE key = 'monitoring.thresholds'`)
      ).rows[0].value;
      expect(kept.reviewPendingDays).toBe(9);
    } finally {
      await setReview(7);
    }
  });
});

describe('demo set', () => {
  it('has one account per official role, the Main Admin and the volunteer mix', async () => {
    const byRole = Object.fromEntries(
      (
        await db.query(`SELECT role_key, count(*)::int AS n FROM user_roles GROUP BY role_key`)
      ).rows.map((r) => [r.role_key, r.n]),
    );
    expect(byRole).toEqual({
      department_head: 1,
      monitoring_team: 1,
      program_manager: 3,
      regional_program_manager: 3,
      project_executive: 1,
      official_daee: 1,
      implementer: 1,
      procurement_team: 1,
      media_team: 1,
      finance_team: 1,
      volunteer_general: 16,
      volunteer_both: 1,
      volunteer_local_daee: 1,
      volunteer_team_member: 1,
      volunteer_paid: 1,
    });
    expect(
      (await db.query('SELECT count(*)::int AS n FROM users WHERE is_system_owner')).rows[0].n,
    ).toBe(1);
    expect(DEMO_STAFF).toHaveLength(14);
    // the dedicated official of the handover journey holds one project area of its own (plan docs/plans/2026-10-12-1541-feat-registration-approval-handover-plan.md, U14)
    const areas = (
      await db.query(
        `SELECT a.location_id <> ALL (SELECT location_id FROM project_areas o WHERE o.rpm_user_id <> a.rpm_user_id) AS own_location FROM project_areas a JOIN users u ON u.id = a.rpm_user_id WHERE u.email = 'handover.rpm@example.org'`,
      )
    ).rows;
    expect(areas).toEqual([{ own_location: true }]);
    const team = (
      await db.query(
        `SELECT t.reference_nid, m.nid FROM volunteers t JOIN volunteers m ON m.id = t.reference_volunteer_id WHERE t.type = 'team_member'`,
      )
    ).rows;
    expect(team).toHaveLength(1);
    expect(team[0].reference_nid).toBe(team[0].nid);
  });

  it('has 50 beneficiaries in exactly two divisions and a draft winter project with components', async () => {
    const divisions = (
      await db.query(
        `SELECT l.name_en, count(*)::int AS n FROM beneficiaries b JOIN locations l ON l.id = b.division_id GROUP BY l.name_en ORDER BY l.name_en`,
      )
    ).rows;
    expect(divisions).toEqual([
      { name_en: 'Dhaka', n: 25 },
      { name_en: 'Rangpur', n: 25 },
    ]);
    const project = (
      await db.query(
        `SELECT p.code, p.status, w.key AS workflow, array_agg(c.component_key ORDER BY c.component_key) AS components FROM projects p JOIN workflow_definitions w ON w.id = p.workflow_definition_id JOIN project_components c ON c.project_id = p.id GROUP BY p.id, w.key`,
      )
    ).rows;
    expect(project).toEqual([
      {
        code: 'WNT',
        status: 'draft',
        workflow: 'distribution',
        components: [
          'application_form',
          'dispatch_receive',
          'distribution',
          'rating_criteria',
          'volunteer_assignment',
          'volunteer_expenses',
        ],
      },
    ]);
  });

  it('contains no real identities: every NID, birth registration, mobile, email and name is fake', async () => {
    const users = (
      await db.query(`SELECT mobile, email, display_name FROM users WHERE kind <> 'system'`)
    ).rows;
    const volunteers = (await db.query('SELECT nid, father_name FROM volunteers')).rows;
    const beneficiaries = (
      await db.query(
        'SELECT nid, birth_reg, mobile, name, father_or_husband_name FROM beneficiaries',
      )
    ).rows;
    for (const u of users) {
      if (u.mobile) expect(isFakeMobile(u.mobile), u.mobile).toBe(true);
      if (u.email) expect(isFakeEmail(u.email), u.email).toBe(true);
      expect(isDemoName(u.display_name), u.display_name).toBe(true);
    }
    for (const v of volunteers)
      expect([isFakeNid(v.nid), isDemoName(v.father_name)]).toEqual([true, true]);
    for (const b of beneficiaries) {
      expect(b.nid ? isFakeNid(b.nid) : isFakeBirthReg(b.birth_reg)).toBe(true);
      expect([
        isFakeMobile(b.mobile),
        isDemoName(b.name),
        isDemoName(b.father_or_husband_name),
      ]).toEqual([true, true, true]);
    }
  });

  it('stores Argon2id password hashes, never the password (D-063)', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE password_hash LIKE '$argon2id$v=19$m=19456,t=2,p=1$%')::int AS argon FROM users WHERE kind <> 'system'`,
    );
    expect(rows[0].argon).toBe(rows[0].n);
    expect(rows[0].n).toBe(34);
  });
});
