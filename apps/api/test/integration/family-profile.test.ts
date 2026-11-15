import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeScope } from '../../src/access/scope.js';
import { recountHelp } from '../../src/services/help-history.js';
import { principalOf } from './support/applications.js';
import { accessWorld } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';
import * as f from './support/fixtures.js';
import { storeKeys } from './support/name-keys.js';

// The family on a beneficiary's profile: the members of the household now, each linked to the
// profile it probably is where the viewer reaches that profile and never hinted at otherwise, the
// family that holds a person named only for a viewer who reaches its head, and what the family
// received from the profiles the viewer reaches, the others a bare number of people.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
type Tree = Awaited<ReturnType<typeof f.locationTree>>;
type Project = Awaited<ReturnType<typeof f.project>>;

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  for (const code of ['son', 'daughter', 'wife']) await f.referenceCode(h.db, 'relationship', code);
});
afterAll(async () => h.close());

const profile = (s: Session, id: string) => api().get(`/api/v1/beneficiaries/${id}`).set(bearer(s));
const head = () => as(world.users.head);
let n = 0;
/** A name of its own for each test, so no other test's people match it. */
const unique = (base: string) => `${base} ${['ক', 'খ', 'গ', 'ঘ', 'চ', 'ছ', 'জ', 'ঝ'][n++ % 8]}${n}`;

/** A live profile with its stored keys. */
async function person(tree: Tree, name: string, father: string, village = 'নমুনা গ্রাম') {
  const id = await f.beneficiary(h.db, tree, { name, father_or_husband_name: father, village });
  await storeKeys(h.container, [id]);
  return id;
}

/** An approved application of the person in the project, with the person's kept count. */
async function helped(project: Project, tree: Tree, beneficiaryId: string) {
  await f.application(
    h.db,
    { project, loc: tree },
    { beneficiary_id: beneficiaryId, status: 'approved', approved_at: new Date().toISOString() },
  );
  await h.container.prisma.$transaction((tx) => recountHelp(tx, [beneficiaryId]));
}

/** The household's members on the profile, as a submitted application writes them. */
async function members(
  beneficiaryId: string,
  list: { name: string; relationship?: string; income?: string }[],
  source: string | null = null,
) {
  for (const m of list)
    await f.insert(h.db, 'beneficiary_family_members', {
      id: randomUUID(),
      beneficiary_id: beneficiaryId,
      name: m.name,
      relationship_code: m.relationship ?? null,
      monthly_income: m.income ?? null,
      source_application_id: source,
    });
  await h.container.nameKeys.run();
}

/**
 * The profile as an official reads it whose reach is the people of these projects only, with the
 * contact and application history classes. Every role that holds the contact class reaches every
 * beneficiary today, so this viewer is built here, at the service the route calls.
 */
async function readReachingOnly(projects: readonly string[], beneficiaryId: string) {
  const principal = await principalOf(h.db, world.users.executive);
  const scope = makeScope(principal.userId, 'beneficiary.view_all', 'beneficiary', {
    global: false,
    self: false,
    programIds: [],
    projectIds: [...projects],
    areas: [],
    volunteerAreas: [],
    revokedProjectIds: [],
    revokedProgramIds: [],
  });
  const read = await h.container.beneficiaries.profile(
    {
      principal,
      scope,
      fieldClasses: new Set([
        'beneficiary.contact',
        'beneficiary.application_history',
        'beneficiary.profile_detail',
      ]),
    },
    beneficiaryId,
  );
  return JSON.parse(JSON.stringify(read)) as {
    familyMembers: Member[];
    memberOf: { head: { beneficiaryId: string } }[];
    familyHelp: { total: number; people: number; notShown: number };
  };
}

/** A head of a household, a son and a daughter with profiles of their own, and a member without one. */
async function household() {
  const tree = await f.locationTree(h.db);
  const headName = unique('রহিম উদ্দিন');
  const head = await person(tree, headName, unique('করিম উদ্দিন'));
  const son = await person(tree, unique('সালাম'), headName);
  const daughter = await person(tree, unique('সালমা'), headName);
  const sonName = (await h.db.query('SELECT name FROM beneficiaries WHERE id = $1', [son])).rows[0]
    .name as string;
  const daughterName = (
    await h.db.query('SELECT name FROM beneficiaries WHERE id = $1', [daughter])
  ).rows[0].name as string;
  const nobodyName = unique('নাসির');
  const projects = {
    head: await f.project(h.db, { year: 2024 }),
    son: await f.project(h.db, { year: 2025 }),
    daughter: await f.project(h.db, { year: 2026 }),
  };
  await helped(projects.head, tree, head);
  await helped(projects.son, tree, son);
  await helped(projects.daughter, tree, daughter);
  await members(head, [
    { name: sonName, relationship: 'son', income: '3000.00' },
    { name: daughterName, relationship: 'daughter' },
    { name: nobodyName },
  ]);
  return { tree, head, son, daughter, sonName, daughterName, nobodyName, projects };
}

type Member = { name: string; profile: { beneficiaryId: string; benNo: string } | null };

describe('the members of the household on the profile', () => {
  it('links each member to the profile it probably is, both ways, for a viewer who reaches it all', async () => {
    const f1 = await household();
    const data = (await profile(await head(), f1.head)).body.data;
    const byName = new Map((data.familyMembers as Member[]).map((m) => [m.name, m]));
    expect(byName.get(f1.sonName)!.profile).toMatchObject({ beneficiaryId: f1.son });
    expect(byName.get(f1.daughterName)!.profile).toMatchObject({ beneficiaryId: f1.daughter });
    expect(byName.get(f1.nobodyName)!.profile).toBeNull();
    // the son's profile names the family that holds him, with the relationship its list gives
    const son = (await profile(await head(), f1.son)).body.data;
    expect(son.memberOf).toEqual([
      expect.objectContaining({
        head: expect.objectContaining({ beneficiaryId: f1.head }),
        relationships: [expect.objectContaining({ code: 'son' })],
      }),
    ]);
    // what the family received: three people, three projects, nothing held back
    expect(data.familyHelp).toMatchObject({ total: 3, people: 3, notShown: 0 });
    const projects = (data.familyHelp.years as { projects: { id: string }[] }[]).flatMap((y) =>
      y.projects.map((p) => p.id),
    );
    expect(projects.sort()).toEqual(
      [f1.projects.head.id, f1.projects.son.id, f1.projects.daughter.id].sort(),
    );
  });

  it('links and sums only the profiles the viewer reaches, and tells the others as a bare number of people', async () => {
    const f1 = await household();
    // this official reaches the head and the son, not the daughter
    const data = await readReachingOnly([f1.projects.head.id, f1.projects.son.id], f1.head);
    const byName = new Map((data.familyMembers as Member[]).map((m) => [m.name, m]));
    expect(byName.get(f1.sonName)!.profile).toMatchObject({ beneficiaryId: f1.son });
    // the daughter's row reads exactly like a member who has no profile at all
    expect(byName.get(f1.daughterName)).toEqual({
      ...byName.get(f1.daughterName),
      profile: null,
    });
    expect(Object.keys(byName.get(f1.daughterName)!).sort()).toEqual(
      Object.keys(byName.get(f1.nobodyName)!).sort(),
    );
    expect(data.familyHelp).toMatchObject({ total: 2, people: 2, notShown: 1 });
    const help = JSON.stringify(data.familyHelp);
    expect(help).not.toContain(f1.projects.daughter.id);
    expect(help).not.toContain('2026');
    expect(JSON.stringify(data)).not.toContain(f1.daughter);
  });

  it('names the family that holds a person only for a viewer who reaches its head', async () => {
    const f1 = await household();
    const son = await readReachingOnly([f1.projects.son.id], f1.son);
    expect(son.memberOf).toEqual([]);
    expect(JSON.stringify(son)).not.toContain(f1.head);
  });

  it('gives a role outside the contact class no members, no family and no family help', async () => {
    const f1 = await household();
    const media = await account(h.db, { kind: 'staff', role: 'media_team' });
    const data = (await profile(await login(h, media), f1.head)).body.data;
    for (const key of ['familyMembers', 'memberOf', 'familyHelp'])
      expect(data, key).not.toHaveProperty(key);
    expect(JSON.stringify(data)).not.toContain('3000');
  });
});

describe('the household now', () => {
  it('shows only the list of the application submitted last, also where two lists are active', async () => {
    const tree = await f.locationTree(h.db);
    const someone = await person(tree, unique('জামাল'), unique('কামাল'));
    const older = await f.application(
      h.db,
      { project: await f.project(h.db), loc: tree },
      { beneficiary_id: someone, status: 'submitted', submitted_at: '2025-01-01T00:00:00Z' },
    );
    const newer = await f.application(
      h.db,
      { project: await f.project(h.db), loc: tree },
      { beneficiary_id: someone, status: 'submitted', submitted_at: '2026-01-01T00:00:00Z' },
    );
    await members(someone, [{ name: 'নতুন সদস্য' }], newer);
    await members(someone, [{ name: 'পুরনো সদস্য' }], older);
    const data = (await profile(await head(), someone)).body.data;
    expect((data.familyMembers as Member[]).map((m) => m.name)).toEqual(['নতুন সদস্য']);
  });

  it('after a merge shows the kept household, and after its revert each profile its own', async () => {
    const tree = await f.locationTree(h.db);
    const name = unique('হাবিব');
    const father = unique('হাশেম');
    const kept = await person(tree, name, father);
    const retired = await person(tree, name, father);
    const keptApp = await f.application(
      h.db,
      { project: world.a1, loc: tree },
      { beneficiary_id: kept, status: 'submitted', submitted_at: '2026-02-01T00:00:00Z' },
    );
    const retiredApp = await f.application(
      h.db,
      { project: world.a2, loc: tree },
      { beneficiary_id: retired, status: 'submitted', submitted_at: '2025-02-01T00:00:00Z' },
    );
    await members(kept, [{ name: 'রাখা পরিবারের সদস্য' }], keptApp);
    await members(retired, [{ name: 'অবসর পরিবারের সদস্য' }], retiredApp);
    const s = await head();
    const merged = await api()
      .post('/api/v1/beneficiary-merges/direct')
      .set(bearer(s))
      .send({ keptId: kept, mergedId: retired, reason: 'একই মানুষ, দুইবার নিবন্ধন হয়েছিল' });
    expect(merged.status, JSON.stringify(merged.body)).toBe(201);
    const names = async (id: string) =>
      ((await profile(await head(), id)).body.data.familyMembers as Member[]).map((m) => m.name);
    expect(await names(kept)).toEqual(['রাখা পরিবারের সদস্য']);
    await api()
      .post(`/api/v1/beneficiary-merges/${merged.body.data.id}/revert`)
      .set(bearer(await as(world.users.monitoring)))
      .send({ reason: 'ভুল করে মার্জ হয়েছিল' })
      .expect(200);
    expect(await names(kept)).toEqual(['রাখা পরিবারের সদস্য']);
    expect(await names(retired)).toEqual(['অবসর পরিবারের সদস্য']);
  });
});
