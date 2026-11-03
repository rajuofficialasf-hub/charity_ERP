import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { coreSections, field, section, T } from '../../../test/forms';
import { server } from '../../../test/msw/server';
import { PublicLinkPanel } from '../../admin/forms/PublicLinkPanel';
import { resetClientForTests } from '../../lib/api';
import { PublicApplyPage } from './PublicApplyPage';

// The public application link: the panel in the builder that switches it on with a form, and the
// page anyone opens without signing in, which says only that an application was received.
const PROJECT = '01900000-0000-7000-8000-000000000a01';
const FORM = '01900000-0000-7000-8000-000000000a02';
const VERSION = '01900000-0000-7000-8000-000000000a03';
const TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012345';

afterEach(() => vi.unstubAllGlobals());

beforeEach(() => {
  resetClientForTests();
  sessionStorage.clear();
  // nobody is signed in on the public page; the address field asks for its divisions
  refreshAs(null);
  server.use(
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [], meta: { requestId: 'r' } })),
  );
});

describe('the link panel', () => {
  function links(options: { toggle?: () => Response } = {}) {
    const state = { enabled: false, token: null as string | null };
    const bodies: unknown[] = [];
    server.use(
      http.get(`*/api/v1/projects/${PROJECT}/components`, () =>
        HttpResponse.json({
          data: [
            {
              componentKey: 'public_link',
              enabled: state.enabled,
              settings: state.enabled
                ? { enabled: true, token: state.token, form_ids: [FORM] }
                : {},
            },
          ],
          meta: { requestId: 'r' },
        }),
      ),
      http.patch(`*/api/v1/projects/${PROJECT}/public-link`, async ({ request }) => {
        const body = (await request.json()) as { enabled: boolean };
        bodies.push(body);
        if (options.toggle) return options.toggle();
        state.enabled = body.enabled;
        state.token = body.enabled ? `token_${bodies.length}_abcdefghijklmnop` : null;
        return HttpResponse.json({
          data: { enabled: body.enabled, formId: body.enabled ? FORM : null, url: null },
          meta: { requestId: 'r' },
        });
      }),
    );
    return bodies;
  }
  const panel = (canManage = true, published = true) => {
    refreshAs({ ...ME, roles: ['program_manager'] });
    return renderApp(
      <PublicLinkPanel
        projectId={PROJECT}
        formId={FORM}
        published={published}
        canManage={canManage}
      />,
    );
  };

  it('switches the link on with the form, shows the URL to copy, and switches it off', async () => {
    const user = userEvent.setup();
    const bodies = links();
    panel();
    expect(await screen.findByText('লিংক বন্ধ।')).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'এই ফর্মের জন্য পাবলিক লিংক চালু' }));
    expect(await screen.findByText('লিংক চালু; এই ফর্মটি খোলে।')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'আবেদনের লিংক' })).toHaveValue(
      `${window.location.origin}/apply/token_1_abcdefghijklmnop`,
    );
    expect(screen.getByRole('button', { name: /আবেদনের লিংক/ })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: 'এই ফর্মের জন্য পাবলিক লিংক চালু' }));
    expect(await screen.findByText('লিংক বন্ধ।')).toBeInTheDocument();
    expect(bodies).toEqual([{ enabled: true, formId: FORM }, { enabled: false }]);
  });

  it('offers no switch when the link cannot be read', async () => {
    refreshAs({ ...ME, roles: ['program_manager'] });
    server.use(
      http.get(`*/api/v1/projects/${PROJECT}/components`, () =>
        apiError(500, 'server.internal', 'x'),
      ),
    );
    panel();
    expect(
      await screen.findByText('লিংকের অবস্থা আনা যায়নি। আবার চেষ্টা করুন।', {}, { timeout: 8000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByText('লিংক বন্ধ।')).not.toBeInTheDocument();
  }, 15_000);

  it('shows only the state to someone who does not manage the link', async () => {
    links();
    panel(false);
    expect(await screen.findByText('লিংক বন্ধ।')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('asks for a published form before the link can be switched on', async () => {
    links();
    panel(true, false);
    expect(await screen.findByText('লিংক চালু করার আগে ফর্মটি প্রকাশ করুন।')).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('shows a refused switch and changes nothing', async () => {
    const user = userEvent.setup();
    links({ toggle: () => apiError(403, 'permission.denied', 'এই কাজের অনুমতি আপনার নেই।') });
    panel();
    await user.click(await screen.findByRole('switch'));
    expect(await screen.findByRole('alert')).toHaveTextContent('এই কাজের অনুমতি আপনার নেই।');
    expect(screen.getByText('লিংক বন্ধ।')).toBeInTheDocument();
  });
});

describe('the public application page', () => {
  const form = {
    project: { name: T('শীতবস্ত্র 2026', 'Winter clothing 2026'), applyTo: '2026-11-30' },
    form: {
      id: VERSION,
      formId: FORM,
      versionNo: 1,
      status: 'published',
      publishedAt: '2026-10-20T04:00:00.000Z',
      sections: [
        ...coreSections().map((s) => ({
          ...s,
          fields: s.fields.map((f) => ({ ...f, required: false })),
        })),
        section(
          'extra',
          [
            field('house_photo', 'photo', { label: T('ঘরের ছবি', 'House photo') }),
            field('need', 'short_text', { label: T('প্রয়োজন', 'Need') }),
          ],
          { title: T('অতিরিক্ত', 'Extra') },
        ),
      ],
    },
  };
  let photos: { clientUuid: string | null; fieldKey: string | null; type: string | null }[];
  function page(options: { read?: () => Response; submit?: () => Response } = {}) {
    const sends: { clientUuid: string; answers: { fieldKey: string; value: unknown }[] }[] = [];
    photos = [];
    server.use(
      http.post(`*/api/v1/public/forms/${TOKEN}/photos`, ({ request }) => {
        const url = new URL(request.url);
        photos.push({
          clientUuid: url.searchParams.get('clientUuid'),
          fieldKey: url.searchParams.get('fieldKey'),
          type: request.headers.get('content-type'),
        });
        return HttpResponse.json(
          { data: { fileId: '01900000-0000-7000-8000-000000000a09' }, meta: { requestId: 'r' } },
          { status: 201 },
        );
      }),
      http.get(`*/api/v1/public/forms/${TOKEN}`, () =>
        options.read ? options.read() : HttpResponse.json({ data: form, meta: { requestId: 'r' } }),
      ),
      http.post(`*/api/v1/public/forms/${TOKEN}/applications`, async ({ request }) => {
        sends.push(
          (await request.json()) as {
            clientUuid: string;
            answers: { fieldKey: string; value: unknown }[];
          },
        );
        if (options.submit) return options.submit();
        return HttpResponse.json(
          {
            data: { id: VERSION, status: 'pending_verification', stage: null },
            meta: { requestId: 'r' },
          },
          { status: 201 },
        );
      }),
    );
    renderApp(<PublicApplyPage />, 'bn', { path: '/apply/:token', initialPath: `/apply/${TOKEN}` });
    return sends;
  }
  const wide = () =>
    // a computer's width draws the whole form on one page
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
    }));

  it('shows the project, the closing date and the form, and says only that it was received', async () => {
    const user = userEvent.setup();
    wide();
    const sends = page();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'শীতবস্ত্র 2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText('আবেদনের শেষ দিন: 30-11-2026')).toBeInTheDocument();
    expect(screen.getByText(/ছবি দিতে পারবেন মোট 5টি/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: /প্রয়োজন/ }), 'শীতের কাপড়');
    await user.click(screen.getByRole('button', { name: 'আবেদন জমা দিন' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'আবেদন জমা হয়েছে' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/একজন কর্মকর্তা আবেদনটি যাচাই করবেন/)).toBeInTheDocument();
    expect(sends).toHaveLength(1);
    expect(sessionStorage.length).toBe(0);
  });

  it('sends the same client id again after an answer was lost', async () => {
    const user = userEvent.setup();
    wide();
    let first = true;
    const sends = page({
      submit: () => {
        if (first) {
          first = false;
          return HttpResponse.error();
        }
        return HttpResponse.json(
          {
            data: { id: VERSION, status: 'pending_verification', stage: null },
            meta: { requestId: 'r' },
          },
          { status: 201 },
        );
      },
    });
    await user.type(await screen.findByRole('textbox', { name: /প্রয়োজন/ }), 'কম্বল');
    await user.click(screen.getByRole('button', { name: 'আবেদন জমা দিন' }));
    await waitFor(() => expect(sends).toHaveLength(1));
    await user.click(await screen.findByRole('button', { name: 'আবেদন জমা দিন' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'আবেদন জমা হয়েছে' }),
    ).toBeInTheDocument();
    expect(sends).toHaveLength(2);
    expect(sends[1]!.clientUuid).toBe(sends[0]!.clientUuid);
  });

  it('says to try again later after too many tries', async () => {
    const user = userEvent.setup();
    wide();
    page({ submit: () => apiError(429, 'rate.limited', 'x') });
    await user.click(await screen.findByRole('button', { name: 'আবেদন জমা দিন' }));
    expect(
      await screen.findByText('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।'),
    ).toBeInTheDocument();
  });

  it('sends a photo with the application it belongs to', async () => {
    const user = userEvent.setup();
    wide();
    const sends = page();
    const [input] = await screen.findAllByLabelText('গ্যালারি থেকে নিন');
    await user.upload(input!, new File(['jpeg'], 'house.jpg', { type: 'image/jpeg' }));
    await waitFor(() => expect(photos).toHaveLength(1));
    expect(photos[0]).toMatchObject({ fieldKey: 'house_photo', type: 'image/jpeg' });
    await user.click(await screen.findByRole('button', { name: 'আবেদন জমা দিন' }));
    await screen.findByRole('heading', { level: 1, name: 'আবেদন জমা হয়েছে' });
    expect(sends[0]!.clientUuid).toBe(photos[0]!.clientUuid);
    expect(sends[0]!.answers).toContainEqual(expect.objectContaining({ fieldKey: 'house_photo' }));
  });

  it('puts a refusal on the question it names and keeps the form', async () => {
    const user = userEvent.setup();
    wide();
    page({
      submit: () =>
        HttpResponse.json(
          {
            error: {
              code: 'validation.failed',
              messageKey: 'errors.validation.failed',
              message: 'কিছু তথ্য সঠিক নয়।',
              details: [{ path: 'need', code: 'validation.too_short', message: 'আরও লিখুন।' }],
              requestId: 'r',
            },
          },
          { status: 422 },
        ),
    });
    await user.type(await screen.findByRole('textbox', { name: /প্রয়োজন/ }), 'ক');
    await user.click(screen.getByRole('button', { name: 'আবেদন জমা দিন' }));
    expect(await screen.findByText('আরও লিখুন।')).toBeInTheDocument();
    expect(screen.getByText(/কিছু উত্তর ঠিক করতে হবে/)).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { level: 1, name: 'আবেদন জমা হয়েছে' }),
    ).not.toBeInTheDocument();
  });

  it('shows the plain closed page when the link closes while the form is filled', async () => {
    const user = userEvent.setup();
    wide();
    page({ submit: () => apiError(404, 'permission.not_found', 'পাওয়া যায়নি।') });
    await user.click(await screen.findByRole('button', { name: 'আবেদন জমা দিন' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'এই লিংকে এখন আবেদন নেওয়া হচ্ছে না' }),
    ).toBeInTheDocument();
  });

  it('offers a retry after too many tries on opening the link', async () => {
    const user = userEvent.setup();
    let first = true;
    page({
      read: () => {
        if (first) {
          first = false;
          return apiError(429, 'rate.limited', 'x');
        }
        return HttpResponse.json({ data: form, meta: { requestId: 'r' } });
      },
    });
    expect(
      await screen.findByText('অনেকবার চেষ্টা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /আবার চেষ্টা/ }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'শীতবস্ত্র 2026' }),
    ).toBeInTheDocument();
  });

  it('keeps a level-one heading and a retry when the form cannot be loaded', async () => {
    const user = userEvent.setup();
    let first = true;
    page({
      read: () => {
        if (first) {
          first = false;
          return apiError(500, 'server.internal', 'x');
        }
        return HttpResponse.json({ data: form, meta: { requestId: 'r' } });
      },
    });
    expect(await screen.findByRole('heading', { level: 1, name: 'আবেদন' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: /আবার চেষ্টা/ }, { timeout: 8000 }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'শীতবস্ত্র 2026' }),
    ).toBeInTheDocument();
  }, 15_000);

  it('shows one plain page for a link that takes no applications', async () => {
    page({ read: () => apiError(404, 'permission.not_found', 'পাওয়া যায়নি।') });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'এই লিংকে এখন আবেদন নেওয়া হচ্ছে না' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'আবেদন জমা দিন' })).not.toBeInTheDocument();
  });

  it('says why a photo is refused: too large or of a wrong type', async () => {
    const user = userEvent.setup({ applyAccept: false });
    wide();
    page();
    const [input] = await screen.findAllByLabelText('গ্যালারি থেকে নিন');
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' });
    await user.upload(input!, big);
    expect(await screen.findByText('big.jpg ফাইলটি 5 MB-এর চেয়ে বড়')).toBeInTheDocument();
    await user.upload(input!, new File(['x'], 'scan.pdf', { type: 'application/pdf' }));
    expect(await screen.findByText('scan.pdf: এই ধরনের ফাইল নেওয়া যায় না')).toBeInTheDocument();
  });

  it('redraws the form in English and back with the language switch', async () => {
    const user = userEvent.setup();
    wide();
    page();
    expect(await screen.findByText('প্রয়োজন')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'English' }));
    expect(await screen.findByText('Need')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Winter clothing 2026' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'বাংলা' }));
    expect(await screen.findByText('প্রয়োজন')).toBeInTheDocument();
  });

  it('has no axe violation in either language', async () => {
    wide();
    page();
    await screen.findByRole('heading', { level: 1, name: 'শীতবস্ত্র 2026' });
    await expectNoAxeViolations(document.body);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'English' }));
    await screen.findByRole('heading', { level: 1, name: 'Winter clothing 2026' });
    await expectNoAxeViolations(document.body);
  });
});
