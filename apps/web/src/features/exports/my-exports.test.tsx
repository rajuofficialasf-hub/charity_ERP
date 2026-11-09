import type { Me } from '@css/shared/auth';
import { expectNoAxeViolations } from '@/ui/testing';
import { screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { ME, refreshAs, renderApp } from '../../../test/auth';
import { FILE_ID, job } from '../../../test/msw/exports';
import { server } from '../../../test/msw/server';
import { SignedIn } from '../../../test/signed-in';
import { ProfileMenu } from '../../components/shell/ProfileMenu';
import { resetClientForTests } from '../../api/client';
import { MyExportsPage } from './MyExportsPage';
import { RecordPdfButton } from './RecordPdfButton';

// My exports and the record PDFs: the person's own exports with their state and download, the
// menu link for officials, and the "Download PDF" of a profile and an application. Test data only.
const RPM: Me = { ...ME, roles: ['regional_program_manager'] };
const FINANCE: Me = { ...ME, roles: ['finance_team'] };
const VOLUNTEER: Me = { ...ME, kind: 'volunteer', roles: ['volunteer_general'] };
const PERSON = '01900000-0000-7000-8000-0000000000b1';

const id = (n: number) => `01900000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`;

function serveMine(jobs: unknown[]) {
  server.use(
    http.get('*/api/v1/exports', () =>
      HttpResponse.json({ data: jobs, meta: { requestId: 'req_test' } }),
    ),
  );
}

beforeEach(() => {
  resetClientForTests();
});

describe('my exports', () => {
  it('lists each export with its state: the download of a done one, the progress of a running one, an expired one marked so', async () => {
    refreshAs(RPM);
    serveMine([
      job({ id: id(1), status: 'done', rowsDone: 3, rowCount: 3, fileId: FILE_ID }),
      job({
        id: id(2),
        kind: 'volunteers',
        format: 'csv',
        status: 'running',
        rowsDone: 40,
        rowsTotal: 100,
      }),
      job({
        id: id(3),
        kind: 'applications',
        status: 'done',
        rowCount: 9,
        fileId: id(9),
        expired: true,
      }),
      job({ id: id(4), status: 'failed', errorCode: 'export.timed_out' }),
    ]);
    const { container } = renderApp(<MyExportsPage />, 'bn', { path: '/account/exports' });
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(4);
    expect(within(items[0]!).getByText('তৈরি')).toBeInTheDocument();
    expect(within(items[0]!).getByRole('button', { name: 'ডাউনলোড করুন' })).toBeInTheDocument();
    expect(within(items[1]!).getByRole('progressbar', { name: 'তৈরি হচ্ছে' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    expect(within(items[2]!).getByText('মেয়াদ শেষ')).toBeInTheDocument();
    expect(within(items[2]!).queryByRole('button', { name: 'ডাউনলোড করুন' })).toBeNull();
    expect(within(items[3]!).getByText(/সময়ের মধ্যে শেষ হয়নি/)).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });

  it('says so when there is no export yet', async () => {
    refreshAs(RPM);
    serveMine([]);
    renderApp(<MyExportsPage />, 'bn', { path: '/account/exports' });
    expect(await screen.findByText('এখনও কোনো এক্সপোর্ট নেই।')).toBeInTheDocument();
  });
});

describe('the profile menu', () => {
  it('links an official to their exports, and a volunteer not', async () => {
    const user = userEvent.setup();
    refreshAs(RPM);
    const { unmount } = renderApp(<ProfileMenu me={RPM} withLanguage={false} />);
    await user.click(await screen.findByRole('button', { name: /প্রোফাইল/ }));
    expect(await screen.findByRole('menuitem', { name: 'আমার এক্সপোর্ট' })).toBeInTheDocument();
    unmount();
    refreshAs(VOLUNTEER);
    renderApp(<ProfileMenu me={VOLUNTEER} withLanguage={false} />);
    await user.click(await screen.findByRole('button', { name: /প্রোফাইল/ }));
    await screen.findAllByRole('menuitem');
    expect(screen.queryByRole('menuitem', { name: 'আমার এক্সপোর্ট' })).toBeNull();
  });
});

describe('the record PDF', () => {
  it('starts the profile PDF and follows it to its download', async () => {
    const user = userEvent.setup();
    refreshAs(RPM);
    let started = 0;
    server.use(
      http.post(`*/api/v1/beneficiaries/${PERSON}/pdf`, () => {
        started += 1;
        return HttpResponse.json(
          { data: job({ kind: 'beneficiary_profile', format: 'pdf' }), meta: { requestId: 'r' } },
          { status: 202 },
        );
      }),
      http.get('*/api/v1/exports/:jobId', () =>
        HttpResponse.json({
          data: job({
            kind: 'beneficiary_profile',
            format: 'pdf',
            status: 'done',
            fileId: FILE_ID,
          }),
          meta: { requestId: 'r' },
        }),
      ),
    );
    renderApp(<RecordPdfButton kind="beneficiary_profile" id={PERSON} />);
    await user.click(await screen.findByRole('button', { name: 'PDF নামান' }));
    expect(
      await screen.findByRole('dialog', { name: 'PDF: উপকারভোগীর প্রোফাইল' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'ডাউনলোড করুন' })).toBeInTheDocument();
    expect(started).toBe(1);
  });

  it('appears only with its permission', async () => {
    // the finance team exports lists but holds no journey report
    refreshAs(FINANCE);
    renderApp(
      <>
        <RecordPdfButton kind="beneficiary_profile" id={PERSON} />
        <RecordPdfButton kind="application" id={PERSON} />
      </>,
    );
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'PDF নামান' })).toHaveLength(1),
    );
  });

  it('is not offered to a volunteer', async () => {
    refreshAs(VOLUNTEER);
    renderApp(
      <>
        <SignedIn />
        <RecordPdfButton kind="application" id={PERSON} />
      </>,
    );
    await screen.findByText('signed-in');
    expect(screen.queryByRole('button', { name: 'PDF নামান' })).toBeNull();
  });
});
