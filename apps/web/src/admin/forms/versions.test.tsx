import type { FormDefinition } from '@css/shared/forms';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { coreSections, field, section, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { FormBuilderPage } from './FormBuilderPage';

// The preview of the draft, the versions with their change summaries, publishing and the next
// version: what the PM sees before and after a form goes out.
const PROJECT = '01900000-0000-7000-8000-0000000000f1';
const FORM = '01900000-0000-7000-8000-0000000000f2';
const V1 = '01900000-0000-7000-8000-0000000000f3';
const V2 = '01900000-0000-7000-8000-0000000000f4';

const core = () =>
  coreSections().map((s) =>
    s.key === 'basic_info' ? { ...s, title: T('মৌলিক তথ্য', 'Basic information') } : s,
  );
const extra = section(
  'extra',
  [field('extra_q', 'short_text', { label: T('অতিরিক্ত প্রশ্ন', 'Extra question') })],
  { title: T('অতিরিক্ত', 'Extra') },
);
const official = section(
  'official',
  [field('official_note', 'short_text', { label: T('অফিসের মন্তব্য', 'Office note') })],
  { title: T('অফিসের অংশ', 'Office part'), visibility: 'official_only' },
);

type Version = {
  id: string;
  formId: string;
  versionNo: number;
  status: 'draft' | 'published' | 'retired';
  publishedAt: string | null;
  publishedBy: { id: string; name: string } | null;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string;
  sections: FormDefinition['sections'];
};
const PM = { id: '01900000-0000-7000-8000-0000000000f9', name: 'প্রোগ্রাম ম্যানেজার' };
const v1 = (): Version => ({
  id: V1,
  formId: FORM,
  versionNo: 1,
  status: 'published',
  publishedAt: '2026-10-20T04:00:00.000Z',
  publishedBy: PM,
  updatedBy: PM,
  updatedAt: '2026-10-20T04:00:00.000Z',
  sections: core(),
});
const v2 = (): Version => ({
  id: V2,
  formId: FORM,
  versionNo: 2,
  status: 'draft',
  publishedAt: null,
  publishedBy: null,
  updatedBy: PM,
  updatedAt: '2026-10-21T05:30:00.000Z',
  sections: [...core(), extra, official],
});

let posts: { path: string; ifMatch: string | null }[];
let patches: number;
let reads: number;
function api(
  options: {
    draft?: boolean;
    publish?: () => Response;
    next?: () => Response;
  } = {},
) {
  posts = [];
  patches = 0;
  reads = 0;
  const versions: Version[] = options.draft === false ? [v1()] : [v1(), v2()];
  const row = () => ({
    id: FORM,
    projectId: PROJECT,
    key: 'default',
    title: T('উপকারভোগীর আবেদন', 'Beneficiary application'),
    publishedVersionId: versions.find((v) => v.status === 'published')?.id ?? null,
    draftVersionId: versions.find((v) => v.status === 'draft')?.id ?? null,
  });
  server.use(
    http.get(`*/api/v1/projects/${PROJECT}/forms`, () =>
      HttpResponse.json({ data: [row()], meta: { requestId: 'r' } }),
    ),
    http.get('*/api/v1/form-library', () =>
      HttpResponse.json({
        data: { sections: [], fields: [], templates: [] },
        meta: { requestId: 'r' },
      }),
    ),
    http.get(`*/api/v1/forms/${FORM}/versions`, () =>
      HttpResponse.json({ data: versions, meta: { requestId: 'r' } }),
    ),
    http.get(`*/api/v1/projects/${PROJECT}/components`, () =>
      HttpResponse.json({ data: [], meta: { requestId: 'r' } }),
    ),
    http.get('*/api/v1/nisab-versions/in-force', () =>
      HttpResponse.json({ data: { value: '85000.00' }, meta: { requestId: 'r' } }),
    ),
    http.get('*/api/v1/form-versions/:id', ({ params }) => {
      reads += 1;
      const v = versions.find((x) => x.id === params.id);
      return v
        ? HttpResponse.json({ data: v, meta: { requestId: 'r', etag: `"e${v.versionNo}"` } })
        : apiError(404, 'permission.not_found', 'পাওয়া যায়নি।');
    }),
    http.patch('*/api/v1/form-versions/:id', () => {
      patches += 1;
      return apiError(500, 'server.internal', 'x');
    }),
    http.post('*/api/v1/form-versions/:id/publish', ({ request, params }) => {
      posts.push({
        path: `publish:${String(params.id)}`,
        ifMatch: request.headers.get('if-match'),
      });
      if (options.publish) return options.publish();
      for (const v of versions) if (v.status === 'published') v.status = 'retired';
      const draft = versions.find((v) => v.id === params.id)!;
      draft.status = 'published';
      draft.publishedAt = '2026-10-22T04:00:00.000Z';
      return HttpResponse.json({ data: draft, meta: { requestId: 'r', etag: '"p2"' } });
    }),
    http.post(`*/api/v1/forms/${FORM}/versions`, () => {
      posts.push({ path: 'next', ifMatch: null });
      if (options.next) return options.next();
      const made: Version = {
        ...v1(),
        id: V2,
        versionNo: 2,
        status: 'draft',
        publishedAt: null,
        publishedBy: null,
      };
      versions.push(made);
      return HttpResponse.json({ data: made, meta: { requestId: 'r' } }, { status: 201 });
    }),
  );
}

const open = () =>
  renderApp(<FormBuilderPage />, 'bn', {
    path: '/admin/projects/:projectId/forms/:formId',
    initialPath: `/admin/projects/${PROJECT}/forms/${FORM}`,
  });

beforeEach(() => {
  resetClientForTests();
  sessionStorage.clear();
  refreshAs({ ...ME, roles: ['program_manager'] });
});

/** The versions sit in the form-settings tab of the right pane. */
const openVersions = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole('tab', { name: 'ফর্মের সেটিং' }));
  return within(await screen.findByRole('region', { name: 'সংস্করণগুলো' }));
};

describe('the preview', () => {
  it('shows the volunteer view without the official part, switches to English, and keeps no answer', async () => {
    const user = userEvent.setup();
    api();
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রিভিউ' }));
    const preview = within(await screen.findByRole('dialog', { name: 'প্রিভিউ' }));
    await user.click(preview.getByRole('radio', { name: 'কম্পিউটার' }));
    expect(await preview.findByText('অতিরিক্ত প্রশ্ন')).toBeInTheDocument();
    expect(preview.queryByText('অফিসের মন্তব্য')).not.toBeInTheDocument();
    await user.click(preview.getByRole('radio', { name: 'অফিসিয়াল' }));
    expect(await preview.findByText('অফিসের মন্তব্য')).toBeInTheDocument();
    await user.click(preview.getByRole('radio', { name: 'English' }));
    expect(await preview.findByText('Extra question')).toBeInTheDocument();
    await user.type(preview.getByRole('textbox', { name: /Extra question/ }), 'typed');
    expect(sessionStorage.length).toBe(0);
    expect(patches).toBe(0);
    expect(posts).toEqual([]);
  }, 20_000);
});

describe('the versions', () => {
  it('lists the draft with its change summary and the published version before it', async () => {
    const user = userEvent.setup();
    api();
    open();
    const list = await openVersions(user);
    const items = await list.findAllByRole('listitem');
    expect(items[0]).toHaveTextContent('সংস্করণ 2: খসড়া');
    expect(items[0]).toHaveTextContent('অংশ যোগ হয়েছে: অতিরিক্ত');
    // who changed the draft last and who published the version before it, with when
    expect(items[0]).toHaveTextContent('শেষ বদল: প্রোগ্রাম ম্যানেজার, 21-10-2026');
    expect(items.at(-1)).toHaveTextContent('প্রোগ্রাম ম্যানেজার প্রকাশ করেছেন, 20-10-2026');
    expect(items.at(-1)).toHaveTextContent('সংস্করণ 1: প্রকাশিত');
    expect(items.at(-1)).toHaveTextContent('প্রথম সংস্করণ।');
  });

  it('opens a published version read-only with the action to make the next one', async () => {
    const user = userEvent.setup();
    api({ draft: false });
    open();
    expect(await screen.findByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'প্রকাশ করুন' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'নতুন সংস্করণ তৈরি করুন' }));
    await waitFor(() => expect(posts).toEqual([{ path: 'next', ifMatch: null }]));
    expect(await screen.findByRole('button', { name: 'প্রকাশ করুন' })).toBeInTheDocument();
    expect(screen.queryByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).not.toBeInTheDocument();
  });

  it('shows a refused new version and changes nothing', async () => {
    const user = userEvent.setup();
    api({
      draft: false,
      next: () => apiError(404, 'permission.not_found', 'ফর্মটি পাওয়া যায়নি।'),
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'নতুন সংস্করণ তৈরি করুন' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ফর্মটি পাওয়া যায়নি।');
    expect(screen.getByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).toBeInTheDocument();
  });

  it('shows a new version refused with no question named', async () => {
    const user = userEvent.setup();
    api({
      draft: false,
      next: () => apiError(422, 'validation.failed', 'ফর্মটিতে নতুন সংস্করণ শুরু করা যায়নি।'),
    });
    open();
    await user.click(await screen.findByRole('button', { name: 'নতুন সংস্করণ তৈরি করুন' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ফর্মটিতে নতুন সংস্করণ শুরু করা যায়নি।',
    );
  });
});

describe('publishing', () => {
  it('asks first with the change summary and the note on earlier applications, then publishes', async () => {
    const user = userEvent.setup();
    api();
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রকাশ করুন' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'সংস্করণ 2 প্রকাশ করবেন?' });
    expect(dialog).toHaveTextContent('অংশ যোগ হয়েছে: অতিরিক্ত');
    expect(dialog).toHaveTextContent('আগে জমা পড়া আবেদনগুলো তাদের নিজের সংস্করণেই থাকবে।');
    await user.click(within(dialog).getByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }));
    await waitFor(() => expect(posts).toEqual([{ path: `publish:${V2}`, ifMatch: '"e2"' }]));
    expect(await screen.findByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: 'নতুন সংস্করণ তৈরি করুন' }),
    ).toBeInTheDocument();
  });

  it('puts a refusal of the publish on the question it names', async () => {
    const user = userEvent.setup();
    api({
      publish: () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              details: [
                {
                  path: 'extra_q',
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
    await user.click(await screen.findByRole('button', { name: 'প্রকাশ করুন' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'সংস্করণ 2 প্রকাশ করবেন?' });
    await user.click(within(dialog).getByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }));
    const row = within(await screen.findByRole('list', { name: 'অতিরিক্ত' }));
    expect(await row.findByText('শর্তে এমন একটি ঘরের নাম আছে যা ফর্মে নেই।')).toBeInTheDocument();
    expect(screen.getAllByText('সংস্করণ 2: খসড়া').length).toBeGreaterThan(0);
    // the next edit makes the old messages stale, so they go
    await user.click(screen.getByRole('button', { name: 'অতিরিক্ত: আরও কাজ' }));
    await user.click(await screen.findByRole('menuitem', { name: 'অতিরিক্ত উপরে নিন' }));
    await waitFor(() =>
      expect(
        screen.queryByText('শর্তে এমন একটি ঘরের নাম আছে যা ফর্মে নেই।'),
      ).not.toBeInTheDocument(),
    );
  });

  it('reads the draft again when the publish finds it changed elsewhere', async () => {
    const user = userEvent.setup();
    api({ publish: () => apiError(412, 'conflict.stale_version', 'অন্য কেউ এটি বদলেছেন।') });
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রকাশ করুন' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'সংস্করণ 2 প্রকাশ করবেন?' });
    const before = reads;
    await user.click(within(dialog).getByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }));
    expect(await screen.findByText('অন্য কেউ এটি বদলেছেন।')).toBeInTheDocument();
    await waitFor(() => expect(reads).toBeGreaterThan(before));
  });

  it('shows a refused publish and keeps the draft as it was', async () => {
    const user = userEvent.setup();
    api({ publish: () => apiError(403, 'permission.denied', 'এই কাজের অনুমতি আপনার নেই।') });
    open();
    await user.click(await screen.findByRole('button', { name: 'প্রকাশ করুন' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'সংস্করণ 2 প্রকাশ করবেন?' });
    await user.click(within(dialog).getByRole('button', { name: 'সংস্করণ প্রকাশ করুন' }));
    expect(await screen.findByText('এই কাজের অনুমতি আপনার নেই।')).toBeInTheDocument();
    expect(screen.queryByText('এই সংস্করণ প্রকাশিত; বদলানো যায় না।')).not.toBeInTheDocument();
  });

  it('offers no publish to a role that does not publish forms', async () => {
    const user = userEvent.setup();
    refreshAs({ ...ME, roles: ['regional_program_manager'] });
    api();
    open();
    await openVersions(user);
    expect(screen.queryByRole('button', { name: 'প্রকাশ করুন' })).not.toBeInTheDocument();
  });
});

it('has no axe violation', async () => {
  const user = userEvent.setup();
  api();
  const { container } = open();
  await screen.findByRole('tab', { name: 'ফর্মের সেটিং' });
  await expectNoAxeViolations(container);
  await user.click(screen.getByRole('tab', { name: 'ফর্মের সেটিং' }));
  await screen.findByRole('region', { name: 'সংস্করণগুলো' });
  await expectNoAxeViolations(container);
});
