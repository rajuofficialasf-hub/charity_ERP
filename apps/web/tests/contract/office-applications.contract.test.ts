import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  bulkReviewSchema,
  fieldChangeSchema,
  myProjectSchema,
  officeApplicationPageSchema,
  officeApplicationRecordSchema,
  officeTimelineEntrySchema,
  publicSubmissionSchema,
  pulledApplicationSchema,
  quotaSchema,
  unlockSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope } from './support/expect';
import { approvedVolunteer } from './support/people';
import { at, type Caller, call, contractBase, signIn } from './support/session';
import {
  type ActiveProject,
  activeProject,
  answers,
  approvedApplication,
  assign,
  consent,
  must,
  HEAD,
  PM_HUM,
  RPM_DHAKA,
  sentApplication,
} from './support/world';

// The office's side of the applications: the list with its filters, the review page with its
// timeline, change log, score and quotas, the decisions, an answer opened for correction and
// accepted or cancelled, the waitlist pull, the verification of a public entry and one bulk
// review. The applications are made on a scored project of this run by a volunteer of this run.
const REASON = 'চুক্তি পরীক্ষার কারণ';

describe.skipIf(!contractBase())('the office’s applications', () => {
  let project: ActiveProject;
  let volunteer: Caller;
  let office: Caller;

  beforeAll(async () => {
    project = await activeProject({ scoring: true });
    const person = await approvedVolunteer();
    volunteer = await assign(project.projectId, person.mobile);
    must(await consent(volunteer, project.projectId), 200, 'consent', myProjectSchema);
    office = await signIn(RPM_DHAKA);
  });

  /** The record as the office reads it, with its version. */
  const read = async (id: string) =>
    expectEnvelope(
      await call(office, 'GET', `/applications/${id}`),
      200,
      officeApplicationRecordSchema,
    );

  /** One decision of the office with the version it read last. */
  const decide = async (id: string, action: string, body: object = {}) =>
    expectEnvelope(
      await call(office, 'POST', at`/applications/${id}/actions/${action}`, body, {
        'If-Match': (await read(id)).meta.etag ?? '',
      }),
      200,
      officeApplicationRecordSchema,
    ).data;

  it('lists the applications with filters and reviews one through to approval', async () => {
    const { id } = await sentApplication(project, volunteer);
    const page = expectEnvelope(
      await call(
        office,
        'GET',
        `/projects/${project.projectId}/applications?status=submitted&districtId=${project.places.district}&sort=-score&limit=25&include=total`,
      ),
      200,
      officeApplicationPageSchema,
    );
    expect(page.data.map((a) => a.id)).toContain(id);
    // an edit is logged in the change log while the application is under review
    await decide(id, 'review');
    const record = await read(id);
    expect(record.data.decisionHints).toBeDefined();
    // the office's edit of the answers is the global roles' (a Project Executive with edit access
    // on the project does it in the field)
    const head = await signIn(HEAD);
    const edited = expectEnvelope(
      await call(
        head,
        'PATCH',
        `/applications/${id}`,
        {
          answers: record.data.answers.map((a) =>
            a.fieldKey === 'q_village' ? { ...a, value: { t: 'short_text', v: 'নতুন পাড়া' } } : a,
          ),
        },
        { 'If-Match': record.meta.etag ?? '' },
      ),
      200,
      officeApplicationRecordSchema,
    );
    expect(edited.data.id).toBe(id);
    const changes = expectContract(
      await call(office, 'GET', `/applications/${id}/changes?limit=50`),
      200,
      z.array(fieldChangeSchema),
    );
    expect(changes.length).toBeGreaterThan(0);
    await decide(id, 'send_for_approval');
    const approved = await decide(id, 'approve');
    expect(approved.status).toBe('implementation');
    expect(approved.scoreItems?.length).toBeGreaterThan(0);
    const timeline = expectContract(
      await call(office, 'GET', `/applications/${id}/timeline`),
      200,
      z.array(officeTimelineEntrySchema),
    );
    expect(timeline.map((t) => t.to)).toContain(approved.status);
    expectContract(
      await call(office, 'GET', `/projects/${project.projectId}/quotas`),
      200,
      z.array(quotaSchema),
    );
  });

  it('opens two answers for correction, accepts the one filled and cancels the other', async () => {
    const id = await approvedApplication(project, volunteer);
    const open = async (fieldKey: string) =>
      expectContract(
        await call(office, 'POST', `/applications/${id}/unlocks`, { fieldKey, reason: REASON }),
        201,
        unlockSchema,
      );
    const village = await open('q_village');
    const note = await open('q_note');
    must(
      await call(volunteer, 'PUT', `/application-unlocks/${village.id}/value`, {
        value: { t: 'short_text', v: 'উত্তরপাড়া' },
      }),
      200,
      'fill',
      unlockSchema,
    );
    expect(
      expectContract(
        await call(office, 'POST', `/application-unlocks/${village.id}/decision`, {
          decision: 'accept',
        }),
        200,
        unlockSchema,
      ).decision,
    ).toBe('accepted');
    expect(
      expectContract(
        await call(office, 'POST', `/application-unlocks/${note.id}/cancel`, { reason: REASON }),
        200,
        unlockSchema,
      ).decision,
    ).toBe('cancelled');
  });

  it('waitlists an application and pulls the next one back with one click', async () => {
    const { id } = await sentApplication(project, volunteer);
    await decide(id, 'review');
    await decide(id, 'send_for_approval');
    expect((await decide(id, 'waitlist', { reason: REASON })).status).toBe('waitlisted');
    const pulled = expectEnvelope(
      await call(
        office,
        'POST',
        `/projects/${project.projectId}/waitlist/pull-next`,
        { comment: REASON },
        { 'Idempotency-Key': randomUUID() },
      ),
      200,
      pulledApplicationSchema,
    );
    expect(pulled.data.id).toBeDefined();
  });

  it('verifies an entry that came through the public link', async () => {
    const pm = await signIn(PM_HUM);
    const { url } = must(
      await call(pm, 'PATCH', `/projects/${project.projectId}/public-link`, {
        enabled: true,
        formId: project.formId,
      }),
      200,
      'public link',
      z.object({ url: z.string() }),
    ).data;
    const token = url.split('/apply/')[1]!;
    const entry = expectContract(
      await call(null, 'POST', at`/public/forms/${token}/applications`, {
        clientUuid: randomUUID(),
        clientCreatedAt: new Date().toISOString(),
        answers: answers(project.places),
      }),
      201,
      publicSubmissionSchema,
    );
    expect((await read(entry.id)).data.status).toBe('needs_verification');
    expect((await decide(entry.id, 'verify_create')).status).not.toBe('needs_verification');
  });

  it('reviews two applications in one bulk action', async () => {
    const sent = [
      await sentApplication(project, volunteer),
      await sentApplication(project, volunteer),
    ];
    const rows = await Promise.all(
      sent.map(async ({ id }) => ({
        clientUuid: randomUUID(),
        applicationId: id,
        ifMatch: (await read(id)).meta.etag ?? '',
      })),
    );
    const done = expectContract(
      await call(
        office,
        'POST',
        `/projects/${project.projectId}/bulk/review`,
        { action: 'review', rows },
        { 'Idempotency-Key': randomUUID() },
      ),
      200,
      bulkReviewSchema,
    );
    expect(done.results.map((r) => r.result)).toEqual(['done', 'done']);
  });
});
