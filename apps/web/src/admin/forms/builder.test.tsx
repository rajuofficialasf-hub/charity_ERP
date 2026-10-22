import type { FormDefinition, FormField } from '@css/shared/forms';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { coreSections, field, option, section, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { FormBuilderPage } from './FormBuilderPage';
import { FormsPage } from './FormsPage';

// The form builder: the libraries on one side, the outline in the middle, the draft saved by
// itself with its version, the mandatory core locked, and read-only where saving is not possible.
const PROJECT = '01900000-0000-7000-8000-0000000000e1';
const FORM = '01900000-0000-7000-8000-0000000000e2';
const DRAFT = '01900000-0000-7000-8000-0000000000e3';
const PUBLISHED = '01900000-0000-7000-8000-0000000000e4';
const OTHER_PROJECT = '01900000-0000-7000-8000-0000000000e5';
const OTHER_FORM = '01900000-0000-7000-8000-0000000000e6';

const placed = (f: FormField): FormField[] => [f];
const LIBRARY = {
  sections: [
    {
      key: 'basic_info',
      title: T('মৌলিক তথ্য', 'Basic information'),
      defaultVisibility: 'volunteer',
      fieldKeys: ['name'],
    },
    {
      key: 'family_income',
      title: T('পরিবার ও আয়', 'Family and income'),
      defaultVisibility: 'volunteer',
      fieldKeys: ['members_14_plus', 'daily_income'],
    },
  ],
  fields: [
    {
      key: 'members_14_plus',
      type: 'number',
      label: T('১৪ বছরের বেশি সদস্য', 'Members over 14'),
      standardColumn: null,
      defaultSettings: {},
      formFields: placed(
        field('members_14_plus', 'number', {
          label: T('১৪ বছরের বেশি সদস্য', 'Members over 14'),
          libraryFieldKey: 'members_14_plus',
        }),
      ),
    },
    {
      key: 'daily_income',
      type: 'money',
      label: T('দৈনিক আয়', 'Daily income'),
      standardColumn: null,
      defaultSettings: {},
      formFields: placed(
        field('daily_income', 'money', {
          label: T('দৈনিক আয়', 'Daily income'),
          libraryFieldKey: 'daily_income',
        }),
      ),
    },
  ],
  templates: [
    {
      key: 'form_distribution',
      name: T('বিতরণভিত্তিক আবেদন ফর্ম', 'Distribution form'),
      projectType: 'distribution',
    },
  ],
};

const titled = (def: FormDefinition): FormDefinition => ({
  sections: def.sections.map((s) => ({
    ...s,
    title:
      s.key === 'basic_info'
        ? T('মৌলিক তথ্য', 'Basic information')
        : s.key === 'address'
          ? T('ঠিকানা', 'Address')
          : s.title,
  })),
});
const version = (
  id: string,
  status: 'draft' | 'published',
  sections = titled({ sections: coreSections() }).sections,
) => ({
  id,
  formId: FORM,
  versionNo: status === 'draft' ? 2 : 1,
  status,
  publishedAt: status === 'published' ? '2026-10-20T10:00:00.000Z' : null,
  sections,
});

let saves: { body: { sections: FormDefinition['sections'] }; ifMatch: string | null }[];
let etagNo: number;
let versionReads: number;
function api(
  options: {
    patch?: () => Response;
    versionStatus?: number;
    draft?: boolean;
    sections?: FormDefinition['sections'];
  } = {},
) {
  saves = [];
  etagNo = 1;
  versionReads = 0;
  const current = {
    ...version(
      options.draft === false ? PUBLISHED : DRAFT,
      options.draft === false ? 'published' : 'draft',
      options.sections,
    ),
  };
  server.use(
    http.get(`*/api/v1/projects/${PROJECT}`, () =>
      HttpResponse.json({
        data: {
          id: PROJECT,
          code: 'WIN26',
          year: 2026,
          name: T('শীতবস্ত্র 2026', 'Winter 2026'),
          status: 'draft',
          workflowKey: 'distribution',
        },
        meta: { requestId: 'r', etag: '"p1"' },
      }),
    ),
    http.get(`*/api/v1/projects/${PROJECT}/forms`, () =>
      HttpResponse.json({
        data: [
          {
            id: FORM,
            projectId: PROJECT,
            key: 'default',
            title: T('উপকারভোগীর আবেদন', 'Beneficiary application'),
            publishedVersionId: options.draft === false ? PUBLISHED : null,
            draftVersionId: options.draft === false ? null : DRAFT,
          },
        ],
        meta: { requestId: 'r' },
      }),
    ),
    http.get('*/api/v1/form-library', () =>
      HttpResponse.json({ data: LIBRARY, meta: { requestId: 'r' } }),
    ),
    http.get(`*/api/v1/forms/${FORM}/versions`, () =>
      HttpResponse.json({
        data: [
          {
            ...current,
            publishedBy: null,
            updatedBy: { id: ME.id, name: ME.displayName },
            updatedAt: '2026-10-21T05:30:00.000Z',
          },
        ],
        meta: { requestId: 'r' },
      }),
    ),
    http.get(`*/api/v1/projects/${PROJECT}/components`, () =>
      HttpResponse.json({ data: [], meta: { requestId: 'r' } }),
    ),
    http.get('*/api/v1/nisab-versions/in-force', () =>
      HttpResponse.json({ data: { value: '85000.00' }, meta: { requestId: 'r' } }),
    ),
    http.get('*/api/v1/form-versions/:id', () => {
      versionReads += 1;
      if (options.versionStatus === 404)
        return apiError(404, 'permission.not_found', 'পাওয়া যায়নি।');
      return HttpResponse.json(
        { data: current, meta: { requestId: 'r', etag: `"v${etagNo}"` } },
        { headers: { ETag: `"v${etagNo}"` } },
      );
    }),
    http.patch('*/api/v1/form-versions/:id', async ({ request }) => {
      const body = (await request.json()) as { sections: FormDefinition['sections'] };
      saves.push({ body, ifMatch: request.headers.get('if-match') });
      if (options.patch) return options.patch();
      current.sections = body.sections;
      etagNo += 1;
      return HttpResponse.json(
        { data: current, meta: { requestId: 'r', etag: `"v${etagNo}"` } },
        { headers: { ETag: `"v${etagNo}"` } },
      );
    }),
  );
}

const open = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(<FormBuilderPage />, locale, {
    path: '/admin/projects/:projectId/forms/:formId',
    initialPath: `/admin/projects/${PROJECT}/forms/${FORM}`,
  });

beforeEach(() => {
  // each test signs in afresh, so a role set by one never carries into the next
  resetClientForTests();
  refreshAs({ ...ME, roles: ['program_manager'] });
});
afterEach(() => vi.unstubAllGlobals());

/** The canvas's list of a section's questions. */
const outlineOf = async (title: string) => within(await screen.findByRole('list', { name: title }));
/** Adds a library section whole from the left pane's library tab. */
const addSection = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  await user.click(await screen.findByRole('tab', { name: 'লাইব্রেরি' }));
  await openGroup(user, title);
  await user.click(await screen.findByRole('button', { name: `${title}: পুরো অংশটি যোগ করুন` }));
};
/** Opens a library section's group in the left pane when it is closed. */
const openGroup = async (user: ReturnType<typeof userEvent.setup>, title: string) => {
  const heading = await screen.findByRole('button', { name: new RegExp(`^${title} `) });
  if (heading.getAttribute('aria-expanded') === 'false') await user.click(heading);
};
/** Picks an option of a select of the set, found by its label. */
async function choose(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  optionName: string | RegExp,
  scope: ReturnType<typeof within> | typeof screen = screen,
) {
  await user.click(scope.getByRole('button', { name: label }));
  await user.click(await screen.findByRole('option', { name: optionName }));
}
/** The field of the last saved draft. */
const savedField = (key: string) =>
  saves
    .at(-1)!
    .body.sections.flatMap((s) => s.fields)
    .find((f) => f.fieldKey === key);

describe('the outline and the libraries', () => {
  it('adds a library section with its fields by a tick, and saves the draft with its version', async () => {
    const user = userEvent.setup();
    api();
    open();
    await addSection(user, 'পরিবার ও আয়');
    const added = await outlineOf('পরিবার ও আয়');
    expect(added.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('১৪ বছরের বেশি সদস্য'),
      expect.stringContaining('দৈনিক আয়'),
    ]);
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 });
    expect(saves[0]!.ifMatch).toBe('"v1"');
    expect(saves[0]!.body.sections.map((s) => s.key)).toEqual([
      'basic_info',
      'address',
      'family_income',
    ]);
    expect(await screen.findByText('সংরক্ষিত')).toBeInTheDocument();
  }, 15_000);

  it('moves a question down and back up with the keyboard, and saves the order', async () => {
    const user = userEvent.setup();
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section(
          'family_income',
          [
            field('a', 'number', { label: T('প্রথম') }),
            field('b', 'number', { label: T('দ্বিতীয়') }),
          ],
          { title: T('পরিবার ও আয়', 'Family and income') },
        ),
      ],
    });
    open();
    // the move buttons belong to the chosen question
    await user.click(await screen.findByRole('button', { name: 'প্রথম বদলান' }));
    const down = await screen.findByRole('button', { name: 'প্রথম নিচে নিন' });
    down.focus();
    await user.keyboard('{Enter}');
    const list = await outlineOf('পরিবার ও আয়');
    await waitFor(() => expect(list.getAllByRole('listitem')[0]).toHaveTextContent('দ্বিতীয়'));
    // the first question is now last, so its down button is off and its up button brings it back
    expect(screen.getByRole('button', { name: 'প্রথম নিচে নিন' })).toBeDisabled();
    screen.getByRole('button', { name: 'প্রথম উপরে নিন' }).focus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(list.getAllByRole('listitem')[0]).toHaveTextContent('প্রথম'));
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 });
    const saved = saves[0]!.body.sections.find((s) => s.key === 'family_income')!;
    expect(saved.fields.map((f) => f.fieldKey)).toEqual(['a', 'b']);
  }, 15_000);

  it('marks the core fields locked and offers no remove for them', async () => {
    api();
    open();
    const user = userEvent.setup();
    const basic = await outlineOf('মৌলিক তথ্য');
    const name = basic.getAllByRole('listitem').find((li) => li.textContent?.includes('name'))!;
    expect(within(name).getByText('আবশ্যক ঘর; সরানো বা লুকানো যায় না')).toBeInTheDocument();
    // chosen, it offers its moves but neither a copy nor a remove
    await user.click(within(name).getByRole('button', { name: 'name বদলান' }));
    expect(within(name).getByRole('button', { name: 'name নিচে নিন' })).toBeInTheDocument();
    expect(within(name).queryByRole('button', { name: 'name সরান' })).not.toBeInTheDocument();
    expect(within(name).queryByRole('button', { name: /কপি/ })).not.toBeInTheDocument();
  });

  it('removes a chosen question and brings it back with one press', async () => {
    const user = userEvent.setup();
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section('extra', [field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })], {
          title: T('অতিরিক্ত', 'Extra'),
        }),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য সরান' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'মন্তব্য বদলান' })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText('এই অংশে এখনো কোনো প্রশ্ন নেই। বাঁ দিক থেকে প্রশ্ন যোগ করুন।'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ফেরত আনুন' }));
    expect(await screen.findByRole('button', { name: 'মন্তব্য বদলান' })).toBeInTheDocument();
    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(saves.at(-1)!.body.sections.find((s) => s.key === 'extra')!.fields).toHaveLength(1);
  }, 15_000);

  it("copies a chosen question right after it as one of the project's own", async () => {
    const user = userEvent.setup();
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section('extra', [field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })], {
          title: T('অতিরিক্ত', 'Extra'),
        }),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য কপি করুন' }));
    const list = await outlineOf('অতিরিক্ত');
    expect(list.getAllByRole('listitem')).toHaveLength(2);
    expect(list.getByRole('button', { name: 'মন্তব্য (কপি) বদলান' })).toBeInTheDocument();
    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 4000 });
    const keys = saves
      .at(-1)!
      .body.sections.find((s) => s.key === 'extra')!
      .fields.map((f) => f.fieldKey);
    expect(keys).toEqual(['q_note', 'q_note_copy']);
  }, 15_000);

  it('finds a library field by its label', async () => {
    const user = userEvent.setup();
    api();
    open();
    await user.click(await screen.findByRole('tab', { name: 'লাইব্রেরি' }));
    await user.type(
      await screen.findByRole('textbox', { name: 'লাইব্রেরিতে প্রশ্ন খুঁজুন' }),
      'দৈনিক',
    );
    expect(screen.getByRole('button', { name: 'দৈনিক আয় যোগ করুন' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '১৪ বছরের বেশি সদস্য যোগ করুন' }),
    ).not.toBeInTheDocument();
  });

  it('adds one library question to the chosen section and marks it as in the form', async () => {
    const user = userEvent.setup();
    api();
    open();
    await user.click(await screen.findByRole('button', { name: 'মৌলিক তথ্য' }));
    await user.click(screen.getByRole('tab', { name: 'লাইব্রেরি' }));
    await openGroup(user, 'পরিবার ও আয়');
    await user.click(await screen.findByRole('button', { name: 'দৈনিক আয় যোগ করুন' }));
    expect(screen.queryByRole('button', { name: 'দৈনিক আয় যোগ করুন' })).not.toBeInTheDocument();
    const basic = await outlineOf('মৌলিক তথ্য');
    expect(basic.getByRole('button', { name: 'দৈনিক আয় বদলান' })).toBeInTheDocument();
  });
});

describe('the own question', () => {
  it('comes from a type on the left, needs both labels and, for a choice, an option in both languages', async () => {
    const user = userEvent.setup();
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section('project', [], { title: T('প্রকল্পের প্রশ্ন', 'Project') }),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রকল্পের প্রশ্ন' }));
    await user.click(screen.getByRole('button', { name: 'একটি বেছে নিন প্রশ্ন যোগ করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন প্রশ্ন' });
    expect(within(dialog).getByText('একটি বেছে নিন')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'প্রশ্ন যোগ করুন' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('দুই ভাষাতেই লেবেল লিখুন।');
    await user.type(
      within(dialog).getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }),
      'নিজের ঘর আছে?',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }),
      'Own house?',
    );
    await user.click(within(dialog).getByRole('button', { name: 'প্রশ্ন যোগ করুন' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('অন্তত একটি অপশন রাখুন');
    await user.type(within(dialog).getByRole('textbox', { name: /^অপশন 1 \(বাংলা\)/ }), 'হ্যাঁ');
    await user.type(within(dialog).getByRole('textbox', { name: /^অপশন 1 \(ইংরেজি\)/ }), 'Yes');
    await user.click(within(dialog).getByRole('button', { name: 'প্রশ্ন যোগ করুন' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'নতুন প্রশ্ন' })).not.toBeInTheDocument(),
    );
    // the new question opens in the settings
    expect(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ })).toHaveValue('নিজের ঘর আছে?');
    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(savedField('q_own_house')).toMatchObject({
      type: 'radio',
      label: { bn: 'নিজের ঘর আছে?', en: 'Own house?' },
      libraryFieldKey: null,
      options: [{ code: 'opt_1', label: { bn: 'হ্যাঁ', en: 'Yes' } }],
    });
  }, 20_000);

  it('goes to the section picked in the dialog and names the earlier answer a branching option follows', async () => {
    const user = userEvent.setup();
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section(
          'work',
          [
            field('occupation', 'radio', {
              label: T('পেশা', 'Occupation'),
              options: [
                option('business', { label: T('ব্যবসা', 'Business') }),
                option('farming', { label: T('কৃষি', 'Farming') }),
              ],
            }),
          ],
          { title: T('কাজ', 'Work') },
        ),
      ],
    });
    open();
    // the first section is chosen; the dialog moves the question to the work section
    await user.click(await screen.findByRole('button', { name: 'মৌলিক তথ্য' }));
    await user.click(screen.getByRole('button', { name: 'তালিকা থেকে একটি প্রশ্ন যোগ করুন' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন প্রশ্ন' });
    const scope = within(dialog);
    await user.type(scope.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }), 'ব্যবসার ধরন');
    await user.type(scope.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }), 'Kind of business');
    await choose(user, /^মৌলিক তথ্য কোন অংশে/, 'কাজ', scope);
    await choose(user, /কোন প্রশ্নের উত্তর অনুযায়ী/, 'পেশা', scope);
    await user.type(scope.getByRole('textbox', { name: /^অপশন 1 \(বাংলা\)/ }), 'দোকান');
    await user.type(scope.getByRole('textbox', { name: /^অপশন 1 \(ইংরেজি\)/ }), 'Shop');
    await choose(user, /অপশন 1 দেখাবে যখন “পেশা”-এর উত্তর/, 'ব্যবসা', scope);
    await user.click(scope.getByRole('button', { name: 'প্রশ্ন যোগ করুন' }));
    const work = await outlineOf('কাজ');
    expect(work.getByRole('button', { name: 'ব্যবসার ধরন বদলান' })).toBeInTheDocument();
    await waitFor(() => expect(savedField('q_kind_of_business')).toBeDefined(), { timeout: 4000 });
    expect(savedField('q_kind_of_business')).toMatchObject({
      logic: { options_depend_on: 'occupation' },
      options: [{ code: 'opt_1', dependsOnOptionCode: 'business' }],
    });
  }, 20_000);
});

describe('saving', () => {
  it('puts the engine message on the question the server names', async () => {
    const user = userEvent.setup();
    api({
      patch: () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              details: [
                {
                  path: 'members_14_plus',
                  code: 'form.unknown_reference',
                  message: 'শর্তে এমন একটি ঘরের নাম আছে যা ফর্মে নেই।',
                },
              ],
              requestId: 'r',
            },
          },
          { status: 422 },
        ),
    });
    open();
    await addSection(user, 'পরিবার ও আয়');
    expect(
      await screen.findByText('শর্তে এমন একটি ঘরের নাম আছে যা ফর্মে নেই।', {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    expect(screen.getByText('সংরক্ষণ হয়নি')).toBeInTheDocument();
  }, 15_000);

  it('shows a refusal about the whole form above the outline', async () => {
    const user = userEvent.setup();
    api({
      patch: () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              details: [{ path: 'sections', code: 'form.too_many', message: 'ফর্মটি অনেক বড়।' }],
              requestId: 'r',
            },
          },
          { status: 422 },
        ),
    });
    open();
    await addSection(user, 'পরিবার ও আয়');
    expect(await screen.findByText('ফর্মটি অনেক বড়।', {}, { timeout: 4000 })).toBeInTheDocument();
  }, 15_000);

  it('opens the saved draft again after leaving, and saves the next change on its version', async () => {
    const user = userEvent.setup();
    api();
    const { router } = open();
    await addSection(user, 'পরিবার ও আয়');
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 });
    await screen.findByText('সংরক্ষিত');
    await router.navigate('/admin/projects');
    await screen.findByTestId('location');
    expect(screen.queryByRole('list', { name: 'পরিবার ও আয়' })).not.toBeInTheDocument();
    await router.navigate(`/admin/projects/${PROJECT}/forms/${FORM}`);
    expect(await screen.findByRole('list', { name: 'পরিবার ও আয়' })).toBeInTheDocument();
    // the builder opened from what it saved, without asking the server again
    expect(versionReads).toBe(1);
    await user.click(screen.getByRole('button', { name: '১৪ বছরের বেশি সদস্য বদলান' }));
    await user.click(screen.getByRole('button', { name: '১৪ বছরের বেশি সদস্য নিচে নিন' }));
    await waitFor(() => expect(saves).toHaveLength(2), { timeout: 4000 });
    expect(saves[1]!.ifMatch).toBe('"v2"');
  }, 15_000);

  it('reloads the draft when someone else changed it', async () => {
    const user = userEvent.setup();
    api({ patch: () => apiError(412, 'conflict.stale_version', 'অন্য কেউ বদলেছেন।') });
    open();
    await addSection(user, 'পরিবার ও আয়');
    expect(
      await screen.findByText(/অন্য কেউ এই খসড়া বদলেছেন/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(versionReads).toBeGreaterThan(1));
  }, 15_000);

  it('asks before leaving while a change is not saved', async () => {
    const user = userEvent.setup();
    api({ patch: () => apiError(500, 'server.internal', 'কিছু একটা ভুল হয়েছে।') });
    const { router } = open();
    await addSection(user, 'পরিবার ও আয়');
    await screen.findByText('সংরক্ষণ হয়নি', {}, { timeout: 4000 });
    void router.navigate('/admin/projects');
    const dialog = await screen.findByRole('dialog', { name: 'সংরক্ষণ না করেই চলে যাবেন?' });
    await user.click(within(dialog).getByRole('button', { name: 'থাকুন' }));
    expect(await screen.findByRole('list', { name: 'পরিবার ও আয়' })).toBeInTheDocument();
  }, 15_000);

  it('turns read-only with a notice when the server refuses the save to a builder without the official part', async () => {
    const user = userEvent.setup();
    api({ patch: () => apiError(403, 'permission.denied', 'অনুমতি নেই।') });
    open();
    await addSection(user, 'পরিবার ও আয়');
    expect(
      await screen.findByText(/অফিসিয়াল অংশ দেখার অনুমতি নেই/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    // read-only now: the left pane is gone
    expect(screen.queryByRole('tab', { name: 'লাইব্রেরি' })).not.toBeInTheDocument();
  }, 15_000);
});

describe('who may change what', () => {
  it('shows a published version read-only', async () => {
    api({ draft: false });
    open();
    expect(await screen.findByText('সংস্করণ 1: প্রকাশিত')).toBeInTheDocument();
    expect(screen.getByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'লাইব্রেরি' })).not.toBeInTheDocument();
  });

  it('shows the outline read-only to a role that does not build forms', async () => {
    refreshAs({ ...ME, roles: ['regional_program_manager'] });
    api();
    open();
    await outlineOf('মৌলিক তথ্য');
    expect(screen.queryByRole('tab', { name: 'লাইব্রেরি' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /নিচে নিন$/ })).not.toBeInTheDocument();
  });

  it('lets a phone change only the labels and option texts', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('max-width'),
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section(
          'extra',
          [
            field('q_kind', 'radio', {
              label: T('ধরন', 'Kind'),
              options: [option('a', { label: T('ক', 'A') })],
            }),
          ],
          { title: T('অতিরিক্ত', 'Extra') },
        ),
      ],
    });
    open();
    expect(
      await screen.findByText(/ফোনে শুধু লেবেল ও অপশনের লেখা বদলানো যায়/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /নিচে নিন$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'লাইব্রেরি' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'ধরন বদলান' }));
    const label = screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ });
    await user.clear(label);
    await user.type(label, 'ধরনটি');
    await user.clear(screen.getByRole('textbox', { name: /^অপশন 1 \(বাংলা\)/ }));
    await user.type(screen.getByRole('textbox', { name: /^অপশন 1 \(বাংলা\)/ }), 'খ');
    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 4000 });
    const saved = saves.at(-1)!.body.sections.find((s) => s.key === 'extra')!.fields[0]!;
    expect(saved.label.bn).toBe('ধরনটি');
    expect(saved.options![0]!.label.bn).toBe('খ');
  }, 15_000);

  it('offers a retry, not the not-found page, when the forms cannot be read', async () => {
    const user = userEvent.setup();
    api();
    let fail = true;
    server.use(
      http.get(`*/api/v1/projects/${PROJECT}/forms`, () =>
        fail
          ? apiError(500, 'server.internal', 'কিছু একটা ভুল হয়েছে।')
          : HttpResponse.json({
              data: [
                {
                  id: FORM,
                  projectId: PROJECT,
                  key: 'default',
                  title: T('উপকারভোগীর আবেদন', 'Beneficiary application'),
                  publishedVersionId: null,
                  draftVersionId: DRAFT,
                },
              ],
              meta: { requestId: 'r' },
            }),
      ),
    );
    open();
    const retry = await screen.findByRole('button', { name: /আবার চেষ্টা/ }, { timeout: 8000 });
    expect(screen.queryByText('ফর্মটি পাওয়া যায়নি')).not.toBeInTheDocument();
    fail = false;
    await user.click(retry);
    expect(await outlineOf('মৌলিক তথ্য')).toBeTruthy();
  }, 20_000);

  it('answers a form of another program with the not-found page', async () => {
    api({ versionStatus: 404 });
    open();
    expect(await screen.findByText('ফর্মটি পাওয়া যায়নি')).toBeInTheDocument();
  });

  it('has no axe violation', async () => {
    api();
    const { container } = open();
    await outlineOf('মৌলিক তথ্য');
    await expectNoAxeViolations(container);
  });
});

describe('a new form', () => {
  const forms = (rows: unknown[]) =>
    http.get(`*/api/v1/projects/${PROJECT}/forms`, () =>
      HttpResponse.json({ data: rows, meta: { requestId: 'r' } }),
    );
  const openList = () =>
    renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms`,
    });

  it('starts from a library template with both names and opens the builder', async () => {
    const user = userEvent.setup();
    const posts: unknown[] = [];
    server.use(
      forms([]),
      http.get('*/api/v1/form-library', () =>
        HttpResponse.json({ data: LIBRARY, meta: { requestId: 'r' } }),
      ),
      http.post(`*/api/v1/projects/${PROJECT}/forms`, async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json(
          {
            data: {
              id: FORM,
              projectId: PROJECT,
              key: 'default',
              title: T('আবেদন', 'Application'),
              publishedVersionId: null,
              draftVersionId: DRAFT,
            },
            meta: { requestId: 'r' },
          },
          { status: 201 },
        );
      }),
    );
    const { getByTestId } = openList();
    expect(await screen.findByText('এই প্রকল্পে এখনো কোনো ফর্ম নেই।')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'নতুন ফর্ম' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন আবেদন ফর্ম' });
    await user.type(within(dialog).getByRole('textbox', { name: /ফর্মের নাম \(বাংলা\)/ }), 'আবেদন');
    await user.type(
      within(dialog).getByRole('textbox', { name: /ফর্মের নাম \(ইংরেজি\)/ }),
      'Application',
    );
    await user.click(within(dialog).getByRole('radio', { name: 'লাইব্রেরির টেমপ্লেট' }));
    await user.click(within(dialog).getByRole('button', { name: /টেমপ্লেট/ }));
    await user.click(await screen.findByRole('option', { name: 'বিতরণভিত্তিক আবেদন ফর্ম' }));
    await user.click(within(dialog).getByRole('button', { name: 'তৈরি করুন' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      key: 'default',
      title: { bn: 'আবেদন', en: 'Application' },
      source: { kind: 'template', templateKey: 'form_distribution' },
    });
    await waitFor(() =>
      expect(getByTestId('location')).toHaveTextContent(`/admin/projects/${PROJECT}/forms/${FORM}`),
    );
  });

  it('opens the new-form dialog when the setup screen sends a project without a form', async () => {
    server.use(
      forms([]),
      http.get('*/api/v1/form-library', () =>
        HttpResponse.json({ data: LIBRARY, meta: { requestId: 'r' } }),
      ),
    );
    renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms?new=1`,
    });
    expect(await screen.findByRole('dialog', { name: 'নতুন আবেদন ফর্ম' })).toBeInTheDocument();
  });

  it('opens no dialog from ?new=1 for a role that does not build forms', async () => {
    refreshAs({ ...ME, roles: ['regional_program_manager'] });
    server.use(forms([]));
    renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms?new=1`,
    });
    expect(await screen.findByText('এই প্রকল্পে এখনো কোনো ফর্ম নেই।')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'নতুন আবেদন ফর্ম' })).not.toBeInTheDocument();
  });

  it('takes ?new=1 off the address when the dialog closes, so it does not open again', async () => {
    const user = userEvent.setup();
    server.use(
      forms([]),
      http.get('*/api/v1/form-library', () =>
        HttpResponse.json({ data: LIBRARY, meta: { requestId: 'r' } }),
      ),
    );
    const { router } = renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms?new=1`,
    });
    const dialog = await screen.findByRole('dialog', { name: 'নতুন আবেদন ফর্ম' });
    await user.click(within(dialog).getByRole('button', { name: 'বাতিল' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('offers only the published forms of the projects the caller reaches as a copy', async () => {
    const user = userEvent.setup();
    server.use(
      forms([]),
      http.get('*/api/v1/form-library', () =>
        HttpResponse.json({ data: LIBRARY, meta: { requestId: 'r' } }),
      ),
      http.get('*/api/v1/projects', () =>
        HttpResponse.json({
          data: [
            {
              id: OTHER_PROJECT,
              code: 'WIN25',
              year: 2025,
              name: T('শীতবস্ত্র 2025', 'Winter 2025'),
              status: 'closed',
              workflowKey: 'distribution',
            },
          ],
          meta: { requestId: 'r' },
        }),
      ),
      http.get(`*/api/v1/projects/${OTHER_PROJECT}/forms`, () =>
        HttpResponse.json({
          data: [
            {
              id: OTHER_FORM,
              projectId: OTHER_PROJECT,
              key: 'default',
              title: T('গত বছরের ফর্ম', 'Last year'),
              publishedVersionId: PUBLISHED,
              draftVersionId: null,
            },
            {
              id: '01900000-0000-7000-8000-0000000000e7',
              projectId: OTHER_PROJECT,
              key: 'second',
              title: T('শুধু খসড়া', 'Draft only'),
              publishedVersionId: null,
              draftVersionId: DRAFT,
            },
          ],
          meta: { requestId: 'r' },
        }),
      ),
    );
    openList();
    await user.click(await screen.findByRole('button', { name: 'নতুন ফর্ম' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন আবেদন ফর্ম' });
    await user.click(within(dialog).getByRole('radio', { name: 'অন্য প্রকল্পের ফর্ম' }));
    await user.click(within(dialog).getByRole('button', { name: /^.*প্রকল্প/ }));
    await user.click(await screen.findByRole('option', { name: /শীতবস্ত্র 2025/ }));
    await user.click(within(dialog).getByRole('button', { name: /(^|\s)ফর্ম(\(|\s|$)/ }));
    expect(await screen.findByRole('option', { name: 'গত বছরের ফর্ম' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'শুধু খসড়া' })).not.toBeInTheDocument();
  });

  it('shows the server refusal of a new form and keeps the dialog open', async () => {
    const user = userEvent.setup();
    server.use(
      forms([]),
      http.post(`*/api/v1/projects/${PROJECT}/forms`, () =>
        apiError(409, 'form.key_taken', 'এই প্রকল্পে এই নামের ফর্ম আগেই আছে।'),
      ),
    );
    openList();
    await user.click(await screen.findByRole('button', { name: 'নতুন ফর্ম' }));
    const dialog = await screen.findByRole('dialog', { name: 'নতুন আবেদন ফর্ম' });
    await user.type(within(dialog).getByRole('textbox', { name: /ফর্মের নাম \(বাংলা\)/ }), 'আবেদন');
    await user.type(
      within(dialog).getByRole('textbox', { name: /ফর্মের নাম \(ইংরেজি\)/ }),
      'Application',
    );
    await user.click(within(dialog).getByRole('radio', { name: 'খালি ফর্ম (শুধু আবশ্যক ঘর)' }));
    await user.click(within(dialog).getByRole('button', { name: 'তৈরি করুন' }));
    expect(
      await within(dialog).findByText('এই প্রকল্পে এই নামের ফর্ম আগেই আছে।'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'নতুন আবেদন ফর্ম' })).toBeInTheDocument();
  });
});
