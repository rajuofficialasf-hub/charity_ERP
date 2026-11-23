import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { coreSections, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../api/client';
import { FormBuilderPage } from './FormBuilderPage';
import { FormsPage } from './FormsPage';

// The PM places a published ready form on a project and later takes its newer version; the
// placed form opens read-only.
const PROJECT = '01900000-0000-7000-8000-0000000000b1';
const READY = '01900000-0000-7000-8000-0000000000b2';
const DRAFT_ONLY = '01900000-0000-7000-8000-0000000000b3';
const PLACED = '01900000-0000-7000-8000-0000000000b4';
const PLACED_V1 = '01900000-0000-7000-8000-0000000000b5';
const PLACED_V2 = '01900000-0000-7000-8000-0000000000b6';
/** A form of the project's own, still a draft, which a PM opens but does not build. */
const OWN = '01900000-0000-7000-8000-0000000000b9';
const OWN_V1 = '01900000-0000-7000-8000-0000000000ba';
const meta = { requestId: 'r' };

const ready = [
  {
    id: READY,
    key: 'srp_application',
    kind: 'beneficiary_application',
    title: T('স্বাবলম্বী আবেদন', 'Self-reliance application'),
    publishedVersionId: '01900000-0000-7000-8000-0000000000b7',
    publishedVersionNo: 1,
    draftVersionId: null,
  },
  {
    id: DRAFT_ONLY,
    key: 'survey',
    kind: 'other',
    title: T('শুধু খসড়া', 'Draft only'),
    publishedVersionId: null,
    publishedVersionNo: null,
    draftVersionId: '01900000-0000-7000-8000-0000000000b8',
  },
];
const placedRow = (over: Record<string, unknown> = {}) => ({
  id: PLACED,
  projectId: PROJECT,
  key: 'default',
  title: T('স্বাবলম্বী আবেদন', 'Self-reliance application'),
  kind: 'beneficiary_application',
  publishedVersionId: PLACED_V1,
  draftVersionId: null,
  sourceFormId: READY,
  sourceVersionNo: 1,
  newerVersionNo: null,
  ...over,
});
const sections = coreSections().map((s) =>
  s.key === 'basic_info' ? { ...s, title: T('মৌলিক তথ্য', 'Basic information') } : s,
);

function api(rows: unknown[]) {
  const placed: unknown[] = [];
  const state = { rows };
  server.use(
    http.get(`*/api/v1/projects/${PROJECT}/forms`, () =>
      HttpResponse.json({ data: state.rows, meta }),
    ),
    http.get('*/api/v1/ready-forms', () => HttpResponse.json({ data: ready, meta })),
    http.post(`*/api/v1/projects/${PROJECT}/forms/place`, async ({ request }) => {
      placed.push(await request.json());
      state.rows = [placedRow()];
      return HttpResponse.json({ data: placedRow(), meta }, { status: 201 });
    }),
    http.get('*/api/v1/form-versions/:id', ({ params }) =>
      HttpResponse.json({
        data: {
          id: params.id,
          formId: PLACED,
          versionNo: params.id === PLACED_V2 ? 2 : 1,
          status: params.id === OWN_V1 ? 'draft' : 'published',
          publishedAt: '2026-10-24T08:00:00.000Z',
          sections,
        },
        meta: { ...meta, etag: '"p1"' },
      }),
    ),
    http.post(`*/api/v1/forms/${PLACED}/take-version`, () => {
      state.rows = [placedRow({ publishedVersionId: PLACED_V2, sourceVersionNo: 2 })];
      return HttpResponse.json({ data: state.rows[0], meta });
    }),
    http.get('*/api/v1/nisab-versions/in-force', () =>
      HttpResponse.json({ data: { value: '100000' }, meta }),
    ),
    http.get(`*/api/v1/projects/${PROJECT}/components`, () =>
      HttpResponse.json({ data: [], meta }),
    ),
  );
  return { placed };
}

beforeEach(() => {
  resetClientForTests();
  sessionStorage.clear();
  refreshAs({ ...ME, roles: ['program_manager'] });
});

describe("a PM's project forms", () => {
  it('offers the placement of a ready form, and no form of the project’s own', async () => {
    api([]);
    renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms`,
    });
    expect(await screen.findByRole('button', { name: 'তৈরি ফর্ম বসান' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন ফর্ম' })).not.toBeInTheDocument();
  });

  it('lists the published ready forms only, and opens the placed form', async () => {
    const user = userEvent.setup();
    const { placed } = api([]);
    const { router } = renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms`,
    });
    await user.click(await screen.findByRole('button', { name: 'তৈরি ফর্ম বসান' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'তৈরি ফর্ম বসান' }));
    const choice = await dialog.findByRole('radio', {
      name: 'স্বাবলম্বী আবেদন · উপকারভোগীর আবেদন · সংস্করণ 1',
    });
    expect(dialog.queryByRole('radio', { name: /শুধু খসড়া/ })).not.toBeInTheDocument();
    await user.click(choice);
    await user.click(dialog.getByRole('button', { name: 'বসান' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/admin/projects/${PROJECT}/forms/${PLACED}`),
    );
    // the first form of a project is its default application form
    expect(placed).toEqual([{ readyFormId: READY, key: 'default' }]);
  });
});

describe('a form of the project’s own, as a PM opens it', () => {
  it('says the Monitoring Team builds forms and their scoring, and offers to place a ready form', async () => {
    const user = userEvent.setup();
    api([
      placedRow({
        id: OWN,
        sourceFormId: null,
        sourceVersionNo: null,
        publishedVersionId: null,
        draftVersionId: OWN_V1,
      }),
    ]);
    const { router } = renderApp(<FormBuilderPage />, 'bn', {
      path: '/admin/projects/:projectId/forms/:formId',
      initialPath: `/admin/projects/${PROJECT}/forms/${OWN}`,
    });
    expect(
      await screen.findByText(
        'এই প্রকল্পের ফর্ম ও তার স্কোরিং বানায় মনিটরিং টিম। আপনি একটি তৈরি ফর্ম বসাতে পারেন।',
      ),
    ).toBeInTheDocument();
    // nothing suggests the PM can make a version of their own
    expect(screen.queryByText(/বদল নতুন সংস্করণে হবে/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'তৈরি ফর্ম বসান' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/admin/projects/${PROJECT}/forms`),
    );
    expect(router.state.location.search).toBe('?new=1');
  });
});

describe('a placed form', () => {
  const open = () =>
    renderApp(<FormBuilderPage />, 'bn', {
      path: '/admin/projects/:projectId/forms/:formId',
      initialPath: `/admin/projects/${PROJECT}/forms/${PLACED}`,
    });

  it('opens read-only, published, with no publish and no new version of its own', async () => {
    api([placedRow()]);
    open();
    expect(await screen.findByText('সংস্করণ 1: প্রকাশিত')).toBeInTheDocument();
    expect(
      screen.getByText('এই ফর্মটি একটি তৈরি ফর্ম থেকে বসানো, তাই এখানে বদলানো যায় না।'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'প্রকাশ করুন' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন সংস্করণ নিন' })).not.toBeInTheDocument();
  });

  it('shows a newer version of its ready form and takes it with one press', async () => {
    const user = userEvent.setup();
    api([placedRow({ newerVersionNo: 2 })]);
    open();
    expect(await screen.findByText(/এই ফর্মের নতুন সংস্করণ আছে \(সংস্করণ 2\)/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'নতুন সংস্করণ নিন' }));
    expect(await screen.findByText('সংস্করণ 2: প্রকাশিত')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'নতুন সংস্করণ নিন' })).not.toBeInTheDocument();
  });
});

describe('a refusal', () => {
  const refusal = (code: string, message: string, status: number) =>
    HttpResponse.json(
      { error: { code, messageKey: `errors.${code}`, message, details: [], requestId: 'r' } },
      { status },
    );

  it('of the placement shows its message and keeps the dialog open', async () => {
    const user = userEvent.setup();
    api([]);
    server.use(
      http.post(`*/api/v1/projects/${PROJECT}/forms/place`, () =>
        refusal('form.nothing_published', 'ওই ফর্মের কোনো প্রকাশিত সংস্করণ নেই।', 422),
      ),
    );
    renderApp(<FormsPage />, 'bn', {
      path: '/admin/projects/:projectId/forms',
      initialPath: `/admin/projects/${PROJECT}/forms`,
    });
    await user.click(await screen.findByRole('button', { name: 'তৈরি ফর্ম বসান' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'তৈরি ফর্ম বসান' }));
    await user.click(
      await dialog.findByRole('radio', { name: 'স্বাবলম্বী আবেদন · উপকারভোগীর আবেদন · সংস্করণ 1' }),
    );
    await user.click(dialog.getByRole('button', { name: 'বসান' }));
    expect(await dialog.findByText('ওই ফর্মের কোনো প্রকাশিত সংস্করণ নেই।')).toBeInTheDocument();
  });

  it('of the take shows its message and keeps the version', async () => {
    const user = userEvent.setup();
    api([placedRow({ newerVersionNo: 2 })]);
    server.use(
      http.post(`*/api/v1/forms/${PLACED}/take-version`, () =>
        refusal('project.read_only', 'এই প্রকল্পে এখন আর বদল করা যায় না।', 409),
      ),
    );
    renderApp(<FormBuilderPage />, 'bn', {
      path: '/admin/projects/:projectId/forms/:formId',
      initialPath: `/admin/projects/${PROJECT}/forms/${PLACED}`,
    });
    await user.click(await screen.findByRole('button', { name: 'নতুন সংস্করণ নিন' }));
    expect(await screen.findByText('এই প্রকল্পে এখন আর বদল করা যায় না।')).toBeInTheDocument();
    expect(screen.getByText('সংস্করণ 1: প্রকাশিত')).toBeInTheDocument();
  });
});
