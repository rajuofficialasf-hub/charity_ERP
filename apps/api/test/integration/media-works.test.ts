import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { account, type Session } from './support/auth-app';
import { mediaWork, type MediaWorld, mediaWorld } from './support/media';
import { notificationsOf } from './support/notifications';

// A media work from its acceptance to publication: the team moves it among the ordinary stages and
// to "ready to publish", the directors also choose its members, rename, hold, resume, cancel and
// close it; the Media Director gives the final review or sends it back; the first publication marked
// published after the review makes the work "published" and tells the referrer. A member reaches
// only the works they are on; nothing here writes the application or the person.
let m: MediaWorld;
let otherMember: string;
const as = (userId: string) => m.as(userId);

const readReferral = async (s: Session, referralId: string) =>
  m.at(s, 'get', `/media-referrals/${referralId}`);
const versionOf = async (referralId: string) =>
  (await readReferral(await as(m.media.director), referralId)).body.data.work.version as string;
const patch = async (s: Session, referralId: string, workId: string, body: object) =>
  m
    .at(s, 'patch', `/media-works/${workId}`)
    .set('If-Match', await versionOf(referralId))
    .send(body);
const setMembers = (s: Session, workId: string, members: object[]) =>
  m.at(s, 'put', `/media-works/${workId}/members`).send({ members });
const addPublication = (s: Session, workId: string, body: object) =>
  m.at(s, 'post', `/media-works/${workId}/publications`).send(body);
const review = (s: Session, workId: string, body: object) =>
  m.at(s, 'post', `/media-works/${workId}/final-review`).send(body);
const YOUTUBE = 'https://youtu.be/dQw4w9WgXcQ';

/** A work with the member on it as cinematographer and video editor. */
async function staffed() {
  const ids = await mediaWork(m);
  const res = await setMembers(await as(m.media.director), ids.workId, [
    { userId: m.media.member, roles: ['cinematographer', 'video_editor'] },
  ]);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return ids;
}

/** A staffed work moved by its member to "ready to publish". */
async function ready() {
  const ids = await staffed();
  const member = await as(m.media.member);
  for (const stageCode of ['shooting_done', 'editing', 'ready_to_publish']) {
    const res = await patch(member, ids.referralId, ids.workId, { stageCode });
    expect(res.status, `${stageCode}: ${JSON.stringify(res.body)}`).toBe(200);
  }
  return ids;
}

const workEvents = async (workId: string) =>
  (
    await m.h.db.query<{ kind: string }>(
      'SELECT kind FROM media_events WHERE work_id = $1 ORDER BY created_at, id',
      [workId],
    )
  ).rows.map((r) => r.kind);
const workAudit = async (workId: string) =>
  (
    await m.h.db.query<{ action: string }>(
      `SELECT action FROM audit_log WHERE entity_type = 'media_work' AND entity_id = $1 ORDER BY created_at`,
      [workId],
    )
  ).rows.map((r) => r.action);

beforeAll(async () => {
  m = await mediaWorld();
  const other = await account(m.h.db, { role: 'media_team' });
  m.accounts.set(other.id, other);
  otherMember = other.id;
});
afterAll(async () => m.h.close());

describe('the stages of a work', () => {
  it('are moved by the member on it, each move audited and in the history', async () => {
    const { referralId, workId } = await staffed();
    const member = await as(m.media.member);
    const read = await readReferral(member, referralId);
    expect(read.status).toBe(200);
    expect(read.body.data.work).toMatchObject({
      stageCode: 'accepted',
      mayManage: true,
      mayDirect: false,
      mayReview: false,
    });
    expect(read.body.data.work.nextStages).toContain('planning');
    expect(read.body.data.work.nextStages).not.toContain('on_hold');
    const moved = await patch(member, referralId, workId, { stageCode: 'script' });
    expect(moved.status, JSON.stringify(moved.body)).toBe(200);
    expect(moved.body.data.work.stageCode).toBe('script');
    const back = await patch(member, referralId, workId, { stageCode: 'planning' });
    expect(back.body.data.work.stageCode).toBe('planning');
    expect(await workEvents(workId)).toEqual([
      'accepted',
      'members_changed',
      'stage_changed',
      'stage_changed',
    ]);
    expect(await workAudit(workId)).toEqual([
      'media.members_changed',
      'media.work_changed',
      'media.work_changed',
    ]);
  });

  it('refuse the moves the rules forbid to a member: published, done, on hold, accepted', async () => {
    const { referralId, workId } = await staffed();
    const member = await as(m.media.member);
    for (const stageCode of ['published', 'done', 'on_hold', 'cancelled', 'accepted']) {
      const res = await patch(member, referralId, workId, { stageCode });
      expect(res.status, stageCode).toBe(409);
      expect(res.body.error.code).toBe('media.stage_not_allowed');
    }
  });

  it('are held, resumed and cancelled by a director; a cancelled work takes only comments', async () => {
    const { referralId, workId } = await staffed();
    const assistant = await as(m.media.assistant);
    await patch(assistant, referralId, workId, { stageCode: 'editing' });
    const held = await patch(assistant, referralId, workId, { stageCode: 'on_hold' });
    expect(held.body.data.work).toMatchObject({ stageCode: 'on_hold', heldStageCode: 'editing' });
    expect(held.body.data.work.nextStages).toEqual(['editing', 'cancelled']);
    const resumed = await patch(assistant, referralId, workId, { stageCode: 'editing' });
    expect(resumed.body.data.work).toMatchObject({ stageCode: 'editing', heldStageCode: null });
    const cancelled = await patch(assistant, referralId, workId, { stageCode: 'cancelled' });
    expect(cancelled.body.data.work).toMatchObject({ stageCode: 'cancelled', mayManage: false });
    const again = await patch(assistant, referralId, workId, { stageCode: 'editing' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('media.work_closed');
    const comment = await m
      .at(await as(m.media.member), 'post', `/media-works/${workId}/comments`)
      .send({ body: 'ফুটেজ সংরক্ষণ করা আছে' });
    expect(comment.status, JSON.stringify(comment.body)).toBe(201);
    expect(await workEvents(workId)).toEqual(
      expect.arrayContaining(['held', 'resumed', 'cancelled']),
    );
  });

  it('keep the title for the directors, and the script for whoever holds it with If-Match', async () => {
    const { referralId, workId } = await staffed();
    const member = await as(m.media.member);
    const title = await patch(member, referralId, workId, { title: 'নতুন নাম' });
    expect(title.status).toBe(403);
    const renamed = await patch(await as(m.media.director), referralId, workId, {
      title: 'আত্মনির্ভরতার গল্প',
    });
    expect(renamed.body.data.work.title).toBe('আত্মনির্ভরতার গল্প');
    const stale = (await readReferral(member, referralId)).body.data.work.version as string;
    const script = await patch(member, referralId, workId, {
      script: { summary: 'সারসংক্ষেপ', questions: 'কবে শুরু করলেন?' },
      scriptState: 'in_review',
    });
    expect(script.status, JSON.stringify(script.body)).toBe(200);
    expect(script.body.data.work).toMatchObject({
      script: { summary: 'সারসংক্ষেপ' },
      scriptState: 'in_review',
    });
    const late = await m
      .at(member, 'patch', `/media-works/${workId}`)
      .set('If-Match', stale)
      .send({ contentType: 'both' });
    expect(late.status).toBe(412);
    // neither the script text nor the story reaches the audit log
    const logged = await m.h.db.query<{ text: string }>(
      `SELECT coalesce(old::text, '') || coalesce(new::text, '') AS text FROM audit_log WHERE entity_id = $1`,
      [workId],
    );
    expect(logged.rows.map((r) => r.text).join()).not.toContain('সারসংক্ষেপ');
  });
});

describe('the members of a work', () => {
  it('are set by a director, each new one told, and a member sees only the works they are on', async () => {
    const { referralId, workId } = await staffed();
    const told = await notificationsOf(m.h.db, 'media_member_added', m.media.member);
    expect(told.some((n) => n.params.referralId === referralId)).toBe(true);
    const other = await as(otherMember);
    expect((await readReferral(other, referralId)).status).toBe(404);
    expect(
      (await m.at(other, 'post', `/media-works/${workId}/comments`).send({ body: 'দেখি' })).status,
    ).toBe(404);
    const version = (await readReferral(await as(m.media.member), referralId)).body.data.work
      .version as string;
    const move = await m
      .at(other, 'patch', `/media-works/${workId}`)
      .set('If-Match', version)
      .send({ stageCode: 'planning' });
    expect(move.status).toBe(404);
    expect(
      (
        await addPublication(other, workId, {
          platformCode: 'asf_youtube',
          state: 'waiting',
        })
      ).status,
    ).toBe(404);
  });

  it('are refused to a member (403), a person outside the Media Team and an unknown role (422)', async () => {
    const { workId } = await staffed();
    const director = await as(m.media.director);
    expect(
      (
        await setMembers(await as(m.media.member), workId, [
          { userId: otherMember, roles: ['director'] },
        ])
      ).status,
    ).toBe(403);
    const outsider = await setMembers(director, workId, [
      { userId: m.world.users.rpmDhaka, roles: ['director'] },
    ]);
    expect(outsider.status).toBe(422);
    expect(outsider.body.error.details[0].code).toBe('media.member_not_media');
    const role = await setMembers(director, workId, [{ userId: otherMember, roles: ['singer'] }]);
    expect(role.status).toBe(422);
  });
});

describe('the final review and the publication', () => {
  it('runs from ready to publish to published, told to the director and the referrer', async () => {
    const { referralId, workId, applicationId } = await ready();
    const before = await m.h.db.query(
      'SELECT a.status, a.updated_at, b.updated_at AS person FROM applications a JOIN beneficiaries b ON b.id = a.beneficiary_id WHERE a.id = $1',
      [applicationId],
    );
    const waiting = await notificationsOf(m.h.db, 'media_review_waiting', m.media.director);
    expect(waiting.some((n) => n.params.referralId === referralId)).toBe(true);
    const director = await as(m.media.director);
    const early = await addPublication(director, workId, {
      platformCode: 'asf_youtube',
      state: 'published',
      link: YOUTUBE,
      publishedOn: '2026-10-27',
    });
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('media.publish_before_review');
    const approved = await review(director, workId, { decision: 'approve' });
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    expect(approved.body.data.work.reviewApprovedBy.id).toBe(m.media.director);
    const posted = await addPublication(director, workId, {
      platformCode: 'asf_youtube',
      state: 'published',
      link: YOUTUBE,
      publishedOn: '2026-10-27',
    });
    expect(posted.status, JSON.stringify(posted.body)).toBe(201);
    expect(posted.body.data.work).toMatchObject({
      stageCode: 'published',
      publications: [{ platformCode: 'asf_youtube', state: 'published', youtubeId: 'dQw4w9WgXcQ' }],
    });
    const published = await notificationsOf(m.h.db, 'media_published', m.world.users.rpmDhaka);
    expect(published.some((n) => n.params.referralId === referralId)).toBe(true);
    const done = await patch(director, referralId, workId, { stageCode: 'done' });
    expect(done.body.data.work.stageCode).toBe('done');
    // the application and the person are never written by the media work
    const after = await m.h.db.query(
      'SELECT a.status, a.updated_at, b.updated_at AS person FROM applications a JOIN beneficiaries b ON b.id = a.beneficiary_id WHERE a.id = $1',
      [applicationId],
    );
    expect(after.rows).toEqual(before.rows);
  });

  it('is the Media Director’s: the assistant and a member get 403, and only at ready to publish', async () => {
    const { workId } = await staffed();
    const director = await as(m.media.director);
    const notReady = await review(director, workId, { decision: 'approve' });
    expect(notReady.status).toBe(409);
    expect(notReady.body.error.code).toBe('media.review_not_ready');
    const { workId: readyWork, referralId } = await ready();
    for (const user of [m.media.assistant, m.media.member])
      expect((await review(await as(user), readyWork, { decision: 'approve' })).status).toBe(403);
    expect((await review(director, readyWork, { decision: 'send_back' })).status).toBe(422);
    const back = await review(director, readyWork, {
      decision: 'send_back',
      comment: 'শেষ দৃশ্যটি ছোট করুন',
    });
    expect(back.body.data.work.stageCode).toBe('in_review');
    // from "in review" the team goes back to an ordinary stage first
    const member = await as(m.media.member);
    expect(
      (await patch(member, referralId, readyWork, { stageCode: 'ready_to_publish' })).status,
    ).toBe(409);
    expect((await patch(member, referralId, readyWork, { stageCode: 'editing' })).status).toBe(200);
  });

  it('checks a link against its platform, and a published post for its link and date', async () => {
    const { workId } = await staffed();
    const director = await as(m.media.director);
    const wrongHost = await addPublication(director, workId, {
      platformCode: 'asf_youtube',
      state: 'waiting',
      link: 'https://www.facebook.com/AsSunnahFoundation/videos/1',
    });
    expect(wrongHost.status).toBe(422);
    expect(wrongHost.body.error.details[0].code).toBe('media.link_host');
    const http = await addPublication(director, workId, {
      platformCode: 'asf_facebook',
      state: 'waiting',
      link: 'http://facebook.com/x',
    });
    expect(http.body.error.details[0].code).toBe('media.link_invalid');
    const unknown = await addPublication(director, workId, {
      platformCode: 'tiktok',
      state: 'waiting',
    });
    expect(unknown.body.error.details[0].code).toBe('media.platform_unknown');
    const waiting = await addPublication(director, workId, {
      platformCode: 'asf_facebook',
      state: 'waiting',
    });
    expect(waiting.status, JSON.stringify(waiting.body)).toBe(201);
    const publicationId = waiting.body.data.work.publications[0].id as string;
    const bare = await m
      .at(director, 'patch', `/media-publications/${publicationId}`)
      .send({ state: 'published' });
    expect(bare.status).toBe(422);
    const noted = await m
      .at(director, 'patch', `/media-publications/${publicationId}`)
      .send({ note: 'শুক্রবার সন্ধ্যায়' });
    expect(noted.status, JSON.stringify(noted.body)).toBe(200);
    expect(
      (
        await m
          .at(await as(otherMember), 'patch', `/media-publications/${publicationId}`)
          .send({ note: 'x' })
      ).status,
    ).toBe(404);
    expect(
      (await m.at(director, 'patch', `/media-publications/${randomUUID()}`).send({ note: 'x' }))
        .status,
    ).toBe(404);
  });
});

describe('the work routes and the people outside the Media Team', () => {
  it('refuse a volunteer and the Finance Team (403), and a referrer of another region (404)', async () => {
    const { referralId, workId } = await staffed();
    for (const user of [m.world.users.general, m.media.finance]) {
      const s = await as(user);
      expect((await readReferral(s, referralId)).status, user).toBe(403);
      expect(
        (
          await m
            .at(s, 'patch', `/media-works/${workId}`)
            .set('If-Match', '"x"')
            .send({ stageCode: 'planning' })
        ).status,
      ).toBe(403);
      expect(
        (await m.at(s, 'post', `/media-works/${workId}/comments`).send({ body: 'x' })).status,
      ).toBe(403);
    }
    const rangpur = await as(m.world.users.rpmRangpur);
    expect((await readReferral(rangpur, referralId)).status).toBe(404);
    // the referrer reads the work and comments, but does not run it
    const rpm = await as(m.world.users.rpmDhaka);
    const own = await readReferral(rpm, referralId);
    expect(own.body.data.work).toMatchObject({ mayManage: false, nextStages: [] });
    expect(
      (await m.at(rpm, 'post', `/media-works/${workId}/comments`).send({ body: 'ধন্যবাদ' })).status,
    ).toBe(201);
    expect((await setMembers(rpm, workId, [])).status).toBe(403);
  });
});
