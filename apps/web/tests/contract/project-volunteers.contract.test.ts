import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  assignmentPageSchema,
  assignmentSchema,
  myProjectSchema,
  staffAccessSchema,
  transferCandidateSchema,
  transferResultSchema,
  volunteerCandidatePageSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { approvedVolunteer, newOfficial } from './support/people';
import { call, contractBase, signIn } from './support/session';
import {
  activeProject,
  assign,
  consent,
  must,
  PM_HUM,
  RPM_DHAKA,
  sentApplication,
} from './support/world';

// The volunteers of a project as the region's RPM handles them: candidates, an assignment
// changed and ended, a staff member's extra permission, and the transfer of an application from
// one volunteer to another.
const REASON = 'চুক্তি পরীক্ষার কারণ';
/** The extra a staff member may be given on a project: adding volunteers. */
const ASSIGN_EXTRA = 'volunteer.assign_project';

describe.skipIf(!contractBase())('the volunteers of a project', () => {
  it('assigns a volunteer, changes and ends the assignment, and gives a staff member an extra', async () => {
    const { projectId, places } = await activeProject();
    const person = await approvedVolunteer();
    const rpm = await signIn(RPM_DHAKA);
    const candidates = expectEnvelope(
      await call(
        rpm,
        'GET',
        `/projects/${projectId}/volunteer-candidates?q=${person.mobile}&limit=50`,
      ),
      200,
      volunteerCandidatePageSchema,
    );
    expect(candidates.data.map((c) => c.volunteerId)).toContain(person.volunteerId);
    const [made] = expectContract(
      await call(rpm, 'POST', `/projects/${projectId}/volunteers`, {
        volunteers: [{ volunteerId: person.volunteerId }],
      }),
      201,
      z.array(assignmentSchema),
    );
    const listed = expectEnvelope(
      await call(rpm, 'GET', `/projects/${projectId}/volunteers?limit=100`),
      200,
      assignmentPageSchema,
    );
    expect(listed.data.map((a) => a.id)).toContain(made!.id);
    expect(
      expectContract(
        await call(rpm, 'PATCH', `/project-volunteers/${made!.id}`, { isPaid: true }),
        200,
        assignmentSchema,
      ).isPaid,
    ).toBe(true);
    expectStatus(
      await call(rpm, 'POST', `/project-volunteers/${made!.id}/end`, { reason: REASON }),
      204,
    );

    const official = await newOfficial('project_executive');
    const pm = await signIn(PM_HUM);
    must(
      await call(pm, 'POST', `/projects/${projectId}/staff`, {
        userId: official.userId,
        roleKey: 'project_executive',
        areaLocationId: places.division,
      }),
      201,
      'staff',
      z.array(staffAccessSchema),
    );
    // the app reads nothing from the answer and reads the staff list again
    expectStatus(
      await call(rpm, 'POST', `/projects/${projectId}/grants`, {
        userId: official.userId,
        permissions: [ASSIGN_EXTRA],
        reason: REASON,
      }),
      200,
    );
    const staff = expectContract(
      await call(rpm, 'GET', `/projects/${projectId}/staff`),
      200,
      z.array(staffAccessSchema),
    );
    expect(staff.find((s) => s.userId === official.userId)?.extraPermissions).toEqual([
      ASSIGN_EXTRA,
    ]);
  });

  it('reads the transfer page and moves an application to another volunteer', async () => {
    const project = await activeProject();
    const from = await approvedVolunteer();
    const to = await approvedVolunteer();
    const owner = await assign(project.projectId, from.mobile);
    must(await consent(owner, project.projectId), 200, 'consent', myProjectSchema);
    await assign(project.projectId, to.mobile);
    const { id } = await sentApplication(project, owner);
    const rpm = await signIn(RPM_DHAKA);
    const picker = expectContract(
      await call(
        rpm,
        'GET',
        `/projects/${project.projectId}/volunteers/${from.volunteerId}/applications`,
      ),
      200,
      z.array(transferCandidateSchema),
    );
    expect(picker.map((a) => a.id)).toContain(id);
    const moved = expectContract(
      await call(
        rpm,
        'POST',
        `/projects/${project.projectId}/transfers`,
        {
          fromVolunteerId: from.volunteerId,
          toVolunteerId: to.volunteerId,
          applicationIds: [id],
          reason: REASON,
          moveTeam: false,
          assign: false,
        },
        { 'Idempotency-Key': randomUUID() },
      ),
      200,
      transferResultSchema,
    );
    expect(moved.moved).toEqual([id]);
  });
});
