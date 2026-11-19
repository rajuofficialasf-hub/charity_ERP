import {
  isDemoName,
  isFakeBirthReg,
  isFakeEmail,
  isFakeMobile,
  isFakeNid,
  mergeWorkflowTemplates,
  NOTIFICATION_TEMPLATES,
  workflowDefinitionSchema,
} from '@css/shared';
import { SETTING_DEFAULTS } from '@css/shared/settings';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { json, SeedContext, seedId } from '../../seed/context.js';
import { readPermissionsFile } from '../../seed/sets/base/access.js';
import { deriveTransitions, readWorkflowTemplates } from '../../seed/sets/base/workflows.js';
import {
  DEMO_DUPLICATE_PAIRS,
  DEMO_HELPED_BENEFICIARY,
  DEMO_STAFF,
} from '../../seed/sets/demo/index.js';
import { runSeed, type SeedReport } from '../../seed/run.js';
import { prismaClientFor } from '../../src/core/prisma.service.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { cloneTemplate } from './support/db.js';

// Seed framework: deterministic, idempotent, fake data only, never outside dev/test. The seed
// writes through Prisma; the checks read through the test's own client.
let db: Client;
let prisma: PrismaClient;
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
  'blocklist',
  'project_series',
  'projects',
  'id_sequences',
  'project_areas',
  'project_components',
  'forms',
  'form_versions',
  'applications',
  'beneficiary_merge_candidates',
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
  prisma = prismaClientFor(url);
  first = await runSeed(prisma, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: url });
}, 180_000);
afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

describe('seed runner', () => {
  it('is idempotent: a second run changes nothing, not even updated_at', async () => {
    expect(first.totals.inserted).toBeGreaterThan(700);
    const before = await contentHash();
    const second = await runSeed(prisma, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: url });
    expect({ inserted: second.totals.inserted, updated: second.totals.updated }).toEqual({
      inserted: 0,
      updated: 0,
    });
    expect(await contentHash()).toEqual(before);
  });

  it('refuses production and databases outside the dev/test pattern', async () => {
    await expect(
      runSeed(prisma, ['base'], { NODE_ENV: 'production', DATABASE_URL: url }),
    ).rejects.toThrow(/NODE_ENV is production/);
    await expect(
      runSeed(prisma, ['base'], {
        NODE_ENV: 'test',
        DATABASE_URL: url.replace(/\/[^/]+$/, '/postgres'),
      }),
    ).rejects.toThrow(/not a css_erp_dev, css_erp_test or css_erp_perf database/);
  });

  it('writes inside a transaction that a failure rolls back whole', async () => {
    const ctx = new SeedContext(prisma);
    await expect(
      ctx.transaction(async () => {
        await ctx.upsert('settings', { key: 'seed.probe', value: json({}) }, { key: ['key'] });
        throw new Error('stopped after the first row');
      }),
    ).rejects.toThrow('stopped after the first row');
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM settings WHERE key = 'seed.probe'`,
    );
    expect(rows[0].n).toBe(0);
  });

  it('refuses a table or column name that is not a plain lower-case name', async () => {
    const ctx = new SeedContext(prisma);
    await expect(ctx.upsert('settings"; DROP TABLE users; --', { key: 'x' })).rejects.toThrow(
      /is not a table or column name/,
    );
    await expect(ctx.upsert('settings', { 'key" = 1; --': 'x' }, { key: ['key'] })).rejects.toThrow(
      /is not a table or column name/,
    );
  });

  it('leaves the seed markers the production guard looks for', async () => {
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
      await db.query(
        'SELECT name, module, sensitive, description FROM permissions ORDER BY name COLLATE "C"',
      )
    ).rows;
    expect(permissions).toEqual(
      file.permissions
        .map((p) => ({
          name: p.name,
          module: p.module,
          sensitive: p.sensitive,
          description: p.description,
        }))
        // the code-point order of the database's "C" collation, so '.' and '_' sort alike on both sides
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    );
    expect(roles).toHaveLength(17);
    expect(permissions).toHaveLength(160);
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

  it('seeds the reference lists and notification templates, and no form library or form template', async () => {
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
      guardian_relation: 2,
      issue_type_default: 6,
      marital_status: 6,
      media_platform: 4,
      media_role: 6,
      media_stage: 13,
      mobile_owner: 4,
      payment_method: 4,
      relationship: 17,
    });
    // the media stages the rules need are system entries; each platform names its kind
    const media = (
      await db.query<{
        list_key: string;
        code: string;
        is_system: boolean;
        channel: string | null;
      }>(
        `SELECT list_key, code, is_system, attributes ->> 'kind' AS channel FROM reference_lists
          WHERE list_key IN ('media_stage', 'media_platform') AND (is_system OR list_key = 'media_platform')
          ORDER BY list_key, code`,
      )
    ).rows;
    expect(media.map((m) => [m.list_key, m.code, m.is_system, m.channel])).toEqual([
      ['media_platform', 'ahmadullah_facebook', false, 'facebook'],
      ['media_platform', 'ahmadullah_youtube', false, 'youtube'],
      ['media_platform', 'asf_facebook', false, 'facebook'],
      ['media_platform', 'asf_youtube', false, 'youtube'],
      ['media_stage', 'accepted', true, null],
      ['media_stage', 'cancelled', true, null],
      ['media_stage', 'done', true, null],
      ['media_stage', 'in_review', true, null],
      ['media_stage', 'on_hold', true, null],
      ['media_stage', 'published', true, null],
      ['media_stage', 'ready_to_publish', true, null],
    ]);
    const notif = (
      await db.query(
        `SELECT count(DISTINCT key)::int AS keys, count(*) FILTER (WHERE locale = 'bn')::int AS bn, count(*) FILTER (WHERE locale = 'en')::int AS en FROM notification_templates`,
      )
    ).rows[0];
    expect(notif.bn).toBe(notif.en);
    expect(notif.keys).toBe(NOTIFICATION_TEMPLATES.length);
    // the Monitoring Team builds the library and every form: the seed writes neither
    const templates = await db.query(
      `SELECT key FROM project_templates WHERE definition->>'kind' = 'form_template'`,
    );
    expect(templates.rows).toEqual([]);
    for (const table of ['form_library_sections', 'form_library_fields'])
      expect((await db.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n, table).toBe(0);
    // the library form the migration made stays empty, with its one draft
    const library = await db.query(
      `SELECT v.status, (SELECT count(*)::int FROM form_sections s WHERE s.form_version_id = v.id) AS sections
         FROM forms f JOIN form_versions v ON v.form_id = f.id WHERE f.kind = 'library'`,
    );
    expect(library.rows).toEqual([{ status: 'draft', sections: 0 }]);
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
      await runSeed(prisma, ['base'], { NODE_ENV: 'test', DATABASE_URL: url });
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
  it('makes the demo Admin the Main Admin and leaves the Head a Head', async () => {
    const rows = (
      await db.query(
        `SELECT u.email, u.is_system_owner, r.role_key FROM users u JOIN user_roles r ON r.user_id = u.id AND r.revoked_at IS NULL
         WHERE u.email IN ('admin@example.org', 'head@example.org') ORDER BY u.email`,
      )
    ).rows;
    expect(rows).toEqual([
      { email: 'admin@example.org', is_system_owner: true, role_key: 'admin' },
      { email: 'head@example.org', is_system_owner: false, role_key: 'department_head' },
    ]);
  });

  it('moves the Main Admin of a database seeded before the Admin role to the demo Admin, once', async () => {
    const cloned = await cloneTemplate(inject('templateDb'));
    const client = cloned.client;
    const older = prismaClientFor(cloned.url);
    const url = cloned.url;
    try {
      await runSeed(older, ['base'], { NODE_ENV: 'test', DATABASE_URL: url });
      // the demo Head as the admin role migration leaves an older database: the Main Admin,
      // holding the admin role, the Head role ended
      const head = seedId('user:department_head');
      await client.query(
        `INSERT INTO users (id, kind, email, mobile, password_hash, state, display_name, is_system_owner)
         VALUES ($1, 'staff', 'head@example.org', '01700000001', 'x', 'active', 'ডিপার্টমেন্ট হেড', true)`,
        [head],
      );
      await client.query(
        `INSERT INTO user_roles (id, user_id, role_key, granted_by, revoked_at) VALUES
           ($1, $2, 'department_head', $2, now()), (gen_random_uuid(), $2, 'admin', $2, NULL)`,
        [seedId(`user-role:${head}:department_head`), head],
      );
      const state = async () =>
        (
          await client.query(
            `SELECT u.email, u.is_system_owner, array_agg(r.role_key ORDER BY r.role_key) FILTER (WHERE r.revoked_at IS NULL) AS roles
             FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
             WHERE u.email IN ('admin@example.org', 'head@example.org') GROUP BY u.email, u.is_system_owner ORDER BY u.email`,
          )
        ).rows;
      await runSeed(older, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: url });
      expect(await state()).toEqual([
        { email: 'admin@example.org', is_system_owner: true, roles: ['admin'] },
        { email: 'head@example.org', is_system_owner: false, roles: ['department_head'] },
      ]);
      // the Head's sessions reload their access after the handover
      const version = await client.query(
        `SELECT permission_version FROM users WHERE email = 'head@example.org'`,
      );
      expect(version.rows[0].permission_version).toBeGreaterThan(1);
      // a later seed leaves a role the owner changed since as it is
      await client.query(
        `UPDATE user_roles SET revoked_at = now() WHERE user_id = $1 AND role_key = 'department_head'`,
        [head],
      );
      await client.query(
        `INSERT INTO user_roles (id, user_id, role_key, granted_by) VALUES (gen_random_uuid(), $1, 'program_manager', $1)`,
        [head],
      );
      await runSeed(older, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: url });
      expect((await state())[1]).toEqual({
        email: 'head@example.org',
        is_system_owner: false,
        roles: ['program_manager'],
      });
    } finally {
      await older.$disconnect();
      await cloned.drop();
    }
  }, 180_000);

  it('leaves a Main Admin the owner chose where it is: the new demo Admin takes no flag', async () => {
    const cloned = await cloneTemplate(inject('templateDb'));
    const client = cloned.client;
    const other = prismaClientFor(cloned.url);
    try {
      await runSeed(other, ['base'], { NODE_ENV: 'test', DATABASE_URL: cloned.url });
      const chosen = seedId('user:someone-else');
      await client.query(
        `INSERT INTO users (id, kind, email, mobile, password_hash, state, display_name, is_system_owner)
         VALUES ($1, 'staff', 'chosen@example.org', '01700000999', 'x', 'active', 'x', true)`,
        [chosen],
      );
      await client.query(
        `INSERT INTO user_roles (id, user_id, role_key, granted_by) VALUES (gen_random_uuid(), $1, 'admin', $1)`,
        [chosen],
      );
      await runSeed(other, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: cloned.url });
      const owners = (
        await client.query(`SELECT email FROM users WHERE is_system_owner ORDER BY email`)
      ).rows;
      expect(owners).toEqual([{ email: 'chosen@example.org' }]);
      const head = (
        await client.query(
          `SELECT r.role_key FROM user_roles r JOIN users u ON u.id = r.user_id
           WHERE u.email = 'head@example.org' AND r.revoked_at IS NULL`,
        )
      ).rows;
      expect(head).toEqual([{ role_key: 'department_head' }]);
    } finally {
      await other.$disconnect();
      await cloned.drop();
    }
  }, 180_000);

  it('has one account per official role, the Main Admin and the volunteer mix', async () => {
    const byRole = Object.fromEntries(
      (
        await db.query(`SELECT role_key, count(*)::int AS n FROM user_roles GROUP BY role_key`)
      ).rows.map((r) => [r.role_key, r.n]),
    );
    expect(byRole).toEqual({
      admin: 1,
      department_head: 1,
      monitoring_team: 1,
      program_manager: 3,
      regional_program_manager: 3,
      project_executive: 1,
      official_daee: 1,
      procurement_team: 1,
      media_team: 1,
      media_director: 1,
      media_assistant_director: 1,
      finance_team: 1,
      volunteer_general: 17,
      volunteer_both: 1,
      volunteer_local_daee: 1,
      volunteer_team_member: 1,
      volunteer_paid: 1,
    });
    expect(
      (await db.query('SELECT count(*)::int AS n FROM users WHERE is_system_owner')).rows[0].n,
    ).toBe(1);
    expect(DEMO_STAFF).toHaveLength(16);
    // the dedicated official of the handover journey holds one project area of its own
    const areas = (
      await db.query(
        `SELECT a.location_id <> ALL (SELECT location_id FROM project_areas o WHERE o.rpm_user_id <> a.rpm_user_id) AS own_location FROM project_areas a JOIN users u ON u.id = a.rpm_user_id WHERE u.email = 'handover.rpm@example.org'`,
      )
    ).rows;
    expect(areas).toEqual([{ own_location: true }]);
    // a PM can place a published ready form for beneficiary applications in a test; its
    // questions carry the seven identity marks, and the officials' designations read in Bengali
    const ready = (
      await db.query(
        `SELECT f.kind, v.status, count(q.id)::int AS questions,
                count(q.standard_column)::int AS marked
           FROM forms f JOIN form_versions v ON v.form_id = f.id
           JOIN form_sections s ON s.form_version_id = v.id
           JOIN form_fields q ON q.form_section_id = s.id
          WHERE f.project_id IS NULL AND f.key = 'demo_beneficiary_application'
          GROUP BY f.kind, v.status`,
      )
    ).rows;
    expect(ready).toEqual([
      { kind: 'beneficiary_application', status: 'published', questions: 8, marked: 7 },
    ]);
    expect(
      (
        await db.query(
          `SELECT count(*)::int AS n FROM users WHERE kind = 'staff' AND designation ~ '[A-Za-z]'`,
        )
      ).rows[0].n,
    ).toBe(0);
    const team = (
      await db.query(
        `SELECT t.reference_nid, m.nid FROM volunteers t JOIN volunteers m ON m.id = t.reference_volunteer_id WHERE t.type = 'team_member'`,
      )
    ).rows;
    expect(team).toHaveLength(1);
    expect(team[0].reference_nid).toBe(team[0].nid);
  });

  it('has 55 beneficiaries in exactly two divisions, a draft winter project with components and its closed session of 2025', async () => {
    const divisions = (
      await db.query(
        `SELECT l.name_en, count(*)::int AS n FROM beneficiaries b JOIN locations l ON l.id = b.division_id GROUP BY l.name_en ORDER BY l.name_en`,
      )
    ).rows;
    // 25 per division, and in Dhaka the four profiles of the duplicate pairs and the person helped
    expect(divisions).toEqual([
      { name_en: 'Dhaka', n: 30 },
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
    const sessions = (
      await db.query(`SELECT year, status FROM projects WHERE code = 'WNT' ORDER BY year`)
    ).rows;
    expect(sessions).toEqual([
      { year: 2025, status: 'closed' },
      { year: 2026, status: 'draft' },
    ]);
  });

  it('keeps one person helped once, by the closed session of 2025, with the times helped kept', async () => {
    const { rows } = await db.query(
      `SELECT b.nid, b.help_count, a.status, a.closed_from_status, p.year
         FROM beneficiaries b
         JOIN applications a ON a.beneficiary_id = b.id
         JOIN projects p ON p.id = a.project_id
        WHERE b.nid = $1`,
      [DEMO_HELPED_BENEFICIARY.nid],
    );
    expect(rows).toEqual([
      {
        nid: DEMO_HELPED_BENEFICIARY.nid,
        help_count: 1,
        status: 'closed',
        closed_from_status: 'approved',
        year: 2025,
      },
    ]);
  });

  it('keeps two duplicate pairs the duplicate rules find, both people applied in program HUM', async () => {
    const pairs = (
      await db.query(
        `SELECT x.nid AS low_nid, y.nid AS high_nid, c.rules, c.level, c.active,
           x.name_key = y.name_key AND x.guardian_key = y.guardian_key
             AND x.village_key = y.village_key AND x.union_id = y.union_id
             AND x.mobile = y.mobile AS same_person_data
         FROM beneficiary_merge_candidates c
         JOIN beneficiaries x ON x.id = c.low_id
         JOIN beneficiaries y ON y.id = c.high_id
         ORDER BY least(x.nid, y.nid)`,
      )
    ).rows;
    expect(pairs).toHaveLength(DEMO_DUPLICATE_PAIRS.length);
    for (const [i, pair] of pairs.entries()) {
      expect([pair.low_nid, pair.high_nid].sort()).toEqual([...DEMO_DUPLICATE_PAIRS[i]!.nids]);
      expect(pair).toMatchObject({
        rules: ['name_father_mobile', 'name_father_village', 'same_mobile'],
        level: 'probable',
        active: true,
        same_person_data: true,
      });
    }
    const applications = (
      await db.query(
        `SELECT b.nid, a.status, p.code, g.code AS program
         FROM applications a
         JOIN beneficiaries b ON b.id = a.beneficiary_id
         JOIN projects p ON p.id = a.project_id
         JOIN programs g ON g.id = p.program_id
         WHERE b.nid = ANY($1::text[])
         ORDER BY b.nid`,
        [DEMO_DUPLICATE_PAIRS.flatMap((pair) => pair.nids)],
      )
    ).rows;
    expect(applications).toEqual(
      DEMO_DUPLICATE_PAIRS.flatMap((pair) =>
        pair.nids.map((nid) => ({
          nid,
          status: 'under_review',
          code: 'WNT',
          program: 'HUM',
        })),
      ),
    );
  });

  it('blocks exactly one Dhaka beneficiary, identified by NID, through an active blocklist row', async () => {
    const { rows } = await db.query(
      `SELECT b.nid, l.name_en AS division, bl.active, bl.reason
       FROM beneficiaries b
       JOIN locations l ON l.id = b.division_id
       LEFT JOIN blocklist bl ON bl.subject_type = 'beneficiary' AND bl.subject_id = b.id
       WHERE b.is_blocked`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ division: 'Dhaka', active: true });
    expect(isFakeNid(rows[0].nid)).toBe(true);
    expect(isDemoName(rows[0].reason)).toBe(true);
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

  it('stores Argon2id password hashes, never the password', async () => {
    const { rows } = await db.query(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE password_hash LIKE '$argon2id$v=19$m=19456,t=2,p=1$%')::int AS argon FROM users WHERE kind <> 'system'`,
    );
    expect(rows[0].argon).toBe(rows[0].n);
    expect(rows[0].n).toBe(36);
  });
});

describe('a database seeded before the project series', () => {
  it('runs the demo set again on the series the migration gave the winter project, its own id', async () => {
    const { rows } = await db.query<{ id: string; series_id: string }>(
      `SELECT id, series_id FROM projects WHERE code = 'WNT' AND year = 2026`,
    );
    const project = rows[0]!;
    /** Moves the winter project onto a series of the given id, the old series left behind. */
    const moveSeries = async (from: string, to: string) => {
      await db.query(`UPDATE project_series SET code = 'WNTOLD' WHERE id = $1`, [from]);
      await db.query(
        `INSERT INTO project_series (id, program_id, code, name_bn, name_en, created_at, created_by, updated_at, updated_by)
         SELECT $1, program_id, 'WNT', name_bn, name_en, created_at, created_by, updated_at, updated_by
           FROM project_series WHERE id = $2`,
        [to, from],
      );
      await db.query(`UPDATE projects SET series_id = $1 WHERE series_id = $2`, [to, from]);
      await db.query(`DELETE FROM project_series WHERE id = $1`, [from]);
    };
    await moveSeries(project.series_id, project.id);
    try {
      await runSeed(prisma, ['base', 'demo'], { NODE_ENV: 'test', DATABASE_URL: url });
      const after = await db.query<{ series_id: string }>(
        `SELECT series_id FROM projects WHERE id = $1`,
        [project.id],
      );
      expect(after.rows[0]!.series_id).toBe(project.id);
      const series = await db.query(`SELECT id FROM project_series WHERE code = 'WNT'`);
      expect(series.rows).toEqual([{ id: project.id }]);
    } finally {
      // the other tests read the seed's own series again, whatever order they run in
      await moveSeries(project.id, project.series_id);
    }
  }, 180_000);
});
