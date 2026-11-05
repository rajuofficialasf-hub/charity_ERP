import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { field, section, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
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
  it('shows the kind, offers no public link, and names a missing identity role on a refused publish', async () => {
    const user = userEvent.setup();
    api();
    server.use(
      http.post(`*/api/v1/form-versions/${DRAFT}/publish`, () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              details: [
                {
                  path: 'mobile',
                  code: 'form.core_field_missing',
                  messageKey: 'errors.form.core_field_missing',
                  message: 'উপকারভোগীর আবেদন-ফর্মে পরিচয়ের সব প্রশ্ন চিহ্নিত করুন।',
                },
              ],
              requestId: 'r',
            },
          },
          { status: 422 },
        ),
      ),
    );
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
    await user.click(screen.getByRole('button', { name: 'প্রকাশ করুন' }));
    await user.click(await screen.findByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }));
    expect(
      await screen.findByText(
        'উপকারভোগীর আবেদন-ফর্মে পরিচয়ের সব প্রশ্ন চিহ্নিত করুন। এখনো বাকি: মোবাইল নম্বর।',
      ),
    ).toBeInTheDocument();
  });

  it('opens the question library in the same builder, under its own name', async () => {
    api();
    renderApp(<LibraryBuilderPage />, 'bn', { path: '/admin/question-library' });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রশ্ন-লাইব্রেরি' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('প্রশ্ন-লাইব্রেরি').length).toBeGreaterThan(1);
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
