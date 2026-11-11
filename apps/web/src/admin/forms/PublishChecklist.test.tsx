import type { FormDefinition } from '@css/shared/forms';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { coreSections, field, option, section, T } from '../../../test/forms';
import { stubMatchMedia } from '../../../test/match-media';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { FormBuilderPage } from './FormBuilderPage';
import { PublishChecklist } from './PublishChecklist';
import { publishEntries } from './publish-entries';

// What stands between the draft and its publishing, listed beside the Publish button while the
// form is built: each line names its question and its place and leads there, Publish opens the
// list while it has entries, and a refusal of the server lands in the same list.
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const FORM = '01900000-0000-7000-8000-0000000000c2';
const DRAFT = '01900000-0000-7000-8000-0000000000c3';

/** A question of the form's own, written in Bengali only. */
const note = field('q_note', 'short_text', { label: T('মন্তব্য', '') });
/** An application form with that one question and no identity question. */
const bare = (): FormDefinition['sections'] => [
  section('section_1', [note], { title: T('অংশ 1', 'Section 1') }),
];
/** A form with every identity question and one complete question after them. */
const complete = (...more: Parameters<typeof section>[1]): FormDefinition['sections'] => [
  ...coreSections(),
  section('extra', [field('q_more', 'short_text', { label: T('আরও', 'More') }), ...more], {
    title: T('অতিরিক্ত', 'Extra'),
  }),
];
const IDENTITY_LINE =
  'পরিচয়ের প্রশ্ন বাকি: এনআইডি বা জন্মনিবন্ধন নম্বর, নাম, পিতা বা স্বামীর নাম, মোবাইল নম্বর, লিঙ্গ, ঠিকানা (বিভাগ থেকে ইউনিয়ন), গ্রাম';

let saves: FormDefinition['sections'][];
let publishes: number;
function api(
  sections: FormDefinition['sections'],
  options: { status?: 'draft' | 'published'; publish?: () => Response | undefined } = {},
) {
  saves = [];
  publishes = 0;
  let etagNo = 1;
  const current = {
    id: DRAFT,
    formId: FORM,
    versionNo: 1,
    status: options.status ?? 'draft',
    publishedAt: options.status === 'published' ? '2026-10-20T10:00:00.000Z' : null,
    sections,
  };
  const answer = () =>
    HttpResponse.json({ data: current, meta: { requestId: 'r', etag: `"v${etagNo}"` } });
  server.use(
    http.get(`*/api/v1/projects/${PROJECT}/forms`, () =>
      HttpResponse.json({
        data: [
          {
            id: FORM,
            projectId: PROJECT,
            key: 'default',
            title: T('উপকারভোগীর আবেদন', 'Beneficiary application'),
            publishedVersionId: current.status === 'published' ? DRAFT : null,
            draftVersionId: current.status === 'draft' ? DRAFT : null,
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
      HttpResponse.json({
        data: { sections: [], fields: [], templates: [] },
        meta: { requestId: 'r' },
      }),
    ),
    http.get(`*/api/v1/forms/${FORM}/versions`, () =>
      HttpResponse.json({
        data: [
          { ...current, publishedBy: null, updatedBy: null, updatedAt: '2026-10-21T05:30:00.000Z' },
        ],
        meta: { requestId: 'r' },
      }),
    ),
    http.get('*/api/v1/nisab-versions/in-force', () =>
      HttpResponse.json({ data: { value: '85000.00' }, meta: { requestId: 'r' } }),
    ),
    http.get('*/api/v1/form-versions/:id', answer),
    http.patch('*/api/v1/form-versions/:id', async ({ request }) => {
      const body = (await request.json()) as FormDefinition;
      saves.push(body.sections);
      current.sections = body.sections;
      etagNo += 1;
      return answer();
    }),
    http.post('*/api/v1/form-versions/:id/publish', () => {
      publishes += 1;
      const refusal = options.publish?.();
      if (refusal) return refusal;
      current.status = 'published';
      current.publishedAt = '2026-10-22T04:00:00.000Z';
      return answer();
    }),
  );
}
/** A refusal of the publish that names its places, as the server words it. */
const refused = (...details: { path: string; code: string; message: string }[]) =>
  HttpResponse.json(
    {
      error: {
        code: 'validation.failed',
        messageKey: 'errors.validation.failed',
        message: 'কিছু তথ্য সঠিক নয়।',
        details,
        requestId: 'r',
      },
    },
    { status: 422 },
  );

const open = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(<FormBuilderPage />, locale, {
    path: '/admin/projects/:projectId/forms/:formId',
    initialPath: `/admin/projects/${PROJECT}/forms/${FORM}`,
  });

const listButton = (n: number) =>
  screen.findByRole('button', { name: `প্রকাশের আগে ঠিক করুন (${n})` });
const noListButton = () =>
  expect(screen.queryByRole('button', { name: /^প্রকাশের আগে ঠিক করুন/ })).not.toBeInTheDocument();
const list = () => screen.findByRole('dialog', { name: 'প্রকাশের আগে ঠিক করুন' });
const publishButton = () => screen.getByRole('button', { name: 'প্রকাশ করুন' });

let scrolled: Element[];
beforeEach(() => {
  resetClientForTests();
  refreshAs({ ...ME, roles: ['monitoring_team'] });
  // jsdom has no scrolling; the test notes what was asked to come into view
  scrolled = [];
  Element.prototype.scrollIntoView = function scrollIntoView(this: Element) {
    scrolled.push(this);
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
});

describe('the list beside the Publish button', () => {
  it('counts what is left, names each problem by its question and its place, and leads to the question', async () => {
    const user = userEvent.setup();
    api(bare());
    open();
    await user.click(await listButton(2));
    const dialog = within(await list());
    // the identity questions in one line, the missing text by the place it is missing at
    expect(dialog.getByText(IDENTITY_LINE)).toBeInTheDocument();
    expect(dialog.queryByText(/দুই ভাষাতেই লিখুন/)).not.toBeInTheDocument();
    const line = dialog.getByRole('button', { name: 'মন্তব্য: প্রশ্নের ইংরেজি লেখা বাকি' });
    await user.click(line);
    // the list closes, the question is chosen, brought into view and holds the focus
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const question = screen.getByRole('button', { name: 'মন্তব্য বদলান' });
    expect(question).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ })).toHaveValue('');
    expect(scrolled).toEqual([question.closest('li')]);
    await waitFor(() => expect(question).toHaveFocus());
  }, 20_000);

  it('lowers the count as a text is written, without a press of Publish, and goes when nothing is left', async () => {
    const user = userEvent.setup();
    api(complete(note));
    open();
    await listButton(1);
    await user.click(screen.getByRole('button', { name: 'মন্তব্য বদলান' }));
    await user.type(screen.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }), 'Note');
    await waitFor(noListButton);
    expect(publishes).toBe(0);
    // and comes back with the problem
    await user.clear(screen.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }));
    expect(await listButton(1)).toBeInTheDocument();
  }, 20_000);

  it('words the texts of a part, an option and a help text by their place, with how many', async () => {
    const user = userEvent.setup();
    api([
      ...coreSections(),
      section(
        'extra',
        [
          field('q_kind', 'radio', {
            label: T('ধরন', 'Kind'),
            settings: { help: T('একটি বেছে নিন', '') },
            options: [
              option('a', { label: T('ক', '') }),
              option('b', { label: T('খ', '') }),
              option('c', { label: T('', 'C') }),
            ],
          }),
          field('q_total', 'calculation', { label: T('মোট', 'Total') }),
        ],
        { title: T('অতিরিক্ত', '') },
      ),
    ]);
    open();
    await user.click(await listButton(5));
    const dialog = within(await list());
    for (const name of [
      'অতিরিক্ত: অংশের নাম (ইংরেজি) বাকি',
      'ধরন: সহায়ক লেখার ইংরেজি বাকি',
      'ধরন: অপশনের ইংরেজি লেখা বাকি (2টি)',
      'ধরন: অপশনের বাংলা লেখা বাকি',
      // any other problem in the words of the errors catalogue
      'মোট: এই হিসাব-প্রশ্নের নিয়ম এখনো ঠিক করা হয়নি।',
    ])
      expect(dialog.getByRole('button', { name })).toBeInTheDocument();
    expect(dialog.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'যেসব লেখা বাকি',
      'আরও যা ঠিক করতে হবে',
    ]);
    // a part's line leads to the part
    await user.click(dialog.getByRole('button', { name: 'অতিরিক্ত: অংশের নাম (ইংরেজি) বাকি' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const part = screen.getByRole('button', { name: 'অতিরিক্ত' });
    await waitFor(() => expect(part).toHaveFocus());
    expect(scrolled).toEqual([part.closest('section')]);
    // the part's own texts are in the right pane
    expect(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ })).toHaveValue('অতিরিক্ত');
    expect(screen.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ })).toHaveValue('');
  }, 20_000);

  it('reads in English too', async () => {
    const user = userEvent.setup();
    api(bare());
    open('en');
    await user.click(await screen.findByRole('button', { name: 'Fix before publishing (2)' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Fix before publishing' }));
    expect(
      dialog.getByText(
        "Identity questions still missing: NID or birth registration number, Name, Father's or husband's name, Mobile number, Gender, Address (division to union), Village",
      ),
    ).toBeInTheDocument();
    // the question is named by the text it has
    expect(
      dialog.getByRole('button', { name: "মন্তব্য: The question's English text is missing" }),
    ).toBeInTheDocument();
  }, 20_000);
});

describe('the Publish button', () => {
  it('opens the list instead of the confirmation while the list has entries', async () => {
    const user = userEvent.setup();
    api(bare());
    open();
    await listButton(2);
    await waitFor(() => expect(publishButton()).toBeEnabled());
    await user.click(publishButton());
    expect(await list()).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(publishes).toBe(0);
  }, 20_000);

  it('asks first and publishes when nothing is left to fix', async () => {
    const user = userEvent.setup();
    api(complete());
    open();
    await waitFor(() => expect(publishButton()).toBeEnabled());
    noListButton();
    await user.click(publishButton());
    const confirm = await screen.findByRole('alertdialog', { name: 'সংস্করণ 1 প্রকাশ করবেন?' });
    await user.click(within(confirm).getByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }));
    expect(await screen.findByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).toBeInTheDocument();
    expect(publishes).toBe(1);
    noListButton();
  }, 20_000);
});

describe('a refusal of the server', () => {
  const EMPTY_LIST = 'এই প্রশ্নের তালিকায় কোনো অপশন নেই।';
  const refuseOnce = () => {
    let first = true;
    return () => {
      if (!first) return undefined;
      first = false;
      return refused({ path: 'gender', code: 'form.list_empty', message: EMPTY_LIST });
    };
  };
  const publishNow = async (user: ReturnType<typeof userEvent.setup>) => {
    await waitFor(() => expect(publishButton()).toBeEnabled());
    await user.click(publishButton());
    await user.click(await screen.findByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }));
  };

  it('lands in the list with the question it names, and stays through an edit elsewhere', async () => {
    const user = userEvent.setup();
    api(complete(), { publish: refuseOnce() });
    open();
    await publishNow(user);
    // the list opens by itself with what the server said, and how to go on
    const dialog = within(await list());
    expect(
      dialog.getByRole('heading', { level: 3, name: 'শেষবার চেষ্টা করার সময় যা ধরা পড়েছে' }),
    ).toBeInTheDocument();
    expect(dialog.getByText(/ঠিক করার পর আবার “প্রকাশ করুন” চাপুন/)).toBeInTheDocument();
    expect(dialog.getByRole('button', { name: `gender: ${EMPTY_LIST}` })).toBeInTheDocument();
    // no banner repeats it above the form
    await user.click(dialog.getByRole('button', { name: 'বন্ধ করুন' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByText('কিছু তথ্য সঠিক নয়।')).not.toBeInTheDocument();
    // the question says it too
    const row = within(screen.getByRole('button', { name: 'gender বদলান' }).closest('li')!);
    expect(row.getByText(EMPTY_LIST)).toBeInTheDocument();
    expect(row.getByRole('img', { name: 'ঠিক করতে হবে' })).toBeInTheDocument();
    // an edit elsewhere wipes nothing
    await user.click(screen.getByRole('button', { name: 'অতিরিক্ত: আরও কাজ' }));
    await user.click(await screen.findByRole('menuitem', { name: 'অতিরিক্ত উপরে নিন' }));
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 });
    expect(await listButton(1)).toBeInTheDocument();
    expect(row.getByText(EMPTY_LIST)).toBeInTheDocument();
  }, 30_000);

  it('leaves the list once the question it names is edited, without a press of Publish', async () => {
    const user = userEvent.setup();
    api(complete(), { publish: refuseOnce() });
    open();
    await publishNow(user);
    await user.click(within(await list()).getByRole('button', { name: 'বন্ধ করুন' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await listButton(1)).toBeInTheDocument();
    // the person changes that very question: whether it is right now is for the server to say
    await user.click(screen.getByRole('button', { name: 'gender বদলান' }));
    await user.type(screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ }), ' ক');
    await waitFor(noListButton);
    expect(screen.queryByText(EMPTY_LIST)).not.toBeInTheDocument();
    expect(publishes).toBe(1);
    // and it stays away once the change is saved
    await waitFor(() => expect(saves).toHaveLength(1), { timeout: 4000 });
    await screen.findByText('সংরক্ষিত');
    noListButton();
  }, 30_000);

  it('does not hold Publish back, and leaves at the next try', async () => {
    const user = userEvent.setup();
    api(complete(), { publish: refuseOnce() });
    open();
    await publishNow(user);
    await user.click(within(await list()).getByRole('button', { name: 'বন্ধ করুন' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // only the server knows whether it is fixed, so Publish asks it again
    await publishNow(user);
    expect(await screen.findByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).toBeInTheDocument();
    expect(publishes).toBe(2);
    noListButton();
    expect(screen.queryByText(EMPTY_LIST)).not.toBeInTheDocument();
  }, 30_000);

  it('names a problem of the whole form in the list, as a line that leads nowhere', async () => {
    const user = userEvent.setup();
    api(complete(), {
      publish: () =>
        refused({ path: 'sections', code: 'form.too_many', message: 'ফর্মটি অনেক বড়।' }),
    });
    open();
    await publishNow(user);
    const dialog = within(await list());
    expect(dialog.getByText('ফর্মটি অনেক বড়।')).toBeInTheDocument();
    expect(dialog.queryByRole('button', { name: /ফর্মটি অনেক বড়/ })).not.toBeInTheDocument();
  }, 30_000);
});

describe('the marks on the form', () => {
  it('marks a question and a part that have something to fix, and says what on the chosen one', async () => {
    const user = userEvent.setup();
    api([
      ...coreSections(),
      section('extra', [note, field('q_more', 'short_text', { label: T('আরও', 'More') })], {
        title: T('অতিরিক্ত', ''),
      }),
    ]);
    open();
    await listButton(2);
    const row = (label: string) =>
      within(screen.getByRole('button', { name: `${label} বদলান` }).closest('li')!);
    // by an icon with a name, not by colour alone
    expect(row('মন্তব্য').getByRole('img', { name: 'ঠিক করতে হবে' })).toBeInTheDocument();
    expect(row('আরও').queryByRole('img', { name: 'ঠিক করতে হবে' })).not.toBeInTheDocument();
    const part = within(screen.getByRole('region', { name: 'অতিরিক্ত' }));
    expect(
      within(part.getByRole('heading', { level: 2 })).getByRole('img', { name: 'ঠিক করতে হবে' }),
    ).toBeInTheDocument();
    // what is to fix shows on the question once it is chosen
    expect(row('মন্তব্য').queryByText('প্রশ্নের ইংরেজি লেখা বাকি')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'মন্তব্য বদলান' }));
    expect(row('মন্তব্য').getByText('প্রশ্নের ইংরেজি লেখা বাকি')).toBeInTheDocument();
    // and goes with its cause
    await user.type(screen.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }), 'Note');
    await waitFor(() =>
      expect(row('মন্তব্য').queryByRole('img', { name: 'ঠিক করতে হবে' })).not.toBeInTheDocument(),
    );
    expect(row('মন্তব্য').queryByText('প্রশ্নের ইংরেজি লেখা বাকি')).not.toBeInTheDocument();
  }, 20_000);
});

describe('where nothing can be published', () => {
  const outline = () => screen.findByRole('list', { name: 'অংশ 1' });

  it('shows no list and no mark on a published version', async () => {
    api(bare(), { status: 'published' });
    open();
    await outline();
    expect(screen.getByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).toBeInTheDocument();
    noListButton();
    expect(screen.queryByRole('img', { name: 'ঠিক করতে হবে' })).not.toBeInTheDocument();
  });

  it('shows none on a phone, where only the texts change', async () => {
    stubMatchMedia((q) => q.includes('max-width'));
    api(bare());
    open();
    await outline();
    expect(screen.getByRole('button', { name: 'মন্তব্য বদলান' })).toBeInTheDocument();
    noListButton();
    expect(screen.queryByRole('img', { name: 'ঠিক করতে হবে' })).not.toBeInTheDocument();
  });

  it('shows none to a role that does not build forms', async () => {
    refreshAs({ ...ME, roles: ['regional_program_manager'] });
    api(bare());
    open();
    await outline();
    noListButton();
    expect(screen.queryByRole('img', { name: 'ঠিক করতে হবে' })).not.toBeInTheDocument();
  });
});

it('has no axe violation with the list open', async () => {
  const user = userEvent.setup();
  api(bare());
  open();
  await user.click(await listButton(2));
  await list();
  // the list is drawn outside the page's own node
  await expectNoAxeViolations(document.body);
}, 30_000);

describe('the list on its own', () => {
  const definition: FormDefinition = { sections: bare() };
  const entries = publishEntries(definition, 'beneficiary_application');

  it('draws the action a group is given under its lines', async () => {
    const user = userEvent.setup();
    const add = vi.fn();
    renderApp(
      <PublishChecklist
        entries={entries}
        definition={definition}
        open
        onOpen={() => undefined}
        onClose={() => undefined}
        onGo={() => undefined}
        actions={{ identity: { label: 'পরিচয়ের প্রশ্নগুলো যোগ করুন', onSelect: add } }}
      />,
    );
    const dialog = within(await list());
    await user.click(dialog.getByRole('button', { name: 'পরিচয়ের প্রশ্নগুলো যোগ করুন' }));
    expect(add).toHaveBeenCalledOnce();
  });

  it('shows neither the button nor the list without an entry', () => {
    renderApp(
      <PublishChecklist
        entries={[]}
        definition={definition}
        open
        onOpen={() => undefined}
        onClose={() => undefined}
        onGo={() => undefined}
      />,
    );
    noListButton();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
