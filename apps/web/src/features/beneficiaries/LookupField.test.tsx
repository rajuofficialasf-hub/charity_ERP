import { expectNoAxeViolations } from '@css/ui/testing';
import { screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { apiError, ME, refreshAs, renderApp } from '../../../test/auth';
import { server } from '../../../test/msw/server';
import { resetClientForTests } from '../../lib/api';
import { LookupField } from './LookupField';

// The identity lookup of the application form: each answer has its own message, and a found
// profile fills the form with the identity locked and the mobile editable. Test data only.
// the lock marker is visually hidden text after the label, so the space before it may be dropped
// a locked field is named by its label and says it is locked in its description
const NAME = 'নাম';
const FATHER = 'পিতা/স্বামীর নাম';
const PROJECT = '01900000-0000-7000-8000-0000000000c1';
const PLACE = '01900000-0000-7000-8000-0000000000d1';
const autofill = {
  beneficiaryId: '01900000-0000-7000-8000-0000000000b1',
  benNo: 42,
  name: 'নমুনা উপকারভোগী',
  fatherOrHusbandName: 'নমুনা পিতা',
  motherName: null,
  mobile: '01700001000',
  genderCode: 'female',
  dob: null,
  ageYears: 40,
  divisionId: PLACE,
  districtId: PLACE,
  upazilaId: PLACE,
  unionId: PLACE,
  village: 'নমুনা গ্রাম',
  postOffice: null,
  postCode: null,
  landmark: null,
  members14Plus: 2,
  childrenUnder14: 1,
  lockedFields: ['name', 'father_or_husband_name', 'nid', 'birth_reg'],
};

let bodies: unknown[];
function answer(result: unknown, status = 200) {
  bodies = [];
  server.use(
    http.post('*/api/v1/beneficiaries/lookup', async ({ request }) => {
      bodies.push(await request.json());
      return status === 200
        ? HttpResponse.json({ data: result, meta: { requestId: 'req_test' } })
        : apiError(
            status,
            'beneficiary.lookup_outside_limit',
            'আজ অন্য অঞ্চলের প্রোফাইল খোঁজার সীমা শেষ।',
          );
    }),
    http.get('*/api/v1/locations', () => HttpResponse.json({ data: [] })),
  );
}

const open = (locale: 'bn' | 'en' = 'bn') => renderApp(<LookupField projectId={PROJECT} />, locale);

async function search(number = '১০০০০০১০০০') {
  const user = userEvent.setup();
  await user.type(await screen.findByRole('textbox', { name: /NID নম্বর/ }), number);
  await user.click(screen.getByRole('button', { name: 'খুঁজুন' }));
  return user;
}

beforeEach(() => {
  resetClientForTests();
  refreshAs({ ...ME, roles: ['regional_program_manager'] });
});

describe('the lookup field', () => {
  it('fills a found profile with the name, the father and the number locked and the mobile editable', async () => {
    answer({
      found: true,
      blocked: false,
      alreadyAppliedInProject: false,
      mobileIsCallerOwn: false,
      autofill,
    });
    const { container } = open();
    const user = await search();
    // Bengali digits are sent as English ones
    await waitFor(() => expect(bodies).toEqual([{ nid: '1000001000', projectId: PROJECT }]));
    const name = await screen.findByRole('textbox', { name: NAME });
    expect(name).toHaveValue('নমুনা উপকারভোগী');
    expect(name).toHaveAttribute('readonly');
    expect(name).toHaveAccessibleDescription(/লক করা/);
    const father = screen.getByRole('textbox', { name: FATHER });
    expect(father).toHaveAttribute('readonly');
    expect(father).toHaveAccessibleDescription(/লক করা/);
    expect(screen.getByText('প্রোফাইল পাওয়া গেছে: BEN-0000042')).toBeInTheDocument();
    const mobile = screen.getByRole('textbox', { name: 'মোবাইল' });
    expect(mobile).not.toHaveAttribute('readonly');
    await user.clear(mobile);
    await user.type(mobile, '01700002000');
    expect(mobile).toHaveValue('01700002000');
    await expectNoAxeViolations(container);
  });

  it('drops an answer that arrives after the number was changed', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.post('*/api/v1/beneficiaries/lookup', async () => {
        await held;
        return HttpResponse.json({
          data: { found: true, blocked: false, alreadyAppliedInProject: false, autofill },
          meta: { requestId: 'req_test' },
        });
      }),
      http.get('*/api/v1/locations', () => HttpResponse.json({ data: [] })),
    );
    open();
    const user = await search();
    await user.type(screen.getByRole('textbox', { name: /NID নম্বর/ }), '9');
    release();
    // the search button is ready again once the old answer has come and gone
    await waitFor(() => expect(screen.getByRole('button', { name: 'খুঁজুন' })).toBeEnabled());
    expect(screen.queryByText('প্রোফাইল পাওয়া গেছে: BEN-0000042')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: NAME })).not.toBeInTheDocument();
  });

  it('says when no profile has the number', async () => {
    answer({ found: false });
    open();
    await search();
    expect(await screen.findByText('এই নম্বরে কোনো প্রোফাইল নেই')).toBeInTheDocument();
  });

  it('says a blocked person is blocked, without the auto-fill', async () => {
    answer({ found: true, blocked: true });
    open();
    await search();
    expect(await screen.findByText('এই ব্যক্তি ব্লক করা আছেন')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: NAME })).not.toBeInTheDocument();
  });

  it('says when the person already applied in this project', async () => {
    answer({ found: true, blocked: false, alreadyAppliedInProject: true, autofill });
    open();
    await search();
    expect(
      await screen.findByText('এই প্রকল্পে এই ব্যক্তির (BEN-0000042) আবেদন আগেই আছে'),
    ).toBeInTheDocument();
  });

  it("asks for another number when the profile's mobile is the caller's own", async () => {
    answer({
      found: true,
      blocked: false,
      alreadyAppliedInProject: false,
      mobileIsCallerOwn: true,
      autofill,
    });
    open();
    const user = await search();
    const own = 'এটি আপনার নিজের মোবাইল নম্বর। উপকারভোগীর অন্য একটি নম্বর দিন।';
    expect(await screen.findByText(own)).toBeInTheDocument();
    const mobile = screen.getByRole('textbox', { name: 'মোবাইল' });
    await user.clear(mobile);
    await user.type(mobile, '01700002000');
    expect(screen.queryByText(own)).not.toBeInTheDocument();
  });

  it('names the kept profile of a merged number', async () => {
    answer({
      found: true,
      blocked: false,
      alreadyAppliedInProject: false,
      mergedInto: { benNo: 42 },
      autofill,
    });
    open();
    await search();
    expect(
      await screen.findByText(
        'এই নম্বরের প্রোফাইল BEN-0000042-এ মার্জ হয়েছে, তাই সেই প্রোফাইলের তথ্য দেখানো হচ্ছে।',
      ),
    ).toBeInTheDocument();
  });

  it('shows the limit message of the server and refuses a malformed number without asking', async () => {
    answer(null, 429);
    open();
    const user = await search('12345');
    expect(await screen.findByText('এনআইডি 10, 13 বা 17 অঙ্কের হতে হবে।')).toBeInTheDocument();
    expect(bodies).toEqual([]);
    await user.clear(screen.getByRole('textbox', { name: /NID নম্বর/ }));
    await user.type(screen.getByRole('textbox', { name: /NID নম্বর/ }), '1000001000');
    await user.click(screen.getByRole('button', { name: 'খুঁজুন' }));
    expect(
      await screen.findByText('আজ অন্য অঞ্চলের প্রোফাইল খোঁজার সীমা শেষ।'),
    ).toBeInTheDocument();
  });

  it('looks up a birth registration number and passes axe in English', async () => {
    answer({ found: false });
    const user = userEvent.setup();
    const { container } = open('en');
    await user.click(await screen.findByRole('radio', { name: 'Birth registration' }));
    await user.type(
      screen.getByRole('textbox', { name: /Birth registration number/ }),
      '10000000000000001',
    );
    await user.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('No profile has this number')).toBeInTheDocument();
    expect(bodies).toEqual([{ birthReg: '10000000000000001', projectId: PROJECT }]);
    await expectNoAxeViolations(container);
  });
});
