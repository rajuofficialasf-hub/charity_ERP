import type { FormDefinition, FormField } from '@css/shared/forms';
import { expectNoAxeViolations } from '@/ui/testing';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { coreSections, field, option, section, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { FormBuilderPage } from './FormBuilderPage';
import { FormsPage } from './FormsPage';
import { LEAVE_ASK_AFTER_MS, SAVE_DELAY_MS, SAVE_RETRY_EVERY_MS } from './use-draft-save';
import { stubMatchMedia } from '../../../test/match-media';

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

let saves: {
  body: { sections: FormDefinition['sections']; scoring?: FormDefinition['scoring'] | null };
  ifMatch: string | null;
}[];
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
  const current: ReturnType<typeof version> & { scoring?: FormDefinition['scoring'] } = {
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
            kind: 'beneficiary_application',
            sourceFormId: null,
            sourceVersionNo: null,
            newerVersionNo: null,
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
      const body = (await request.json()) as {
        sections: FormDefinition['sections'];
        scoring?: FormDefinition['scoring'] | null;
      };
      saves.push({ body, ifMatch: request.headers.get('if-match') });
      if (options.patch) return options.patch();
      current.sections = body.sections;
      if (body.scoring) current.scoring = body.scoring;
      else delete current.scoring;
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

/** What the page asked to bring into view (jsdom has no scrolling of its own). */
let scrolled: Element[];
beforeEach(() => {
  // each test signs in afresh, so a role set by one never carries into the next
  resetClientForTests();
  refreshAs({ ...ME, roles: ['monitoring_team'] });
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

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
  // the group's name is its title, then its count of questions
  const heading = await screen.findByRole('button', { name: new RegExp(`^${title}`) });
  if (heading.getAttribute('aria-expanded') === 'false') await user.click(heading);
};
/**
 * The waits of the save on a clock the test moves by hand. The library's own waiting helpers
 * lean on the same clock, so with it the screen is given its turns here, and presses are plain
 * events.
 */
const byHand = {
  start: () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }),
  /** Lets the network and the screen settle; the clock does not move. */
  settle: async (turns = 20) => {
    for (let turn = 0; turn < turns; turn += 1)
      await act(async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
      });
  },
  /** Settles until the search finds what it looks for. */
  found: async <T,>(find: () => T): Promise<T> => {
    for (let turn = 0; turn < 300; turn += 1) {
      try {
        return find();
      } catch {
        await byHand.settle(1);
      }
    }
    return find();
  },
  /** Moves the clock on, then lets what it started settle. */
  pass: async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
    await byHand.settle();
  },
  /** Adds a library section whole, as `addSection` does. */
  addSection: async (title: string) => {
    fireEvent.click(screen.getByRole('tab', { name: 'লাইব্রেরি' }));
    const group = await byHand.found(() =>
      screen.getByRole('button', { name: new RegExp(`^${title}`) }),
    );
    if (group.getAttribute('aria-expanded') === 'false') fireEvent.click(group);
    fireEvent.click(
      await byHand.found(() =>
        screen.getByRole('button', { name: `${title}: পুরো অংশটি যোগ করুন` }),
      ),
    );
  },
};
/** The undo and redo buttons of the form head. */
const undoButton = () =>
  within(screen.getByTestId('form-head')).getByRole('button', { name: 'ফিরিয়ে আনুন' });
const redoButton = () =>
  within(screen.getByTestId('form-head')).getByRole('button', { name: 'আবার করুন' });
/** A form with one question of its own, "মন্তব্য", in a part after the identity ones. */
const withNote = (): FormDefinition['sections'] => [
  ...titled({ sections: coreSections() }).sections,
  section('extra', [field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })], {
    title: T('অতিরিক্ত', 'Extra'),
  }),
];
/** The key every new and every copied question takes: random, never a word of its text. */
const RANDOM_KEY = /^q_[a-z0-9]{6}$/;
/** The questions of a part in the last saved draft. */
const savedFields = (sectionKey: string) =>
  saves.at(-1)?.body.sections.find((s) => s.key === sectionKey)?.fields ?? [];
/** The Bengali text of the chosen question or part, in the settings pane. */
const bnText = () => screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ });
/** The names of the questions of a part, in the order of the canvas. */
const questionsOf = async (title: string) =>
  (await outlineOf(title))
    .getAllByRole('button', { name: / বদলান$/ })
    .map((b) => b.getAttribute('aria-label'));
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
    // saved, the draft may be published: the button waits for nothing
    expect(screen.getByRole('button', { name: 'প্রকাশ করুন' })).toBeEnabled();
    expect(screen.queryByTitle('খসড়া সংরক্ষণ হলে তবেই প্রকাশ করা যাবে')).not.toBeInTheDocument();
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

  it('tags an identity question with its role, and lets it be moved, copied and removed', async () => {
    api();
    open();
    const user = userEvent.setup();
    const basic = await outlineOf('মৌলিক তথ্য');
    const name = basic.getAllByRole('listitem').find((li) => li.textContent?.includes('name'))!;
    expect(within(name).getByText('পরিচয়: নাম')).toBeInTheDocument();
    // chosen, it moves, copies and goes like any other question
    await user.click(within(name).getByRole('button', { name: 'name বদলান' }));
    expect(within(name).getByRole('button', { name: 'name নিচে নিন' })).toBeInTheDocument();
    expect(within(name).getByRole('button', { name: 'name সরান' })).toBeInTheDocument();
  });

  it('removes a chosen question, says how it comes back, and undoes the removal from the form head', async () => {
    const user = userEvent.setup();
    api({ sections: withNote() });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য সরান' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'মন্তব্য বদলান' })).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText('এই অংশে এখনো কোনো প্রশ্ন নেই। বাঁ দিক থেকে প্রশ্ন যোগ করুন।'),
    ).toBeInTheDocument();
    const notice = '“মন্তব্য” সরানো হয়েছে। ফিরিয়ে আনতে উপরের “ফিরিয়ে আনুন” বোতামে চাপুন।';
    expect(screen.getByText(notice)).toBeInTheDocument();
    await user.click(undoButton());
    // back in its place, and chosen as it was when it was removed
    expect(await screen.findByRole('button', { name: 'মন্তব্য বদলান' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
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
    const keys = savedFields('extra').map((f) => f.fieldKey);
    // the copy's key is its own, and no word of the copied question's key or text
    expect(keys).toEqual(['q_note', expect.stringMatching(RANDOM_KEY)]);
    expect(keys[1]).not.toContain('note');
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
    // a section's title finds the whole section
    const box = screen.getByRole('textbox', { name: 'লাইব্রেরিতে প্রশ্ন খুঁজুন' });
    await user.clear(box);
    await user.type(box, 'পরিবার');
    expect(
      screen.getByRole('button', { name: '১৪ বছরের বেশি সদস্য যোগ করুন' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'পরিবার ও আয়: পুরো অংশটি যোগ করুন' }),
    ).toBeInTheDocument();
  });

  it('tags a calculated question by whether its rule is set', async () => {
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section(
          'extra',
          [
            field('a', 'number', { label: T('ক', 'A') }),
            field('sum', 'calculation', {
              label: T('যোগফল', 'Sum'),
              calculation: { expr: { op: 'add', args: [{ field: 'a' }, 1] } },
            }),
            field('later', 'calculation', { label: T('পরে', 'Later') }),
          ],
          { title: T('অতিরিক্ত', 'Extra') },
        ),
      ],
    });
    open();
    const list = await outlineOf('অতিরিক্ত');
    const items = list.getAllByRole('listitem');
    expect(items[1]).toHaveTextContent('নিজে থেকে হিসাব');
    expect(items[2]).toHaveTextContent('হিসাবের নিয়ম দিন');
  });

  it("takes a question into a group's rows from the types the group's own button opens", async () => {
    const user = userEvent.setup();
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section(
          'family',
          [field('members', 'repeat_group', { label: T('পরিবারের সদস্যরা', 'Family members') })],
          { title: T('পরিবার', 'Family') },
        ),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'সারিতে প্রশ্ন যোগ করুন' }));
    const menu = within(await screen.findByRole('menu', { name: 'সারিতে প্রশ্ন যোগ করুন' }));
    // a list holds no list and no number table, so the rows are offered neither
    expect(menu.queryByRole('menuitem', { name: 'কয়েকজনের তালিকা' })).not.toBeInTheDocument();
    expect(menu.queryByRole('menuitem', { name: 'সংখ্যার ছক' })).not.toBeInTheDocument();
    await user.click(menu.getByRole('menuitem', { name: 'সংখ্যা' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const rows = within(
      await screen.findByRole('list', { name: 'পরিবারের সদস্যরা: প্রতিটি সারির প্রশ্ন' }),
    );
    expect(rows.getByRole('button', { name: 'নাম ছাড়া প্রশ্ন বদলান' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await waitFor(() => expect(bnText()).toHaveFocus());
    await user.type(bnText(), 'বয়স');
    expect(await rows.findByRole('button', { name: 'বয়স বদলান' })).toBeInTheDocument();
    await waitFor(() => expect(savedFields('family')[1]?.label.bn).toBe('বয়স'), {
      timeout: 4000,
    });
    expect(savedFields('family')[1]).toMatchObject({
      fieldKey: expect.stringMatching(RANDOM_KEY),
      type: 'number',
      settings: { repeat: { group: 'members' } },
    });
    // with the row question chosen, a type from the left goes into the rows right after it
    await user.click(screen.getByRole('button', { name: 'ছোট লেখা প্রশ্ন যোগ করুন' }));
    await waitFor(() =>
      expect(
        rows.getAllByRole('button', { name: / বদলান$/ }).map((b) => b.getAttribute('aria-label')),
      ).toEqual(['বয়স বদলান', 'নাম ছাড়া প্রশ্ন বদলান']),
    );
  }, 20_000);

  it('undoes a removal and an added part one by one until the form is as it was, and redoes them', async () => {
    const user = userEvent.setup();
    const start = withNote();
    api({ sections: start });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য সরান' }));
    expect(await screen.findByText(/^“মন্তব্য” সরানো হয়েছে।/)).toBeInTheDocument();
    await addSection(user, 'পরিবার ও আয়');
    expect(await screen.findByRole('list', { name: 'পরিবার ও আয়' })).toBeInTheDocument();
    // the notice of the removal leaves with the next change; the way back stays
    expect(screen.queryByText(/^“মন্তব্য” সরানো হয়েছে।/)).not.toBeInTheDocument();
    await user.click(undoButton());
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'পরিবার ও আয়' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'মন্তব্য বদলান' })).not.toBeInTheDocument();
    await user.click(undoButton());
    expect(await screen.findByRole('button', { name: 'মন্তব্য বদলান' })).toBeInTheDocument();
    expect(undoButton()).toBeDisabled();
    await waitFor(() => expect(saves.at(-1)?.body.sections).toEqual(start), { timeout: 4000 });
    // and forward again, the same two steps
    await user.click(redoButton());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'মন্তব্য বদলান' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('list', { name: 'পরিবার ও আয়' })).not.toBeInTheDocument();
    await user.click(redoButton());
    expect(await screen.findByRole('list', { name: 'পরিবার ও আয়' })).toBeInTheDocument();
    expect(redoButton()).toBeDisabled();
    await waitFor(
      () =>
        expect(saves.at(-1)?.body.sections.map((s) => [s.key, s.fields.length])).toEqual([
          ['basic_info', start[0]!.fields.length],
          ['address', start[1]!.fields.length],
          ['extra', 0],
          ['family_income', 2],
        ]),
      { timeout: 4000 },
    );
  }, 30_000);

  it('has nothing to undo or redo when the form opens', async () => {
    api();
    open();
    await outlineOf('মৌলিক তথ্য');
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
  });

  it('keeps the steps when the saved draft comes back, and saves the undone draft on its version', async () => {
    const user = userEvent.setup();
    api();
    open();
    await addSection(user, 'পরিবার ও আয়');
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 });
    await screen.findByText('সংরক্ষিত');
    // the save is one change, not a second step
    await user.click(undoButton());
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'পরিবার ও আয়' })).not.toBeInTheDocument(),
    );
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeEnabled();
    await waitFor(() => expect(saves).toHaveLength(2), { timeout: 4000 });
    expect(saves[1]!.ifMatch).toBe('"v2"');
    expect(saves[1]!.body.sections.map((s) => s.key)).toEqual(['basic_info', 'address']);
  }, 20_000);

  it('undoes and redoes by the keyboard from the canvas, and leaves a text field its own undo', async () => {
    const user = userEvent.setup();
    api({ sections: withNote() });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য কপি করুন' }));
    const copyButton = () => screen.queryByRole('button', { name: 'মন্তব্য (কপি) বদলান' });
    await waitFor(() => expect(copyButton()).toBeInTheDocument());
    // the focus on a question of the canvas
    copyButton()!.focus();
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(copyButton()).not.toBeInTheDocument());
    await user.keyboard('{Control>}y{/Control}');
    await waitFor(() => expect(copyButton()).toBeInTheDocument());
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(copyButton()).not.toBeInTheDocument());
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    await waitFor(() => expect(copyButton()).toBeInTheDocument());
    // in a text field the keys are the field's own: the draft's steps stay as they are
    const label = screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ });
    await user.click(label);
    await user.keyboard('{Control>}z{/Control}');
    await user.keyboard('{Control>}y{/Control}');
    expect(copyButton()).toBeInTheDocument();
    expect(undoButton()).toBeEnabled();
    expect(redoButton()).toBeDisabled();
  }, 20_000);

  it('keeps two quick moves of a question as two steps to undo', async () => {
    const user = userEvent.setup();
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section(
          'family_income',
          [
            field('a', 'number', { label: T('প্রথম') }),
            field('b', 'number', { label: T('দ্বিতীয়') }),
            field('c', 'number', { label: T('তৃতীয়') }),
          ],
          { title: T('পরিবার ও আয়', 'Family and income') },
        ),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রথম বদলান' }));
    const list = await outlineOf('পরিবার ও আয়');
    const order = () => list.getAllByRole('listitem').map((li) => li.textContent);
    const is = (...labels: string[]) => labels.map((label) => expect.stringContaining(label));
    // two clicks one after the other, well within a second
    await user.click(screen.getByRole('button', { name: 'প্রথম নিচে নিন' }));
    await user.click(screen.getByRole('button', { name: 'প্রথম নিচে নিন' }));
    expect(order()).toEqual(is('দ্বিতীয়', 'তৃতীয়', 'প্রথম'));
    await user.click(undoButton());
    expect(order()).toEqual(is('দ্বিতীয়', 'প্রথম', 'তৃতীয়'));
    await user.click(undoButton());
    expect(order()).toEqual(is('প্রথম', 'দ্বিতীয়', 'তৃতীয়'));
    expect(undoButton()).toBeDisabled();
  }, 20_000);

  it('keeps a switch and the typing right after it as steps of their own, and the typing as one', async () => {
    const user = userEvent.setup();
    api({ sections: withNote() });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    const required = screen.getByRole('switch', { name: 'উত্তর দেওয়া আবশ্যক' });
    await user.click(required);
    await user.type(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }), ' দিন');
    expect(await screen.findByRole('button', { name: 'মন্তব্য দিন বদলান' })).toBeInTheDocument();
    // the four letters typed are one step back
    await user.click(undoButton());
    expect(await screen.findByRole('button', { name: 'মন্তব্য বদলান' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'উত্তর দেওয়া আবশ্যক' })).toBeChecked();
    // and the switch another
    await user.click(undoButton());
    expect(screen.getByRole('switch', { name: 'উত্তর দেওয়া আবশ্যক' })).not.toBeChecked();
    expect(undoButton()).toBeDisabled();
  }, 20_000);

  it('leaves the right pane on the form tab when a change is undone', async () => {
    const user = userEvent.setup();
    api({ sections: withNote() });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য কপি করুন' }));
    await screen.findByRole('button', { name: 'মন্তব্য (কপি) বদলান' });
    await user.click(screen.getByRole('tab', { name: 'ফর্মের সেটিং' }));
    expect(screen.getByRole('tab', { name: 'ফর্মের সেটিং' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(undoButton());
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'মন্তব্য (কপি) বদলান' })).not.toBeInTheDocument(),
    );
    expect(screen.getByRole('tab', { name: 'ফর্মের সেটিং' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(redoButton());
    await screen.findByRole('button', { name: 'মন্তব্য (কপি) বদলান' });
    expect(screen.getByRole('tab', { name: 'ফর্মের সেটিং' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    // the question chosen at that step is chosen again, under the tab that was left alone
    await user.click(screen.getByRole('tab', { name: 'প্রশ্নের সেটিং' }));
    expect(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ })).toHaveValue('মন্তব্য (কপি)');
  }, 20_000);

  it('undoes by the keyboard from a switch, and not while a dialog is open', async () => {
    const user = userEvent.setup();
    api({ sections: withNote() });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    const required = () => screen.getByRole('switch', { name: 'উত্তর দেওয়া আবশ্যক' });
    await user.click(required());
    expect(required()).toBeChecked();
    // a switch holds no text of its own: the keys are the draft's
    required().focus();
    await user.keyboard('{Control>}z{/Control}');
    expect(required()).not.toBeChecked();
    await user.keyboard('{Control>}y{/Control}');
    expect(required()).toBeChecked();
    // a dialog over the page: the focus on one of its buttons
    await user.click(screen.getByRole('button', { name: 'স্কোর' }));
    const dialog = await screen.findByRole('dialog', { name: 'অগ্রাধিকার স্কোর' });
    within(dialog).getByRole('button', { name: 'ঠিক আছে' }).focus();
    await user.keyboard('{Control>}z{/Control}');
    // and on the page's body, as after a click on the dialog's text
    (document.activeElement as HTMLElement).blur();
    expect(document.activeElement).toBe(document.body);
    await user.keyboard('{Control>}z{/Control}');
    await user.click(within(dialog).getByRole('button', { name: 'ঠিক আছে' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(required()).toBeChecked();
    expect(redoButton()).toBeDisabled();
  }, 20_000);

  it('leaves the undo keys alone while a question is being moved by its handle', async () => {
    const user = userEvent.setup();
    api({ sections: withNote() });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য কপি করুন' }));
    const copyButton = () => screen.queryByRole('button', { name: 'মন্তব্য (কপি) বদলান' });
    await waitFor(() => expect(copyButton()).toBeInTheDocument());
    // picked up with the keyboard, the question is on its way
    screen.getByRole('button', { name: 'মন্তব্য টেনে সরান' }).focus();
    await user.keyboard('[Space]');
    await user.keyboard('{Control>}z{/Control}');
    expect(copyButton()).toBeInTheDocument();
    // put down where it was, the keys are the draft's again
    await user.keyboard('[Escape]');
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(copyButton()).not.toBeInTheDocument());
  }, 20_000);

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

describe('deleting', () => {
  const removedNotice = (label: string) =>
    `“${label}” সরানো হয়েছে। ফিরিয়ে আনতে উপরের “ফিরিয়ে আনুন” বোতামে চাপুন।`;
  const yes = (key: string) => ({ field: key, op: 'eq' as const, value: 'yes' });
  /**
   * "গরু আছে?" decides whether "গরুর সংখ্যা" shows and whether the part "আরও" shows; "মোট" in
   * that part adds "গরুর সংখ্যা" up; "মন্তব্য" is read by nothing.
   */
  const withUses = (): FormDefinition['sections'] => [
    ...titled({ sections: coreSections() }).sections,
    section(
      'extra',
      [
        field('has_cow', 'radio', {
          label: T('গরু আছে?', 'Has a cow?'),
          options: [option('yes'), option('no')],
        }),
        field('cows', 'number', {
          label: T('গরুর সংখ্যা', 'Number of cows'),
          logic: { show_if: yes('has_cow') },
        }),
        field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') }),
      ],
      { title: T('অতিরিক্ত', 'Extra') },
    ),
    section(
      'more',
      [
        field('total', 'calculation', {
          label: T('মোট', 'Total'),
          calculation: { expr: { op: 'add', args: [{ field: 'cows' }, 1] } },
        }),
      ],
      { title: T('আরও', 'More'), condition: yes('has_cow') },
    ),
  ];
  const savedSection = (key: string) => saves.at(-1)?.body.sections.find((s) => s.key === key);

  it('brings a removed part back with its questions by the undo of the form head, as a step of its own', async () => {
    const user = userEvent.setup();
    const start = withNote();
    api({ sections: start });
    open();
    // moved up first: the removal right after it is still a step of its own
    await user.click(await screen.findByRole('button', { name: 'অতিরিক্ত: আরও কাজ' }));
    await user.click(await screen.findByRole('menuitem', { name: 'অতিরিক্ত উপরে নিন' }));
    await user.click(await screen.findByRole('button', { name: 'অতিরিক্ত: আরও কাজ' }));
    await user.click(await screen.findByRole('menuitem', { name: 'অতিরিক্ত সরান' }));
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'অতিরিক্ত' })).not.toBeInTheDocument(),
    );
    // nothing else reads its question, so nothing is asked
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(removedNotice('অতিরিক্ত'))).toBeInTheDocument();
    await user.click(undoButton());
    const back = await outlineOf('অতিরিক্ত');
    expect(back.getByRole('button', { name: 'মন্তব্য বদলান' })).toBeInTheDocument();
    expect(screen.queryByText(removedNotice('অতিরিক্ত'))).not.toBeInTheDocument();
    // one step back: the part is where the move left it, with its question, and that is saved
    await waitFor(
      () =>
        expect(saves.at(-1)?.body.sections.map((s) => s.key)).toEqual([
          'basic_info',
          'extra',
          'address',
        ]),
      { timeout: 4000 },
    );
    expect(savedSection('extra')).toEqual(start[2]);
    expect(undoButton()).toBeEnabled();
  }, 20_000);

  it('copies and removes a row question of a list from its own bar, and the list stays', async () => {
    const user = userEvent.setup();
    const inGroup = { settings: { repeat: { group: 'members' } } };
    api({
      sections: [
        ...titled({ sections: coreSections() }).sections,
        section(
          'family',
          [
            field('members', 'repeat_group', { label: T('পরিবারের সদস্যরা', 'Family members') }),
            field('m_name', 'short_text', { label: T('সদস্যের নাম', 'Member name'), ...inGroup }),
            field('m_age', 'number', { label: T('বয়স', 'Age'), ...inGroup }),
          ],
          { title: T('পরিবার', 'Family') },
        ),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'সদস্যের নাম বদলান' }));
    const bar = within(screen.getByRole('group', { name: 'সদস্যের নাম: কাজ' }));
    expect(bar.getByRole('button', { name: 'সদস্যের নাম সরান' })).toBeInTheDocument();
    await user.click(bar.getByRole('button', { name: 'সদস্যের নাম কপি করুন' }));
    const rows = () =>
      within(screen.getByRole('list', { name: 'পরিবারের সদস্যরা: প্রতিটি সারির প্রশ্ন' }))
        .getAllByRole('button', { name: / বদলান$/ })
        .map((b) => b.getAttribute('aria-label'));
    // the copy stands right after it inside the list, and is the chosen one
    await waitFor(() =>
      expect(rows()).toEqual(['সদস্যের নাম বদলান', 'সদস্যের নাম (কপি) বদলান', 'বয়স বদলান']),
    );
    expect(screen.getByRole('button', { name: 'সদস্যের নাম (কপি) বদলান' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await user.click(screen.getByRole('button', { name: 'সদস্যের নাম বদলান' }));
    await user.click(screen.getByRole('button', { name: 'সদস্যের নাম সরান' }));
    await waitFor(() => expect(rows()).toEqual(['সদস্যের নাম (কপি) বদলান', 'বয়স বদলান']));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(removedNotice('সদস্যের নাম'))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'পরিবারের সদস্যরা বদলান' })).toBeInTheDocument();
    await waitFor(
      () =>
        expect(savedSection('family')?.fields.map((f) => f.fieldKey)).toEqual([
          'members',
          expect.stringMatching(RANDOM_KEY),
          'm_age',
        ]),
      { timeout: 4000 },
    );
    expect(savedSection('family')!.fields[1]!.settings).toEqual(inGroup.settings);
    // the removal is one step back
    await user.click(undoButton());
    await waitFor(() =>
      expect(rows()).toEqual(['সদস্যের নাম বদলান', 'সদস্যের নাম (কপি) বদলান', 'বয়স বদলান']),
    );
  }, 30_000);

  it('names where a question is used before removing it, and removes the uses with it in one step', async () => {
    const user = userEvent.setup();
    const start = withUses();
    api({ sections: start });
    const view = open();
    await user.click(await screen.findByRole('button', { name: 'গরু আছে? বদলান' }));
    await user.click(screen.getByRole('button', { name: 'গরু আছে? সরান' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'এই প্রশ্নটি অন্য জায়গায় ব্যবহার হচ্ছে',
    });
    const uses = within(within(dialog).getByRole('list', { name: 'যেখানে ব্যবহার হচ্ছে' }));
    expect(uses.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '“গরুর সংখ্যা” প্রশ্নের “কখন দেখাবে” শর্তে',
      '“আরও” অংশের “অংশটি কখন দেখাবে” শর্তে',
    ]);
    await expectNoAxeViolations(view.container);
    // cancelled: nothing changed
    await user.click(within(dialog).getByRole('button', { name: 'বাতিল' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'গরু আছে? বদলান' })).toBeInTheDocument();
    expect(undoButton()).toBeDisabled();
    expect(saves).toHaveLength(0);
    // confirmed: the question goes, and so do the condition of the question and of the part
    await user.click(screen.getByRole('button', { name: 'গরু আছে? সরান' }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'প্রশ্ন ও এই ব্যবহারগুলো সরান',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'গরু আছে? বদলান' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(removedNotice('গরু আছে?'))).toBeInTheDocument();
    await waitFor(() => expect(savedField('cows')).toBeDefined(), { timeout: 4000 });
    expect(savedField('has_cow')).toBeUndefined();
    expect(savedField('cows')!.logic).toBeUndefined();
    expect(savedSection('more')!.condition).toBeNull();
    // what read another question keeps reading it
    expect(savedField('total')!.calculation).toEqual(start[3]!.fields[0]!.calculation);
    // one step back brings the question and both conditions
    await user.click(undoButton());
    expect(await screen.findByRole('button', { name: 'গরু আছে? বদলান' })).toBeInTheDocument();
    expect(undoButton()).toBeDisabled();
    await waitFor(() => expect(saves.at(-1)?.body.sections).toEqual(start), { timeout: 4000 });
  }, 30_000);

  it('does not offer to remove the only part of a form, and says why', async () => {
    const user = userEvent.setup();
    api({
      sections: [
        section('extra', [field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })], {
          title: T('অতিরিক্ত', 'Extra'),
        }),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'অতিরিক্ত: আরও কাজ' }));
    const only = await screen.findByRole('menuitem', { name: 'একমাত্র অংশ সরানো যায় না' });
    expect(only).toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByRole('menuitem', { name: 'অতিরিক্ত সরান' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    // with a second part either may go
    await user.click(screen.getByRole('button', { name: 'নতুন অংশ' }));
    await user.click(await screen.findByRole('button', { name: 'অতিরিক্ত: আরও কাজ' }));
    expect(await screen.findByRole('menuitem', { name: 'অতিরিক্ত সরান' })).toBeInTheDocument();
    expect(
      screen.queryByRole('menuitem', { name: 'একমাত্র অংশ সরানো যায় না' }),
    ).not.toBeInTheDocument();
  }, 20_000);

  it('removes a question nothing uses at once, without asking', async () => {
    const user = userEvent.setup();
    api({ sections: withUses() });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য সরান' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'মন্তব্য বদলান' })).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(removedNotice('মন্তব্য'))).toBeInTheDocument();
  }, 15_000);

  it('names the uses from other parts before removing a part, each with the question that is used', async () => {
    const user = userEvent.setup();
    const start = withUses();
    api({ sections: start });
    open();
    await user.click(await screen.findByRole('button', { name: 'অতিরিক্ত: আরও কাজ' }));
    await user.click(await screen.findByRole('menuitem', { name: 'অতিরিক্ত সরান' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'এই অংশের প্রশ্ন অন্য জায়গায় ব্যবহার হচ্ছে',
    });
    // the condition inside the part itself goes with it and is not named
    const uses = within(within(dialog).getByRole('list', { name: 'যেখানে ব্যবহার হচ্ছে' }));
    expect(uses.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'গরু আছে?: “আরও” অংশের “অংশটি কখন দেখাবে” শর্তে',
      'গরুর সংখ্যা: “মোট” প্রশ্নের হিসাবে',
    ]);
    expect(
      within(dialog).getByText('যে প্রশ্নের হিসাব সরবে, তার হিসাব নতুন করে ঠিক করতে হবে।'),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'অংশ ও এই ব্যবহারগুলো সরান' }));
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'অতিরিক্ত' })).not.toBeInTheDocument(),
    );
    expect(screen.getByText(removedNotice('অতিরিক্ত'))).toBeInTheDocument();
    // the question that added its answer up stays, without its rule
    const more = await outlineOf('আরও');
    expect(more.getByRole('listitem')).toHaveTextContent('হিসাবের নিয়ম দিন');
    await waitFor(() => expect(savedSection('more')).toBeDefined(), { timeout: 4000 });
    expect(savedSection('extra')).toBeUndefined();
    expect(savedSection('more')!.condition).toBeNull();
    expect(savedField('total')!.calculation).toBeUndefined();
    await user.click(undoButton());
    expect(await screen.findByRole('list', { name: 'অতিরিক্ত' })).toBeInTheDocument();
    await waitFor(() => expect(saves.at(-1)?.body.sections).toEqual(start), { timeout: 4000 });
  }, 30_000);
});

describe('the points of the score', () => {
  it('sets the points of "not previously assisted" in the score dialog, shows the maximum, and saves them', async () => {
    const user = userEvent.setup();
    api();
    const view = open();
    await user.click(await screen.findByRole('button', { name: 'স্কোর' }));
    const dialog = await screen.findByRole('dialog', { name: 'অগ্রাধিকার স্কোর' });
    expect(within(dialog).getByText('সর্বোচ্চ মোট: 0 / 100')).toBeInTheDocument();
    await user.type(within(dialog).getByRole('textbox', { name: /আগে সহায়তা পাননি/ }), '20');
    expect(within(dialog).getByText('সর্বোচ্চ মোট: 20 / 100')).toBeInTheDocument();
    await expectNoAxeViolations(view.container);
    await user.click(within(dialog).getByRole('button', { name: 'ঠিক আছে' }));
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 });
    expect(saves[0]!.body.scoring).toEqual({ not_previously_assisted: 20 });
  }, 15_000);

  it('keeps the points of the form through the changes made after them', async () => {
    const user = userEvent.setup();
    api({ sections: withNote() });
    open();
    await user.click(await screen.findByRole('button', { name: 'স্কোর' }));
    const dialog = await screen.findByRole('dialog', { name: 'অগ্রাধিকার স্কোর' });
    await user.type(within(dialog).getByRole('textbox', { name: /আগে সহায়তা পাননি/ }), '20');
    await user.click(within(dialog).getByRole('button', { name: 'ঠিক আছে' }));
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 });
    const points = { not_previously_assisted: 20 };
    expect(saves[0]!.body.scoring).toEqual(points);
    // a question renamed
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.type(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }), ' দিন');
    await waitFor(() => expect(saves).toHaveLength(2), { timeout: 4000 });
    expect(savedField('q_note')!.label.bn).toBe('মন্তব্য দিন');
    expect(saves[1]!.body.scoring).toEqual(points);
    // a part renamed
    await user.click(screen.getByRole('button', { name: 'অতিরিক্ত' }));
    await user.type(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }), ' তথ্য');
    await waitFor(() => expect(saves).toHaveLength(3), { timeout: 4000 });
    expect(saves[2]!.body.sections.at(-1)!.title.bn).toBe('অতিরিক্ত তথ্য');
    expect(saves[2]!.body.scoring).toEqual(points);
    // a part added, and the question removed
    await user.click(screen.getByRole('button', { name: 'নতুন অংশ' }));
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য দিন বদলান' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য দিন সরান' }));
    await waitFor(() => expect(saves).toHaveLength(4), { timeout: 4000 });
    expect(saves[3]!.body.sections).toHaveLength(4);
    expect(savedField('q_note')).toBeUndefined();
    expect(saves[3]!.body.scoring).toEqual(points);
  }, 40_000);
});

describe('the own question', () => {
  const withProject = (...fields: FormField[]): FormDefinition['sections'] => [
    ...titled({ sections: coreSections() }).sections,
    section('project', fields, { title: T('প্রকল্পের প্রশ্ন', 'Project') }),
  ];

  it('is added at once from a type on the left: no dialog, chosen, in view, the Bengali text ready to type, and saved without a text', async () => {
    const user = userEvent.setup();
    api({ sections: withProject() });
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রকল্পের প্রশ্ন' }));
    await user.click(screen.getByRole('button', { name: 'ছোট লেখা প্রশ্ন যোগ করুন' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const list = await outlineOf('প্রকল্পের প্রশ্ন');
    const question = list.getByRole('button', { name: 'নাম ছাড়া প্রশ্ন বদলান' });
    expect(question).toHaveAttribute('aria-pressed', 'true');
    // never an empty row: the question says it has no name yet
    const row = question.closest('li')!;
    expect(row).toHaveClass('is-unnamed');
    expect(within(row).getAllByText('নাম ছাড়া প্রশ্ন').length).toBeGreaterThan(0);
    expect(scrolled).toEqual([row]);
    await waitFor(() => expect(bnText()).toHaveFocus());
    expect(bnText()).toHaveValue('');
    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(savedFields('project')).toEqual([
      expect.objectContaining({
        fieldKey: expect.stringMatching(RANDOM_KEY),
        type: 'short_text',
        label: { bn: '', en: '' },
        libraryFieldKey: null,
        required: false,
        options: [],
      }),
    ]);
    // the text typed shows on the canvas, and the key stays what it was
    const key = savedFields('project')[0]!.fieldKey;
    await user.type(bnText(), 'পেশা');
    expect(await list.findByRole('button', { name: 'পেশা বদলান' })).toBeInTheDocument();
    expect(row).not.toHaveClass('is-unnamed');
    await waitFor(() => expect(savedField(key)?.label).toEqual({ bn: 'পেশা', en: '' }), {
      timeout: 4000,
    });
  }, 20_000);

  it('lands right after the chosen question, and one step back takes it away', async () => {
    const user = userEvent.setup();
    api({
      sections: withProject(
        field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') }),
        field('q_more', 'short_text', { label: T('আরও', 'More') }),
      ),
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.click(screen.getByRole('button', { name: 'সংখ্যা প্রশ্ন যোগ করুন' }));
    await waitFor(async () =>
      expect(await questionsOf('প্রকল্পের প্রশ্ন')).toEqual([
        'মন্তব্য বদলান',
        'নাম ছাড়া প্রশ্ন বদলান',
        'আরও বদলান',
      ]),
    );
    await waitFor(() => expect(bnText()).toHaveFocus());
    // the next one follows the one just added, which is the chosen question now
    await user.click(screen.getByRole('button', { name: 'তারিখ প্রশ্ন যোগ করুন' }));
    await waitFor(() => expect(savedFields('project')).toHaveLength(4), { timeout: 4000 });
    expect(savedFields('project').map((f) => f.type)).toEqual([
      'short_text',
      'number',
      'date',
      'short_text',
    ]);
    // each addition is a step of its own
    await user.click(undoButton());
    await user.click(undoButton());
    await waitFor(async () =>
      expect(await questionsOf('প্রকল্পের প্রশ্ন')).toEqual(['মন্তব্য বদলান', 'আরও বদলান']),
    );
    await waitFor(
      () => expect(savedFields('project').map((f) => f.fieldKey)).toEqual(['q_note', 'q_more']),
      { timeout: 4000 },
    );
  }, 30_000);

  it('goes to the end of the last part when nothing is chosen', async () => {
    const user = userEvent.setup();
    api({ sections: withProject(field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })) });
    open();
    await user.click(await screen.findByRole('button', { name: 'ছোট লেখা প্রশ্ন যোগ করুন' }));
    await waitFor(async () =>
      expect(await questionsOf('প্রকল্পের প্রশ্ন')).toEqual([
        'মন্তব্য বদলান',
        'নাম ছাড়া প্রশ্ন বদলান',
      ]),
    );
  }, 15_000);

  it('starts a choice without options, written in the settings afterwards', async () => {
    const user = userEvent.setup();
    api({ sections: withProject() });
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রকল্পের প্রশ্ন' }));
    await user.click(screen.getByRole('button', { name: 'একটি বেছে নিন প্রশ্ন যোগ করুন' }));
    await waitFor(() => expect(bnText()).toHaveFocus());
    await user.type(bnText(), 'নিজের ঘর আছে?');
    expect(screen.queryByRole('textbox', { name: /^অপশন 1/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'অপশন যোগ করুন' }));
    await user.type(screen.getByRole('textbox', { name: /^অপশন 1 \(বাংলা\)/ }), 'হ্যাঁ');
    await waitFor(() => expect(savedFields('project')[0]?.options?.[0]?.label.bn).toBe('হ্যাঁ'), {
      timeout: 4000,
    });
    expect(savedFields('project')[0]).toMatchObject({
      fieldKey: expect.stringMatching(RANDOM_KEY),
      type: 'radio',
      label: { bn: 'নিজের ঘর আছে?', en: '' },
      options: [{ code: expect.stringMatching(/^opt_/), label: { bn: 'হ্যাঁ', en: '' } }],
    });
  }, 20_000);

  it('adds a number table from its type, with one row and one column to start', async () => {
    const user = userEvent.setup();
    api({ sections: withProject() });
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রকল্পের প্রশ্ন' }));
    await user.click(screen.getByRole('button', { name: 'সংখ্যার ছক প্রশ্ন যোগ করুন' }));
    await waitFor(() => expect(saves.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(savedFields('project')[0]).toMatchObject({
      type: 'number_table',
      settings: {
        table: {
          rows: [{ key: 'r1', label: { bn: 'সারি 1', en: 'সারি 1' } }],
          cols: [{ key: 'c1', label: { bn: 'কলাম 1', en: 'কলাম 1' } }],
        },
      },
    });
  }, 20_000);

  it('opens the question types at the end of a part and adds the chosen one there, by the keyboard too', async () => {
    const user = userEvent.setup();
    api({ sections: withProject(field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })) });
    const view = open();
    // a question of another part is the chosen one
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    const address = within(screen.getByRole('region', { name: 'ঠিকানা' }));
    const before = (await questionsOf('ঠিকানা')).length;
    await user.click(address.getByRole('button', { name: 'এই অংশে প্রশ্ন যোগ করুন' }));
    const menu = await screen.findByRole('menu', { name: 'এই অংশে প্রশ্ন যোগ করুন' });
    // every type, in the groups of the left pane, each with its name
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      'ছোট লেখা',
      'বড় লেখা',
      'ইমেইল',
      'সংখ্যা',
      'দশমিক সংখ্যা',
      'টাকার অঙ্ক',
      'মোবাইল নম্বর',
      'সংখ্যার ছক',
      'তালিকা থেকে একটি',
      'তালিকা থেকে কয়েকটি',
      'একটি বেছে নিন',
      'কয়েকটি বেছে নিন',
      'তারিখ',
      'সময়',
      'তারিখ ও সময়',
      'ছবি',
      'ফাইল',
      'স্বাক্ষরের ছবি',
      'অবস্থান (GPS)',
      'ঠিকানা',
      'কয়েকজনের তালিকা',
      'নিজে থেকে হিসাব',
      'শুধু লেখা দেখানো',
    ]);
    // the open list itself, and the page under it
    await expectNoAxeViolations(menu);
    await expectNoAxeViolations(view.container);
    await user.click(within(menu).getByRole('menuitem', { name: 'টাকার অঙ্ক' }));
    await waitFor(async () => expect(await questionsOf('ঠিকানা')).toHaveLength(before + 1));
    expect((await questionsOf('ঠিকানা')).at(-1)).toBe('নাম ছাড়া প্রশ্ন বদলান');
    expect(await questionsOf('প্রকল্পের প্রশ্ন')).toEqual(['মন্তব্য বদলান']);
    await waitFor(() => expect(bnText()).toHaveFocus());
    expect(savedFields('address')).toEqual([]);
    await waitFor(() => expect(savedFields('address').at(-1)?.type).toBe('money'), {
      timeout: 4000,
    });
    // the keyboard: the button opens the list, the arrow and Enter choose from it
    const project = within(screen.getByRole('region', { name: 'প্রকল্পের প্রশ্ন' }));
    project.getByRole('button', { name: 'এই অংশে প্রশ্ন যোগ করুন' }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('menu', { name: 'এই অংশে প্রশ্ন যোগ করুন' });
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(async () =>
      expect(await questionsOf('প্রকল্পের প্রশ্ন')).toEqual([
        'মন্তব্য বদলান',
        'নাম ছাড়া প্রশ্ন বদলান',
      ]),
    );
    await waitFor(() => expect(savedFields('project').at(-1)?.type).toBe('long_text'), {
      timeout: 4000,
    });
    await waitFor(() => expect(bnText()).toHaveFocus());
  }, 40_000);

  it('chooses a library question it adds, and brings it into view', async () => {
    const user = userEvent.setup();
    api({ sections: withProject(field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })) });
    open();
    await user.click(await screen.findByRole('tab', { name: 'লাইব্রেরি' }));
    await openGroup(user, 'পরিবার ও আয়');
    await user.click(await screen.findByRole('button', { name: 'দৈনিক আয় যোগ করুন' }));
    const question = await screen.findByRole('button', { name: 'দৈনিক আয় বদলান' });
    expect(question).toHaveAttribute('aria-pressed', 'true');
    expect(scrolled).toEqual([question.closest('li')]);
    await waitFor(() => expect(question).toHaveFocus());
    expect(bnText()).toHaveValue('দৈনিক আয়');
    // the library's own key, as before
    await waitFor(
      () =>
        expect(savedFields('project').map((f) => f.fieldKey)).toEqual(['q_note', 'daily_income']),
      { timeout: 4000 },
    );
  }, 20_000);

  it('moves a question to another part from its bar, keeps it chosen, and comes back in one step', async () => {
    const user = userEvent.setup();
    api({
      sections: [
        ...withProject(field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') })),
        section('office', [], { title: T('অফিসের অংশ', 'Office'), visibility: 'official_only' }),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    const bar = within(screen.getByRole('group', { name: 'মন্তব্য: কাজ' }));
    await user.click(bar.getByRole('button', { name: 'মন্তব্য অন্য অংশে নিন' }));
    const menu = within(await screen.findByRole('menu', { name: 'মন্তব্য অন্য অংশে নিন' }));
    // the other parts, never its own
    expect(menu.getAllByRole('menuitem').map((i) => i.textContent)).toEqual([
      'মৌলিক তথ্য',
      'ঠিকানা',
      'অফিসের অংশ',
    ]);
    await user.click(menu.getByRole('menuitem', { name: 'ঠিকানা' }));
    await waitFor(async () => expect((await questionsOf('ঠিকানা')).at(-1)).toBe('মন্তব্য বদলান'));
    const moved = screen.getByRole('button', { name: 'মন্তব্য বদলান' });
    expect(moved).toHaveAttribute('aria-pressed', 'true');
    expect(scrolled.at(-1)).toBe(moved.closest('li'));
    await waitFor(() => expect(moved).toHaveFocus());
    expect(
      within(screen.getByRole('region', { name: 'প্রকল্পের প্রশ্ন' })).queryByRole('button', {
        name: 'মন্তব্য বদলান',
      }),
    ).not.toBeInTheDocument();
    await waitFor(() => expect(savedFields('address').at(-1)?.fieldKey).toBe('q_note'), {
      timeout: 4000,
    });
    expect(savedFields('project')).toEqual([]);
    // an identity question is not offered a part only officials see
    await user.click(screen.getByRole('button', { name: 'name বদলান' }));
    await user.click(screen.getByRole('button', { name: 'name অন্য অংশে নিন' }));
    const identity = within(await screen.findByRole('menu', { name: 'name অন্য অংশে নিন' }));
    expect(identity.getByRole('menuitem', { name: 'অফিসের অংশ' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    // one step back: the question is in its part again
    await user.click(undoButton());
    await waitFor(async () =>
      expect(await questionsOf('প্রকল্পের প্রশ্ন')).toEqual(['মন্তব্য বদলান']),
    );
  }, 40_000);

  it('offers no move to another part in a form of one part, nor to a row question of a list', async () => {
    const user = userEvent.setup();
    const inGroup = { settings: { repeat: { group: 'members' } } };
    api({
      sections: [
        section(
          'only',
          [
            field('q_note', 'short_text', { label: T('মন্তব্য', 'Note') }),
            field('members', 'repeat_group', { label: T('সদস্যরা', 'Members') }),
            field('m_name', 'short_text', { label: T('সদস্যের নাম', 'Member name'), ...inGroup }),
          ],
          { title: T('একমাত্র অংশ', 'Only part') },
        ),
      ],
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    expect(screen.getByRole('button', { name: 'মন্তব্য কপি করুন' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /অন্য অংশে নিন/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'নতুন অংশ' }));
    await user.click(screen.getByRole('button', { name: 'মন্তব্য বদলান' }));
    expect(screen.getByRole('button', { name: 'মন্তব্য অন্য অংশে নিন' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'সদস্যের নাম বদলান' }));
    expect(screen.getByRole('button', { name: 'সদস্যের নাম কপি করুন' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /অন্য অংশে নিন/ })).not.toBeInTheDocument();
  }, 20_000);
});

describe('saving', () => {
  it('puts the engine message on the question the server names', async () => {
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
    await screen.findByRole('tab', { name: 'লাইব্রেরি' });
    byHand.start();
    await byHand.addSection('পরিবার ও আয়');
    await byHand.pass(SAVE_DELAY_MS);
    expect(
      await byHand.found(() => screen.getByText('শর্তে এমন একটি ঘরের নাম আছে যা ফর্মে নেই।')),
    ).toBeInTheDocument();
    // the head says it is not saved and why; the same draft would be refused again, so no retry
    const head = within(screen.getByTestId('form-head'));
    expect(head.getByText('সংরক্ষণ হয়নি')).toBeInTheDocument();
    expect(head.getByText('কিছু তথ্য সঠিক নয়।')).toBeInTheDocument();
    expect(head.queryByRole('button', { name: 'আবার চেষ্টা করুন' })).not.toBeInTheDocument();
    // however long it waits, the refused draft is not sent a second time
    await byHand.pass(10 * SAVE_RETRY_EVERY_MS);
    expect(saves).toHaveLength(1);
  }, 15_000);

  it('says in the form head that a save failed, tries again by itself, and saves', async () => {
    const user = userEvent.setup();
    let failing = true;
    api();
    // the first save fails on the server; the ones after it reach the handler above
    server.use(
      http.patch('*/api/v1/form-versions/:id', () => {
        if (!failing) return undefined;
        failing = false;
        return apiError(500, 'server.internal', 'কিছু একটা ভুল হয়েছে।');
      }),
    );
    open();
    await addSection(user, 'পরিবার ও আয়');
    const head = within(screen.getByTestId('form-head'));
    const failed = await head.findByText('সংরক্ষণ হয়নি', {}, { timeout: 4000 });
    // announced where the save state always is, with what happens next and a way to hurry it
    expect(failed.closest('[aria-live="polite"]')).toHaveTextContent(
      'সংরক্ষণ হয়নিএকটু পরে নিজে থেকেই আবার চেষ্টা করা হবে।',
    );
    expect(head.getByRole('button', { name: 'আবার চেষ্টা করুন' })).toBeInTheDocument();
    // two seconds later it is sent again, and goes through
    expect(await head.findByText('সংরক্ষিত', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(saves).toHaveLength(1);
    expect(saves[0]!.ifMatch).toBe('"v1"');
    expect(head.queryByRole('button', { name: 'আবার চেষ্টা করুন' })).not.toBeInTheDocument();
    expect(head.queryByText('সংরক্ষণ হয়নি')).not.toBeInTheDocument();
  }, 20_000);

  it('saves at once by the retry button, and says so while the connection is away', async () => {
    const user = userEvent.setup();
    let failing = true;
    api();
    server.use(
      http.patch('*/api/v1/form-versions/:id', () => (failing ? HttpResponse.error() : undefined)),
    );
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    try {
      open();
      await addSection(user, 'পরিবার ও আয়');
      const head = within(screen.getByTestId('form-head'));
      await head.findByText('সংরক্ষণ হয়নি', {}, { timeout: 4000 });
      expect(head.getByText('সংযোগ নেই। সংযোগ ফিরলেই আবার চেষ্টা করা হবে।')).toBeInTheDocument();
      failing = false;
      await user.click(head.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
      expect(await head.findByText('সংরক্ষিত')).toBeInTheDocument();
      expect(saves).toHaveLength(1);
    } finally {
      onLine.mockRestore();
    }
  }, 20_000);

  it('saves again as soon as the browser says the connection is back', async () => {
    const user = userEvent.setup();
    let failing = true;
    api();
    server.use(
      http.patch('*/api/v1/form-versions/:id', () => (failing ? HttpResponse.error() : undefined)),
    );
    open();
    await addSection(user, 'পরিবার ও আয়');
    const head = within(screen.getByTestId('form-head'));
    await head.findByText('সংরক্ষণ হয়নি', {}, { timeout: 4000 });
    failing = false;
    window.dispatchEvent(new Event('online'));
    // well before the two seconds of the first wait
    expect(await head.findByText('সংরক্ষিত', {}, { timeout: 1000 })).toBeInTheDocument();
    expect(saves).toHaveLength(1);
  }, 20_000);

  it('lists a refusal about the whole form beside the Publish button', async () => {
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
    await user.click(
      await screen.findByRole('button', { name: 'প্রকাশের আগে ঠিক করুন (1)' }, { timeout: 4000 }),
    );
    const list = await screen.findByRole('dialog', { name: 'প্রকাশের আগে ঠিক করুন' });
    expect(within(list).getByText('ফর্মটি অনেক বড়।')).toBeInTheDocument();
  }, 15_000);

  it('shows a refusal about the whole form above the outline on a phone, where there is no list', async () => {
    const user = userEvent.setup();
    stubMatchMedia((q) => q.includes('max-width'));
    api({
      sections: withNote(),
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
    await user.click(await screen.findByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.type(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }), ' খ');
    expect(await screen.findByText('ফর্মটি অনেক বড়।', {}, { timeout: 4000 })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^প্রকাশের আগে ঠিক করুন/ }),
    ).not.toBeInTheDocument();
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
    api({
      patch: () => {
        // the other person's save moved the version on
        etagNo += 1;
        return apiError(412, 'conflict.stale_version', 'অন্য কেউ বদলেছেন।');
      },
    });
    open();
    await addSection(user, 'পরিবার ও আয়');
    expect(undoButton()).toBeEnabled();
    expect(
      await screen.findByText(/অন্য কেউ এই খসড়া বদলেছেন/, {}, { timeout: 4000 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(versionReads).toBeGreaterThan(1));
    // their draft is on screen now, and no step of this one leads back over it
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'পরিবার ও আয়' })).not.toBeInTheDocument(),
    );
    expect(undoButton()).toBeDisabled();
    expect(redoButton()).toBeDisabled();
  }, 15_000);

  it('saves a question whose English text is emptied, and still names it by its Bengali text on the canvas and in a condition', async () => {
    const user = userEvent.setup();
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
            field('q_why', 'long_text', {
              label: T('কারণ', 'Reason'),
              logic: { show_if: { field: 'q_kind', op: 'eq', value: 'a' } },
            }),
          ],
          { title: T('অতিরিক্ত', 'Extra') },
        ),
      ],
    });
    open('en');
    await user.click(await screen.findByRole('button', { name: 'Change Kind' }));
    await user.clear(screen.getByRole('textbox', { name: /^Label \(English\)/ }));
    // the draft saves with the text missing, and the question reads in the other language
    await waitFor(() => expect(savedField('q_kind')?.label).toEqual({ bn: 'ধরন', en: '' }), {
      timeout: 4000,
    });
    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(screen.queryByText('Not saved')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change ধরন' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Change Reason' }));
    expect(await screen.findByText(/Shown when “ধরন” = /)).toBeInTheDocument();
  }, 20_000);

  it('saves a change that still waits before the page is left, and asks nothing', async () => {
    const user = userEvent.setup();
    api();
    const { router } = open();
    await addSection(user, 'পরিবার ও আয়');
    // at once, before the wait after a change is over
    expect(saves).toHaveLength(0);
    void router.navigate('/admin/projects');
    await screen.findByTestId('location');
    expect(saves).toHaveLength(1);
    expect(saves[0]!.body.sections.map((s) => s.key)).toContain('family_income');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    // and the builder opens again with it
    await router.navigate(`/admin/projects/${PROJECT}/forms/${FORM}`);
    expect(await screen.findByRole('list', { name: 'পরিবার ও আয়' })).toBeInTheDocument();
  }, 15_000);

  it('asks before leaving only when the change cannot be saved', async () => {
    const user = userEvent.setup();
    api({ patch: () => apiError(500, 'server.internal', 'কিছু একটা ভুল হয়েছে।') });
    const { router } = open();
    await addSection(user, 'পরিবার ও আয়');
    void router.navigate('/admin/projects');
    const dialog = await screen.findByRole('dialog', { name: 'সংরক্ষণ হয়নি, তবুও চলে যাবেন?' });
    expect(saves).toHaveLength(1);
    expect(dialog).toHaveTextContent('শেষ বদলগুলো সংরক্ষণ করা যায়নি। চলে গেলে সেগুলো থাকবে না।');
    await user.click(within(dialog).getByRole('button', { name: 'থাকুন' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByRole('list', { name: 'পরিবার ও আয়' })).toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    // asked again at the next try, and gone on the person's word
    void router.navigate('/admin/projects');
    await user.click(
      within(
        await screen.findByRole('dialog', { name: 'সংরক্ষণ হয়নি, তবুও চলে যাবেন?' }),
      ).getByRole('button', { name: 'চলে যান' }),
    );
    expect(await screen.findByTestId('location')).toHaveTextContent('/admin/projects');
  }, 20_000);

  it('asks while the save before leaving takes long, and leaves by itself once it is through', async () => {
    api();
    // the server keeps the save waiting until the test lets it answer
    let answer: () => void = () => undefined;
    const waiting = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      http.patch('*/api/v1/form-versions/:id', async () => {
        await waiting;
        return undefined;
      }),
    );
    const { router } = open();
    await screen.findByRole('tab', { name: 'লাইব্রেরি' });
    byHand.start();
    await byHand.addSection('পরিবার ও আয়');
    void router.navigate('/admin/projects');
    await byHand.settle();
    // held for the save, and nothing is asked in its first moments
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('location')).not.toBeInTheDocument();
    await byHand.pass(LEAVE_ASK_AFTER_MS);
    const dialog = await byHand.found(() =>
      screen.getByRole('dialog', { name: 'সংরক্ষণ হয়নি, তবুও চলে যাবেন?' }),
    );
    expect(dialog).toHaveTextContent(
      'শেষ বদলগুলো এখনো সংরক্ষণ হচ্ছে, সময় লাগছে। এখন চলে গেলে সেগুলো না-ও থাকতে পারে।',
    );
    expect(within(dialog).getByRole('button', { name: 'চলে যান' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'থাকুন' })).toBeInTheDocument();
    answer();
    expect(await byHand.found(() => screen.getByTestId('location'))).toHaveTextContent(
      '/admin/projects',
    );
    expect(saves).toHaveLength(1);
  }, 20_000);

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
    expect(screen.queryByRole('button', { name: 'ফিরিয়ে আনুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'আবার করুন' })).not.toBeInTheDocument();
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
    stubMatchMedia((q) => q.includes('max-width'));
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
    expect(screen.queryByRole('button', { name: 'ফিরিয়ে আনুন' })).not.toBeInTheDocument();
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
                  kind: 'beneficiary_application',
                  sourceFormId: null,
                  sourceVersionNo: null,
                  newerVersionNo: null,
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
              kind: 'beneficiary_application',
              sourceFormId: null,
              sourceVersionNo: null,
              newerVersionNo: null,
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
    await user.click(within(dialog).getByRole('combobox', { name: /টেমপ্লেট/ }));
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

  it('opens the placement of a ready form when the setup screen sends a project without a form', async () => {
    server.use(
      forms([]),
      http.get('*/api/v1/ready-forms', () =>
        HttpResponse.json({ data: [], meta: { requestId: 'r' } }),
      ),
    );
    renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms?new=1`,
    });
    expect(await screen.findByRole('dialog', { name: 'তৈরি ফর্ম বসান' })).toBeInTheDocument();
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
    expect(screen.queryByRole('dialog', { name: 'তৈরি ফর্ম বসান' })).not.toBeInTheDocument();
  });

  it('takes ?new=1 off the address when the dialog closes, so it does not open again', async () => {
    const user = userEvent.setup();
    server.use(
      forms([]),
      http.get('*/api/v1/ready-forms', () =>
        HttpResponse.json({ data: [], meta: { requestId: 'r' } }),
      ),
    );
    const { router } = renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms?new=1`,
    });
    const dialog = await screen.findByRole('dialog', { name: 'তৈরি ফর্ম বসান' });
    await user.click(within(dialog).getByRole('button', { name: 'বাতিল' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('offers only the published forms of the projects the caller reaches as a copy', async () => {
    const user = userEvent.setup();
    const posts: unknown[] = [];
    server.use(
      forms([]),
      http.post(`*/api/v1/projects/${PROJECT}/forms`, async ({ request }) => {
        posts.push(await request.json());
        return apiError(409, 'form.key_taken', 'এই প্রকল্পে এই নামের ফর্ম আগেই আছে।');
      }),
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
              kind: 'beneficiary_application',
              sourceFormId: null,
              sourceVersionNo: null,
              newerVersionNo: null,
            },
            {
              id: '01900000-0000-7000-8000-0000000000e7',
              projectId: OTHER_PROJECT,
              key: 'second',
              title: T('শুধু খসড়া', 'Draft only'),
              publishedVersionId: null,
              draftVersionId: DRAFT,
              kind: 'beneficiary_application',
              sourceFormId: null,
              sourceVersionNo: null,
              newerVersionNo: null,
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
    await user.click(within(dialog).getByRole('combobox', { name: /^.*প্রকল্প/ }));
    await user.click(await screen.findByRole('option', { name: /শীতবস্ত্র 2025/ }));
    await user.click(within(dialog).getByRole('combobox', { name: /^ফর্ম/ }));
    expect(await screen.findByRole('option', { name: 'গত বছরের ফর্ম' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'শুধু খসড়া' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'গত বছরের ফর্ম' }));
    await user.type(within(dialog).getByRole('textbox', { name: /ফর্মের নাম \(বাংলা\)/ }), 'আবেদন');
    await user.type(
      within(dialog).getByRole('textbox', { name: /ফর্মের নাম \(ইংরেজি\)/ }),
      'Application',
    );
    await user.click(within(dialog).getByRole('button', { name: 'তৈরি করুন' }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]).toEqual({
      key: 'default',
      title: { bn: 'আবেদন', en: 'Application' },
      source: { kind: 'copy', formId: OTHER_FORM },
    });
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
    await user.click(
      within(dialog).getByRole('radio', { name: 'খালি ফর্ম (শুধু সব প্রকল্পে আবশ্যক প্রশ্নগুলো)' }),
    );
    await user.click(within(dialog).getByRole('button', { name: 'তৈরি করুন' }));
    expect(
      await within(dialog).findByText('এই প্রকল্পে এই নামের ফর্ম আগেই আছে।'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'নতুন আবেদন ফর্ম' })).toBeInTheDocument();
  });

  it('shows what a refused field says when the refusal names one', async () => {
    const user = userEvent.setup();
    server.use(
      forms([]),
      http.get('*/api/v1/form-library', () =>
        HttpResponse.json({ data: LIBRARY, meta: { requestId: 'r' } }),
      ),
      http.post(`*/api/v1/projects/${PROJECT}/forms`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              requestId: 'r',
              details: [
                {
                  path: 'source.templateKey',
                  code: 'form.template_unknown',
                  message: 'এই টেমপ্লেটটি পাওয়া যায়নি।',
                },
              ],
            },
          },
          { status: 422 },
        ),
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
    await user.click(within(dialog).getByRole('combobox', { name: /টেমপ্লেট/ }));
    await user.click(await screen.findByRole('option', { name: 'বিতরণভিত্তিক আবেদন ফর্ম' }));
    await user.click(within(dialog).getByRole('button', { name: 'তৈরি করুন' }));
    expect(await within(dialog).findByText('এই টেমপ্লেটটি পাওয়া যায়নি।')).toBeInTheDocument();
    expect(within(dialog).queryByText('কিছু তথ্য সঠিক নয়।')).not.toBeInTheDocument();
  });
});
