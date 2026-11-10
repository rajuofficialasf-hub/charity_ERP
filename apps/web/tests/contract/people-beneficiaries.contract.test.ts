import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  beneficiaryPageSchema,
  beneficiaryRecordSchema,
  beneficiaryStatisticsSchema,
  contactSavedSchema,
  correctionRequestSchema,
  lookupResultSchema,
  type MergeCandidate,
  type MergeCandidatePage,
  mergeCandidatePageSchema,
  mergeViewSchema,
  myProjectSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { approvedVolunteer } from './support/people';
import { type Caller, call, contractBase, signIn } from './support/session';
import {
  type ActiveProject,
  activeProject,
  assign,
  consent,
  HEAD,
  MONITORING,
  must,
  newPerson,
  RPM_DHAKA,
  sentApplication,
} from './support/world';

// The beneficiary tab of the admin area: the list and its counts, the 360° profile with its
// history, the lookup by NID, the contact edit, a locked field's correction, the block, and the
// duplicate pairs with a merge proposed, carried out, reverted and done directly, and a pair
// dismissed. The people are applied for on a project of this run by a volunteer of this run.
const REASON = 'চুক্তি পরীক্ষার কারণ';

describe.skipIf(!contractBase())('the beneficiary tab', () => {
  let project: ActiveProject;
  /** A second project, so the two profiles of a pair have no application on one project. */
  let otherProject: ActiveProject;
  let volunteer: Caller;
  let head: Caller;
  let rpm: Caller;

  beforeAll(async () => {
    project = await activeProject();
    otherProject = await activeProject();
    const person = await approvedVolunteer();
    volunteer = await assign(project.projectId, person.mobile);
    await assign(otherProject.projectId, person.mobile);
    for (const { projectId } of [project, otherProject])
      must(await consent(volunteer, projectId), 200, 'consent', myProjectSchema);
    head = await signIn(HEAD);
    rpm = await signIn(RPM_DHAKA);
  });

  it('lists the beneficiaries and their counts for the Head and the region’s RPM', async () => {
    const person = newPerson();
    const { beneficiaryId } = await sentApplication(project, volunteer, person);
    for (const caller of [head, rpm]) {
      const page = expectEnvelope(
        await call(
          caller,
          'GET',
          `/beneficiaries?q=${encodeURIComponent(person.name)}&limit=25&include=total`,
        ),
        200,
        beneficiaryPageSchema,
      );
      expect(page.data.map((b) => b.id)).toContain(beneficiaryId);
      const counts = expectContract(
        await call(caller, 'GET', '/beneficiaries/statistics'),
        200,
        beneficiaryStatisticsSchema,
      );
      expect(counts.total).toBeGreaterThan(0);
    }
  });

  it('opens a 360° profile and looks the person up by the NID', async () => {
    const { beneficiaryId } = await sentApplication(project, volunteer);
    const record = expectEnvelope(
      await call(head, 'GET', `/beneficiaries/${beneficiaryId}`),
      200,
      beneficiaryRecordSchema,
    );
    expect(record.data.applications?.length).toBeGreaterThan(0);
    const looked = expectContract(
      await call(rpm, 'POST', '/beneficiaries/lookup', {
        nid: record.data.nid,
        projectId: project.projectId,
      }),
      200,
      lookupResultSchema,
    );
    expect(looked.autofill?.beneficiaryId).toBe(beneficiaryId);
  });

  it('edits the contact, corrects the name, blocks and unblocks, and shows it in the history', async () => {
    const { beneficiaryId } = await sentApplication(project, volunteer);
    const { meta } = expectEnvelope(
      await call(head, 'GET', `/beneficiaries/${beneficiaryId}`),
      200,
      beneficiaryRecordSchema,
    );
    const mobile = newPerson().mobile;
    const saved = expectContract(
      await call(
        rpm,
        'PATCH',
        `/beneficiaries/${beneficiaryId}/contact`,
        { mobile },
        { 'If-Match': meta.etag },
      ),
      200,
      contactSavedSchema,
    );
    expect(saved.mobile).toBe(mobile);
    const asked = expectContract(
      await call(rpm, 'POST', `/beneficiaries/${beneficiaryId}/correction-requests`, {
        field: 'name',
        newValue: newPerson().name,
        reason: REASON,
      }),
      201,
      correctionRequestSchema,
    );
    const decided = expectContract(
      await call(head, 'POST', `/beneficiary-corrections/${asked.id}/decision`, {
        decision: 'approve',
      }),
      200,
      correctionRequestSchema,
    );
    expect(decided.status).toBe('approved');
    expectStatus(
      await call(head, 'POST', `/beneficiaries/${beneficiaryId}/block`, { reason: REASON }),
      201,
    );
    expectStatus(
      await call(head, 'POST', `/beneficiaries/${beneficiaryId}/unblock`, { reason: REASON }),
      200,
    );
    const history = expectEnvelope(
      await call(head, 'GET', `/beneficiaries/${beneficiaryId}`),
      200,
      beneficiaryRecordSchema,
    ).data;
    expect(history.contactLog?.length).toBeGreaterThan(0);
    expect(history.corrections.map((c) => c.id)).toContain(asked.id);
    expect(history.blocks?.length).toBeGreaterThan(0);
  });

  /**
   * Two profiles of one person: the same name, father's name and mobile, two NIDs, each applied
   * for on its own project (two applications on one project would stop the merge).
   */
  async function pair(): Promise<MergeCandidate> {
    const person = newPerson();
    const one = await sentApplication(project, volunteer, person);
    const other = await sentApplication(otherProject, volunteer, person);
    const ids = [one.beneficiaryId, other.beneficiaryId];
    for (let cursor: string | null = null, pages = 0; pages < 20; pages += 1) {
      const page: MergeCandidatePage = expectEnvelope(
        await call(
          head,
          'GET',
          `/beneficiaries/merge-candidates?limit=25${cursor ? `&cursor=${cursor}` : ''}`,
        ),
        200,
        mergeCandidatePageSchema,
      );
      const found = page.data.find(
        (c) => ids.includes(c.beneficiaryId) && ids.includes(c.otherBeneficiaryId),
      );
      if (found) return found;
      if (!page.meta.nextCursor) break;
      cursor = page.meta.nextCursor;
    }
    throw new Error('the pair is not among the suggested duplicates');
  }

  it('proposes, merges, reverts and merges a duplicate pair again', async () => {
    const candidate = await pair();
    expect(candidate.matchedOn).toContain('name_father_mobile');
    const request = {
      keptId: candidate.beneficiaryId,
      mergedId: candidate.otherBeneficiaryId,
      reason: REASON,
    };
    const proposed = expectContract(
      await call(rpm, 'POST', '/beneficiary-merges', request),
      201,
      mergeViewSchema,
    );
    const waiting = expectContract(
      await call(head, 'GET', '/beneficiary-merges?status=proposed'),
      200,
      z.array(mergeViewSchema),
    );
    expect(waiting.map((m) => m.id)).toContain(proposed.id);
    const merged = expectContract(
      await call(head, 'POST', `/beneficiary-merges/${proposed.id}/execute`, {
        keptId: candidate.beneficiaryId,
      }),
      200,
      mergeViewSchema,
    );
    expect(merged.status).toBe('merged');
    const monitoring = await signIn(MONITORING);
    const reverted = expectContract(
      await call(monitoring, 'POST', `/beneficiary-merges/${merged.id}/revert`, {
        reason: REASON,
      }),
      200,
      mergeViewSchema,
    );
    expect(reverted.status).toBe('reverted');
    const direct = expectContract(
      await call(head, 'POST', '/beneficiary-merges/direct', request),
      201,
      mergeViewSchema,
    );
    expect(direct.status).toBe('merged');
  });

  it('dismisses a pair that is not one person', async () => {
    const candidate = await pair();
    expectStatus(
      await call(head, 'POST', '/beneficiaries/merge-dismissals', {
        beneficiaryId: candidate.beneficiaryId,
        otherBeneficiaryId: candidate.otherBeneficiaryId,
        reason: REASON,
      }),
      201,
    );
  });
});
