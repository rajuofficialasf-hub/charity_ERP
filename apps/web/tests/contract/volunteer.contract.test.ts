import { createHash, randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  applicationFormSchema,
  applicationPageSchema,
  applicationRecordSchema,
  locationViewSchema,
  myProjectDetailSchema,
  myProjectSchema,
  publicFormSchema,
  publicSubmissionSchema,
  snapshotViewSchema,
  storedFileSchema,
  syncBatchResponseSchema,
  teamSchema,
  timelineEntrySchema,
  unlockSchema,
  uploadedFileSchema,
  uploadSessionSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { at, type Caller, call, contractBase, signIn } from './support/session';
import {
  type ActiveProject,
  activeProject,
  answers,
  approvedApplication,
  assign,
  must,
  PM_HUM,
  PNG,
  RPM_DHAKA,
} from './support/world';

// The volunteer's screens: the own projects and the team, an application from its draft to the
// office, an answer opened for correction, a photo upload, the phone's sync, and an application
// through the public link.
/** Volunteer 1, whose team member (volunteer 19) the team case adds. */
const VOLUNTEER = '01700000101';

describe.skipIf(!contractBase())('the volunteer’s screens', () => {
  let project: ActiveProject;
  let volunteer: Caller;
  let formVersionId: string;

  beforeAll(async () => {
    project = await activeProject();
    volunteer = await assign(project.projectId, VOLUNTEER);
  });

  it('reads the own projects, accepts the rules and builds a team', async () => {
    const mine = expectContract(
      await call(volunteer, 'GET', '/me/projects'),
      200,
      z.array(myProjectSchema),
    );
    expect(mine.map((p) => p.projectId)).toContain(project.projectId);
    const detail = expectContract(
      await call(volunteer, 'GET', `/me/projects/${project.projectId}`),
      200,
      myProjectDetailSchema,
    );
    const accepted = expectContract(
      await call(volunteer, 'POST', `/me/projects/${project.projectId}/consent`, {
        rulesVersion: detail.rules.version,
        decision: 'accepted',
        parts: detail.rules.parts.map((p) => p.part),
      }),
      200,
      myProjectSchema,
    );
    expect(accepted.consentStatus).toBe('accepted');
    const team = expectContract(
      await call(volunteer, 'GET', `/me/projects/${project.projectId}/team`),
      200,
      teamSchema,
    );
    const candidate = team.candidates[0]!.volunteerId;
    const grown = expectContract(
      await call(volunteer, 'POST', `/me/projects/${project.projectId}/team`, {
        memberVolunteerIds: [candidate],
      }),
      201,
      teamSchema,
    );
    expect(grown.members.map((m) => m.volunteerId)).toEqual([candidate]);
    expectStatus(
      await call(volunteer, 'POST', `/me/projects/${project.projectId}/team/${candidate}/remove`),
      204,
    );
  });

  it('makes a draft with a photo, sends it to the office and reads it back', async () => {
    const form = expectContract(
      await call(volunteer, 'GET', `/projects/${project.projectId}/application-form`),
      200,
      applicationFormSchema,
    );
    formVersionId = form.id;
    const draft = expectEnvelope(
      await call(volunteer, 'POST', `/projects/${project.projectId}/applications`, {
        clientUuid: randomUUID(),
        projectId: project.projectId,
        formVersionId,
        clientCreatedAt: new Date().toISOString(),
        answers: answers(project.places),
      }),
      201,
      applicationRecordSchema,
    );
    const id = draft.data.id;

    const session = expectContract(
      await call(volunteer, 'POST', '/upload-sessions', {
        clientUuid: randomUUID(),
        kind: 'form_photo',
        entityType: 'application',
        entityId: id,
        slot: 'q_photo',
        mime: 'image/png',
        sizeBytes: PNG.length,
        sha256: createHash('sha256').update(PNG).digest('hex'),
        source: 'gallery',
      }),
      201,
      uploadSessionSchema,
    );
    expectContract(
      await call(volunteer, 'PUT', `/upload-sessions/${session.id}/parts/1`, PNG, {
        'Content-Type': 'application/octet-stream',
      }),
      200,
      uploadSessionSchema,
    );
    const stored = expectContract(
      await call(volunteer, 'POST', `/upload-sessions/${session.id}/finalize`),
      201,
      uploadedFileSchema,
    );
    // the photo stays in quarantine until a worker scans it, and the E2E API runs no photo
    // worker; a file's content is read in the export case

    const edited = expectEnvelope(
      await call(
        volunteer,
        'PATCH',
        `/applications/${id}`,
        {
          answers: [
            ...answers(project.places),
            { fieldKey: 'q_photo', value: { t: 'photo', v: [stored.id] } },
          ],
        },
        { 'If-Match': draft.meta.etag ?? '' },
      ),
      200,
      applicationRecordSchema,
    );
    const sent = expectEnvelope(
      await call(
        volunteer,
        'POST',
        at`/applications/${id}/actions/${'submit'}`,
        {},
        {
          'If-Match': edited.meta.etag ?? '',
        },
      ),
      200,
      applicationRecordSchema,
    );
    expect(sent.data.status).toBe('submitted');

    const pending = expectEnvelope(
      await call(
        volunteer,
        'GET',
        '/me/applications?status=submitted,under_review&limit=50&include=total',
      ),
      200,
      applicationPageSchema,
    );
    expect(pending.data.map((a) => a.id)).toContain(id);
    expectEnvelope(
      await call(volunteer, 'GET', `/applications/${id}`),
      200,
      applicationRecordSchema,
    );
    const timeline = expectContract(
      await call(volunteer, 'GET', `/applications/${id}/timeline`),
      200,
      z.array(timelineEntrySchema),
    );
    expect(timeline.length).toBeGreaterThan(0);
  });

  it('fills an answer the office opened for correction', async () => {
    const id = await approvedApplication(project, volunteer);
    const rpm = await signIn(RPM_DHAKA);
    const opened = must(
      await call(rpm, 'POST', `/applications/${id}/unlocks`, {
        fieldKey: 'q_village',
        reason: 'গ্রামের নাম ভুল লেখা হয়েছে',
      }),
      201,
      'unlock',
    ).data as { id: string };
    const record = expectEnvelope(
      await call(volunteer, 'GET', `/applications/${id}`),
      200,
      applicationRecordSchema,
    );
    expect(record.data.unlocks?.map((u) => u.id)).toContain(opened.id);
    const filled = expectContract(
      await call(volunteer, 'PUT', `/application-unlocks/${opened.id}/value`, {
        value: { t: 'short_text', v: 'উত্তরপাড়া' },
      }),
      200,
      unlockSchema,
    );
    expect(filled.state).toBe('updated');
  });

  it('sends a record taken offline and pulls the phone’s data set', async () => {
    const now = new Date().toISOString();
    const batch = expectContract(
      await call(
        volunteer,
        'POST',
        '/sync/batch',
        {
          deviceTime: now,
          records: [
            {
              clientUuid: randomUUID(),
              kind: 'application_draft',
              target: null,
              projectId: project.projectId,
              formVersionId,
              payload: { answers: answers(project.places) },
              clientCreatedAt: now,
              clientUpdatedAt: now,
            },
          ],
        },
        { 'Idempotency-Key': randomUUID() },
      ),
      200,
      syncBatchResponseSchema,
    );
    expect(batch.results[0]!.result).toBe('synced');
    const snapshot = expectContract(
      await call(volunteer, 'GET', '/sync/snapshot'),
      200,
      snapshotViewSchema,
    );
    expect(snapshot.applications.length).toBeGreaterThan(0);
    expect(snapshot.formVersions.length).toBeGreaterThan(0);
    expectContract(
      await call(
        volunteer,
        'GET',
        `/sync/snapshot?since=${encodeURIComponent(snapshot.nextSince)}`,
      ),
      200,
      snapshotViewSchema,
    );
    const locations = expectContract(
      await call(volunteer, 'GET', '/locations/all'),
      200,
      z.array(locationViewSchema),
    );
    expect(locations.length).toBeGreaterThan(0);
  });

  it('takes an application with a photo through the public link', async () => {
    const pm = await signIn(PM_HUM);
    const link = must(
      await call(pm, 'PATCH', `/projects/${project.projectId}/public-link`, {
        enabled: true,
        formId: project.formId,
      }),
      200,
      'public link',
    ).data as { url: string };
    const token = link.url.split('/apply/')[1]!;
    const form = expectContract(
      await call(null, 'GET', at`/public/forms/${token}`),
      200,
      publicFormSchema,
    );
    expect(form.form.sections.length).toBeGreaterThan(0);
    const clientUuid = randomUUID();
    const photo = expectContract(
      await call(
        null,
        'POST',
        at`/public/forms/${token}/photos?clientUuid=${clientUuid}&fieldKey=q_photo`,
        PNG,
        { 'Content-Type': 'image/png' },
      ),
      201,
      storedFileSchema,
    );
    expectContract(
      await call(null, 'POST', at`/public/forms/${token}/applications`, {
        clientUuid,
        clientCreatedAt: new Date().toISOString(),
        answers: [
          ...answers(project.places),
          { fieldKey: 'q_photo', value: { t: 'photo', v: [photo.fileId] } },
        ],
      }),
      201,
      publicSubmissionSchema,
    );
  });
});
