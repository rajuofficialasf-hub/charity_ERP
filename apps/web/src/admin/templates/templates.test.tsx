import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { TemplatesPage } from './TemplatesPage';

// The template library: everyone who creates projects sees, renames, describes, deactivates and
// activates every template of the organisation. Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };

const TEMPLATE = {
  id: '01900000-0000-7000-8000-0000000000d1',
  name: { bn: 'শীতবস্ত্র টেমপ্লেট', en: 'Winter template' },
  description: null,
  workflowKey: 'distribution',
  active: true,
  version: 2,
  sourceProjectId: null,
  updatedAt: '2026-10-17T05:00:00Z',
  updatedByName: 'নমুনা পিএম',
};
const OLD = { ...TEMPLATE, id: '01900000-0000-7000-8000-0000000000d2', active: false };

let asked: string[];
let patched: unknown[];

function serve() {
  asked = [];
  patched = [];
  server.use(
    http.get('*/api/v1/templates', ({ request }) => {
      const include = new URL(request.url).searchParams.get('include');
      asked.push(include ?? '');
      return HttpResponse.json({ data: include ? [TEMPLATE, OLD] : [TEMPLATE], meta: {} });
    }),
    http.patch('*/api/v1/templates/:id', async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      patched.push(body);
      return HttpResponse.json({ data: { ...TEMPLATE, ...body }, meta: {} });
    }),
  );
}
const open = () =>
  renderApp(<TemplatesPage />, 'bn', { path: '/admin/templates', initialPath: '/admin/templates' });

beforeEach(() => {
  resetClientForTests();
});

describe('the template library', () => {
  it('lists the active templates, and the inactive ones when asked, without accessibility violations', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    const { container } = open();
    const table = await screen.findByRole('grid', { name: 'টেমপ্লেটের তালিকা' });
    expect(await within(table).findByText('শীতবস্ত্র টেমপ্লেট')).toBeInTheDocument();
    expect(within(table).getByText('বিতরণ')).toBeInTheDocument();
    expect(within(table).getAllByText('সক্রিয়')).toHaveLength(1);
    await user.click(screen.getByText('নিষ্ক্রিয়গুলোও দেখান'));
    await waitFor(() => expect(asked).toContain('inactive'));
    // the list loads again: the table is drawn anew
    const again = await screen.findByRole('grid', { name: 'টেমপ্লেটের তালিকা' });
    await waitFor(() => expect(within(again).getAllByText('নিষ্ক্রিয়')).toHaveLength(1));
    await expectNoAxeViolations(container);
  });

  it('renames a template and deactivates it', async () => {
    refreshAs(PM);
    serve();
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'শীতবস্ত্র টেমপ্লেট বদলান' }));
    const dialog = await screen.findByRole('dialog');
    const nameEn = within(dialog).getByRole('textbox', { name: /ইংরেজিতে নাম/ });
    await user.clear(nameEn);
    await user.type(nameEn, 'Winter clothing');
    await user.click(within(dialog).getByText(/সক্রিয়: নতুন প্রকল্প/));
    await user.click(within(dialog).getByRole('button', { name: 'সংরক্ষণ' }));
    await waitFor(() => expect(patched).toHaveLength(1));
    expect(patched[0]).toEqual({
      name: { bn: 'শীতবস্ত্র টেমপ্লেট', en: 'Winter clothing' },
      active: false,
    });
    expect(await screen.findByText('শীতবস্ত্র টেমপ্লেট সংরক্ষিত হয়েছে।')).toBeInTheDocument();
  });

  it('is closed to a role that cannot create projects', async () => {
    refreshAs(RPM);
    serve();
    open();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'প্রবেশাধিকার নেই' }),
    ).toBeInTheDocument();
    expect(asked).toEqual([]);
  });
});
