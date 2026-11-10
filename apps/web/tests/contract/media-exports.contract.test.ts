import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  exportColumnsSchema,
  exportJobSchema,
  mediaMemberSchema,
  mediaReferralSchema,
  mediaSummarySchema,
  mediaTeamMemberSchema,
  mediaWorkPageSchema,
  myProjectSchema,
  referenceItemSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { at, type Caller, call, contractBase, signIn } from './support/session';
import {
  activeProject,
  approvedApplication,
  assign,
  consent,
  HEAD,
  MEDIA_MEMBER,
  must,
  RPM_DHAKA,
  until,
} from './support/world';

// The Media Team's screens and the exports: an approved application sent to the Media Team, its
// work run by the Department Head (who holds every media right) up to a published post, the
// member's portfolio, and a list's export, a record's PDF and the person's own jobs.
/** A volunteer no other contract case signs in with. */
const VOLUNTEER = '01700000115';

describe.skipIf(!contractBase())('the Media Team’s screens and the exports', () => {
  let head: Caller;
  let applicationId: string;
  let beneficiaryId: string;

  beforeAll(async () => {
    const project = await activeProject();
    const volunteer = await assign(project.projectId, VOLUNTEER);
    must(await consent(volunteer, project.projectId), 200, 'consent', myProjectSchema);
    applicationId = await approvedApplication(project, volunteer);
    head = await signIn(HEAD);
    beneficiaryId = must(
      await call(head, 'GET', `/applications/${applicationId}`),
      200,
      'application',
      z.object({ beneficiaryId: z.uuid() }),
    ).data.beneficiaryId;
  });

  it('runs a referral from the approved application to a published work', async () => {
    const rpm = await signIn(RPM_DHAKA);
    const referred = expectContract(
      await call(rpm, 'POST', `/applications/${applicationId}/media-referral`, {
        priority: 'normal',
        note: 'একটি অনুপ্রেরণার গল্প',
        story: 'পরিবারটি শীতে কষ্টে ছিল।',
      }),
      201,
      mediaReferralSchema,
    );
    expectContract(await call(head, 'GET', '/media/summary'), 200, mediaSummarySchema);
    const works = expectEnvelope(
      await call(head, 'GET', '/media-works?limit=20'),
      200,
      mediaWorkPageSchema,
    );
    expect(works.data.map((w) => w.referralId)).toContain(referred.id);
    expectContract(
      await call(head, 'GET', `/media-referrals/${referred.id}`),
      200,
      mediaReferralSchema,
    );
    let work = expectContract(
      await call(head, 'POST', `/media-referrals/${referred.id}/decision`, { decision: 'accept' }),
      200,
      mediaReferralSchema,
    ).work!;

    const roles = expectContract(
      await call(head, 'GET', at`/reference-lists/${'media_role'}`),
      200,
      z.array(referenceItemSchema),
    );
    const platforms = expectContract(
      await call(head, 'GET', at`/reference-lists/${'media_platform'}`),
      200,
      z.array(referenceItemSchema),
    );
    const team = expectContract(
      await call(head, 'GET', '/media/members'),
      200,
      z.array(mediaTeamMemberSchema),
    );
    const member = await signIn(MEDIA_MEMBER);
    const memberId = (member.me as { id: string }).id;
    expect(team.map((m) => m.id)).toContain(memberId);
    work = expectContract(
      await call(
        head,
        'PUT',
        `/media-works/${work.id}/members`,
        { members: [{ userId: memberId, roles: [roles.find((r) => r.active)!.code] }] },
        { 'If-Match': work.version },
      ),
      200,
      mediaReferralSchema,
    ).work!;
    work = expectContract(
      await call(
        head,
        'PATCH',
        `/media-works/${work.id}`,
        { title: 'শীতের গল্প', stageCode: 'ready_to_publish' },
        { 'If-Match': work.version },
      ),
      200,
      mediaReferralSchema,
    ).work!;
    work = expectContract(
      await call(
        head,
        'POST',
        `/media-works/${work.id}/final-review`,
        { decision: 'approve' },
        { 'If-Match': work.version },
      ),
      200,
      mediaReferralSchema,
    ).work!;
    work = expectContract(
      await call(head, 'POST', `/media-works/${work.id}/publications`, {
        platformCode: platforms.find((p) => p.kind === 'youtube')!.code,
        state: 'published',
        publishedOn: new Date().toISOString().slice(0, 10),
        link: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      }),
      201,
      mediaReferralSchema,
    ).work!;
    expect(work.stageCode).toBe('published');
    expectContract(
      await call(head, 'PATCH', `/media-publications/${work.publications[0]!.id}`, {
        note: 'প্রথম পোস্ট',
      }),
      200,
      mediaReferralSchema,
    );
    expectContract(
      await call(head, 'POST', `/media-works/${work.id}/comments`, { body: 'ভালো হয়েছে' }),
      201,
      mediaReferralSchema,
    );
    const profile = expectContract(
      await call(head, 'GET', `/media/members/${memberId}`),
      200,
      mediaMemberSchema,
    );
    expect(profile.portfolio.map((p) => p.workId)).toContain(work.id);
  });

  it('exports a list and two records, follows the jobs and saves the file', async () => {
    const { columns } = expectContract(
      await call(head, 'GET', '/exports/columns?list=volunteers'),
      200,
      exportColumnsSchema,
    );
    const list = expectContract(
      await call(head, 'POST', '/exports', {
        kind: 'volunteers',
        format: 'csv',
        columns: columns.slice(0, 2).map((c) => c.id),
        filters: {},
      }),
      202,
      exportJobSchema,
    );
    expectContract(
      await call(head, 'POST', `/beneficiaries/${beneficiaryId}/pdf`),
      202,
      exportJobSchema,
    );
    expectContract(
      await call(head, 'POST', `/applications/${applicationId}/pdf`),
      202,
      exportJobSchema,
    );
    const done = await until(
      async () =>
        expectContract(await call(head, 'GET', `/exports/${list.id}`), 200, exportJobSchema),
      (job) => job.status === 'done' || job.status === 'failed',
    );
    expect(done.status).toBe('done');
    const mine = expectContract(await call(head, 'GET', '/exports'), 200, z.array(exportJobSchema));
    expect(mine.map((j) => j.id)).toContain(list.id);
    const file = await call(head, 'GET', `/files/${done.fileId}/content`);
    expectStatus(file, 200);
    expect(file.contentType).toMatch(/^text\/csv/);
  });
});
