import type { Me } from '@css/shared/auth';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../../test/auth';
import { server } from '../../../../test/msw/server';
import { resetClientForTests } from '../../../api/client';
import type { Project } from '../projects-api';
import { ApplicationFormPicker } from './ApplicationFormPicker';
import type { ProjectForm } from './setup-api';
import { SetupProvider } from './setup-context';

// The application form chosen in the setup from the published ready forms: placed on a project
// without one, replaced on a draft after a confirmation, read-only once the project runs.
// Test data only.
const PM: Me = { ...ME, roles: ['program_manager'] };
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const WINTER = '01900000-0000-7000-8000-0000000000f1';
const IFTAR = '01900000-0000-7000-8000-0000000000f2';

const project = (status: Project['status']) =>
  ({
    id: PROJECT,
    code: 'WNT',
    year: 2026,
    name: { bn: 'শীতবস্ত্র বিতরণ', en: 'Winter clothing' },
    status,
    workflowKey: 'distribution',
    applyFrom: null,
    applyTo: null,
    perVolunteerLimit: null,
    dawahEnabled: false,
    periodFrom: '2026-01',
    periodTo: '2026-12',
    sessionLabel: '2026',
  }) as Project;

const placed = (readyFormId: string | null, title = 'শীতবস্ত্রের আবেদন'): ProjectForm => ({
  id: '01900000-0000-7000-8000-0000000000e1',
  projectId: PROJECT,
  key: 'default',
  title: { bn: title, en: 'Winter application' },
  kind: 'beneficiary_application',
  publishedVersionId: '01900000-0000-7000-8000-0000000000e2',
  draftVersionId: null,
  sourceFormId: readyFormId,
  sourceVersionNo: readyFormId ? 1 : null,
  newerVersionNo: null,
});

let sent: unknown[];

function serve() {
  sent = [];
  server.use(
    http.get('*/api/v1/ready-forms', () =>
      HttpResponse.json({
        data: [
          {
            id: WINTER,
            key: 'winter',
            kind: 'beneficiary_application',
            title: { bn: 'শীতবস্ত্রের আবেদন', en: 'Winter application' },
            publishedVersionId: '01900000-0000-7000-8000-0000000000a1',
            publishedVersionNo: 2,
            draftVersionId: null,
            updatedAt: '2026-11-01T00:00:00Z',
          },
          {
            id: IFTAR,
            key: 'iftar',
            kind: 'beneficiary_application',
            title: { bn: 'ইফতারের আবেদন', en: 'Iftar application' },
            publishedVersionId: '01900000-0000-7000-8000-0000000000a2',
            publishedVersionNo: 1,
            draftVersionId: null,
            updatedAt: '2026-11-01T00:00:00Z',
          },
          {
            id: '01900000-0000-7000-8000-0000000000f3',
            key: 'survey',
            kind: 'other',
            title: { bn: 'জরিপ', en: 'Survey' },
            publishedVersionId: '01900000-0000-7000-8000-0000000000a3',
            publishedVersionNo: 1,
            draftVersionId: null,
            updatedAt: '2026-11-01T00:00:00Z',
          },
          {
            id: '01900000-0000-7000-8000-0000000000f4',
            key: 'unfinished',
            kind: 'beneficiary_application',
            title: { bn: 'অসম্পূর্ণ', en: 'Unfinished' },
            publishedVersionId: null,
            publishedVersionNo: null,
            draftVersionId: '01900000-0000-7000-8000-0000000000a4',
            updatedAt: '2026-11-01T00:00:00Z',
          },
        ],
        meta: {},
      }),
    ),
    http.post(`*/api/v1/projects/${PROJECT}/forms/place`, async ({ request }) => {
      sent.push(await request.json());
      return HttpResponse.json({ data: placed(IFTAR, 'ইফতারের আবেদন') }, { status: 201 });
    }),
  );
}

function open(status: Project['status'], forms: ProjectForm[] = [], can = true) {
  return renderApp(
    <SetupProvider
      value={{
        project: project(status),
        etag: '"p1"',
        phone: false,
        configure: true,
        refresh: async () => undefined,
      }}
    >
      <ApplicationFormPicker
        forms={forms}
        can={can}
        formHref={`/admin/projects/${PROJECT}/forms`}
      />
    </SetupProvider>,
    'bn',
  );
}

beforeEach(() => {
  resetClientForTests();
  refreshAs(PM);
  serve();
});

describe('the application form picker', () => {
  it('offers only the published ready application forms and keeps the builder a small link', async () => {
    const user = userEvent.setup();
    open('draft');
    expect(screen.getByRole('link', { name: 'ফর্ম বিল্ডার খুলুন' })).toHaveAttribute(
      'href',
      `/admin/projects/${PROJECT}/forms`,
    );
    const select = await screen.findByRole('combobox', { name: 'আবেদন ফর্ম' });
    await user.click(select);
    const options = within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['শীতবস্ত্রের আবেদন (সংস্করণ 2)', 'ইফতারের আবেদন (সংস্করণ 1)']);
  });

  it('places the first choice as the project’s application form', async () => {
    const user = userEvent.setup();
    open('draft');
    await user.click(await screen.findByRole('combobox', { name: 'আবেদন ফর্ম' }));
    await user.click(await screen.findByRole('option', { name: 'ইফতারের আবেদন (সংস্করণ 1)' }));
    await waitFor(() => expect(sent).toEqual([{ readyFormId: IFTAR, key: 'default' }]));
  });

  it('asks before replacing the form of a draft, and replaces it once confirmed', async () => {
    const user = userEvent.setup();
    open('draft', [placed(WINTER)]);
    const select = await screen.findByRole('combobox', { name: 'আবেদন ফর্ম' });
    // the chosen one shows once the ready forms have come
    await waitFor(() => expect(select).toHaveTextContent('শীতবস্ত্রের আবেদন (সংস্করণ 2)'));
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'ইফতারের আবেদন (সংস্করণ 1)' }));
    const ask = await screen.findByRole('alertdialog', { name: 'আবেদন ফর্ম বদলাবেন?' });
    await user.click(within(ask).getByRole('button', { name: 'বাতিল' }));
    expect(sent).toEqual([]);
    await user.click(select);
    await user.click(await screen.findByRole('option', { name: 'ইফতারের আবেদন (সংস্করণ 1)' }));
    await user.click(
      within(await screen.findByRole('alertdialog', { name: 'আবেদন ফর্ম বদলাবেন?' })).getByRole(
        'button',
        { name: 'বদলান' },
      ),
    );
    await waitFor(() => expect(sent).toEqual([{ readyFormId: IFTAR, replace: true }]));
  });

  it('shows the form of a running project read-only', async () => {
    open('active', [placed(WINTER)]);
    expect(await screen.findByText('আবেদন ফর্ম: শীতবস্ত্রের আবেদন')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'আবেদন ফর্ম' })).not.toBeInTheDocument();
  });

  it('names a form built for the project itself as the current choice', async () => {
    open('draft', [placed(null, 'প্রকল্পের নিজের ফর্ম')]);
    expect(await screen.findByRole('combobox', { name: 'আবেদন ফর্ম' })).toHaveTextContent(
      'প্রকল্পের নিজের ফর্ম',
    );
  });
});
