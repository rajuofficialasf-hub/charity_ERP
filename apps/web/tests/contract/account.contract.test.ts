import { attentionItemSchema } from '@css/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  changeRequestSchema,
  deviceSessionSchema,
  homeProjectSchema,
  inboxEntrySchema,
  inboxPageSchema,
  locationSchema,
  ownProfileSchema,
  ownStaffProfileSchema,
  preferencesSchema,
  projectCountSchema,
  projectsWorkSchema,
  staffChoicesSchema,
  storedFileSchema,
  tokenPairSchema,
  unreadCountSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { newOfficial, register } from './support/people';
import {
  at,
  type Caller,
  call,
  CHANGED_PASSWORD,
  contractBase,
  DEMO_PASSWORD,
  DUMMY_OTP,
  signIn,
} from './support/session';
import {
  digits,
  draftProject,
  HEAD,
  must,
  PM_HUM,
  PNG,
  RPM_DHAKA,
  savar,
  unread,
} from './support/world';

// The person's own screens: the registration, the own profile and its requests, an official's
// profile and work, the devices, the passwords, the language, the inbox and the home. Each case
// makes the people and records it reads, so it passes alone, in any order and on a database an
// earlier run has written to.
/** Volunteers no other contract case signs in with. */
const LANGUAGE_VOLUNTEER = '01700000112';
const DEVICES_VOLUNTEER = '01700000113';
const PASSWORD_VOLUNTEER = '01700000114';

/**
 * Puts the demo password back on an account a password case changed: nothing to do when the demo
 * password signs in, otherwise the changed one signs in and changes it back. The demo password is
 * tried first, so a passing run adds no failed sign-in towards the lockout.
 */
async function restorePassword(loginId: string): Promise<void> {
  const signInWith = async (password: string) => {
    const caller: Caller = { token: null, cookies: [] };
    const res = await call(caller, 'POST', '/auth/login', {
      loginId,
      password,
      device: { name: 'contract test', platform: 'other' },
    });
    return { caller, res };
  };
  if ((await signInWith(DEMO_PASSWORD)).res.status === 200) return;
  const { caller, res } = await signInWith(CHANGED_PASSWORD);
  caller.token = must(
    res,
    200,
    'sign-in with the changed password',
    tokenPairSchema,
  ).data.accessToken;
  expectStatus(
    await call(caller, 'POST', '/auth/password/change', {
      currentPassword: CHANGED_PASSWORD,
      newPassword: DEMO_PASSWORD,
    }),
    204,
  );
}

describe.skipIf(!contractBase())('the person’s own screens', () => {
  it('registers a new volunteer through the two codes, the photo and the form', async () => {
    const places = await savar(null);
    const divisions = expectContract(
      await call(null, 'GET', '/locations'),
      200,
      z.array(locationSchema),
    );
    expect(divisions.map((d) => d.id)).toContain(places.division);
    const districts = expectContract(
      await call(null, 'GET', `/locations?parentId=${places.division}`),
      200,
      z.array(locationSchema),
    );
    expect(districts.map((d) => d.id)).toContain(places.district);
    const applicant = await register();
    const person = await signIn(applicant.mobile);
    expect(person.me.state).toBe('pending');
  });

  it('answers a correction of the pending registration and sends it back', async () => {
    const applicant = await register();
    const head = await signIn(HEAD);
    must(
      await call(head, 'POST', `/registrations/${applicant.userId}/correction-requests`, {
        fields: ['education'],
        note: 'শিক্ষাগত যোগ্যতা লিখুন',
      }),
      201,
      'correction',
      unread,
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
    expect(request?.field).toBe('education');
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
    const applicant = await register();
    const head = await signIn(HEAD);
    must(
      await call(head, 'POST', `/registrations/${applicant.userId}/approve`),
      200,
      'approve',
      unread,
    );
    const volunteer = await signIn(applicant.mobile);
    const profile = expectContract(
      await call(volunteer, 'GET', '/volunteers/me'),
      200,
      ownProfileSchema,
    );
    expect(profile.state).toBe('active');
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
    // several details at once, all or none, once per key
    const many = expectContract(
      await call(
        volunteer,
        'POST',
        '/me/change-requests/batch',
        { requests: [{ field: 'education', newValue: 'স্নাতক' }] },
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
      201,
      z.array(changeRequestSchema),
    );
    expect(many.map((r) => r.field)).toEqual(['education']);
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
        { 'Content-Type': 'image/png' },
      ),
      201,
      storedFileSchema,
    );
  });

  it('reads an official’s own profile and work', async () => {
    const rpm = await signIn(RPM_DHAKA);
    const own = expectContract(await call(rpm, 'GET', '/me/profile'), 200, ownStaffProfileSchema);
    // the seeded draft project has an area of the Dhaka RPM
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
  });

  it('sets a new official’s password from the invitation and asks to change the email', async () => {
    const official = await signIn((await newOfficial()).jobId);
    const choices = expectContract(
      await call(official, 'GET', '/me/staff-change-requests/choices'),
      200,
      staffChoicesSchema,
    );
    expect(choices.programs.length).toBeGreaterThan(0);
    const request = expectContract(
      await call(official, 'POST', '/me/staff-change-requests', {
        field: 'email',
        newValue: `official.${digits(8)}@example.org`,
      }),
      201,
      changeRequestSchema,
    );
    const many = expectContract(
      await call(
        official,
        'POST',
        '/me/staff-change-requests/batch',
        { requests: [{ field: 'designation', newValue: 'প্রোগ্রাম অফিসার' }] },
        { 'Idempotency-Key': crypto.randomUUID() },
      ),
      201,
      z.array(changeRequestSchema),
    );
    expect(many.map((r) => r.field)).toEqual(['designation']);
    expectStatus(await call(official, 'POST', `/me/staff-change-requests/${request.id}/otp`), 204);
    expectStatus(
      await call(official, 'POST', `/me/staff-change-requests/${request.id}/otp/verify`, {
        code: DUMMY_OTP,
      }),
      204,
    );
  });

  it('lists the own devices and signs another one out', async () => {
    const here = await signIn(DEVICES_VOLUNTEER);
    const before = expectContract(
      await call(here, 'GET', '/sessions'),
      200,
      z.array(deviceSessionSchema),
    ).map((s) => s.id);
    const other = await signIn(DEVICES_VOLUNTEER);
    const sessions = expectContract(
      await call(here, 'GET', '/sessions'),
      200,
      z.array(deviceSessionSchema),
    );
    const added = sessions.filter((s) => !before.includes(s.id));
    expect(added).toHaveLength(1);
    expectStatus(await call(here, 'POST', `/sessions/${added[0]!.id}/revoke`), 204);
    expect((await call(other, 'GET', '/sessions')).status).toBe(401);
    expectStatus(await call(here, 'GET', '/sessions'), 200);
  });

  it('changes a password and resets it with a code', async () => {
    try {
      const volunteer = await signIn(PASSWORD_VOLUNTEER);
      expectStatus(
        await call(volunteer, 'POST', '/auth/password/change', {
          currentPassword: DEMO_PASSWORD,
          newPassword: CHANGED_PASSWORD,
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
      await signIn(PASSWORD_VOLUNTEER);
    } finally {
      await restorePassword(PASSWORD_VOLUNTEER);
    }
  });

  it('switches the own language', async () => {
    const volunteer = await signIn(LANGUAGE_VOLUNTEER);
    expectStatus(await call(volunteer, 'PUT', '/me/language', { language: 'en' }), 204);
    expectStatus(await call(volunteer, 'PUT', '/me/language', { language: 'bn' }), 204);
  });

  it('reads the inbox, marks it read and keeps the email preference', async () => {
    // a new registration leaves the Department Head a notice to read
    await register();
    const head = await signIn(HEAD);
    const page = expectEnvelope(
      await call(head, 'GET', '/notifications?limit=20'),
      200,
      inboxPageSchema,
    );
    expect(page.data.length).toBeGreaterThan(0);
    const unreadBefore = expectContract(
      await call(head, 'GET', '/notifications/unread-count'),
      200,
      unreadCountSchema,
    );
    expect(unreadBefore.count).toBeGreaterThan(0);
    expectStatus(await call(head, 'POST', '/notifications/read', { all: true }), 204);
    expect(
      expectContract(await call(head, 'GET', '/notifications/unread-count'), 200, unreadCountSchema)
        .count,
    ).toBe(0);
    expectContract(await call(head, 'GET', '/me/preferences'), 200, preferencesSchema);
    expectContract(
      await call(head, 'PATCH', '/me/preferences', { email_mode: 'digest' }),
      200,
      preferencesSchema,
    );
  });

  it('shows the home: what waits, the newest notices and the projects', async () => {
    // a new registration and a new draft give the home something in each part
    await register();
    const pm = await signIn(PM_HUM);
    await draftProject(pm);
    const head = await signIn(HEAD);
    const waiting = expectContract(
      await call(head, 'GET', '/me/attention'),
      200,
      z.array(attentionItemSchema),
    );
    expect(waiting.length).toBeGreaterThan(0);
    const latest = expectContract(
      await call(head, 'GET', '/notifications?limit=5'),
      200,
      z.array(inboxEntrySchema),
    );
    expect(latest.length).toBeGreaterThan(0);
    const drafts = expectContract(
      await call(pm, 'GET', '/projects?status=draft&limit=5'),
      200,
      z.array(homeProjectSchema),
    );
    expect(drafts.length).toBeGreaterThan(0);
    const count = expectEnvelope(
      await call(pm, 'GET', '/projects?status=draft&limit=1&include=total'),
      200,
      projectCountSchema,
    );
    expect(count.meta.total).toBeGreaterThan(0);
  });
});
