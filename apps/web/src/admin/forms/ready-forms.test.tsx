import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { field, section, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { LibraryBuilderPage, ReadyFormBuilderPage } from './FormBuilderPage';
import { readyKeyOf } from './NewReadyFormDialog';
import { ReadyFormsPage } from './ReadyFormsPage';

// The ready forms the Monitoring Team builds outside the projects, the question library edited in
// the same builder, and the identity marks an application form needs before it is published.
const READY = '01900000-0000-7000-8000-0000000000a1';
const DRAFT = '01900000-0000-7000-8000-0000000000a2';
const OTHER = '01900000-0000-7000-8000-0000000000a3';
const OTHER_V1 = '01900000-0000-7000-8000-0000000000a4';
const LIBRARY = '01a16a00-0000-7000-8000-00000000f001';
const LIBRARY_DRAFT = '01a16a00-0000-7000-8000-00000000f002';
const meta = { requestId: 'r' };

const readyRows = () => [
  {
    id: READY,
    key: 'srp_application',
    kind: 'beneficiary_application',
    title: T('স্বাবলম্বী আবেদন', 'Self-reliance application'),
    publishedVersionId: null,
    publishedVersionNo: null,
    draftVersionId: DRAFT,
  },
  {
    id: OTHER,
    key: 'site_survey',
    kind: 'other',
    title: T('এলাকা জরিপ', 'Site survey'),
    publishedVersionId: OTHER_V1,
    publishedVersionNo: 1,
    draftVersionId: null,
  },
];
const version = (id: string, formId: string, sections: unknown[], status = 'draft') => ({
  id,
  formId,
  versionNo: 1,
  status,
  publishedAt: status === 'published' ? '2026-10-24T08:00:00.000Z' : null,
  sections,
});
const firstSection = (fields = [field('q_name', 'short_text', { label: T('নাম', 'Name') })]) =>
  section('section_1', fields, { title: T('অংশ 1', 'Section 1') });

function api() {
  const created: unknown[] = [];
  server.use(
    http.get('*/api/v1/ready-forms', () => HttpResponse.json({ data: readyRows(), meta })),
    http.post('*/api/v1/ready-forms', async ({ request }) => {
      created.push(await request.json());
      return HttpResponse.json(
        {
          data: { ...readyRows()[0], id: READY, draftVersionId: DRAFT },
          meta,
        },
        { status: 201 },
      );
    }),
    http.get('*/api/v1/form-library', () =>
      HttpResponse.json({
        data: { libraryFormId: LIBRARY, sections: [], fields: [], templates: [] },
        meta,
      }),
    ),
    http.get(`*/api/v1/forms/${READY}/versions`, () =>
      HttpResponse.json({
        data: [
          {
            ...version(DRAFT, READY, [firstSection()]),
            publishedBy: null,
            updatedBy: null,
            updatedAt: '2026-10-24T08:00:00.000Z',
          },
        ],
        meta,
      }),
    ),
    http.get(`*/api/v1/forms/${LIBRARY}/versions`, () =>
      HttpResponse.json({
        data: [
          {
            ...version(LIBRARY_DRAFT, LIBRARY, []),
            publishedBy: null,
            updatedBy: null,
            updatedAt: '2026-10-24T08:00:00.000Z',
          },
        ],
        meta,
      }),
    ),
    http.get(`*/api/v1/form-versions/${DRAFT}`, () =>
      HttpResponse.json({
        data: version(DRAFT, READY, [firstSection()]),
        meta: { ...meta, etag: '"d1"' },
      }),
    ),
    http.get(`*/api/v1/form-versions/${LIBRARY_DRAFT}`, () =>
      HttpResponse.json({
        data: version(LIBRARY_DRAFT, LIBRARY, [firstSection([])]),
        meta: { ...meta, etag: '"l1"' },
      }),
    ),
    http.get('*/api/v1/nisab-versions/in-force', () =>
      HttpResponse.json({ data: { value: '100000' }, meta }),
    ),
  );
  return { created };
}

beforeEach(() => {
  resetClientForTests();
  sessionStorage.clear();
  refreshAs({ ...ME, roles: ['monitoring_team'] });
});

describe('the ready forms page', () => {
  it('lists each ready form with what it is for and how far it is published', async () => {
    api();
    renderApp(<ReadyFormsPage />, 'bn', { path: '/admin/ready-forms' });
    expect(await screen.findByText('ফর্ম ও তথ্য সংগ্রহ')).toBeInTheDocument();
    const table = within(await screen.findByRole('table', { name: 'তৈরি ফর্মের তালিকা' }));
    const [, first, second] = table.getAllByRole('row');
    expect(within(first!).getByRole('link', { name: 'স্বাবলম্বী আবেদন' })).toHaveAttribute(
      'href',
      `/admin/ready-forms/${READY}`,
    );
    expect(within(first!).getByText('উপকারভোগীর আবেদন')).toBeInTheDocument();
    expect(within(first!).getByText('খসড়া, এখনো প্রকাশিত হয়নি')).toBeInTheDocument();
    expect(within(second!).getByText('অন্যান্য')).toBeInTheDocument();
    expect(within(second!).getByText('সংস্করণ 1 প্রকাশিত')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'প্রকাশের ধাপ' })).toBeInTheDocument();
  });

  it('starts a new application form and opens it in the builder', async () => {
    const user = userEvent.setup();
    const { created } = api();
    const { router } = renderApp(<ReadyFormsPage />, 'bn', { path: '/admin/ready-forms' });
    await user.click(await screen.findByRole('button', { name: 'নতুন তৈরি ফর্ম' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'নতুন তৈরি ফর্ম' }));
    await user.type(
      dialog.getByRole('textbox', { name: /ফর্মের নাম \(বাংলা\)/ }),
      'স্বাবলম্বী আবেদন',
    );
    await user.type(
      dialog.getByRole('textbox', { name: /ফর্মের নাম \(ইংরেজি\)/ }),
      'Self-reliance application',
    );
    expect(dialog.getByRole('radio', { name: 'উপকারভোগীর আবেদন' })).toBeChecked();
    await user.click(dialog.getByRole('button', { name: 'তৈরি করুন' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/admin/ready-forms/${READY}`));
    expect(created[0]).toMatchObject({
      title: { bn: 'স্বাবলম্বী আবেদন', en: 'Self-reliance application' },
      kind: 'beneficiary_application',
      source: { kind: 'blank' },
    });
    expect((created[0] as { key: string }).key).toMatch(/^self_reliance_application_/);
  });

  it('starts another kind of form as a copy of a published ready form', async () => {
    const user = userEvent.setup();
    const { created } = api();
    renderApp(<ReadyFormsPage />, 'bn', { path: '/admin/ready-forms' });
    await user.click(await screen.findByRole('button', { name: 'নতুন তৈরি ফর্ম' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'নতুন তৈরি ফর্ম' }));
    await user.type(dialog.getByRole('textbox', { name: /ফর্মের নাম \(বাংলা\)/ }), 'জরিপ ২');
    await user.type(dialog.getByRole('textbox', { name: /ফর্মের নাম \(ইংরেজি\)/ }), 'Survey 2');
    await user.click(dialog.getByRole('radio', { name: 'অন্যান্য' }));
    await user.click(dialog.getByRole('radio', { name: 'অন্য তৈরি ফর্মের কপি' }));
    const create = dialog.getByRole('button', { name: 'তৈরি করুন' });
    // a copy waits for the form it copies
    expect(create).toBeDisabled();
    await user.click(dialog.getByRole('combobox', { name: /কোন ফর্মের কপি/ }));
    // only a published ready form can be copied
    expect(screen.queryByRole('option', { name: 'স্বাবলম্বী আবেদন' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'এলাকা জরিপ' }));
    await user.click(create);
    await waitFor(() => expect(created).toHaveLength(1));
    expect(created[0]).toMatchObject({
      title: { bn: 'জরিপ ২', en: 'Survey 2' },
      kind: 'other',
      source: { kind: 'copy', formId: OTHER },
    });
  });

  it('opens the question library from its button', async () => {
    const user = userEvent.setup();
    api();
    const { router } = renderApp(<ReadyFormsPage />, 'bn', { path: '/admin/ready-forms' });
    await user.click(await screen.findByRole('button', { name: 'প্রশ্ন-লাইব্রেরি বদলান' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/question-library'));
  });

  it('has no axe violation', async () => {
    api();
    const { container } = renderApp(<ReadyFormsPage />, 'bn', { path: '/admin/ready-forms' });
    await screen.findByRole('table');
    await expectNoAxeViolations(container);
  });
});

describe('a key for a new ready form', () => {
  it('comes from the English name in small letters, with a stamp', () => {
    expect(readyKeyOf('Self-reliance Application!', 'k1')).toBe('self_reliance_application_k1');
    expect(readyKeyOf('২০২৬', 'k1')).toBe('form_k1');
    expect(readyKeyOf('2026 winter', 'k1')).toBe('winter_k1');
  });
});

describe('the builder of a ready form', () => {
  it('shows the kind, offers no public link, and names the missing identity roles before any publish', async () => {
    const user = userEvent.setup();
    api();
    renderApp(<ReadyFormBuilderPage />, 'bn', {
      path: '/admin/ready-forms/:formId',
      initialPath: `/admin/ready-forms/${READY}`,
    });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'স্বাবলম্বী আবেদন' }),
    ).toBeInTheDocument();
    expect(screen.getByText('উপকারভোগীর আবেদন')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'ফর্মের সেটিং' }));
    expect(screen.queryByRole('button', { name: 'পাবলিক আবেদনের লিংক' })).not.toBeInTheDocument();
    // the list beside the button counts them, and Publish opens it without asking the server
    // (this file answers no publish, so a request would fail the test)
    expect(
      await screen.findByRole('button', { name: 'প্রকাশের আগে ঠিক করুন (1)' }),
    ).toBeInTheDocument();
    const publish = screen.getByRole('button', { name: 'প্রকাশ করুন' });
    await waitFor(() => expect(publish).toBeEnabled());
    await user.click(publish);
    const list = within(await screen.findByRole('dialog', { name: 'প্রকাশের আগে ঠিক করুন' }));
    expect(
      list.getByText(
        'পরিচয়ের প্রশ্ন বাকি: এনআইডি বা জন্মনিবন্ধন নম্বর, নাম, পিতা বা স্বামীর নাম, মোবাইল নম্বর, লিঙ্গ, ঠিকানা (বিভাগ থেকে ইউনিয়ন), গ্রাম',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('opens the question library in the same builder, under its own name', async () => {
    api();
    renderApp(<LibraryBuilderPage />, 'bn', { path: '/admin/question-library' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রশ্ন-লাইব্রেরি' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('প্রশ্ন-লাইব্রেরি').length).toBeGreaterThan(1);
  });

  it('adds a question at once from its type, with no dialog and the Bengali text ready to type', async () => {
    const user = userEvent.setup();
    api();
    const saved: { sections: { fields: { fieldKey: string; label: unknown }[] }[] }[] = [];
    server.use(
      http.patch(`*/api/v1/form-versions/${DRAFT}`, async ({ request }) => {
        const body = (await request.json()) as (typeof saved)[number];
        saved.push(body);
        return HttpResponse.json({
          data: version(DRAFT, READY, body.sections),
          meta: { ...meta, etag: `"d${saved.length + 1}"` },
        });
      }),
    );
    renderApp(<ReadyFormBuilderPage />, 'bn', {
      path: '/admin/ready-forms/:formId',
      initialPath: `/admin/ready-forms/${READY}`,
    });
    // nothing is chosen: the question goes to the end of the form's last part
    await user.click(await screen.findByRole('button', { name: 'ছোট লেখা প্রশ্ন যোগ করুন' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    const list = within(await screen.findByRole('list', { name: 'অংশ 1' }));
    expect(list.getByRole('button', { name: 'নাম ছাড়া প্রশ্ন বদলান' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const text = screen.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ });
    await waitFor(() => expect(text).toHaveFocus());
    await user.type(text, 'পেশা');
    expect(await list.findByRole('button', { name: 'পেশা বদলান' })).toBeInTheDocument();
    await waitFor(
      () =>
        expect(saved.at(-1)?.sections[0]?.fields).toEqual([
          expect.objectContaining({ fieldKey: 'q_name' }),
          expect.objectContaining({
            fieldKey: expect.stringMatching(/^q_[a-z0-9]{6}$/),
            label: { bn: 'পেশা', en: '' },
          }),
        ]),
      { timeout: 4000 },
    );
  }, 20_000);

  it('says the library is empty, and keeps "none by this name" for a search', async () => {
    const user = userEvent.setup();
    api();
    renderApp(<ReadyFormBuilderPage />, 'bn', {
      path: '/admin/ready-forms/:formId',
      initialPath: `/admin/ready-forms/${READY}`,
    });
    await user.click(await screen.findByRole('tab', { name: 'লাইব্রেরি' }));
    expect(await screen.findByText('লাইব্রেরিতে এখনো কোনো প্রশ্ন নেই।')).toBeInTheDocument();
    expect(screen.queryByText('এই নামে কোনো প্রশ্ন নেই।')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'লাইব্রেরিতে প্রশ্ন খুঁজুন' }), 'আয়');
    expect(screen.getByText('এই নামে কোনো প্রশ্ন নেই।')).toBeInTheDocument();
    expect(screen.queryByText('লাইব্রেরিতে এখনো কোনো প্রশ্ন নেই।')).not.toBeInTheDocument();
  });

  it('adds an empty section at the end with the next number', async () => {
    const user = userEvent.setup();
    api();
    server.use(
      http.patch(`*/api/v1/form-versions/${LIBRARY_DRAFT}`, async ({ request }) => {
        const body = (await request.json()) as { sections: unknown[] };
        return HttpResponse.json({
          data: version(LIBRARY_DRAFT, LIBRARY, body.sections),
          meta: { ...meta, etag: '"l2"' },
        });
      }),
    );
    renderApp(<LibraryBuilderPage />, 'bn', { path: '/admin/question-library' });
    await user.click(await screen.findByRole('button', { name: 'নতুন অংশ' }));
    expect(await screen.findByRole('button', { name: 'অংশ 2' })).toBeInTheDocument();
  });
});

describe('who opens the ready forms', () => {
  it('tells a PM the ready forms page and the library are not theirs', async () => {
    refreshAs({ ...ME, roles: ['program_manager'] });
    api();
    const page = renderApp(<ReadyFormsPage />, 'bn', { path: '/admin/ready-forms' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন তৈরি ফর্ম' })).not.toBeInTheDocument();
    page.unmount();
    renderApp(<LibraryBuilderPage />, 'bn', { path: '/admin/question-library' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
  });
});

describe('a failure', () => {
  it('of the library read shows the error with a retry, not a lasting load', async () => {
    api();
    server.use(
      http.get('*/api/v1/form-library', () =>
        HttpResponse.json(
          // a client error, which the query client does not retry
          { error: { code: 'permission.denied', message: 'x', requestId: 'r' } },
          { status: 403 },
        ),
      ),
    );
    renderApp(<LibraryBuilderPage />, 'bn', { path: '/admin/question-library' });
    expect(await screen.findByRole('button', { name: /আবার চেষ্টা/ })).toBeInTheDocument();
  });

  it('of a new ready form shows the refusal and keeps the dialog open', async () => {
    const user = userEvent.setup();
    api();
    server.use(
      http.post('*/api/v1/ready-forms', () =>
        HttpResponse.json(
          {
            error: {
              code: 'form.key_taken',
              messageKey: 'errors.form.key_taken',
              message: 'এই নামের ফর্ম আগে থেকেই আছে।',
              details: [],
              requestId: 'r',
            },
          },
          { status: 409 },
        ),
      ),
    );
    renderApp(<ReadyFormsPage />, 'bn', { path: '/admin/ready-forms' });
    await user.click(await screen.findByRole('button', { name: 'নতুন তৈরি ফর্ম' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'নতুন তৈরি ফর্ম' }));
    await user.type(dialog.getByRole('textbox', { name: /ফর্মের নাম \(বাংলা\)/ }), 'জরিপ');
    await user.type(dialog.getByRole('textbox', { name: /ফর্মের নাম \(ইংরেজি\)/ }), 'Survey');
    await user.click(dialog.getByRole('button', { name: 'তৈরি করুন' }));
    expect(await dialog.findByText('এই নামের ফর্ম আগে থেকেই আছে।')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'নতুন তৈরি ফর্ম' })).toBeInTheDocument();
  });
});
