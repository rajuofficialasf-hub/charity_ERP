import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAME_KEYS_QUEUE, NAME_KEYS_SINGLETON } from '../../src/jobs/name-keys.js';
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

// The spelling variants of names on the settings page: the Department Head and the Monitoring Team
// add a group, change its spellings and switch it off and on, each change audited with the group
// before and after, raising the version of the list and queuing the key job; a spelling is one word,
// never a title, in one group only, and the groups never chain.
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());
const as = (userId: string) => login(h, accounts.get(userId)!);

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});
afterAll(async () => h.close());

interface Group {
  id: string;
  canonical: string;
  variants: string[];
  active: boolean;
  etag: string;
}

const add = (s: Session, body: object) =>
  api().post('/api/v1/name-variants').set(bearer(s)).send(body);
/** A change made from a read of the group: it names the version that read showed. */
const change = (s: Session, group: Pick<Group, 'id' | 'etag'>, body: object) =>
  api()
    .patch(`/api/v1/name-variants/${group.id}`)
    .set(bearer(s))
    .set('If-Match', group.etag)
    .send(body);
const version = async () =>
  (await h.db.query('SELECT version FROM name_variants_version WHERE id = 1')).rows[0]
    .version as number;
/** A group as the audit keeps it: without its version. */
const audited = ({ etag: _etag, ...group }: Group) => group;
async function audits(groupId: string) {
  const { rows } = await h.db.query<{ old: Group | null; new: Group }>(
    `SELECT old, new FROM audit_log
     WHERE action = 'name_variants.change' AND entity_type = 'name_variant_group' AND entity_id = $1
     ORDER BY created_at, id`,
    [groupId],
  );
  return rows;
}
/** The key jobs waiting, after the queue was emptied by the test. */
async function waitingJobs() {
  const boss = await h.container.jobs.instance();
  return boss.findJobs(NAME_KEYS_QUEUE, { queued: true });
}
async function emptyQueue() {
  const boss = await h.container.jobs.instance();
  await boss.deleteQueuedJobs(NAME_KEYS_QUEUE);
}
/** Expects the change to have raised the version once and queued one key job. */
async function expectRecomputed(before: number) {
  expect(await version()).toBe(before + 1);
  const waiting = await waitingJobs();
  expect(waiting).toHaveLength(1);
  expect(waiting[0]!.singletonKey).toBe(NAME_KEYS_SINGLETON);
}
/** The detail codes of a 422 by their paths. */
const details = (body: { error: { details?: { path: string; code: string }[] } }) =>
  Object.fromEntries((body.error.details ?? []).map((d) => [d.path, d.code]));

// each of the two roles adds a group, changes its spellings and switches it off and on, with its
// own spellings, so the two runs never touch each other's groups
const KEEPERS = [
  {
    role: 'the Department Head',
    user: () => world.users.head,
    first: 'ইব্রাহিম',
    others: ['ইবরাহীম', ' ইব্রাহীম '],
    swap: ['ইবরাহীম', 'ইবরাহিম'],
    freed: 'ইব্রাহীম',
    freedOther: 'ইব্রাহীমু',
  },
  {
    role: 'the Monitoring Team',
    user: () => world.users.monitoring,
    first: 'ইউসুফ',
    others: ['ইউসূফ', 'ইয়ুসুফ'],
    swap: ['ইউসূফ', 'ইউছুফ'],
    freed: 'ইয়ুসুফ',
    freedOther: 'ইয়ূসুফ',
  },
];

describe.each(KEEPERS)('$role keeps the list', (keeper) => {
  let group: Group;

  it('adds a group, audited, raising the version and queuing the job', async () => {
    const s = await as(keeper.user());
    await emptyQueue();
    const before = await version();
    const res = await add(s, { canonical: keeper.first, variants: keeper.others });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    group = res.body.data as Group;
    expect(group).toMatchObject({
      canonical: keeper.first,
      variants: keeper.others.map((v) => v.trim()).sort(),
      active: true,
      etag: expect.any(String),
    });
    const [entry] = await audits(group.id);
    expect(entry).toEqual({ old: null, new: audited(group) });
    await expectRecomputed(before);
    const list = await api().get('/api/v1/name-variants').set(bearer(s));
    expect(list.status).toBe(200);
    // the list carries each group's version
    expect(list.body.data).toContainEqual(group);
  });

  it('changes the spellings: one left out is free for another group', async () => {
    const s = await as(keeper.user());
    await emptyQueue();
    const before = await version();
    const res = await change(s, group, { canonical: keeper.first, variants: keeper.swap });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const changed = res.body.data as Group;
    expect(changed).toMatchObject({ id: group.id, variants: [...keeper.swap].sort() });
    // the group's version moved with its spellings
    expect(changed.etag).not.toBe(group.etag);
    expect((await audits(group.id)).at(-1)).toEqual({
      old: audited(group),
      new: audited(changed),
    });
    await expectRecomputed(before);
    // the spelling taken out stays stored, no longer active, and another group may hold it
    const { rows } = await h.db.query(
      'SELECT active FROM name_variants WHERE variant = $1 AND group_id = $2',
      [keeper.freed, group.id],
    );
    expect(rows).toEqual([{ active: false }]);
    const other = await add(s, { canonical: keeper.freed, variants: [keeper.freedOther] });
    expect(other.status, JSON.stringify(other.body)).toBe(201);
    group = changed;
  });

  it('switches the group off and on, each audited and raising the version', async () => {
    const s = await as(keeper.user());
    for (const active of [false, true]) {
      await emptyQueue();
      const before = await version();
      const res = await change(s, group, { active });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const switched = res.body.data as Group;
      expect(switched).toEqual({ ...group, active, etag: expect.any(String) });
      expect(switched.etag).not.toBe(group.etag);
      expect((await audits(group.id)).at(-1)).toEqual({
        old: audited(group),
        new: audited(switched),
      });
      await expectRecomputed(before);
      group = switched;
    }
    // a change that leaves what the keys read as it was is audited and computes nothing again
    await emptyQueue();
    const before = await version();
    const same = await change(s, group, { active: true });
    expect(same.status).toBe(200);
    expect(await audits(group.id)).toHaveLength(5);
    expect(await version()).toBe(before);
    expect(await waitingJobs()).toHaveLength(0);
  });
});

describe('two officials change one group', () => {
  const read = async (s: Session) =>
    ((await api().get('/api/v1/name-variants').set(bearer(s))).body.data as Group[]).find(
      (g) => g.canonical === 'ইসমাইল',
    )!;

  it('refuses the second save made from the same read, and takes a save after a fresh read', async () => {
    const head = await as(world.users.head);
    const monitoring = await as(world.users.monitoring);
    expect((await add(head, { canonical: 'ইসমাইল', variants: ['ইসমাঈল'] })).status).toBe(201);
    // both open the page and read the group at one version
    const seenByHead = await read(head);
    const seenByMonitoring = await read(monitoring);
    expect(seenByMonitoring.etag).toBe(seenByHead.etag);
    const first = await change(head, seenByHead, {
      canonical: 'ইসমাইল',
      variants: ['ইসমাঈল', 'ইছমাইল'],
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const before = await version();
    const second = await change(monitoring, seenByMonitoring, {
      canonical: 'ইসমাইল',
      variants: ['ইসমাঈল', 'ইসমায়িল'],
    });
    expect(second.status).toBe(412);
    expect(second.body.error.code).toBe('conflict.stale_version');
    // the first official's spelling stays and the refused save wrote nothing
    const stored = await read(head);
    expect(stored.variants).toEqual(['ইছমাইল', 'ইসমাঈল']);
    expect(await audits(stored.id)).toHaveLength(2);
    expect(await version()).toBe(before);
    // a save that names no version is refused as well
    const unversioned = await api()
      .patch(`/api/v1/name-variants/${stored.id}`)
      .set(bearer(monitoring))
      .send({ active: false });
    expect(unversioned.status).toBe(412);
    // after a fresh read the second official's save passes and keeps the first one's spelling
    const again = await change(monitoring, await read(monitoring), {
      canonical: 'ইসমাইল',
      variants: ['ইসমাঈল', 'ইছমাইল', 'ইসমায়িল'],
    });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((again.body.data as Group).variants).toEqual(['ইছমাইল', 'ইসমাঈল', 'ইসমায়িল']);
  });

  it('answers 404 for a group that does not exist', async () => {
    const head = await as(world.users.head);
    const res = await change(head, { id: randomUUID(), etag: '"x"' }, { active: false });
    expect(res.status).toBe(404);
  });
});

describe('who may keep the list', () => {
  it('refuses a PM, an RPM, an executive and a volunteer, reading and writing', async () => {
    const head = await as(world.users.head);
    const group = (await add(head, { canonical: 'হারুন', variants: ['হারূন'] })).body.data as Group;
    for (const userId of [
      world.users.pm,
      world.users.rpmDhaka,
      world.users.executive,
      world.users.general,
    ]) {
      const s = await as(userId);
      expect((await api().get('/api/v1/name-variants').set(bearer(s))).status).toBe(403);
      expect((await add(s, { canonical: 'মুসা', variants: ['মূসা'] })).status).toBe(403);
      expect((await change(s, group, { active: false })).status).toBe(403);
    }
    expect(await audits(group.id)).toHaveLength(1);
  });
});

describe('the spellings a group may hold', () => {
  it('refuses a spelling with a space, a title, other letters, marks alone and a spelling given twice', async () => {
    const head = await as(world.users.head);
    const before = await version();
    const res = await add(head, {
      canonical: 'আব্দুল করিম',
      variants: ['মোঃ', 'বেগম', 'করিম১', 'Karim2', 'করিম', 'করিম', '\u0983', '\u0981'],
    });
    expect(res.status).toBe(422);
    expect(details(res.body)).toEqual({
      canonical: 'validation.name_variant_one_word',
      'variants.0': 'validation.name_variant_title',
      'variants.1': 'validation.name_variant_title',
      'variants.2': 'validation.name_variant_letters',
      'variants.3': 'validation.name_variant_letters',
      'variants.5': 'validation.name_variant_repeated',
      'variants.6': 'validation.name_variant_no_letter',
      'variants.7': 'validation.name_variant_no_letter',
    });
    expect(await version()).toBe(before);
  });

  it('refuses a spelling another group holds, also a group switched off', async () => {
    const head = await as(world.users.head);
    const first = (await add(head, { canonical: 'ইদ্রিস', variants: ['ইদরিস'] })).body
      .data as Group;
    await change(head, first, { active: false });
    const res = await add(head, { canonical: 'ইদরীস', variants: ['ইদরিস'] });
    expect(res.status).toBe(422);
    expect(details(res.body)).toEqual({ 'variants.0': 'validation.name_variant_taken' });
    const latin = (await add(head, { canonical: 'Idris', variants: ['Idrees'] })).body
      .data as Group;
    // the same spelling in another letter case is the same spelling
    const again = await add(head, { canonical: 'IDRIS', variants: ['Edris'] });
    expect(details(again.body)).toEqual({ canonical: 'validation.name_variant_taken' });
    expect(latin.active).toBe(true);
  });

  it('refuses a chain: a canonical that is another group’s spelling, or another group’s canonical as a spelling', async () => {
    const head = await as(world.users.head);
    const base = (await add(head, { canonical: 'নূহ', variants: ['নুহ'] })).body.data as Group;
    const asCanonical = await add(head, { canonical: 'নুহ', variants: ['নোহ'] });
    expect(asCanonical.status).toBe(422);
    expect(details(asCanonical.body)).toEqual({ canonical: 'validation.name_variant_chain' });
    const asSpelling = await add(head, { canonical: 'নোয়া', variants: ['নূহ'] });
    expect(asSpelling.status).toBe(422);
    expect(details(asSpelling.body)).toEqual({ 'variants.0': 'validation.name_variant_chain' });
    // a change of a group is held to the same rules
    const other = (await add(head, { canonical: 'লূত', variants: ['লুত'] })).body.data as Group;
    const res = await change(head, other, { canonical: 'লূত', variants: ['লুত', 'নূহ'] });
    expect(res.status).toBe(422);
    expect(details(res.body)).toEqual({ 'variants.1': 'validation.name_variant_chain' });
    expect(base.active).toBe(true);
  });

  it('asks for the canonical and the other spellings together in a change', async () => {
    const head = await as(world.users.head);
    const group = (await add(head, { canonical: 'ইলিয়াস', variants: ['ইলইয়াস'] })).body
      .data as Group;
    const res = await change(head, group, { variants: ['ইলিয়াছ'] });
    expect(res.status).toBe(422);
    expect(details(res.body)).toEqual({ canonical: 'validation.required' });
  });
});

describe('the keys follow the list', () => {
  it('makes two profiles whose names differ only by a new spelling equal after the key job', async () => {
    const one = await f.beneficiary(h.db, world.dhaka, {
      name: 'মোঃ আব্দুল কাদের',
      father_or_husband_name: 'রফিক',
      village: 'চরপাড়া',
    });
    const two = await f.beneficiary(h.db, world.dhaka, {
      name: 'আব্দুল কাদির',
      father_or_husband_name: 'রফিক',
      village: 'চরপাড়া',
    });
    const keys = async () =>
      (
        await h.db.query(
          'SELECT name_key, guardian_key, village_key FROM beneficiaries WHERE id = ANY($1::uuid[]) ORDER BY id',
          [[one, two]],
        )
      ).rows as { name_key: string; guardian_key: string; village_key: string }[];
    await h.container.nameKeys.run();
    const [a, b] = await keys();
    expect(a!.name_key).not.toBe(b!.name_key);
    const head = await as(world.users.head);
    const res = await add(head, { canonical: 'কাদের', variants: ['কাদির'] });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    await h.container.nameKeys.run();
    const [c, d] = await keys();
    expect(c!.name_key).toBe('আব্দুলকাদের');
    expect(c).toEqual(d);
  });
});
