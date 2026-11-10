import { randomUUID } from 'node:crypto';
import { fakeMobile as sharedFakeMobile, fakeNid as sharedFakeNid } from '@css/shared';
import type { Client } from 'pg';
import { mergedWorkflowDefinitions } from '../../../src/workflow/templates';

/**
 * Minimal row builders for database tests. Identities are obviously fake
 * (docs/testing/TEST_STRATEGY.md, "Test data strategy"): NIDs from 1000000000, mobiles 0170000xxxx,
 * emails @example.org. Each builder inserts one row with only the required columns and returns its
 * id.
 */
let counter = 0;
const next = () => ++counter;
// Shared fake generators (packages/shared/src/testing/fake.ts); indexes from 5000 stay clear of the demo seed.
export const fakeNid = () => sharedFakeNid(5000 + next());
export const fakeMobile = () => sharedFakeMobile(5000 + (next() % 5000));

async function insert(db: Client, table: string, given: Record<string, unknown>): Promise<string> {
  // a file row names the driver that holds it; the tests store on the NAS driver
  const row = table === 'files' ? { storage_driver: 'nas', ...given } : given;
  const cols = Object.keys(row);
  const sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`;
  const res = await db.query(sql, Object.values(row));
  return (res.rows[0].id ?? res.rows[0].key ?? res.rows[0].activity_id) as string;
}

export const user = (db: Client, over: Record<string, unknown> = {}) =>
  insert(db, 'users', {
    id: randomUUID(),
    kind: 'staff',
    email: `u${next()}@example.org`,
    display_name: 'নমুনা ব্যবহারকারী',
    state: 'active',
    ...over,
  });

export async function volunteerUser(db: Client, mobile = fakeMobile()) {
  return user(db, { kind: 'volunteer', email: null, mobile });
}

export async function locationTree(db: Client) {
  const n = next();
  const division = await insert(db, 'locations', {
    id: randomUUID(),
    level: 'division',
    kind: 'division',
    code: `T-${n}`,
    name_bn: 'বিভাগ',
    name_en: 'Division',
  });
  const district = await insert(db, 'locations', {
    id: randomUUID(),
    parent_id: division,
    level: 'district',
    kind: 'district',
    code: `T-${n}-1`,
    name_bn: 'জেলা',
    name_en: 'District',
  });
  const upazila = await insert(db, 'locations', {
    id: randomUUID(),
    parent_id: district,
    level: 'upazila',
    kind: 'upazila',
    code: `T-${n}-1-1`,
    name_bn: 'উপজেলা',
    name_en: 'Upazila',
  });
  const union = await insert(db, 'locations', {
    id: randomUUID(),
    parent_id: upazila,
    level: 'union',
    kind: 'union',
    code: `T-${n}-1-1-1`,
    name_bn: 'ইউনিয়ন',
    name_en: 'Union',
  });
  return { division, district, upazila, union };
}

export async function referenceCode(db: Client, listKey: string, code: string) {
  await db.query(
    `INSERT INTO reference_lists (id, list_key, code, label_bn, label_en) VALUES ($1, $2, $3, $3, $3) ON CONFLICT (list_key, code) DO NOTHING`,
    [randomUUID(), listKey, code],
  );
}

export async function project(db: Client, over: Record<string, unknown> = {}) {
  const n = next();
  const program = await insert(db, 'programs', {
    id: randomUUID(),
    code: `P${n}`,
    name_bn: 'প্রোগ্রাম',
    name_en: 'Program',
  });
  const workflow = await insert(db, 'workflow_definitions', {
    id: randomUUID(),
    key: `wf${n}`,
    version: 1,
    title_bn: 'ধাপ',
    title_en: 'Flow',
    // a real definition (the distribution template), so the engine can read any fixture project
    definition: JSON.stringify(
      mergedWorkflowDefinitions().find((d) => d.template === 'distribution'),
    ),
  });
  const code =
    'T' +
    String.fromCharCode(65 + (n % 26)) +
    String.fromCharCode(65 + (Math.floor(n / 26) % 26)) +
    String.fromCharCode(65 + (Math.floor(n / 676) % 26));
  const id = await insert(db, 'projects', {
    id: randomUUID(),
    program_id: program,
    code,
    year: 2026,
    name_bn: 'প্রকল্প',
    name_en: 'Project',
    workflow_definition_id: workflow,
    workflow_version: 1,
    ...over,
  });
  const form = await insert(db, 'forms', {
    id: randomUUID(),
    project_id: id,
    key: 'default',
    title_bn: 'ফর্ম',
    title_en: 'Form',
  });
  const formVersion = await insert(db, 'form_versions', {
    id: randomUUID(),
    form_id: form,
    version_no: 1,
  });
  return { id, program, workflow, form, formVersion };
}

export async function beneficiary(
  db: Client,
  loc: Awaited<ReturnType<typeof locationTree>>,
  over: Record<string, unknown> = {},
) {
  // the gender list holds the two genders the tests give; any other code stays refused
  await referenceCode(db, 'gender', 'female');
  await referenceCode(db, 'gender', 'male');
  // each person their own family unless a test gives two the same father, village and union
  return insert(db, 'beneficiaries', {
    id: randomUUID(),
    nid: fakeNid(),
    name: 'নমুনা উপকারভোগী',
    father_or_husband_name: `নমুনা পিতা ${randomUUID().slice(0, 8)}`,
    mobile: fakeMobile(),
    gender_code: 'female',
    division_id: loc.division,
    district_id: loc.district,
    upazila_id: loc.upazila,
    union_id: loc.union,
    village: 'নমুনা গ্রাম',
    ...over,
  });
}

export async function volunteer(
  db: Client,
  loc: Awaited<ReturnType<typeof locationTree>>,
  userId: string,
  over: Record<string, unknown> = {},
) {
  return insert(db, 'volunteers', {
    id: randomUUID(),
    user_id: userId,
    nid: fakeNid(),
    type: 'general',
    father_name: 'নমুনা পিতা',
    mother_name: 'নমুনা মাতা',
    division_id: loc.division,
    district_id: loc.district,
    upazila_id: loc.upazila,
    union_id: loc.union,
    ...over,
  });
}

export async function application(
  db: Client,
  ctx: {
    project: Awaited<ReturnType<typeof project>>;
    loc: Awaited<ReturnType<typeof locationTree>>;
  },
  over: Record<string, unknown> = {},
) {
  return insert(db, 'applications', {
    id: randomUUID(),
    project_id: ctx.project.id,
    form_version_id: ctx.project.formVersion,
    region_location_id: ctx.loc.division,
    district_id: ctx.loc.district,
    union_id: ctx.loc.union,
    status: 'submitted',
    ...over,
  });
}

export { insert };
