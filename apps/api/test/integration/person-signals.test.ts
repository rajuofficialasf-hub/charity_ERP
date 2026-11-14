import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedContext } from '../../seed/context.js';
import { seedReferenceLists } from '../../seed/sets/base/reference-lists.js';
import { seedWorkflows } from '../../seed/sets/base/workflows.js';
import { accessWorld } from './support/access-fixtures.js';
import { applicationProject, applicationRow } from './support/applications.js';
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

// What the review tells about the applicant's person beyond the project: the earlier family that
// probably holds them as a member, and an open probable pair with another profile. Both only tell;
// another profile is named only to an official whose scope reaches it, and a volunteer reads
// neither.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);
const read = (s: Session, id: string) => api().get(`/api/v1/applications/${id}`).set(bearer(s));

/** A distribution project of the Dhaka RPMs. */
let distribution: { id: string; versionId: string };
/** A second RPM of the area, whose beneficiary tab the permission panel took away. */
let withoutProfiles: string;

async function projectOf(code: string, workflowKey: string) {
  const made = await api()
    .post('/api/v1/projects')
    .set(bearer(await as(world.users.pm)))
    .send({
      programId: world.a1.program,
      code,
      year: 2026,
      name: { bn: code, en: code },
      source: { kind: 'workflow', workflowKey },
    });
  expect(made.status, JSON.stringify(made.body)).toBe(201);
  const id = made.body.data.id as string;
  const { versionId } = await applicationProject(h, await as(world.users.monitoring), id, {
    workflow: workflowKey,
  });
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), id, world.dhaka.division, world.users.rpmDhaka],
  );
  return { id, versionId };
}

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
  const ctx = new SeedContext(h.container.prisma);
  await seedWorkflows(ctx);
  await seedReferenceLists(ctx);
  distribution = await projectOf('SIG', 'distribution');
  withoutProfiles = await make('staff')('regional_program_manager');
  await h.db.query(
    `INSERT INTO project_areas (id, project_id, location_id, rpm_user_id) VALUES ($1, $2, $3, $4)`,
    [randomUUID(), distribution.id, world.dhaka.division, withoutProfiles],
  );
  await h.db.query(
    `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, reason, granted_by)
     VALUES ($1, $2, 'beneficiary.view_all', 'revoke', 'GLOBAL', 'Test override', $3)`,
    [randomUUID(), withoutProfiles, world.users.head],
  );
});
afterAll(async () => h.close());

let counter = 0;
/** A profile in Dhaka with its keys stored, as a write stores them. */
async function profile(over: Record<string, unknown>) {
  const id = await f.beneficiary(h.db, world.dhaka, { village: 'খালপাড়', ...over });
  await storeKeys(h.container, [id]);
  return id;
}
/** An application of the person in a project, under review. */
const applies = (project: { id: string; versionId: string }, beneficiaryId: string) =>
  applicationRow(h.db, {
    projectId: project.id,
    versionId: project.versionId,
    loc: world.dhaka,
    status: 'under_review',
    beneficiaryId,
  });
/** An earlier beneficiary (another project's) whose active family list holds a son. */
async function familyOf(n: number) {
  const head = await profile({ name: `মোঃ হাবিব ${n}`, father_or_husband_name: `পিতা ${n}` });
  await f.insert(h.db, 'beneficiary_family_members', {
    id: randomUUID(),
    beneficiary_id: head,
    name: `সোহেল ${n}`,
    relationship_code: 'son',
    name_key: (await h.container.matchKeys.ofMember(h.container.prisma, `সোহেল ${n}`)).nameKey,
  });
  await applies({ id: world.a2.id, versionId: world.a2.formVersion }, head);
  return head;
}
const benNo = async (id: string) =>
  `BEN-${String((await h.db.query('SELECT ben_no FROM beneficiaries WHERE id = $1', [id])).rows[0].ben_no).padStart(7, '0')}`;
const pairUp = async (...ids: string[]) =>
  h.container.prisma.$transaction((tx) =>
    h.container.beneficiaryMergeCandidates.refreshFor(tx, ids),
  );

describe('the family member signal', () => {
  it('names the earlier family and the relationship its list gives, to an official who reaches the head', async () => {
    const n = ++counter;
    const head = await familyOf(n);
    const son = await profile({ name: `সোহেল ${n}`, father_or_husband_name: `হাবিব ${n}` });
    const application = await applies(distribution, son);
    const rpm = await read(await as(world.users.rpmDhaka), application);
    expect(rpm.status, JSON.stringify(rpm.body)).toBe(200);
    expect(rpm.body.data.familyMemberSignals).toEqual([
      {
        relationshipCode: 'son',
        relationship: { bn: expect.any(String), en: expect.any(String) },
        head: { beneficiaryId: head, benNo: await benNo(head), name: `মোঃ হাবিব ${n}` },
      },
    ]);
    // a sign, never a family match of the project: the decision asks nothing for it
    expect(rpm.body.data.familyDuplicateWarnings).toEqual([]);
  });

  it('tells an official who cannot open the head only that such a family exists, with no link', async () => {
    const n = ++counter;
    await familyOf(n);
    const son = await profile({ name: `সোহেল ${n}`, father_or_husband_name: `হাবিব ${n}` });
    const application = await applies(distribution, son);
    const rpm = await read(await as(withoutProfiles), application);
    expect(rpm.status, JSON.stringify(rpm.body)).toBe(200);
    expect(rpm.body.data.familyMemberSignals).toEqual([
      { relationshipCode: 'son', relationship: expect.any(Object), head: null },
    ]);
    expect(JSON.stringify(rpm.body.data.familyMemberSignals)).not.toContain('হাবিব');
  });

  it('gives a volunteer neither signal', async () => {
    const n = ++counter;
    await familyOf(n);
    const son = await profile({ name: `সোহেল ${n}`, father_or_husband_name: `হাবিব ${n}` });
    const twin = await profile({ name: `সোহেল ${n}`, father_or_husband_name: `হাবিব ${n}` });
    await pairUp(son, twin);
    // the volunteer who brings it reads the record, as a volunteer
    const own = (
      await h.db.query<{ id: string }>('SELECT id FROM volunteers WHERE user_id = $1', [
        world.users.general,
      ])
    ).rows[0]!.id;
    const application = await applicationRow(h.db, {
      projectId: world.a1.id,
      versionId: world.a1.formVersion,
      loc: world.dhaka,
      status: 'under_review',
      beneficiaryId: son,
      ownerVolunteerId: own,
    });
    const theirs = await read(await as(world.users.general), application);
    expect(theirs.status, JSON.stringify(theirs.body)).toBe(200);
    expect(theirs.body.data.familyMemberSignals).toEqual([]);
    expect(theirs.body.data.samePersonSignals).toEqual([]);
  });
});

describe('the same person signal', () => {
  it('names the other profile of an open probable pair to an official who may compare both', async () => {
    const n = ++counter;
    const person = { name: `জরিনা ${n}`, father_or_husband_name: `মোঃ আজিজ ${n}` };
    const first = await profile(person);
    const second = await profile({ ...person, father_or_husband_name: `আজিজ ${n}` });
    await pairUp(first, second);
    const application = await applies(distribution, second);
    const rpm = await read(await as(world.users.rpmDhaka), application);
    expect(rpm.body.data.samePersonSignals).toEqual([
      {
        level: 'probable',
        matchedOn: ['name_father_village'],
        other: { beneficiaryId: first, benNo: await benNo(first), name: person.name },
      },
    ]);
    // an RPM who may not open the profiles is told, not named
    const blind = await read(await as(withoutProfiles), application);
    expect(blind.status, JSON.stringify(blind.body)).toBe(200);
    expect(blind.body.data.samePersonSignals).toEqual([
      { level: 'probable', matchedOn: ['name_father_village'], other: null },
    ]);
    // an executive opens profiles but does not compare pairs: told, not named
    const onTheirProject = await applicationRow(h.db, {
      projectId: world.a1.id,
      versionId: world.a1.formVersion,
      loc: world.dhaka,
      status: 'under_review',
      beneficiaryId: second,
    });
    const executive = await read(await as(world.users.executive), onTheirProject);
    expect(executive.status, JSON.stringify(executive.body)).toBe(200);
    expect(executive.body.data.samePersonSignals).toEqual([
      { level: 'probable', matchedOn: ['name_father_village'], other: null },
    ]);
  });

  it('tells nothing of a pair that is only for an official to check, or one marked as two people', async () => {
    const n = ++counter;
    const mobile = `0170${String(1_000_000 + n).slice(-7)}`;
    const a = await profile({ name: `ফোনের এক ${n}`, mobile });
    const b = await profile({ name: `ফোনের দুই ${n}`, mobile });
    await pairUp(a, b);
    const rpm = await as(world.users.rpmDhaka);
    expect((await read(rpm, await applies(distribution, a))).body.data.samePersonSignals).toEqual(
      [],
    );
    const person = { name: `চিহ্নিত ${n}`, father_or_husband_name: `পিতা ${n}` };
    const first = await profile(person);
    const second = await profile(person);
    await pairUp(first, second);
    const application = await applies(distribution, first);
    expect((await read(rpm, application)).body.data.samePersonSignals).toHaveLength(1);
    await api()
      .post('/api/v1/beneficiaries/merge-dismissals')
      .set(bearer(rpm))
      .send({ beneficiaryId: first, otherBeneficiaryId: second, reason: 'আলাদা মানুষ, যাচাই করা' })
      .expect(201);
    expect((await read(rpm, application)).body.data.samePersonSignals).toEqual([]);
  });
});
