import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  changeRequestSchema,
  deviceSessionSchema,
  editRequestRowSchema,
  effectivePermissionSchema,
  extraAreaSchema,
  handoverAccountSchema,
  handoverViewSchema,
  invitationIssuedSchema,
  organogramSchema,
  panelUserSchema,
  pendingRegistrationSchema,
  permissionSchema,
  registrationDetailSchema,
  roleInfoSchema,
  staffDetailSchema,
  staffEditRequestRowSchema,
  staffMemberSchema,
  staffPageSchema,
  staffRecordSchema,
  volunteerPageSchema,
  volunteerProfileSchema,
  volunteerStatisticsSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { approvedVolunteer, newOfficial, register } from './support/people';
import { type Caller, call, contractBase, DUMMY_OTP, signIn } from './support/session';
import {
  digits,
  draftProject,
  HEAD,
  must,
  PM_HUM,
  RPM_DHAKA,
  savar,
  unread,
} from './support/world';

// The people screens of the admin area: the volunteer tab and a volunteer's profile, the
// registrations and the edit requests, the officials, the organogram, the user search, the
// permission panel and the handover. Each case makes the people it reads or changes, so no shared
// demo account is changed.
const REASON = 'চুক্তি পরীক্ষার কারণ';
/**
 * An ordinary permission an RPM holds by default, given on the official's region through the
 * panel by the Department Head (a key permission would be an Admin's to give).
 */
const GRANTED_PERMISSION = 'application.view';

/** A user's id by the login id the user search finds them with. */
async function userIdOf(caller: Caller, loginId: string): Promise<string> {
  const [found] = expectContract(
    await call(caller, 'GET', `/users?limit=20&q=${loginId}`),
    200,
    z.array(panelUserSchema),
  );
  return found!.id;
}

describe.skipIf(!contractBase())('the volunteer tab', () => {
  it('lists the volunteers with their counts and opens a profile, for the Head and the RPM', async () => {
    const person = await approvedVolunteer();
    for (const caller of [await signIn(HEAD), await signIn(RPM_DHAKA)]) {
      const page = expectEnvelope(
        await call(caller, 'GET', `/volunteers?q=${person.mobile}&limit=25&include=total`),
        200,
        volunteerPageSchema,
      );
      expect(page.data.map((v) => v.id)).toContain(person.volunteerId);
      const counts = expectContract(
        await call(caller, 'GET', '/volunteers/statistics'),
        200,
        volunteerStatisticsSchema,
      );
      expect(counts.volunteers.total).toBeGreaterThan(0);
      const profile = expectContract(
        await call(caller, 'GET', `/volunteers/${person.volunteerId}`),
        200,
        volunteerProfileSchema,
      );
      expect(profile.state).toBe('active');
    }
  });

  it('signs a volunteer’s device out, and blocks and unblocks the volunteer', async () => {
    const person = await approvedVolunteer();
    await signIn(person.mobile);
    const head = await signIn(HEAD);
    const sessions = expectContract(
      await call(head, 'GET', `/users/${person.userId}/sessions`),
      200,
      z.array(deviceSessionSchema),
    );
    const open = sessions.find((s) => !s.revokedAt);
    expect(open).toBeDefined();
    expectStatus(
      await call(head, 'POST', `/users/${person.userId}/sessions/${open!.id}/revoke`, {
        reason: REASON,
      }),
      204,
    );
    expectStatus(
      await call(head, 'POST', `/volunteers/${person.volunteerId}/block`, { reason: REASON }),
      201,
    );
    expectStatus(
      await call(head, 'POST', `/volunteers/${person.volunteerId}/unblock`, { reason: REASON }),
      200,
    );
  });
});

describe.skipIf(!contractBase())('the registrations and the edit requests', () => {
  it('reads a pending registration, asks for a correction, approves one and rejects one', async () => {
    const head = await signIn(HEAD);
    const corrected = await register();
    const detail = expectContract(
      await call(head, 'GET', `/registrations/${corrected.userId}`),
      200,
      registrationDetailSchema,
    );
    expect(detail.status).toBe('awaiting_review');
    const asked = expectContract(
      await call(head, 'POST', `/registrations/${corrected.userId}/correction-requests`, {
        fields: ['education'],
        note: REASON,
      }),
      201,
      z.array(changeRequestSchema),
    );
    expect(asked.map((r) => r.field)).toEqual(['education']);
    const approved = await register();
    must(
      await call(head, 'POST', `/registrations/${approved.userId}/approve`),
      200,
      'approve',
      unread,
    );
    const rejected = await register();
    expectStatus(
      await call(head, 'POST', `/registrations/${rejected.userId}/reject`, { reason: REASON }),
      204,
    );
  });

  it('lists the staff registrations and refuses a decision on an account that is not one', async () => {
    const head = await signIn(HEAD);
    // officials no longer register themselves, so the list may be empty
    expectContract(
      await call(head, 'GET', '/registrations?limit=100&kind=staff'),
      200,
      z.array(pendingRegistrationSchema),
    );
    // an account made by the Head is never a registration to decide, so the decision is refused
    const official = await newOfficial();
    expectStatus(
      await call(head, 'POST', `/staff-registrations/${official.userId}/decision`, {
        decision: 'approve',
        roleKey: 'project_executive',
      }),
      404,
    );
    const roles = expectContract(await call(head, 'GET', '/roles'), 200, z.array(roleInfoSchema));
    expect(roles.length).toBeGreaterThan(0);
  });

  it('approves a volunteer’s mobile change and an official’s email change', async () => {
    const head = await signIn(HEAD);
    const person = await approvedVolunteer();
    const volunteer = await signIn(person.mobile);
    const edit = must(
      await call(volunteer, 'POST', '/me/change-requests', {
        field: 'mobile',
        newValue: `019${digits(8)}`,
      }),
      201,
      'edit request',
      changeRequestSchema,
    ).data;
    await confirmCode(volunteer, `/me/change-requests/${edit.id}`);
    const edits = expectContract(
      await call(head, 'GET', '/edit-requests?limit=100'),
      200,
      z.array(editRequestRowSchema),
    );
    expect(edits.map((r) => r.id)).toContain(edit.id);
    expect(
      expectContract(
        await call(head, 'POST', `/edit-requests/${edit.id}/decision`, { decision: 'approve' }),
        200,
        changeRequestSchema,
      ).status,
    ).toBe('approved');

    const official = await signIn((await newOfficial()).jobId);
    const own = must(
      await call(official, 'POST', '/me/staff-change-requests', {
        field: 'email',
        newValue: `official.${digits(8)}@example.org`,
      }),
      201,
      'staff edit request',
      changeRequestSchema,
    ).data;
    await confirmCode(official, `/me/staff-change-requests/${own.id}`);
    const staffEdits = expectContract(
      await call(head, 'GET', '/staff-edit-requests?limit=100'),
      200,
      z.array(staffEditRequestRowSchema),
    );
    expect(staffEdits.map((r) => r.id)).toContain(own.id);
    expect(
      expectContract(
        await call(head, 'POST', `/staff-edit-requests/${own.id}/decision`, {
          decision: 'approve',
        }),
        200,
        changeRequestSchema,
      ).status,
    ).toBe('approved');
  });
});

/** The code sent to a new contact of a request, and its check with the dummy code. */
async function confirmCode(caller: Caller, request: string) {
  expectStatus(await call(caller, 'POST', `${request}/otp`), 204);
  expectStatus(await call(caller, 'POST', `${request}/otp/verify`, { code: DUMMY_OTP }), 204);
}

describe.skipIf(!contractBase())('the officials', () => {
  it('lists the officials with their count, reads and edits one, and renews a link', async () => {
    const head = await signIn(HEAD);
    const issued = expectContract(
      await call(head, 'POST', '/users', {
        jobId: `CT-${digits(6)}`,
        displayName: 'চুক্তি কর্মকর্তা (নমুনা)',
        designation: 'চুক্তি পরীক্ষা',
        affiliation: 'department',
        affiliationUnit: null,
        homeProgramId: null,
        supervisorUserId: null,
        email: `official.${digits(8)}@example.org`,
        mobile: null,
        roleKey: 'finance_team',
      }),
      201,
      invitationIssuedSchema,
    );
    const page = expectEnvelope(
      await call(head, 'GET', '/users?kind=staff&affiliation=department&limit=50'),
      200,
      staffPageSchema,
    );
    expect(page.data.length).toBeGreaterThan(0);
    const count = expectEnvelope(
      await call(head, 'GET', '/users?kind=staff&affiliation=department&limit=1&include=total'),
      200,
      staffPageSchema,
    );
    expect(count.meta.total).toBeGreaterThan(0);
    const detail = expectContract(
      await call(head, 'GET', `/users/${issued.userId}`),
      200,
      staffDetailSchema,
    );
    expect(detail.awaitingPassword).toBe(true);
    const record = expectEnvelope(
      await call(head, 'GET', `/users/${issued.userId}`),
      200,
      staffRecordSchema,
    );
    const supervisors = expectContract(
      await call(
        head,
        'GET',
        `/users?kind=staff&affiliation=department&state=active&limit=50&q=${HEAD}`,
      ),
      200,
      z.array(staffMemberSchema),
    );
    const edited = expectContract(
      await call(
        head,
        'PUT',
        `/users/${issued.userId}/profile`,
        {
          jobId: record.data.jobId,
          displayName: record.data.displayName,
          designation: 'চুক্তি পরীক্ষা (সম্পাদিত)',
          affiliation: 'department',
          affiliationUnit: null,
          homeProgramId: null,
          supervisorUserId: supervisors[0]!.id,
        },
        { 'If-Match': record.meta.etag },
      ),
      200,
      staffMemberSchema,
    );
    expect(edited.supervisorUserId).toBe(supervisors[0]!.id);
    expectContract(
      await call(head, 'POST', `/users/${issued.userId}/invitation`, {}),
      201,
      invitationIssuedSchema,
    );
  });

  it('gives an official an extra area for volunteers, lists it and ends it', async () => {
    const head = await signIn(HEAD);
    const official = await newOfficial('regional_program_manager');
    const places = await savar(head);
    expectContract(
      await call(head, 'GET', `/users/${official.userId}/extra-areas`),
      200,
      z.array(extraAreaSchema),
    );
    const given = expectContract(
      await call(head, 'POST', `/users/${official.userId}/extra-areas`, {
        wholeCountry: false,
        locationId: places.division,
        reason: REASON,
      }),
      201,
      z.array(extraAreaSchema),
    );
    expect(given[0]).toMatchObject({ wholeCountry: false, endedAt: null });
    expect(given[0]?.location?.id).toBe(places.division);
    const ended = expectContract(
      await call(head, 'POST', `/users/${official.userId}/extra-areas/${given[0]!.id}/end`, {
        reason: REASON,
      }),
      200,
      z.array(extraAreaSchema),
    );
    expect(ended[0]?.endedAt).not.toBeNull();
  });

  it('shows the organogram and finds users by name and by role', async () => {
    const head = await signIn(HEAD);
    const organogram = expectContract(
      await call(head, 'GET', '/organogram'),
      200,
      organogramSchema,
    );
    expect(organogram.leadership.length).toBeGreaterThan(0);
    const found = expectContract(
      await call(head, 'GET', `/users?limit=20&q=${RPM_DHAKA}`),
      200,
      z.array(panelUserSchema),
    );
    expect(found).toHaveLength(1);
    const rpms = expectContract(
      await call(
        head,
        'GET',
        '/users?kind=staff&state=active&role=regional_program_manager&limit=50',
      ),
      200,
      z.array(panelUserSchema),
    );
    expect(rpms.map((u) => u.id)).toContain(found[0]!.id);
  });
});

describe.skipIf(!contractBase())('the permission panel and the handover', () => {
  it('reads an official’s permissions, grants one on the region and ends it', async () => {
    const head = await signIn(HEAD);
    const { userId } = await newOfficial();
    const catalogue = expectContract(
      await call(head, 'GET', '/permissions'),
      200,
      z.array(permissionSchema),
    );
    expect(catalogue.map((p) => p.name)).toContain(GRANTED_PERMISSION);
    expectContract(await call(head, 'GET', '/roles'), 200, z.array(roleInfoSchema));
    const { division } = await savar(head);
    expectStatus(
      await call(head, 'POST', '/permission-grants', {
        userId,
        permission: GRANTED_PERMISSION,
        effect: 'grant',
        scopeType: 'REGION',
        scopeRef: division,
        reason: REASON,
      }),
      201,
    );
    const effective = expectContract(
      await call(head, 'GET', `/users/${userId}/effective-permissions`),
      200,
      z.array(effectivePermissionSchema),
    );
    const grant = effective.find(
      (p) => p.permission === GRANTED_PERMISSION && p.source === 'panel_grant',
    );
    expect(grant?.grantId).toBeDefined();
    expectStatus(
      await call(head, 'POST', `/permission-grants/${grant!.grantId}/revoke`, { reason: REASON }),
      204,
    );
  });

  it('hands an RPM’s project area to another RPM, completes it and deactivates the account', async () => {
    const head = await signIn(HEAD);
    const leaving = await newOfficial('regional_program_manager');
    const pm = await signIn(PM_HUM);
    const projectId = await draftProject(pm);
    const { division } = await savar(pm);
    must(
      await call(pm, 'POST', `/projects/${projectId}/areas`, {
        locationId: division,
        rpmUserId: leaving.userId,
      }),
      201,
      'area',
      unread,
    );
    const work = expectContract(
      await call(head, 'GET', `/users/${leaving.userId}/handover`),
      200,
      handoverViewSchema,
    );
    expect(work.pending.map((p) => p.projectId)).toContain(projectId);
    const moved = expectContract(
      await call(head, 'POST', `/users/${leaving.userId}/handover`, {
        toUserId: await userIdOf(head, RPM_DHAKA),
      }),
      200,
      handoverViewSchema,
    );
    expect(moved.outstandingCount).toBe(0);
    const done = expectContract(
      await call(head, 'POST', `/users/${leaving.userId}/handover/complete`),
      200,
      handoverViewSchema,
    );
    expect(done.completedAt).not.toBeNull();
    const account = expectEnvelope(
      await call(head, 'GET', `/users/${leaving.userId}`),
      200,
      handoverAccountSchema,
    );
    expectStatus(
      await call(
        head,
        'POST',
        `/users/${leaving.userId}/state`,
        { state: 'deactivated', reason: REASON },
        { 'If-Match': account.meta.etag },
      ),
      200,
    );
  });
});
