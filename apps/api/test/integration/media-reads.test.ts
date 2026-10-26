import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { account } from './support/auth-app';
import {
  mediaApplication,
  mediaReferral,
  mediaWork,
  type MediaWorld,
  mediaWorld,
  publishedWork,
} from './support/media';

// The reads of the Media Team's screens: the home's counts by program, the works list with its
// filters, a member's profile with the portfolio of published works, the published works on the
// person's 360° profile, and the waiting media work in "needs your attention". A member sees only
// the works they are on; a volunteer and the Finance Team reach none of it.
let m: MediaWorld;
let second: string;
const as = (userId: string) => m.as(userId);
const get = async (userId: string, path: string) => m.at(await as(userId), 'get', path);

type Item = { kind: string; count: number; href: string };
const attention = async (userId: string) =>
  ((await get(userId, '/me/attention')).body.data as Item[]).reduce<Record<string, number>>(
    (all, i) => ({ ...all, [i.kind]: i.count }),
    {},
  );

let published: { referralId: string; workId: string; applicationId: string };
let pendingReferral: string;
let memberWork: { referralId: string; workId: string };

beforeAll(async () => {
  m = await mediaWorld();
  const other = await account(m.h.db, { role: 'media_team' });
  m.accounts.set(other.id, other);
  second = other.id;
  // a work published by two members, a work with one member at its start, a referral waiting
  published = await publishedWork(m, [
    { userId: m.media.member, roles: ['cinematographer'] },
    { userId: second, roles: ['video_editor', 'scriptwriter'] },
  ]);
  memberWork = await mediaWork(m);
  const director = await as(m.media.director);
  const staffed = await m
    .at(director, 'put', `/media-works/${memberWork.workId}/members`)
    .send({ members: [{ userId: m.media.member, roles: ['director'] }] });
  expect(staffed.status).toBe(200);
  pendingReferral = await mediaReferral(m, await mediaApplication(m));
});
afterAll(async () => m.h.close());

describe('the home’s counts', () => {
  it('count every referral and work for a director, by program and overall', async () => {
    const res = await get(m.media.director, '/media/summary');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.overall).toEqual({
      referrals: 3,
      new: 1,
      inReview: 0,
      inProgress: 1,
      waitingForShooting: 0,
      inEditing: 0,
      published: 1,
      done: 0,
      rejected: 0,
    });
    expect(res.body.data.programs).toEqual([
      expect.objectContaining({
        program: expect.objectContaining({ id: m.world.a1.program }),
        counts: {
          referrals: 3,
          new: 1,
          inReview: 0,
          inProgress: 1,
          waitingForShooting: 0,
          inEditing: 0,
          published: 1,
          done: 0,
          rejected: 0,
        },
      }),
    ]);
  });

  it('count only a member’s own works', async () => {
    const res = await get(second, '/media/summary');
    expect(res.body.data.overall).toMatchObject({
      referrals: 1,
      published: 1,
      new: 0,
      inProgress: 0,
    });
  });
});

describe('the works list', () => {
  it('lists every referral for a director, newest first, and filters by stage, decision and member', async () => {
    const all = await get(m.media.director, '/media-works?limit=100');
    expect(all.status, JSON.stringify(all.body)).toBe(200);
    expect(all.body.data.map((r: { referralId: string }) => r.referralId)).toEqual([
      pendingReferral,
      memberWork.referralId,
      published.referralId,
    ]);
    const row = all.body.data[2];
    expect(row).toMatchObject({
      workId: published.workId,
      stageCode: 'published',
      state: 'accepted',
      priority: 'high',
      members: [{ userId: m.media.member }, { userId: second }],
    });
    const waiting = await get(m.media.director, '/media-works?state=pending');
    expect(waiting.body.data.map((r: { referralId: string }) => r.referralId)).toEqual([
      pendingReferral,
    ]);
    const atStage = await get(m.media.director, '/media-works?stage=published,done');
    expect(atStage.body.data).toHaveLength(1);
    const ofMember = await get(m.media.director, `/media-works?memberId=${second}`);
    expect(ofMember.body.data.map((r: { workId: string }) => r.workId)).toEqual([published.workId]);
    const paged = await get(m.media.director, '/media-works?limit=2');
    expect(paged.body.data).toHaveLength(2);
    const next = await get(
      m.media.director,
      `/media-works?limit=2&cursor=${encodeURIComponent(paged.body.meta.nextCursor as string)}`,
    );
    expect(next.body.data.map((r: { referralId: string }) => r.referralId)).toEqual([
      published.referralId,
    ]);
    expect((await get(m.media.director, '/media-works?priority=urgent')).status).toBe(422);
    expect((await get(m.media.director, '/media-works?state=lost')).status).toBe(422);
  });

  it('holds only a member’s own works, and the referrer’s region for an RPM', async () => {
    const mine = await get(m.media.member, '/media-works');
    expect(mine.body.data.map((r: { workId: string }) => r.workId).sort()).toEqual(
      [published.workId, memberWork.workId].sort(),
    );
    const rangpur = await get(m.world.users.rpmRangpur, '/media-works');
    expect(rangpur.body.data).toEqual([]);
    const dhaka = await get(m.world.users.rpmDhaka, '/media-works');
    expect(dhaka.body.data).toHaveLength(3);
  });
});

describe('a member’s profile', () => {
  it('shows the contact, the counts and the published works with the member’s roles', async () => {
    const res = await get(m.world.users.pm, `/media/members/${second}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // the contact is for the team; a referrer sees the portfolio only
    expect(res.body.data).toMatchObject({ mobile: null, email: null });
    const team = await get(m.media.director, `/media/members/${second}`);
    expect(team.body.data.mobile).toEqual(expect.any(String));
    const own = await get(second, `/media/members/${second}`);
    expect(own.body.data.email).toEqual(expect.any(String));
    expect(res.body.data).toMatchObject({
      id: second,
      roles: ['media_team'],
      counts: { works: 1, published: 1 },
      portfolio: [
        {
          workId: published.workId,
          ownRoles: ['video_editor', 'scriptwriter'],
          publications: [{ platformCode: 'asf_youtube', youtubeId: 'dQw4w9WgXcQ' }],
        },
      ],
    });
    // a work of two members appears on both profiles
    const first = await get(m.media.director, `/media/members/${m.media.member}`);
    expect(first.body.data.counts).toEqual({ works: 2, published: 1 });
    expect(first.body.data.portfolio.map((w: { workId: string }) => w.workId)).toEqual([
      published.workId,
    ]);
  });

  it('is 404 for anyone outside the Media Team', async () => {
    for (const id of [m.world.users.rpmDhaka, randomUUID()])
      expect((await get(m.media.director, `/media/members/${id}`)).status).toBe(404);
  });
});

describe('the person’s profile', () => {
  it('shows the published works about them, and no work in progress', async () => {
    const beneficiary = await m.h.db.query<{ beneficiary_id: string }>(
      'SELECT beneficiary_id FROM applications WHERE id = $1',
      [published.applicationId],
    );
    const res = await get(
      m.world.users.head,
      `/beneficiaries/${beneficiary.rows[0]!.beneficiary_id}`,
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.media).toEqual([
      expect.objectContaining({
        workId: published.workId,
        stageCode: 'published',
        publishedOn: '2026-10-27',
        members: [
          expect.objectContaining({ userId: m.media.member, roles: ['cinematographer'] }),
          expect.objectContaining({ userId: second }),
        ],
      }),
    ]);
    const other = await m.h.db.query<{ beneficiary_id: string }>(
      'SELECT r.beneficiary_id FROM media_referrals r WHERE r.id = $1',
      [memberWork.referralId],
    );
    const inProgress = await get(
      m.world.users.head,
      `/beneficiaries/${other.rows[0]!.beneficiary_id}`,
    );
    expect(inProgress.body.data.media).toEqual([]);
  });
});

describe('needs your attention', () => {
  it('counts the referrals to decide, the reviews waiting and the works sent back, each for whoever acts', async () => {
    expect((await attention(m.media.director)).media_referrals_new).toBe(1);
    expect((await attention(m.media.assistant)).media_referrals_new).toBe(1);
    expect((await attention(m.media.member)).media_referrals_new).toBeUndefined();
    const director = await as(m.media.director);
    const version = async () =>
      (await m.at(director, 'get', `/media-referrals/${memberWork.referralId}`)).body.data.work
        .version as string;
    const move = async (stageCode: string) => {
      const res = await m
        .at(director, 'patch', `/media-works/${memberWork.workId}`)
        .set('If-Match', await version())
        .send({ stageCode });
      expect(res.status, stageCode).toBe(200);
    };
    await move('ready_to_publish');
    expect((await attention(m.media.director)).media_review_waiting).toBe(1);
    expect((await attention(m.media.assistant)).media_review_waiting).toBeUndefined();
    const back = await m
      .at(director, 'post', `/media-works/${memberWork.workId}/final-review`)
      .set('If-Match', await version())
      .send({ decision: 'send_back', comment: 'আবার দেখুন' });
    expect(back.status).toBe(200);
    expect((await attention(m.media.member)).media_sent_back).toBe(1);
    expect((await attention(second)).media_sent_back).toBeUndefined();
    expect((await attention(m.world.users.rpmDhaka)).media_sent_back).toBeUndefined();
  });

  it('counts a member’s own works on hold', async () => {
    const director = await as(m.media.director);
    const version = (await m.at(director, 'get', `/media-referrals/${memberWork.referralId}`)).body
      .data.work.version as string;
    const held = await m
      .at(director, 'patch', `/media-works/${memberWork.workId}`)
      .set('If-Match', version)
      .send({ stageCode: 'on_hold' });
    expect(held.status).toBe(200);
    expect((await attention(m.media.member)).media_on_hold).toBe(1);
    expect((await attention(second)).media_on_hold).toBeUndefined();
  });
});

describe('the platform list', () => {
  it('keeps the kind of a platform that already has links', async () => {
    const res = await m
      .at(
        await as(m.world.users.head),
        'patch',
        '/reference-lists/media_platform/items/asf_youtube',
      )
      .send({ kind: 'other' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('reference.kind_in_use');
  });
});

describe('the people outside the Media Team', () => {
  it('reach no media read: a volunteer and the Finance Team get 403', async () => {
    for (const user of [m.world.users.general, m.media.finance])
      for (const path of ['/media/summary', '/media-works', `/media/members/${second}`]) {
        const res = await get(user, path);
        expect(res.status, `${user} ${path}`).toBe(403);
      }
  });

  it('show a volunteer nothing of the Media Team in their attention', async () => {
    const items = await attention(m.world.users.general);
    expect(Object.keys(items).filter((k) => k.startsWith('media_'))).toEqual([]);
  });
});
