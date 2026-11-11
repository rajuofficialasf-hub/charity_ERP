import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { seedAccessCatalogue } from './support/access-fixtures.js';
import {
  type Account,
  account,
  type AuthHarness,
  authHarness,
  auditRows,
  bearer,
  login,
  type Session,
} from './support/auth-app.js';

// The official's profile, the staff directory and the organogram.
let h: AuthHarness;
let head: Account;
let headSession: Session;
let programId: string;
let otherProgramId: string;
const people: Record<string, Account> = {};
const api = () => request(h.server());

async function place(who: Account, values: Record<string, unknown>) {
  const cols = Object.keys(values);
  await h.db.query(
    `UPDATE users SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [who.id, ...Object.values(values)],
  );
}

async function newProgram(code: string, pmUserId: string) {
  const id = randomUUID();
  await h.db.query(
    `INSERT INTO programs (id, code, name_bn, name_en, pm_user_id) VALUES ($1, $2, $3, $4, $5)`,
    [id, code, `প্রোগ্রাম ${code}`, `Program ${code}`, pmUserId],
  );
  return id;
}

beforeAll(async () => {
  h = await authHarness();
  await seedAccessCatalogue(h.db);
  head = await account(h.db, { role: 'department_head' });
  await place(head, { job_id: 'DIR-001' });
  headSession = await login(h, head);
  const make = async (key: string, role: string, values: Record<string, unknown>) => {
    people[key] = await account(h.db, { role });
    await place(people[key], values);
  };
  await make('monitoring', 'monitoring_team', { job_id: 'DIR-002', supervisor_user_id: head.id });
  await make('pm', 'program_manager', { job_id: 'DIR-101', supervisor_user_id: head.id });
  programId = await newProgram('DA', people.pm!.id);
  await make('pmOther', 'program_manager', { job_id: 'DIR-102' });
  otherProgramId = await newProgram('DB', people.pmOther!.id);
  // placed through the supervisor line: RPM under the PM, the executive under the RPM
  await make('rpm', 'regional_program_manager', {
    job_id: 'DIR-201',
    supervisor_user_id: people.pm!.id,
  });
  await make('executive', 'project_executive', {
    job_id: 'DIR-301',
    supervisor_user_id: people.rpm!.id,
  });
  // placed by the home program although the supervisor works elsewhere
  await make('daee', 'official_daee', {
    job_id: 'DIR-302',
    home_program_id: otherProgramId,
    supervisor_user_id: people.rpm!.id,
  });
  // nowhere yet
  await make('loose', 'project_executive', { job_id: 'DIR-303' });
  // outside the department and a former official
  await make('partner', 'project_executive', {
    job_id: 'DIR-901',
    affiliation: 'external',
    affiliation_unit: 'সহযোগী সংস্থা',
    supervisor_user_id: null,
  });
  await make('wing', 'project_executive', {
    job_id: 'DIR-902',
    affiliation: 'foundation',
    affiliation_unit: 'আইটি বিভাগ',
    home_program_id: programId,
  });
  await make('former', 'project_executive', {
    job_id: 'DIR-399',
    state: 'deactivated',
    supervisor_user_id: people.rpm!.id,
  });
});
afterAll(async () => h.close());

const profileOf = (over: Record<string, unknown> = {}) => ({
  jobId: 'DIR-303',
  displayName: 'অবস্থানহীন কর্মকর্তা',
  designation: 'Project Executive',
  affiliation: 'department',
  affiliationUnit: null,
  homeProgramId: null,
  homeDivisionId: null,
  supervisorUserId: null,
  ...over,
});

async function etagOf(userId: string) {
  const res = await api().get(`/api/v1/users/${userId}`).set(bearer(headSession));
  expect(res.status).toBe(200);
  return res.headers.etag as string;
}

const putProfile = (userId: string, body: Record<string, unknown>, etag: string, s = headSession) =>
  api().put(`/api/v1/users/${userId}/profile`).set(bearer(s)).set('If-Match', etag).send(body);

describe('the official profile', () => {
  it('replaces the profile of an existing official with an audit entry', async () => {
    const who = people.loose!;
    const res = await putProfile(
      who.id,
      profileOf({
        jobId: 'dir-303a',
        homeProgramId: programId,
        supervisorUserId: people.pm!.id,
      }),
      await etagOf(who.id),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      jobId: 'DIR-303A',
      affiliation: 'department',
      homeProgramId: programId,
      supervisorUserId: people.pm!.id,
    });
    const audit = (await auditRows(h.db, 'user.profile_changed')).at(-1)!;
    expect(audit).toMatchObject({ actor_user_id: head.id, entity_id: who.id });
    expect(audit.old).toMatchObject({ jobId: 'DIR-303', homeProgramId: null });
    expect(audit.new).toMatchObject({ jobId: 'DIR-303A', homeProgramId: programId });
    // put back for the organogram below
    const back = await putProfile(who.id, profileOf(), await etagOf(who.id));
    expect(back.status).toBe(200);
  });

  it('needs the current ETag, a free job ID and a line without a loop', async () => {
    const who = people.loose!;
    const etag = await etagOf(who.id);
    expect((await putProfile(who.id, profileOf(), '"stale"')).status).toBe(412);
    const taken = await putProfile(who.id, profileOf({ jobId: 'dir-101' }), etag);
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe('user.job_id_taken');
    // the PM would report to the RPM who reports to the PM
    const pm = people.pm!;
    const loop = await putProfile(
      pm.id,
      profileOf({ jobId: 'DIR-101', supervisorUserId: people.rpm!.id }),
      await etagOf(pm.id),
    );
    expect(loop.status).toBe(422);
    expect(loop.body.error.details[0]).toMatchObject({
      path: 'supervisorUserId',
      code: 'user.supervisor_invalid',
    });
    const self = await putProfile(
      pm.id,
      profileOf({ jobId: 'DIR-101', supervisorUserId: pm.id }),
      await etagOf(pm.id),
    );
    expect(self.status).toBe(422);
  });

  it('is refused without the permission and for a volunteer', async () => {
    const who = people.loose!;
    const pmSession = await login(h, people.pm!);
    const res = await putProfile(who.id, profileOf(), await etagOf(who.id), pmSession);
    expect(res.status).toBe(403);
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const v = await putProfile(volunteer.id, profileOf({ jobId: 'DIR-777' }), '"x"');
    expect([409, 412]).toContain(v.status);
    const fresh = await putProfile(
      volunteer.id,
      profileOf({ jobId: 'DIR-777' }),
      await etagOf(volunteer.id),
    );
    expect(fresh.status).toBe(409);
    expect(fresh.body.error.code).toBe('user.not_staff');
  });
});

describe('the profile and the link at a narrower scope', () => {
  it('a grant below GLOBAL scope never reaches another official', async () => {
    const pm = people.pm!;
    for (const permission of ['user.profile.manage', 'user.create'])
      await h.db.query(
        `INSERT INTO user_permissions (id, user_id, permission_name, effect, scope_type, scope_ref, reason, granted_by)
         VALUES ($1, $2, $3, 'grant', 'PROGRAM', $4, 'Test override', $5)`,
        [randomUUID(), pm.id, permission, programId, head.id],
      );
    await h.db.query('UPDATE users SET permission_version = permission_version + 1 WHERE id = $1', [
      pm.id,
    ]);
    h.container.sessions.evictUser(pm.id);
    const pmSession = await login(h, pm);
    const wing = people.wing!;
    const profile = await putProfile(
      wing.id,
      profileOf({
        jobId: 'DIR-902',
        affiliation: 'foundation',
        affiliationUnit: 'আইটি বিভাগ',
        homeProgramId: otherProgramId,
      }),
      await etagOf(wing.id),
      pmSession,
    );
    expect(profile.status).toBe(403);
    const link = await api()
      .post(`/api/v1/users/${wing.id}/invitation`)
      .set(bearer(pmSession))
      .send({});
    expect(link.status).toBe(403);
  });

  it('keeps an unchanged supervisor who has left since', async () => {
    const who = people.loose!;
    const gone = await account(h.db, { role: 'project_executive' });
    await place(gone, { job_id: 'DIR-398' });
    await place(who, { supervisor_user_id: gone.id });
    await place(gone, { state: 'deactivated' });
    const res = await putProfile(
      who.id,
      profileOf({ designation: 'Senior Project Executive', supervisorUserId: gone.id }),
      await etagOf(who.id),
    );
    expect(res.status).toBe(200);
    // choosing them anew is refused
    await place(who, { supervisor_user_id: null });
    const again = await putProfile(
      who.id,
      profileOf({ supervisorUserId: gone.id }),
      await etagOf(who.id),
    );
    expect(again.status).toBe(422);
  });
});

describe('the staff directory', () => {
  const ids = (res: request.Response) => res.body.data.map((u: { id: string }) => u.id);

  it('lists department staff, other departments and partners apart', async () => {
    const department = await api()
      .get('/api/v1/users?kind=staff&affiliation=department&limit=100')
      .set(bearer(headSession));
    expect(department.status).toBe(200);
    expect(ids(department)).toContain(people.rpm!.id);
    expect(ids(department)).not.toContain(people.partner!.id);
    expect(ids(department)).not.toContain(people.wing!.id);
    const external = await api()
      .get('/api/v1/users?affiliation=external&limit=100')
      .set(bearer(headSession));
    expect(ids(external)).toEqual([people.partner!.id]);
    expect(external.body.data[0]).toMatchObject({
      jobId: 'DIR-901',
      affiliation: 'external',
      affiliationUnit: 'সহযোগী সংস্থা',
      awaitingPassword: false,
    });
    const foundation = await api()
      .get(`/api/v1/users?affiliation=foundation&programId=${programId}`)
      .set(bearer(headSession));
    expect(ids(foundation)).toEqual([people.wing!.id]);
  });

  it('finds an official by job ID', async () => {
    const res = await api().get('/api/v1/users?q=dir-201').set(bearer(headSession));
    expect(ids(res)).toEqual([people.rpm!.id]);
  });
});

describe('the organogram', () => {
  type Node = { userId: string; jobId: string | null; reports: Node[] };
  const flat = (nodes: Node[]): string[] => nodes.flatMap((n) => [n.userId, ...flat(n.reports)]);

  it('places department staff by program through the home program or the supervisor line', async () => {
    const res = await api().get('/api/v1/organogram').set(bearer(headSession));
    expect(res.status).toBe(200);
    const { leadership, programs, unplaced } = res.body.data as {
      leadership: Node[];
      programs: { programId: string; members: Node[] }[];
      unplaced: Node[];
    };
    expect(leadership.map((n) => n.userId).sort()).toEqual([head.id, people.monitoring!.id].sort());
    const a = programs.find((p) => p.programId === programId)!;
    // the PM at the top, the RPM under the PM, the executive under the RPM
    expect(a.members).toHaveLength(1);
    expect(a.members[0]!.userId).toBe(people.pm!.id);
    expect(a.members[0]!.reports.map((n) => n.userId)).toEqual([people.rpm!.id]);
    expect(a.members[0]!.reports[0]!.reports.map((n) => n.userId)).toEqual([people.executive!.id]);
    const b = programs.find((p) => p.programId === otherProgramId)!;
    expect(flat(b.members).sort()).toEqual([people.pmOther!.id, people.daee!.id].sort());
    expect(unplaced.map((n) => n.userId)).toContain(people.loose!.id);
    // only the department's own current staff
    const everyone = [
      ...flat(leadership),
      ...programs.flatMap((p) => flat(p.members)),
      ...flat(unplaced),
    ];
    for (const outside of ['partner', 'wing', 'former'])
      expect(everyone, outside).not.toContain(people[outside]!.id);
    expect(new Set(everyone).size).toBe(everyone.length);
  });

  it('never loses officials whose supervisor line loops', async () => {
    const x = await account(h.db, { role: 'project_executive' });
    const y = await account(h.db, { role: 'project_executive' });
    await place(x, { job_id: 'DIR-501', home_program_id: programId });
    await place(y, { job_id: 'DIR-502', home_program_id: programId, supervisor_user_id: x.id });
    // written past the service, which refuses a loop
    await place(x, { supervisor_user_id: y.id });
    const res = await api().get('/api/v1/organogram').set(bearer(headSession));
    const a = (res.body.data.programs as { programId: string; members: Node[] }[]).find(
      (p) => p.programId === programId,
    )!;
    expect(flat(a.members)).toEqual(expect.arrayContaining([x.id, y.id]));
  });

  it("carries each official's uploaded photo, and none for one without", async () => {
    const file = randomUUID();
    await h.db.query(
      `INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, source)
       VALUES ($1, 'profiles', 'nas', $2, 'profile_photo', 'image/jpeg', 4, $3, 'camera')`,
      [file, `staff/${file}.jpg`, file.replace(/-/g, '').padEnd(64, '0')],
    );
    await h.db.query(
      `INSERT INTO file_links (id, file_id, entity_type, entity_id, slot)
       VALUES ($1, $2, 'user', $3, 'photo')`,
      [randomUUID(), file, people.rpm!.id],
    );
    const res = await api().get('/api/v1/organogram').set(bearer(headSession));
    const nodes = (
      res.body.data.programs as { members: (Node & { photoFileId: string | null })[] }[]
    )
      .flatMap((p) => p.members)
      .flatMap(function all(n): (Node & { photoFileId: string | null })[] {
        return [n, ...(n.reports as (Node & { photoFileId: string | null })[]).flatMap(all)];
      });
    expect(nodes.find((n) => n.userId === people.rpm!.id)?.photoFileId).toBe(file);
    expect(nodes.find((n) => n.userId === people.pm!.id)?.photoFileId).toBeNull();
  });

  it('is refused to a volunteer', async () => {
    const volunteer = await account(h.db, { kind: 'volunteer' });
    const res = await api()
      .get('/api/v1/organogram')
      .set(bearer(await login(h, volunteer)));
    expect(res.status).toBe(403);
  });
});
