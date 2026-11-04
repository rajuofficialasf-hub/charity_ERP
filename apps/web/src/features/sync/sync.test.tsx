import type { Me } from '@css/shared/auth';
import type { Answer } from '@css/shared/forms';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderInShell, TEST_SESSION_ID } from '../../../test/auth';
import { definition, field, section } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { offlineDb } from '../../offline/db';
import { afterSignIn } from '../../offline/keys';
import { apply, applyResult, enqueue } from '../../offline/outbox';
import { add as addPhoto } from '../../offline/photo-queue';
import { applySnapshot } from '../../offline/snapshot';
import type { SnapshotView } from '../../offline/sync-api';
import { SyncCentrePage } from './SyncCentrePage';

// The sync centre: what waits on this phone by group, the reason of a refusal, the actions on
// a record, the photos and their room, and the empty state. Test data only.
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const VERSION = '01900000-0000-7000-8000-0000000000c2';
const APP = '01900000-0000-7000-8000-0000000000c3';
const FAILED = '01900000-0000-7000-8000-0000000000e1';
const WAITING = '01900000-0000-7000-8000-0000000000e2';
const VERIFYING = '01900000-0000-7000-8000-0000000000e3';
const T0 = new Date('2026-10-31T10:00:00Z');

const project = {
  projectId: PROJECT,
  code: 'WC',
  year: 2026,
  name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
  status: 'active' as const,
  applyFrom: '2026-11-01',
  applyTo: '2026-12-31',
  perVolunteerLimit: 50,
  dawahEnabled: false,
  via: 'assignment' as const,
  permissionSet: null,
  isPaid: false,
  consentStatus: 'accepted' as const,
  rulesVersion: 2,
  applicationsCounted: 7,
  applicationsLeft: 43,
  leadsTeam: true,
};
const form = {
  id: VERSION,
  formId: '01900000-0000-7000-8000-0000000000c4',
  projectId: PROJECT,
  versionNo: 1,
  status: 'published',
  publishedAt: '2026-10-01T00:00:00Z',
  ...definition(section('note', [field('note', 'long_text')])),
};
const summary = {
  id: APP,
  appNo: 'WC-2026-00012',
  projectId: PROJECT,
  beneficiaryId: null,
  beneficiaryName: 'নমুনা উপকারভোগী',
  ownerVolunteerId: null,
  status: 'needs_verification',
  stage: null,
  outcome: null,
  flags: ['existing_identity'],
  districtId: '',
  unionId: '',
  submittedAt: '2026-10-31T10:00:00Z',
  waitingDays: 0,
  etag: '"v1"',
};
const view: SnapshotView = {
  serverTime: '2026-10-31T10:00:00.000Z',
  nextSince: '2026-10-31T09:59:00.000Z',
  nextAfterId: null,
  hasMore: false,
  projects: [project],
  formVersions: [form as unknown as SnapshotView['formVersions'][number]],
  applications: [summary],
  applicationIds: [APP],
  locationsVersion: '1.1',
};
const answers = (name: string): Answer[] => [
  { fieldKey: 'name', repeatIndex: 0, value: { t: 'short_text', v: name } },
];
const draft = (clientUuid: string, name: string, now = T0) =>
  enqueue({
    clientUuid,
    kind: 'application_draft',
    projectId: PROJECT,
    formVersionId: VERSION,
    payload: { answers: answers(name) },
    now,
  });

/** The phone holds the data set and three records: one refused, one waiting, one the office checks. */
async function seedPhone() {
  await afterSignIn({ sessionId: TEST_SESSION_ID, userId: ME.id, deviceKey: 'k'.repeat(43) });
  await applySnapshot(view, T0);
  await draft(FAILED, 'ব্যর্থ উপকারভোগী');
  await apply([FAILED], { type: 'flush', at: T0 });
  await applyResult({ clientUuid: FAILED, result: 'failed', code: 'sync.deadline_passed' }, T0);
  await draft(WAITING, 'অপেক্ষার উপকারভোগী');
  await addPhoto({
    clientUuid: WAITING,
    slot: 'house_photo',
    blob: new Blob([new Uint8Array(2048)], { type: 'image/jpeg' }),
    facts: { name: 'h.jpg', mime: 'image/jpeg', source: 'camera' },
  });
  await draft(VERIFYING, 'যাচাইয়ের উপকারভোগী');
  await apply([VERIFYING], { type: 'flush', at: T0 });
  await applyResult(
    {
      clientUuid: VERIFYING,
      result: 'needs_verification',
      serverId: APP,
      code: 'existing_identity',
    },
    T0,
  );
}

/** The batch endpoint accepting every record. */
function acceptBatch(posted: string[]) {
  server.use(
    http.post('*/api/v1/sync/batch', async ({ request }) => {
      const body = (await request.json()) as { records: { clientUuid: string; kind: string }[] };
      posted.push(...body.records.map((r) => r.clientUuid));
      return HttpResponse.json({
        data: {
          serverTime: new Date().toISOString(),
          results: body.records.map((r) => ({
            clientUuid: r.clientUuid,
            result: 'synced',
            serverId: '01900000-0000-7000-8000-0000000000c9',
            status: 'draft',
          })),
        },
        meta: {},
      });
    }),
    http.get('*/api/v1/sync/snapshot', () => HttpResponse.json({ data: view, meta: {} })),
  );
}

const open = (locale: 'bn' | 'en' = 'bn') =>
  renderInShell([{ path: 'sync', element: <SyncCentrePage /> }], '/sync', locale);

beforeEach(() => {
  resetClientForTests();
  refreshAs(VOLUNTEER);
});
afterEach(() => vi.unstubAllGlobals());

describe('the sync centre', () => {
  it('groups the records with the reason of a refusal, and sends a refused record again', async () => {
    await seedPhone();
    const posted: string[] = [];
    acceptBatch(posted);
    const user = userEvent.setup();
    const { container } = open();
    expect(await screen.findByRole('heading', { level: 1, name: 'সিঙ্ক' })).toBeInTheDocument();
    const failed = await screen.findByRole('region', { name: /পাঠানো যায়নি/ });
    expect(within(failed).getByRole('heading', { name: 'ব্যর্থ উপকারভোগী' })).toBeInTheDocument();
    expect(within(failed).getByText('প্রকল্পের শেষ তারিখ পার হয়ে গেছে।')).toBeInTheDocument();
    expect(within(failed).getByRole('link', { name: 'সম্পাদনা' })).toHaveAttribute(
      'href',
      `/my-applications/${FAILED}/edit`,
    );
    const waiting = screen.getByRole('region', { name: /পাঠানোর অপেক্ষায়/ });
    expect(
      within(waiting).getByRole('heading', { name: 'অপেক্ষার উপকারভোগী' }),
    ).toBeInTheDocument();
    expect(within(waiting).getByText('নতুন আবেদন · শীতবস্ত্র বিতরণ')).toBeInTheDocument();
    const verifying = screen.getByRole('region', { name: /অফিস যাচাই করছে/ });
    expect(within(verifying).getByRole('heading', { name: 'নমুনা উপকারভোগী' })).toBeInTheDocument();
    expect(within(verifying).getByRole('link', { name: 'খুলুন' })).toHaveAttribute(
      'href',
      `/my-applications/${APP}`,
    );
    expect(within(verifying).queryByRole('button', { name: 'মুছুন' })).toBeNull();
    const photos = screen.getByRole('region', { name: 'ছবি বাকি' });
    expect(within(photos).getByText('1টি ছবি অপেক্ষায় (2 KB)')).toBeInTheDocument();
    expect(within(photos).getByRole('progressbar', { name: 'ছবির জায়গা' })).toBeInTheDocument();
    expect(within(photos).queryByRole('button', { name: 'জায়গা খালি করুন' })).toBeNull();
    expect(screen.getByText('এই ফোন থেকে এখনো সিঙ্ক হয়নি।')).toBeInTheDocument();
    await expectNoAxeViolations(container);
    await user.click(within(failed).getByRole('button', { name: 'আবার পাঠান' }));
    await waitFor(() => expect(posted).toContain(FAILED), { timeout: 5000 });
    await waitFor(() => expect(screen.queryByRole('region', { name: /পাঠানো যায়নি/ })).toBeNull());
    // the record leaves the refused group as soon as it is on its way; the answer follows
    await waitFor(async () => expect((await offlineDb().outbox.get(FAILED))?.state).toBe('synced'));
  });

  it('asks before dropping a draft of the phone’s own, then removes it with its photos', async () => {
    await seedPhone();
    const user = userEvent.setup();
    open();
    const waiting = await screen.findByRole('region', { name: /পাঠানোর অপেক্ষায়/ });
    await user.click(within(waiting).getByRole('button', { name: 'মুছুন' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'খসড়াটি মুছবেন?' });
    expect(dialog).toHaveTextContent('অপেক্ষার উপকারভোগী');
    await user.click(within(dialog).getByRole('button', { name: 'খসড়া মুছুন' }));
    expect(await screen.findByText('খসড়াটি মুছে ফেলা হয়েছে।')).toBeInTheDocument();
    expect(await offlineDb().outbox.get(WAITING)).toBeUndefined();
    expect(await offlineDb().photos.where('clientUuid').equals(WAITING).count()).toBe(0);
    expect(screen.queryByRole('region', { name: /পাঠানোর অপেক্ষায়/ })).toBeNull();
  });

  it('shows the empty state when everything has gone, in both languages', async () => {
    await afterSignIn({ sessionId: TEST_SESSION_ID, userId: ME.id, deviceKey: 'k'.repeat(43) });
    const { container, unmount } = open();
    expect(await screen.findByText('সব পাঠানো হয়েছে')).toBeInTheDocument();
    expect(screen.getByText('এই ফোনে অপেক্ষায় কিছু নেই।')).toBeInTheDocument();
    await expectNoAxeViolations(container);
    unmount();
    const en = open('en');
    expect(await screen.findByText('Everything has been sent')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sync now' })).toBeInTheDocument();
    await expectNoAxeViolations(en.container);
  });

  it('frees the room of the photos already sent', async () => {
    await afterSignIn({ sessionId: TEST_SESSION_ID, userId: ME.id, deviceKey: 'k'.repeat(43) });
    await applySnapshot(view, T0);
    await draft(WAITING, 'অপেক্ষার উপকারভোগী');
    const id = await addPhoto({
      clientUuid: WAITING,
      slot: 'house_photo',
      blob: new Blob([new Uint8Array(4096)], { type: 'image/jpeg' }),
      facts: { name: 'h.jpg', mime: 'image/jpeg', source: 'camera' },
    });
    const row = await offlineDb().photos.get(id);
    await offlineDb().photos.put({ ...row!, state: 'uploaded', fileId: 'f1' });
    const user = userEvent.setup();
    open();
    const photos = await screen.findByRole('region', { name: 'ছবি বাকি' });
    expect(within(photos).getByText('1টি ছবি পাঠানো হয়েছে (4 KB)')).toBeInTheDocument();
    await user.click(within(photos).getByRole('button', { name: 'জায়গা খালি করুন' }));
    expect(await screen.findByText('4 KB জায়গা খালি হয়েছে।')).toBeInTheDocument();
    expect(await offlineDb().photos.count()).toBe(0);
  });
});
