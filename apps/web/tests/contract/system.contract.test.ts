import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  activeSessionPageSchema,
  auditPageSchema,
  channelsSchema,
  deliveryPageSchema,
  handoverViewSchema,
  nameVariantGroupSchema,
  nisabVersionViewSchema,
  notificationTemplateSchema,
  panelUserSchema,
  publicSettingsSchema,
  referenceItemSchema,
  type SettingEntry,
  settingEntrySchema,
  systemHealthSchema,
  templatePreviewSchema,
} from '../../src/api/schemas';
import { expectContract, expectEnvelope, expectStatus } from './support/expect';
import { approvedVolunteer, newOfficial, register } from './support/people';
import { at, call, contractBase, signIn } from './support/session';
import { day, draftProject, HEAD, must, PM_HUM, RPM_DHAKA, savar, unread } from './support/world';

// The system administration of the admin area, as the Department Head runs it: the settings and
// the public settings, an editable reference list, the spelling variants of names, the nisab
// versions, the audit log, the active sessions, the system health, the message channels, the
// notification texts and the deliveries. The settings, the SMS setting and the notification text
// are saved as they were read, so the configuration stays as found; some rows stay behind: the
// reference-list entries the cases add (one switched off), the group of name spellings the case
// adds (switched off), the nisab version added and withdrawn, the notification text's next
// version, and the people, the project and the handover the cases make.
const REASON = 'চুক্তি পরীক্ষার কারণ';
/** An editable list the case adds an entry of its own to. */
const LIST = 'expense_category_default';
/** A nisab in Taka the case sets and withdraws again. */
const NISAB = '96000.00';

const head = () => signIn(HEAD);

describe.skipIf(!contractBase())('the system administration', () => {
  it('reads the settings and saves one as it is, and reads the public settings', async () => {
    const caller = await head();
    const settings = expectContract(
      await call(caller, 'GET', '/settings'),
      200,
      z.array(settingEntrySchema),
    );
    const organisation = settings.find(
      (s): s is Extract<SettingEntry, { key: 'organisation' }> => s.key === 'organisation',
    )!;
    const saved = expectContract(
      await call(caller, 'PATCH', at`/settings/${'organisation'}`, { value: organisation.value }),
      200,
      settingEntrySchema,
    );
    expect(saved.value).toEqual(organisation.value);
    const visitors = expectContract(
      await call(null, 'GET', '/public/settings'),
      200,
      publicSettingsSchema,
    );
    expect(visitors.organisation.foundationName).toEqual(organisation.value.foundationName);
  });

  it('adds an entry to a reference list and switches it off', async () => {
    const caller = await head();
    const code = `contract_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const added = expectContract(
      await call(caller, 'POST', at`/reference-lists/${LIST}`, {
        code,
        label: { bn: 'চুক্তি খরচ', en: 'Contract cost' },
      }),
      201,
      referenceItemSchema,
    );
    expect(added.active).toBe(true);
    const list = expectContract(
      await call(caller, 'GET', at`/reference-lists/${LIST}`),
      200,
      z.array(referenceItemSchema),
    );
    expect(list.map((i) => i.code)).toContain(code);
    const off = expectContract(
      await call(caller, 'PATCH', at`/reference-lists/${LIST}/items/${code}`, { active: false }),
      200,
      referenceItemSchema,
    );
    expect(off.active).toBe(false);
  });

  it('adds a group of name spellings, reads the groups and switches the group off', async () => {
    const caller = await head();
    // a spelling is one word of letters: the case's own, from a random id's letters
    const letters = randomUUID().replace(/[^a-f]/g, '');
    const canonical = `Contract${letters}`;
    const added = expectContract(
      await call(caller, 'POST', '/name-variants', {
        canonical,
        variants: [`Kontract${letters}`],
      }),
      201,
      nameVariantGroupSchema,
    );
    expect(added).toMatchObject({ canonical, active: true });
    const groups = expectContract(
      await call(caller, 'GET', '/name-variants'),
      200,
      z.array(nameVariantGroupSchema),
    );
    expect(groups.map((g) => g.id)).toContain(added.id);
    const off = expectContract(
      await call(
        caller,
        'PATCH',
        `/name-variants/${added.id}`,
        { active: false },
        { 'If-Match': added.etag },
      ),
      200,
      nameVariantGroupSchema,
    );
    expect(off.active).toBe(false);
  });

  it('adds a nisab version after the latest and withdraws it again', async () => {
    const caller = await head();
    const before = expectContract(
      await call(caller, 'GET', '/nisab-versions'),
      200,
      z.array(nisabVersionViewSchema),
    );
    // a new version takes effect after the latest one, and only one not yet in effect may be
    // withdrawn: the day after the latest version or after tomorrow, whichever is later
    const latest = [day(1), ...before.map((v) => v.effectiveFrom)].sort().at(-1)!;
    const next = dayAfter(latest);
    const added = expectContract(
      await call(caller, 'POST', '/nisab-versions', {
        value: NISAB,
        effectiveFrom: next,
        basisNote: 'চুক্তি পরীক্ষা',
      }),
      201,
      nisabVersionViewSchema,
    );
    expect(added.effectiveFrom).toBe(next);
    const withdrawn = expectContract(
      await call(caller, 'POST', `/nisab-versions/${added.id}/withdraw`, { reason: REASON }),
      200,
      nisabVersionViewSchema,
    );
    expect(withdrawn.withdrawn?.reason).toBe(REASON);
  });

  it('reads the audit log for the Head’s own changes of today', async () => {
    const caller = await head();
    const { me } = caller;
    // the Head's own change to read back
    expectStatus(
      await call(caller, 'POST', at`/reference-lists/${LIST}`, {
        code: `contract_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
        label: { bn: 'চুক্তি খরচ', en: 'Contract cost' },
      }),
      201,
    );
    const page = expectEnvelope(
      await call(caller, 'GET', `/audit-log?actorUserId=${me.id}&from=${day(-1)}&to=${day(1)}`),
      200,
      auditPageSchema,
    );
    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((e) => e.actor?.id === me.id)).toBe(true);
  });

  it('finds a volunteer’s session among the active ones and ends it', async () => {
    const person = await approvedVolunteer();
    await signIn(person.mobile);
    const caller = await head();
    const page = expectEnvelope(
      await call(caller, 'GET', `/sessions/active?q=${person.mobile}&kind=volunteer`),
      200,
      activeSessionPageSchema,
    );
    const session = page.data.find((s) => s.person.id === person.userId);
    expect(session).toBeDefined();
    expectStatus(
      await call(caller, 'POST', `/users/${person.userId}/sessions/${session!.id}/revoke`, {
        reason: REASON,
      }),
      204,
    );
  });

  it('reads the system health and the message channels, and saves the SMS setting as it is', async () => {
    // a registration's photo is a stored file the storage figures count
    await register();
    const caller = await head();
    const health = expectContract(
      await call(caller, 'GET', '/admin/health'),
      200,
      systemHealthSchema,
    );
    expect(health.checks.database).toBe('up');
    expect(health.storage?.total.count).toBeGreaterThan(0);
    const channels = expectContract(
      await call(caller, 'GET', '/admin/channels'),
      200,
      channelsSchema,
    );
    // the E2E API runs on the dummy code
    expect(channels.otpDummy).toBe(true);
    const saved = expectContract(
      await call(caller, 'PUT', '/admin/channels/sms', channels.sms.config),
      200,
      channelsSchema,
    );
    expect(saved.sms.config).toEqual(channels.sms.config);
  });

  it('previews a notification text and saves it as it is, and reads the deliveries', async () => {
    const caller = await head();
    // work handed to the Dhaka RPM is emailed to them: a new RPM's project area handed over
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
    const [receiver] = expectContract(
      await call(caller, 'GET', `/users?limit=20&q=${RPM_DHAKA}`),
      200,
      z.array(panelUserSchema),
    );
    must(
      await call(caller, 'POST', `/users/${leaving.userId}/handover`, { toUserId: receiver!.id }),
      200,
      'handover',
      handoverViewSchema,
    );
    const templates = expectContract(
      await call(caller, 'GET', '/admin/notification-templates'),
      200,
      z.array(notificationTemplateSchema),
    );
    const template = templates.find((t) => t.channels.in_app)!;
    const text = template.channels.in_app!;
    const plain = (stored: { subject: string | null; title: string | null; body: string }) => ({
      ...(stored.subject ? { subject: stored.subject } : {}),
      ...(stored.title ? { title: stored.title } : {}),
      body: stored.body,
    });
    const body = { bn: plain(text.bn), en: plain(text.en) };
    const preview = expectContract(
      await call(
        caller,
        'POST',
        at`/admin/notification-templates/${template.key}/${'in_app'}/preview`,
        body,
      ),
      200,
      templatePreviewSchema,
    );
    expect(preview.bn.body.length).toBeGreaterThan(0);
    const saved = expectContract(
      await call(
        caller,
        'PUT',
        at`/admin/notification-templates/${template.key}/${'in_app'}`,
        body,
      ),
      200,
      notificationTemplateSchema,
    );
    expect(saved.channels.in_app?.version).toBe(text.version + 1);
    const deliveries = expectEnvelope(
      await call(caller, 'GET', `/admin/deliveries?channel=email&from=${day(-1)}&to=${day(1)}`),
      200,
      deliveryPageSchema,
    );
    expect(deliveries.data.length).toBeGreaterThan(0);
  });
});

/** The day after a `yyyy-mm-dd` day. */
function dayAfter(value: string): string {
  return new Date(Date.parse(`${value}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}
