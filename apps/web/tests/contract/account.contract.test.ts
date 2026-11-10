import { attentionItemSchema } from '@css/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  changeRequestSchema,
  deviceSessionSchema,
  homeProjectSchema,
  inboxEntrySchema,
  inboxPageSchema,
  invitationViewSchema,
  locationSchema,
  ownProfileSchema,
  ownStaffProfileSchema,
  preferencesSchema,
  projectCountSchema,
  projectsWorkSchema,
  registrationStartSchema,
  registrationVerifyResultSchema,
  staffChoicesSchema,
  storedFileSchema,
  unreadCountSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { at, call, contractBase, DEMO_PASSWORD, DUMMY_OTP, signIn } from './support/session';
import { digits, HEAD, must, PM_HUM, PNG, RPM_DHAKA, savar } from './support/world';

// The person's own screens: the registration, the own profile and its requests, an official's
// profile and work, the devices, the passwords, the language, the inbox and the home.
/** Volunteers no other contract case signs in with. */
const EDITING_VOLUNTEER = '01700000112';
const DEVICES_VOLUNTEER = '01700000113';
const PASSWORD_VOLUNTEER = '01700000114';

describe.skipIf(!contractBase())('the person’s own screens', () => {
  /** The applicant of the registration case, left pending for the correction case. */
  const applicant = { userId: '', mobile: `019${digits(8)}` };

  it('registers a new volunteer through the two codes, the photo and the form', async () => {
    const start = expectContract(
      await call(null, 'POST', '/auth/register/start', { kind: 'volunteer' }),
      201,
      registrationStartSchema,
    );
    const registrationId = start.registrationId;
    const email = `contract.${digits(8)}@example.org`;
    for (const [channel, address] of [
      ['sms', applicant.mobile],
      ['email', email],
    ] as const)
      expectStatus(
        await call(null, 'POST', '/auth/register/otp/send', { registrationId, channel, address }),
        204,
      );
    const first = expectContract(
      await call(null, 'POST', '/auth/register/otp/verify', {
        registrationId,
        channel: 'sms',
        code: DUMMY_OTP,
      }),
      200,
      registrationVerifyResultSchema,
    );
    expect(first.verified).toEqual(['sms']);
    const both = expectContract(
      await call(null, 'POST', '/auth/register/otp/verify', {
        registrationId,
        channel: 'email',
        code: DUMMY_OTP,
      }),
      200,
      registrationVerifyResultSchema,
    );
    const token = { 'X-Registration-Token': both.registrationToken ?? '' };
    expectContract(
      await call(
        null,
        'POST',
        at`/auth/register/photos/${'photo'}?registrationId=${registrationId}&source=gallery`,
        PNG,
        { ...token, 'Content-Type': 'image/png' },
      ),
      201,
      storedFileSchema,
    );
    const places = await savar(null);
    const divisions = expectContract(
      await call(null, 'GET', '/locations'),
      200,
      z.array(locationSchema),
    );
    expect(divisions.length).toBeGreaterThan(0);
    const districts = expectContract(
      await call(null, 'GET', `/locations?parentId=${places.division}`),
      200,
      z.array(locationSchema),
    );
    expect(districts.length).toBeGreaterThan(0);
    const me = expectContract(
      await call(
        null,
        'POST',
        '/auth/register/submit',
        {
          kind: 'volunteer',
          registrationId,
          password: DEMO_PASSWORD,
          name: 'চুক্তি নিবন্ধন (নমুনা)',
          fatherName: 'পিতা (নমুনা)',
          motherName: 'মাতা (নমুনা)',
          nid: `5${digits(9)}`,
          divisionId: places.division,
          districtId: places.district,
          upazilaId: places.upazila,
          unionId: places.union,
          profession: 'student',
        },
        token,
      ),
      201,
      z.object({ id: z.uuid() }),
    );
    applicant.userId = me.id;
  });

  it('answers a correction of the pending registration and sends it back', async () => {
    const head = await signIn(HEAD);
    must(
      await call(head, 'POST', `/registrations/${applicant.userId}/correction-requests`, {
        fields: ['education'],
        note: 'শিক্ষাগত যোগ্যতা লিখুন',
      }),
      201,
      'correction',
    );
    const person = await signIn(applicant.mobile);
    const profile = expectContract(
      await call(person, 'GET', '/volunteers/me'),
      200,
      ownProfileSchema,
    );
    expect(profile.state).toBe('pending');
    const [request] = expectContract(
      await call(person, 'GET', '/me/change-requests'),
      200,
      z.array(changeRequestSchema),
    );
    expectContract(
      await call(person, 'PATCH', `/me/change-requests/${request!.id}`, {
        newValue: 'স্নাতক',
      }),
      200,
      changeRequestSchema,
    );
    expectStatus(await call(person, 'POST', '/me/registration/resubmit'), 204);
  });

  it('asks to change the own mobile with its code and the own photo', async () => {
    const volunteer = await signIn(EDITING_VOLUNTEER);
    expectContract(await call(volunteer, 'GET', '/volunteers/me'), 200, ownProfileSchema);
    const mobile = expectContract(
      await call(volunteer, 'POST', '/me/change-requests', {
        field: 'mobile',
        newValue: `019${digits(8)}`,
      }),
      201,
      changeRequestSchema,
    );
    expectStatus(await call(volunteer, 'POST', `/me/change-requests/${mobile.id}/otp`), 204);
    expectStatus(
      await call(volunteer, 'POST', `/me/change-requests/${mobile.id}/otp/verify`, {
        code: DUMMY_OTP,
      }),
      204,
    );
    const photo = expectContract(
      await call(volunteer, 'POST', '/me/change-requests', { field: 'photo' }),
      201,
      changeRequestSchema,
    );
    expectContract(
      await call(
        volunteer,
        'POST',
        at`/me/photos/${'photo'}?requestId=${photo.id}&source=gallery`,
        PNG,
        {
          'Content-Type': 'image/png',
        },
      ),
      201,
      storedFileSchema,
    );
  });

  it('reads an official’s own profile and work and asks to change the email', async () => {
    const rpm = await signIn(RPM_DHAKA);
    const own = expectContract(await call(rpm, 'GET', '/me/profile'), 200, ownStaffProfileSchema);
    const work = expectContract(
      await call(rpm, 'GET', '/me/projects-work'),
      200,
      projectsWorkSchema,
    );
    expect(work.years.length).toBeGreaterThan(0);
    const head = await signIn(HEAD);
    expectContract(
      await call(head, 'GET', `/users/${own.id}/projects-work`),
      200,
      projectsWorkSchema,
    );
    const choices = expectContract(
      await call(rpm, 'GET', '/me/staff-change-requests/choices'),
      200,
      staffChoicesSchema,
    );
    expect(choices.programs.length).toBeGreaterThan(0);
    const request = expectContract(
      await call(rpm, 'POST', '/me/staff-change-requests', {
        field: 'email',
        newValue: `rpm.contract.${digits(6)}@example.org`,
      }),
      201,
      changeRequestSchema,
    );
    expectStatus(await call(rpm, 'POST', `/me/staff-change-requests/${request.id}/otp`), 204);
    expectStatus(
      await call(rpm, 'POST', `/me/staff-change-requests/${request.id}/otp/verify`, {
        code: DUMMY_OTP,
      }),
      204,
    );
  });

  it('lists the own devices and signs another one out', async () => {
    const other = await signIn(DEVICES_VOLUNTEER);
    const here = await signIn(DEVICES_VOLUNTEER);
    const sessions = expectContract(
      await call(here, 'GET', '/sessions'),
      200,
      z.array(deviceSessionSchema),
    );
    const away = sessions.find((s) => !s.current && !s.revokedAt);
    expect(away).toBeDefined();
    expectStatus(await call(here, 'POST', `/sessions/${away!.id}/revoke`), 204);
    expect((await call(other, 'GET', '/sessions')).status).toBe(401);
  });

  it('changes a password, resets it with a code and sets one from an invitation', async () => {
    const volunteer = await signIn(PASSWORD_VOLUNTEER);
    expectStatus(
      await call(volunteer, 'POST', '/auth/password/change', {
        currentPassword: DEMO_PASSWORD,
        newPassword: 'CssContract2026',
      }),
      204,
    );
    expectStatus(
      await call(null, 'POST', '/auth/password/reset/start', { loginId: PASSWORD_VOLUNTEER }),
      204,
    );
    expectStatus(
      await call(null, 'POST', '/auth/password/reset/complete', {
        loginId: PASSWORD_VOLUNTEER,
        code: DUMMY_OTP,
        newPassword: DEMO_PASSWORD,
      }),
      204,
    );
    const head = await signIn(HEAD);
    const issued = must(
      await call(head, 'POST', '/users', {
        jobId: `CT-${digits(5)}`,
        displayName: 'চুক্তি কর্মকর্তা (নমুনা)',
        designation: 'Project Executive',
        affiliation: 'department',
        affiliationUnit: null,
        homeProgramId: null,
        homeDivisionId: null,
        supervisorUserId: null,
        email: `official.${digits(8)}@example.org`,
        mobile: null,
        roleKey: 'project_executive',
      }),
      201,
      'official',
    ).data as { link: string };
    const token = /[A-Za-z0-9_-]{43}$/.exec(issued.link)?.[0] ?? '';
    expectContract(
      await call(null, 'POST', '/auth/invitations/check', { token }),
      200,
      invitationViewSchema,
    );
    expectStatus(
      await call(null, 'POST', '/auth/invitations/accept', { token, password: DEMO_PASSWORD }),
      204,
    );
  });

  it('switches the own language', async () => {
    const volunteer = await signIn(EDITING_VOLUNTEER);
    expectStatus(await call(volunteer, 'PUT', '/me/language', { language: 'en' }), 204);
    expectStatus(await call(volunteer, 'PUT', '/me/language', { language: 'bn' }), 204);
  });

  it('reads the inbox, marks it read and keeps the email preference', async () => {
    // the registration case above left the Department Head a notice to read
    const head = await signIn(HEAD);
    const page = expectEnvelope(
      await call(head, 'GET', '/notifications?limit=20'),
      200,
      inboxPageSchema,
    );
    expect(page.data.length).toBeGreaterThan(0);
    expectContract(await call(head, 'GET', '/notifications/unread-count'), 200, unreadCountSchema);
    expectStatus(await call(head, 'POST', '/notifications/read', { all: true }), 204);
    expectContract(await call(head, 'GET', '/me/preferences'), 200, preferencesSchema);
    expectContract(
      await call(head, 'PATCH', '/me/preferences', { email_mode: 'digest' }),
      200,
      preferencesSchema,
    );
  });

  it('shows the home: what waits, the newest notices and the projects', async () => {
    const head = await signIn(HEAD);
    expectContract(await call(head, 'GET', '/me/attention'), 200, z.array(attentionItemSchema));
    const latest = expectContract(
      await call(head, 'GET', '/notifications?limit=5'),
      200,
      z.array(inboxEntrySchema),
    );
    expect(latest.length).toBeGreaterThan(0);
    const pm = await signIn(PM_HUM);
    expectContract(
      await call(pm, 'GET', '/projects?status=draft&limit=5'),
      200,
      z.array(homeProjectSchema),
    );
    const count = expectEnvelope(
      await call(pm, 'GET', '/projects?status=draft&limit=1&include=total'),
      200,
      projectCountSchema,
    );
    expect(count.meta.total).toBeGreaterThan(0);
  });
});
