import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { catalogueColumns, FILE_ID, job, serveExports } from '../../../test/msw/exports';
import { resetClientForTests } from '../../lib/api';
import { ExportButton } from './ExportButton';
import { rememberColumns, rememberedColumns } from './remembered-columns';

// The export dialog of a list: the file type and the columns, the on-screen ones ticked the first
// time and the last choice after that, the start, the progress and the download. Test data only.
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const DIVISION = '01900000-0000-7000-8000-0000000000d1';

const open = (locale: 'bn' | 'en' = 'bn') =>
  renderApp(
    <ExportButton
      list="beneficiaries"
      filters={{ divisionId: DIVISION, q: '', blocked: undefined }}
    />,
    locale,
  );

/** The ticked columns of the dialog, in their order. */
const ticked = (dialog: HTMLElement) =>
  within(dialog)
    .getAllByRole('checkbox')
    .filter((box) => (box as HTMLInputElement).checked)
    .map((box) => (box as HTMLInputElement).value);

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
      states: [
        job({ status: 'running', rowsDone: 1, rowsTotal: 3 }),
        job({ status: 'done', rowsDone: 3, rowCount: 3, fileId: FILE_ID }),
      ],
    });
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog', { name: 'এক্সপোর্ট: উপকারভোগীর তালিকা' });
    await waitFor(() =>
      expect(ticked(dialog)).toEqual(['name', 'ben_no', 'father', 'area', 'status']),
    );
    await user.click(within(dialog).getByRole('radio', { name: 'CSV' }));
    await user.click(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name', 'ben_no', 'father', 'area', 'status'],
      filters: { divisionId: DIVISION },
    });
    expect(
      await screen.findByRole('button', { name: 'ডাউনলোড করুন' }, { timeout: 8000 }),
    ).toBeInTheDocument();
  }, 15_000);

  it('ticks everything with "select all", and cannot start with nothing ticked', async () => {
    refreshAs(RPM);
    serveExports('beneficiaries');
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole('button', { name: 'এক্সপোর্ট' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(await within(dialog).findByRole('button', { name: 'সব বাছুন' }));
    expect(ticked(dialog)).toHaveLength(catalogueColumns('beneficiaries').length);
    await user.click(within(dialog).getByRole('button', { name: 'কোনোটিই না' }));
    expect(ticked(dialog)).toHaveLength(0);
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
    await waitFor(() => expect(ticked(dialog).length).toBeGreaterThan(0));
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
    await waitFor(() => expect(ticked(dialog).length).toBeGreaterThan(0));
    await user.click(within(dialog).getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }));
    expect(await screen.findByText(/এই সার্ভারে এখন PDF বানানো যাচ্ছে না/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'আবার চেষ্টা করুন' }));
    expect(await screen.findByRole('button', { name: 'এক্সপোর্ট শুরু করুন' })).toBeInTheDocument();
  });

  it('is not offered to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    serveExports('beneficiaries');
    open();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'এক্সপোর্ট' })).toBeNull());
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
    await waitFor(() => expect(ticked(dialog).length).toBeGreaterThan(0));
    await expectNoAxeViolations(document.body);
  });
});
