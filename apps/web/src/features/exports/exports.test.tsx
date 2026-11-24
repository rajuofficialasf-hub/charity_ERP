import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import {
  catalogueColumns,
  FILE_ID,
  job,
  serveExports,
  tickedColumns,
} from '../../../test/msw/exports';
import { server } from '../../../test/msw/server';
import { SignedIn } from '../../../test/signed-in';
import { resetClientForTests } from '../../api/client';
import { ExportButton } from './ExportButton';
import { rememberColumns, rememberedColumns } from './remembered-columns';

// The export dialog of a list: the file type and the columns, the on-screen ones ticked the first
// time and the last choice after that, the start, the progress and the download. Test data only.
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const DIVISION = '01900000-0000-7000-8000-0000000000d1';
const PROJECT = '01900000-0000-7000-8000-0000000000c1';

const open = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(
    <ExportButton
      list="beneficiaries"
      filters={{ divisionId: DIVISION, q: '', blocked: undefined }}
    />,
    locale,
  );

beforeEach(() => {
  resetClientForTests();
  localStorage.clear();
});

describe('the remembered columns', () => {
  const columns = catalogueColumns('beneficiaries');

  it('are the on-screen columns the first time, in the catalogue order', () => {
    expect(rememberedColumns('beneficiaries', columns)).toEqual([
      'name',
      'ben_no',
      'father',
      'area',
      'help_count',
      'status',
    ]);
  });

  it('come back as last chosen, in the file order, less a column no longer offered', () => {
    rememberColumns('beneficiaries', ['nid', 'mobile', 'name']);
    expect(rememberedColumns('beneficiaries', columns)).toEqual(['name', 'mobile', 'nid']);
    const withoutNid = columns.filter((c) => c.id !== 'nid');
    expect(rememberedColumns('beneficiaries', withoutNid)).toEqual(['name', 'mobile']);
  });
});

describe('the export dialog', () => {
  it('ticks the on-screen columns, sends the list filters and follows the job to its download', async () => {
    refreshAs(RPM);
    const { bodies } = serveExports('beneficiaries', {
      states: [job({ status: 'done', rowsDone: 3, rowCount: 3, fileId: FILE_ID })],
    });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog', { name: 'এক্সপোর্ট: উপকারভোগীর তালিকা' });
    await waitFor(() =>
      expect(tickedColumns(dialog)).toEqual([
        'name',
        'ben_no',
        'father',
        'area',
        'help_count',
        'status',
      ]),
    );
    await user.click(within(dialog).getByRole('radio', { name: 'CSV' }));
    // the code columns only when asked, and never for a PDF
    const codes = within(dialog).getByRole('checkbox', { name: 'কোডের কলামও দিন' });
    expect(codes).not.toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'PDF' }));
    expect(within(dialog).queryByRole('checkbox', { name: 'কোডের কলামও দিন' })).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: 'CSV' }));
    await user.click(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name', 'ben_no', 'father', 'area', 'help_count', 'status'],
      filters: { divisionId: DIVISION },
    });
    // the choice is kept on the device for the next export of this list
    expect(JSON.parse(localStorage.getItem('css_export_columns:beneficiaries') ?? 'null')).toEqual([
      'name',
      'ben_no',
      'father',
      'area',
      'help_count',
      'status',
    ]);
    expect(await screen.findByRole('button', { name: 'ডাউনলোড করুন' })).toBeInTheDocument();
  });

  it('ticks everything with "select all", and cannot start with nothing ticked', async () => {
    refreshAs(RPM);
    serveExports('beneficiaries');
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'সব বাছুন' }));
    expect(tickedColumns(dialog)).toHaveLength(catalogueColumns('beneficiaries').length);
    await user.click(within(dialog).getByRole('button', { name: 'কোনোটিই না' }));
    expect(tickedColumns(dialog)).toHaveLength(0);
    expect(within(dialog).getByText('অন্তত একটি কলাম বাছুন।')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' })).toBeDisabled();
  });

  it('shows the narrowing message of a list over the row limit', async () => {
    refreshAs(RPM);
    serveExports('beneficiaries', {
      start: HttpResponse.json(
        {
          error: {
            code: 'export.too_many_rows',
            messageKey: 'errors.export.too_many_rows',
            message:
              'একবারে সর্বোচ্চ 1,00,000টি সারি এক্সপোর্ট করা যায়। বছর, জেলা বা প্রজেক্ট দিয়ে তালিকা ছোট করে আবার চেষ্টা করুন।',
            requestId: 'req_limit',
          },
        },
        { status: 422 },
      ),
    });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(tickedColumns(dialog).length).toBeGreaterThan(0));
    await user.click(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }));
    expect(await within(dialog).findByText(/তালিকা ছোট করে আবার চেষ্টা করুন/)).toBeInTheDocument();
  });

  it('says why a job failed and offers to start again', async () => {
    refreshAs(RPM);
    serveExports('beneficiaries', {
      states: [job({ status: 'failed', errorCode: 'export.pdf_unavailable' })],
    });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(tickedColumns(dialog).length).toBeGreaterThan(0));
    await user.click(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }));
    expect(await screen.findByText(/এই সার্ভারে এখন PDF বানানো যাচ্ছে না/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(await screen.findByRole('button', { name: 'এক্সপোর্ট শুরু করুন' })).toBeInTheDocument();
  });

  it('shows a running job with its rows written of the total', async () => {
    refreshAs(RPM);
    serveExports('beneficiaries', {
      states: [job({ status: 'running', rowsDone: 1, rowsTotal: 3 })],
    });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(tickedColumns(dialog).length).toBeGreaterThan(0));
    await user.click(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }));
    const bar = await screen.findByRole('progressbar', { name: 'তৈরি হচ্ছে' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '3');
  });

  it('says so when the job cannot be read, and stops asking until the retry', async () => {
    refreshAs(RPM);
    serveExports('beneficiaries');
    let polls = 0;
    server.use(
      http.get('*/api/v1/exports/:jobId', ({ params }) => {
        // the column list shares the path's shape and is answered by the handlers above
        if (params.jobId === 'columns') return undefined;
        polls += 1;
        return HttpResponse.json(
          {
            error: {
              code: 'permission.not_found',
              messageKey: 'errors.permission.not_found',
              message: 'Not found.',
              requestId: 'req_gone',
            },
          },
          { status: 404 },
        );
      }),
    );
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(tickedColumns(dialog).length).toBeGreaterThan(0));
    await user.click(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }));
    expect(await screen.findByText(/এক্সপোর্টের অবস্থা জানা যাচ্ছে না/)).toBeInTheDocument();
    const asked = polls;
    await user.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    await waitFor(() => expect(polls).toBe(asked + 1));
  });

  it('groups the form questions by section, with the whole section and a search', async () => {
    refreshAs(RPM);
    const section = (key: string, bn: string) => ({ key, title: { bn, en: bn } });
    const question = (id: string, bn: string, at: ReturnType<typeof section>) => ({
      id,
      label: { bn, en: bn },
      group: 'question' as const,
      protected: false,
      onScreen: false,
      kind: 'text',
      section: at,
    });
    const home = section('home', 'বাড়ি');
    const family = section('family', 'পরিবার');
    const { bodies } = serveExports('applications', {
      columns: [
        ...catalogueColumns('applications'),
        question('q:roof', 'ঘরের চাল', home),
        question('q:rooms', 'ঘরের সংখ্যা', home),
        question('q:members', 'সদস্য সংখ্যা', family),
      ],
    });
    const user = userEvent.setup();
    renderApp(<ExportButton list="applications" projectId={PROJECT} filters={{}} />, 'bn');
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(
      await within(dialog).findByRole('checkbox', { name: 'পুরো অংশ বাছুন: বাড়ি' }),
    );
    expect(tickedColumns(dialog)).toEqual(expect.arrayContaining(['q:roof', 'q:rooms']));
    expect(tickedColumns(dialog)).not.toContain('q:members');
    await user.type(within(dialog).getByRole('textbox', { name: 'প্রশ্ন খুঁজুন' }), 'সদস্য{Enter}');
    // Enter in the search starts nothing
    expect(bodies).toHaveLength(0);
    expect(within(dialog).queryByRole('checkbox', { name: 'ঘরের চাল' })).toBeNull();
    expect(within(dialog).getByRole('checkbox', { name: 'সদস্য সংখ্যা' })).toBeInTheDocument();
    await user.clear(within(dialog).getByRole('textbox', { name: 'প্রশ্ন খুঁজুন' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'প্রশ্ন খুঁজুন' }), 'নেই এমন');
    expect(within(dialog).getByText('এই নামে কোনো প্রশ্ন নেই।')).toBeInTheDocument();
  });

  it('is not offered to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    serveExports('beneficiaries');
    renderApp(
      <>
        <SignedIn />
        <ExportButton list="beneficiaries" filters={{}} />
      </>,
    );
    await screen.findByText('signed-in');
    expect(screen.queryByRole('button', { name: 'এক্সপোর্ট' })).toBeNull();
  });

  it.each(['bn', 'en'] as const)('has no accessibility violations (%s)', async (locale) => {
    refreshAs(RPM);
    serveExports('beneficiaries');
    const user = userEvent.setup();
    open(locale);
    await user.click(
      await screen.findByRole('button', { name: locale === 'bn' ? 'এক্সপোর্ট' : 'Export' }),
    );
    const dialog = await screen.findByRole('dialog');
    await waitFor(() => expect(tickedColumns(dialog).length).toBeGreaterThan(0));
    await expectNoAxeViolations(document.body);
  });
});
