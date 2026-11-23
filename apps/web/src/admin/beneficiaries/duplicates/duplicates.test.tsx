import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../../test/auth';
import { server } from '../../../../test/msw/server';
import { resetClientForTests } from '../../../api/client';
import { canReviewDuplicates } from '../../roles';
import { BeneficiaryProfilePage } from '../BeneficiaryProfilePage';
import { ComparePage } from './ComparePage';
import { DuplicatesPage } from './DuplicatesPage';

// The duplicate profiles and their merge: the suggested pairs with the rules they meet, the
// comparison with the choice of the kept profile, the refusals a merge can answer, and the revert
// from the merge history. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const HEAD: Me = { ...ME, roles: ['department_head'] };
const A = '01900000-0000-7000-8000-0000000000a1';
const B = '01900000-0000-7000-8000-0000000000a2';
const MERGE_ID = '01900000-0000-7000-8000-0000000000e1';
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const PLACE = '01900000-0000-7000-8000-0000000000d1';
const ETAG = 'W/"1760000000000"';
const NONE = {
  block: false,
  unblock: false,
  editContact: false,
  requestCorrection: false,
  decideCorrection: false,
  addIdentity: false,
  proposeMerge: false,
  merge: false,
  revertMerge: false,
};

const profile = (id: string, benNo: number, over: Record<string, unknown> = {}) => ({
  id,
  benNo,
  mergedInto: null,
  actions: NONE,
  corrections: [],
  merges: [],
  name: 'নমুনা রাবেয়া',
  fatherOrHusbandName: 'নমুনা মজিদ',
  mobile: '01911000050',
  status: 'active',
  divisionId: PLACE,
  districtId: PLACE,
  upazilaId: PLACE,
  village: `গ্রাম ${benNo}`,
  isBlocked: false,
  projectsByYear: [
    {
      year: 2026,
      projects: [
        { id: PROJECT, code: 'WNT', nameBn: 'শীতবস্ত্র', nameEn: 'Winter', status: 'draft' },
      ],
    },
  ],
  applications: [],
  distributions: [],
  ...over,
});

const PAIR = {
  beneficiaryId: A,
  otherBeneficiaryId: B,
  benNo: 'BEN-0000051',
  otherBenNo: 'BEN-0000052',
  name: 'নমুনা রাবেয়া',
  otherName: 'নমুনা রাবেয়া',
  matchedOn: ['name_father_mobile', 'same_mobile'],
  level: 'probable',
};

const envelope = (data: unknown, meta: Record<string, unknown> = {}) =>
  HttpResponse.json({ data, meta: { requestId: 'req_test', ...meta } });
const failure = (status: number, code: string, message: string, details: unknown[] = []) =>
  HttpResponse.json(
    { error: { code, messageKey: `errors.${code}`, message, requestId: 'req_test', details } },
    { status },
  );

function serveProfiles(actions: Partial<typeof NONE>, over: Record<string, unknown> = {}) {
  const profiles: Record<string, unknown> = {
    [A]: profile(A, 51, { actions: { ...NONE, ...actions }, nid: '1000001050', ...over }),
    [B]: profile(B, 52, { actions: { ...NONE, ...actions }, ...over }),
  };
  server.use(
    http.get('*/api/v1/beneficiaries/:id', ({ params }) =>
      HttpResponse.json(
        { data: profiles[params.id as string], meta: { requestId: 'req_test', etag: ETAG } },
        { headers: { ETag: ETAG } },
      ),
    ),
    http.get('*/api/v1/locations', () => envelope([])),
  );
}

const openCompare = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(<ComparePage />, locale, {
    path: '/admin/beneficiaries/duplicates/compare',
    initialPath: `/admin/beneficiaries/duplicates/compare?a=${A}&b=${B}`,
  });

async function chooseAndOpen(user: ReturnType<typeof userEvent.setup>, button = 'মার্জ করুন') {
  const keep = await screen.findAllByRole('radio', { name: 'এই প্রোফাইল রাখুন' });
  await user.click(keep[0]!);
  await user.click(screen.getByRole('button', { name: button }));
  const dialog = await screen.findByRole('dialog');
  await user.type(
    within(dialog).getByRole('textbox', { name: /কারণ/ }),
    'একই ব্যক্তি, দুইবার এসেছেন',
  );
  return dialog;
}

beforeEach(() => {
  resetClientForTests();
});

describe('the duplicates list', () => {
  it('names the rules each pair meets and offers the comparison, without accessibility violations', async () => {
    refreshAs(PM);
    server.use(
      http.get('*/api/v1/beneficiaries/merge-candidates', () =>
        envelope([PAIR], { nextCursor: null, prevCursor: null, limit: 10 }),
      ),
      http.get('*/api/v1/beneficiary-merges', () => envelope([])),
    );
    const { container } = renderApp(<DuplicatesPage />, 'bn', {
      path: '/admin/beneficiaries/duplicates',
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'সম্ভাব্য ডুপ্লিকেট' }),
    ).toBeVisible();
    expect(screen.getByText('ডেটা গুণমান')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'উপকারভোগীতে ফিরুন' })).toHaveAttribute(
      'href',
      '/admin/beneficiaries',
    );
    expect((await screen.findAllByText('একই নাম, পিতা/স্বামী ও মোবাইল')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('একই মোবাইল নম্বর').length).toBeGreaterThan(0);
    const compare = screen.getAllByRole('link', { name: 'তুলনা করুন' })[0]!;
    expect(compare.getAttribute('href')).toBe(
      `/admin/beneficiaries/duplicates/compare?a=${A}&b=${B}`,
    );
    await expectNoAxeViolations(container);
  });

  it('says each pair’s level and filters by it in the address', async () => {
    refreshAs(PM);
    const asked: (string | null)[] = [];
    const village = {
      ...PAIR,
      beneficiaryId: B,
      otherBeneficiaryId: A,
      matchedOn: ['name_father_village'],
    };
    const phone = { ...PAIR, matchedOn: ['same_mobile'], level: 'check' };
    server.use(
      http.get('*/api/v1/beneficiaries/merge-candidates', ({ request }) => {
        const level = new URL(request.url).searchParams.get('level');
        asked.push(level);
        const rows = level === 'check' ? [phone] : [village, phone];
        return envelope(rows, { nextCursor: null, prevCursor: null, limit: 10 });
      }),
      http.get('*/api/v1/beneficiary-merges', () => envelope([])),
    );
    const user = userEvent.setup();
    const view = renderApp(<DuplicatesPage />, 'bn', {
      path: '/admin/beneficiaries/duplicates',
    });
    expect(
      (await screen.findAllByText('নাম, পিতা/স্বামীর নাম ও গ্রাম মিলেছে')).length,
    ).toBeGreaterThan(0);
    const table = screen.getByRole('table', { name: 'সম্ভাব্য ডুপ্লিকেট জোড়া' });
    expect(within(table).getByRole('columnheader', { name: 'মিলের মাত্রা' })).toBeInTheDocument();
    expect(within(table).getByText('সম্ভাব্য')).toBeInTheDocument();
    expect(within(table).getByText('যাচাই করুন')).toBeInTheDocument();
    expect(asked).toEqual([null]);
    await user.click(screen.getByRole('button', { name: 'যাচাই করুন' }));
    await waitFor(() => expect(asked).toContain('check'));
    expect(view.router.state.location.search).toBe('?level=check');
    await waitFor(() => expect(within(table).queryByText('সম্ভাব্য')).not.toBeInTheDocument());
    await expectNoAxeViolations(view.container);
  });

  it('asks the level the address names, and reads in English', async () => {
    refreshAs(PM);
    const asked: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/beneficiaries/merge-candidates', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('level'));
        return envelope([{ ...PAIR, matchedOn: ['same_mobile'], level: 'check' }], {
          nextCursor: null,
          prevCursor: null,
          limit: 10,
        });
      }),
      http.get('*/api/v1/beneficiary-merges', () => envelope([])),
    );
    renderApp(<DuplicatesPage />, 'en', {
      path: '/admin/beneficiaries/duplicates',
      initialPath: '/admin/beneficiaries/duplicates?level=check',
    });
    expect((await screen.findAllByText('To check')).length).toBeGreaterThan(0);
    expect(asked).toEqual(['check']);
  });

  it('marks a pair as two people with a reason, in English too', async () => {
    refreshAs(PM);
    let body: unknown;
    server.use(
      http.get('*/api/v1/beneficiaries/merge-candidates', () =>
        envelope([PAIR], { nextCursor: null, prevCursor: null, limit: 10 }),
      ),
      http.get('*/api/v1/beneficiary-merges', () => envelope([])),
      http.post('*/api/v1/beneficiaries/merge-dismissals', async ({ request }) => {
        body = await request.json();
        return envelope({}, {});
      }),
    );
    const user = userEvent.setup();
    const first = renderApp(<DuplicatesPage />, 'bn', { path: '/admin/beneficiaries/duplicates' });
    await user.click((await screen.findAllByRole('button', { name: 'একই ব্যক্তি নন' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'দুজন আলাদা মানুষ');
    await user.click(within(dialog).getByRole('button', { name: 'একই ব্যক্তি নন' }));
    expect(await screen.findByText('জোড়াটি আলাদা ব্যক্তি হিসেবে চিহ্নিত হয়েছে')).toBeVisible();
    expect(body).toEqual({ beneficiaryId: A, otherBeneficiaryId: B, reason: 'দুজন আলাদা মানুষ' });
    first.unmount();
    const { container } = renderApp(<DuplicatesPage />, 'en', {
      path: '/admin/beneficiaries/duplicates',
    });
    expect(
      (await screen.findAllByText('Same name, father/husband and mobile')).length,
    ).toBeGreaterThan(0);
    await expectNoAxeViolations(container);
  });

  it('keeps the pair in the list when the mark is refused', async () => {
    refreshAs(PM);
    server.use(
      http.get('*/api/v1/beneficiaries/merge-candidates', () =>
        envelope([PAIR], { nextCursor: null, prevCursor: null, limit: 10 }),
      ),
      http.get('*/api/v1/beneficiary-merges', () => envelope([])),
      http.post('*/api/v1/beneficiaries/merge-dismissals', () =>
        failure(409, 'beneficiary.dismissed', 'এই জোড়া আগেই চিহ্নিত করা হয়েছে।'),
      ),
    );
    const user = userEvent.setup();
    renderApp(<DuplicatesPage />, 'bn', { path: '/admin/beneficiaries/duplicates' });
    await user.click((await screen.findAllByRole('button', { name: 'একই ব্যক্তি নন' }))[0]!);
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'দুজন আলাদা মানুষ');
    await user.click(within(dialog).getByRole('button', { name: 'একই ব্যক্তি নন' }));
    expect(await within(dialog).findByText('এই জোড়া আগেই চিহ্নিত করা হয়েছে।')).toBeVisible();
    expect(
      screen.queryByText('জোড়াটি আলাদা ব্যক্তি হিসেবে চিহ্নিত হয়েছে'),
    ).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'বাতিল' }));
    expect((await screen.findAllByText('একই নাম, পিতা/স্বামী ও মোবাইল')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'তুলনা করুন' }).length).toBeGreaterThan(0);
  });

  it('is for the roles that review duplicates only', () => {
    for (const role of [
      'department_head',
      'monitoring_team',
      'program_manager',
      'regional_program_manager',
    ])
      expect(canReviewDuplicates({ roles: [role] }), role).toBe(true);
    for (const role of ['project_executive', 'media_team', 'procurement_team', 'volunteer_general'])
      expect(canReviewDuplicates({ roles: [role] }), role).toBe(false);
  });
});

describe('the comparison', () => {
  it('shows the level and the rules of the suggested pair of the two, and nothing for two no rule paired', async () => {
    refreshAs(PM);
    serveProfiles({ merge: true });
    let pairs: unknown[] = [{ ...PAIR, matchedOn: ['name_father_village'] }];
    const asked: (string | null)[] = [];
    server.use(
      http.get('*/api/v1/beneficiaries/merge-candidates', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('beneficiaryId'));
        return envelope(pairs, { nextCursor: null, prevCursor: null, limit: 100 });
      }),
    );
    const first = openCompare();
    expect(await screen.findByText('নাম, পিতা/স্বামীর নাম ও গ্রাম মিলেছে')).toBeInTheDocument();
    expect(screen.getByText('মিলের মাত্রা')).toBeInTheDocument();
    expect(screen.getByText('সম্ভাব্য')).toBeInTheDocument();
    expect(asked).toEqual([A]);
    await expectNoAxeViolations(first.container);
    first.unmount();
    resetClientForTests();
    pairs = [];
    openCompare();
    expect(await screen.findAllByRole('radio', { name: 'এই প্রোফাইল রাখুন' })).toHaveLength(2);
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(screen.queryByText('মিলের মাত্রা')).not.toBeInTheDocument();
  });

  it('shows both profiles side by side and asks for the kept profile before merging', async () => {
    refreshAs(PM);
    serveProfiles({ merge: true, proposeMerge: false });
    const user = userEvent.setup();
    const { container } = openCompare();
    expect(await screen.findAllByRole('heading', { level: 2, name: 'নমুনা রাবেয়া' })).toHaveLength(
      2,
    );
    expect(screen.getByText('গ্রাম 51')).toBeVisible();
    expect(screen.getByText('গ্রাম 52')).toBeVisible();
    // the NID only where the profile answer carries it
    expect(screen.getByText('1000001050')).toBeVisible();
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole('button', { name: 'মার্জ করুন' }));
    expect(screen.getAllByText('কোন প্রোফাইল রাখবেন, বেছে নিন').length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('merges with the chosen profile kept and leads to it', async () => {
    refreshAs(PM);
    serveProfiles({ merge: true });
    let body: unknown;
    server.use(
      http.post('*/api/v1/beneficiary-merges/direct', async ({ request }) => {
        body = await request.json();
        return envelope({ id: MERGE_ID, keptId: A, mergedId: B }, {});
      }),
    );
    const user = userEvent.setup();
    openCompare();
    const dialog = await chooseAndOpen(user);
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ করুন' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/admin/beneficiaries/${A}`),
    );
    expect(body).toEqual({ keptId: A, mergedId: B, reason: 'একই ব্যক্তি, দুইবার এসেছেন' });
  });

  it('lists the projects a conflict names', async () => {
    refreshAs(PM);
    serveProfiles({ merge: true });
    server.use(
      http.post('*/api/v1/beneficiary-merges/direct', () =>
        failure(409, 'beneficiary.merge_conflict', 'এই প্রোফাইল দুটি এখনই মার্জ করা যাবে না।', [
          {
            path: 'applications.0',
            code: 'beneficiary.merge_conflict',
            messageKey: 'errors.beneficiary.merge_conflict',
            message: '',
            params: { projectId: PROJECT, applicationId: MERGE_ID },
          },
          {
            path: 'applications.1',
            code: 'beneficiary.merge_conflict',
            messageKey: 'errors.beneficiary.merge_conflict',
            message: '',
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    openCompare();
    const dialog = await chooseAndOpen(user);
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ করুন' }));
    expect(
      await within(dialog).findByText('শীতবস্ত্র: সিদ্ধান্তের অপেক্ষায় থাকা আবেদন'),
    ).toBeVisible();
    // the official opens the waiting application to decide it before merging
    expect(within(dialog).getByRole('link', { name: 'আবেদনটি খুলুন' })).toHaveAttribute(
      'href',
      `/admin/applications/${MERGE_ID}`,
    );
    expect(within(dialog).getByText('আপনার এখতিয়ারের বাইরের একটি প্রকল্পের আবেদন')).toBeVisible();
    // the dialog stays open with the reason typed; the page does not lead anywhere
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(within(dialog).getByRole('textbox', { name: /কারণ/ })).toHaveValue(
      'একই ব্যক্তি, দুইবার এসেছেন',
    );
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('keeps the dialog open on a validation refusal', async () => {
    refreshAs(PM);
    serveProfiles({ merge: true });
    server.use(
      http.post('*/api/v1/beneficiary-merges/direct', () =>
        failure(422, 'validation.failed', 'দেওয়া তথ্য ঠিক নেই।'),
      ),
    );
    const user = userEvent.setup();
    openCompare();
    const dialog = await chooseAndOpen(user);
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ করুন' }));
    expect(await within(dialog).findByText('দেওয়া তথ্য ঠিক নেই।')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    expect(screen.queryByText('প্রোফাইল মার্জ হয়েছে')).not.toBeInTheDocument();
  });

  /** The pair with the identity mark of each side, as the profile answers it to a merging role. */
  function serveDocuments(first: boolean, second: boolean) {
    const profiles: Record<string, unknown> = {
      [A]: profile(A, 51, { actions: { ...NONE, merge: true }, hasDocument: first }),
      [B]: profile(B, 52, { actions: { ...NONE, merge: true }, hasDocument: second }),
    };
    server.use(
      http.get('*/api/v1/beneficiaries/:id', ({ params }) =>
        envelope(profiles[params.id as string], { etag: ETAG }),
      ),
      http.get('*/api/v1/locations', () => envelope([])),
    );
  }
  const KEEP_DOCUMENT = 'যে প্রোফাইলে পরিচয়পত্র আছে, সেটিই রাখতে হবে।';

  it('keeps the one profile that has an identity document: the other cannot be chosen, and says why', async () => {
    refreshAs(PM);
    serveDocuments(false, true);
    let body: unknown;
    server.use(
      http.post('*/api/v1/beneficiary-merges/direct', async ({ request }) => {
        body = await request.json();
        return envelope({ id: MERGE_ID, keptId: B, mergedId: A }, {});
      }),
    );
    const user = userEvent.setup();
    openCompare();
    const [without, withDocument] = await screen.findAllByRole('radio', {
      name: 'এই প্রোফাইল রাখুন',
    });
    expect(without).toBeDisabled();
    expect(without).not.toBeChecked();
    expect(withDocument).toBeEnabled();
    expect(withDocument).toBeChecked();
    expect(screen.getAllByText(KEEP_DOCUMENT)).toHaveLength(1);
    // nothing to choose: the merge opens with the documented profile kept
    await user.click(screen.getByRole('button', { name: 'মার্জ করুন' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'একই ব্যক্তি');
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ করুন' }));
    await waitFor(() => expect(body).toEqual({ keptId: B, mergedId: A, reason: 'একই ব্যক্তি' }));
  });

  it.each([
    ['both have a document', true],
    ['neither has a document', false],
  ])('leaves the choice free when %s', async (_case, has) => {
    refreshAs(PM);
    serveDocuments(has, has);
    openCompare();
    const radios = await screen.findAllByRole('radio', { name: 'এই প্রোফাইল রাখুন' });
    expect(radios).toHaveLength(2);
    for (const radio of radios) {
      expect(radio).toBeEnabled();
      expect(radio).not.toBeChecked();
    }
    expect(screen.queryByText(KEEP_DOCUMENT)).not.toBeInTheDocument();
  });

  it('carries out a proposal with the documented profile kept, whatever the proposal named', async () => {
    refreshAs(PM);
    serveDocuments(false, true);
    let body: unknown;
    server.use(
      http.get('*/api/v1/beneficiary-merges', () =>
        envelope([
          { id: MERGE_ID, keptId: A, mergedId: B, reason: 'একই ব্যক্তি', status: 'proposed' },
        ]),
      ),
      http.post('*/api/v1/beneficiary-merges/:id/execute', async ({ request }) => {
        body = await request.json();
        return envelope({ id: MERGE_ID, keptId: B, mergedId: A }, {});
      }),
    );
    const user = userEvent.setup();
    renderApp(<ComparePage />, 'bn', {
      path: '/admin/beneficiaries/duplicates/compare',
      initialPath: `/admin/beneficiaries/duplicates/compare?a=${A}&b=${B}&proposal=${MERGE_ID}`,
    });
    await user.click(await screen.findByRole('button', { name: 'মার্জ করুন' }));
    // a proposal is carried out with a confirmation, its reason was given when it was proposed
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ করুন' }));
    await waitFor(() => expect(body).toEqual({ keptId: B }));
  });

  it("shows the server's sentence when it refuses the kept profile", async () => {
    refreshAs(PM);
    serveProfiles({ merge: true });
    server.use(
      http.post('*/api/v1/beneficiary-merges/direct', () =>
        failure(422, 'validation.failed', 'দেওয়া তথ্য ঠিক নেই।', [
          {
            path: 'keptId',
            code: 'beneficiary.merge_keep_document',
            messageKey: 'errors.beneficiary.merge_keep_document',
            message: KEEP_DOCUMENT,
          },
        ]),
      ),
    );
    const user = userEvent.setup();
    openCompare();
    const dialog = await chooseAndOpen(user);
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ করুন' }));
    expect(await within(dialog).findByText(KEEP_DOCUMENT)).toBeVisible();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
  });

  it('shows the not-found state when a profile is gone and the error state when a read fails', async () => {
    refreshAs(PM);
    server.use(
      http.get('*/api/v1/beneficiaries/:id', ({ params }) =>
        params.id === B
          ? failure(404, 'permission.not_found', 'পাওয়া যায়নি।')
          : HttpResponse.json(
              { data: profile(A, 51, { actions: { ...NONE, merge: true } }), meta: { etag: ETAG } },
              { headers: { ETag: ETAG } },
            ),
      ),
      http.get('*/api/v1/locations', () => envelope([])),
    );
    const first = openCompare();
    expect(await screen.findByText('দুটি প্রোফাইলের একটি পাওয়া যায়নি।')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'মার্জ করুন' })).not.toBeInTheDocument();
    first.unmount();
    resetClientForTests();
    server.use(
      http.get('*/api/v1/beneficiaries/:id', () =>
        failure(503, 'server.busy', 'সার্ভার ব্যস্ত। একটু পরে আবার চেষ্টা করুন।'),
      ),
    );
    openCompare();
    expect(await screen.findByText('কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।')).toBeVisible();
    expect(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'মার্জ করুন' })).not.toBeInTheDocument();
  });

  it('carries out a proposal only when the list holds it, and never falls back to a fresh merge', async () => {
    refreshAs(HEAD);
    serveProfiles({ merge: true });
    const openProposal = () =>
      renderApp(<ComparePage />, 'bn', {
        path: '/admin/beneficiaries/duplicates/compare',
        initialPath: `/admin/beneficiaries/duplicates/compare?a=${A}&b=${B}&proposal=${MERGE_ID}`,
      });
    // the proposal is no longer among the open ones
    server.use(http.get('*/api/v1/beneficiary-merges', () => envelope([])));
    const first = openProposal();
    expect(await screen.findByText('এই মার্জের প্রস্তাবটি আর অপেক্ষায় নেই।')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'মার্জ করুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    first.unmount();
    resetClientForTests();
    // the list cannot be read (a client error: the cache retries server errors first)
    server.use(
      http.get('*/api/v1/beneficiary-merges', () =>
        failure(403, 'permission.denied', 'এই কাজের অনুমতি আপনার নেই।'),
      ),
    );
    const second = openProposal();
    expect(await screen.findByText('কিছু একটা ভুল হয়েছে। আবার চেষ্টা করুন।')).toBeVisible();
    expect(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'মার্জ করুন' })).not.toBeInTheDocument();
    second.unmount();
    resetClientForTests();
    // the proposal is open: its reason shows and the merge confirms without a new reason
    let executed: unknown;
    server.use(
      http.get('*/api/v1/beneficiary-merges', () =>
        envelope([
          {
            id: MERGE_ID,
            keptId: B,
            mergedId: A,
            keptBenNo: 'BEN-0000052',
            mergedBenNo: 'BEN-0000051',
            keptName: 'নমুনা রাবেয়া',
            mergedName: 'নমুনা রাবেয়া',
            status: 'proposed',
            reason: 'একই গ্রামের একই মানুষ',
            proposedBy: ME.id,
            proposedAt: '2026-10-20T04:00:00.000Z',
            mergedAt: null,
            revertedAt: null,
            leftBehind: 0,
          },
        ]),
      ),
      http.post(`*/api/v1/beneficiary-merges/${MERGE_ID}/execute`, async ({ request }) => {
        executed = await request.json();
        return envelope({ id: MERGE_ID, keptId: B, mergedId: A }, {});
      }),
    );
    const user = userEvent.setup();
    openProposal();
    expect(await screen.findByText('প্রস্তাবের কারণ: একই গ্রামের একই মানুষ')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'মার্জ করুন' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ করুন' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/admin/beneficiaries/${B}`),
    );
    expect(executed).toEqual({ keptId: B });
  });

  it('shows why a merge needs the global roles', async () => {
    refreshAs(PM);
    serveProfiles({ merge: true });
    server.use(
      http.post('*/api/v1/beneficiary-merges/direct', () =>
        failure(
          403,
          'beneficiary.merge_needs_global',
          'এখানে অন্য প্রোগ্রামের আবেদন জড়িত, তাই এই মার্জ করবেন মনিটরিং টিম বা ডিপার্টমেন্ট হেড।',
        ),
      ),
    );
    const user = userEvent.setup();
    openCompare();
    const dialog = await chooseAndOpen(user);
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ করুন' }));
    expect(
      await within(dialog).findByText(
        'এখানে অন্য প্রোগ্রামের আবেদন জড়িত, তাই এই মার্জ করবেন মনিটরিং টিম বা ডিপার্টমেন্ট হেড।',
      ),
    ).toBeVisible();
  });

  it('offers a proposal to a caller who may only propose, in English too', async () => {
    refreshAs(RPM);
    serveProfiles({ proposeMerge: true });
    let body: unknown;
    server.use(
      http.post('*/api/v1/beneficiary-merges', async ({ request }) => {
        body = await request.json();
        return envelope({ id: MERGE_ID, keptId: A, mergedId: B }, {});
      }),
    );
    const user = userEvent.setup();
    const first = openCompare();
    expect(screen.queryByRole('button', { name: 'মার্জ করুন' })).not.toBeInTheDocument();
    const dialog = await chooseAndOpen(user, 'মার্জের প্রস্তাব দিন');
    await user.click(within(dialog).getByRole('button', { name: 'মার্জের প্রস্তাব দিন' }));
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent('/admin/beneficiaries/duplicates'),
    );
    expect(body).toEqual({ keptId: A, mergedId: B, reason: 'একই ব্যক্তি, দুইবার এসেছেন' });
    first.unmount();
    resetClientForTests();
    const { container } = openCompare('en');
    expect(await screen.findByRole('button', { name: 'Propose a merge' })).toBeVisible();
    expect(screen.getAllByRole('radio', { name: 'Keep this profile' })).toHaveLength(2);
    await expectNoAxeViolations(container);
  });

  it('offers no merge when neither flag allows it', async () => {
    refreshAs(PM);
    serveProfiles({});
    openCompare();
    expect(await screen.findByText('গ্রাম 52')).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'মার্জ করুন' })).not.toBeInTheDocument();
  });
});

describe('the revert from the merge history', () => {
  const merged = {
    id: MERGE_ID,
    role: 'kept',
    otherId: B,
    otherBenNo: 52,
    status: 'merged',
    mergedAt: '2026-10-20T04:00:00.000Z',
    revertedAt: null,
    leftBehind: 0,
  };
  const openProfile = () =>
    renderApp(<BeneficiaryProfilePage />, 'bn', {
      path: '/admin/beneficiaries/:beneficiaryId',
      initialPath: `/admin/beneficiaries/${A}`,
    });

  it('shows the action only with its flag', async () => {
    refreshAs(PM);
    serveProfiles({}, { merges: [merged] });
    openProfile();
    expect(await screen.findByText('BEN-0000052 এর সাথে মার্জ হয়েছে')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'মার্জ ফেরত নিন' })).not.toBeInTheDocument();
  });

  it('reverts with a reason', async () => {
    refreshAs(HEAD);
    serveProfiles({ revertMerge: true }, { merges: [merged] });
    let body: unknown;
    server.use(
      http.post(`*/api/v1/beneficiary-merges/${MERGE_ID}/revert`, async ({ request }) => {
        body = await request.json();
        return envelope({ id: MERGE_ID }, {});
      }),
    );
    const user = userEvent.setup();
    const { container } = openProfile();
    await user.click(await screen.findByRole('button', { name: 'মার্জ ফেরত নিন' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'ভুল করে মার্জ হয়েছিল');
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ ফেরত নিন' }));
    expect(await screen.findByText('মার্জ ফেরত নেওয়া হয়েছে')).toBeVisible();
    expect(body).toEqual({ reason: 'ভুল করে মার্জ হয়েছিল' });
    await expectNoAxeViolations(container);
  });

  it('shows why a revert is refused and no success notice', async () => {
    refreshAs(HEAD);
    serveProfiles({ revertMerge: true }, { merges: [merged] });
    server.use(
      http.post(`*/api/v1/beneficiary-merges/${MERGE_ID}/revert`, () =>
        failure(
          409,
          'beneficiary.merge_revert_order',
          'রাখা প্রোফাইলটি পরে আবার মার্জ হয়েছে। আগে সেই মার্জ ফেরত নিন।',
        ),
      ),
    );
    const user = userEvent.setup();
    openProfile();
    await user.click(await screen.findByRole('button', { name: 'মার্জ ফেরত নিন' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByRole('textbox', { name: /কারণ/ }), 'ভুল করে মার্জ হয়েছিল');
    await user.click(within(dialog).getByRole('button', { name: 'মার্জ ফেরত নিন' }));
    expect(
      await within(dialog).findByText(
        'রাখা প্রোফাইলটি পরে আবার মার্জ হয়েছে। আগে সেই মার্জ ফেরত নিন।',
      ),
    ).toBeVisible();
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(screen.queryByText('মার্জ ফেরত নেওয়া হয়েছে')).not.toBeInTheDocument();
  });
});
