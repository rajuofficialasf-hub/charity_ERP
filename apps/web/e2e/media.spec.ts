import {
  type Browser,
  type BrowserContext,
  devices,
  expect,
  type Page,
  test,
} from '@playwright/test';
import { apiAs, choose, isPhone, scan, signIn } from './support/admin';
import { act, consent, onDesk, savar, volunteerId } from './support/applications';
import { activeProject, choice, code, ERR, question } from './support/projects';

// The Media Team end to end (docs/plans/2026-10-26-1502-feat-media-team-plan.md, the journey):
// the region's RPM sends an approved application to the Media Team; the Department Head, who
// holds every media permission, accepts it on a phone and puts the Media Team member on the
// work; the member moves its stages; the final review is given and a YouTube post is added, which
// makes the work published; it then shows on the person's profile and in the member's
// portfolio. A volunteer and the Finance Team are refused. The demo Media Director is not used:
// the sign-in spec changes that account's password (docs/testing/DEMO_ACCOUNTS.md).
const PM = 'pm.err@example.org';
const HEAD = 'head@example.org';
const RPM = 'rpm.dhaka@example.org';
const MEMBER = 'media@example.org';
const MEMBER_NAME = 'মিডিয়া কর্মকর্তা (নমুনা)';
const VOLUNTEER = '01700000115';
const FINANCE = 'finance@example.org';
const DENIED = 'এই পাতায় আপনার প্রবেশাধিকার নেই।';

const digits = (n: number) =>
  Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
const ddmmyyyy = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}${String(d.getMonth() + 1).padStart(2, '0')}${d.getFullYear()}`;
const windowAroundToday = () => {
  const from = new Date();
  from.setDate(from.getDate() - 7);
  const to = new Date();
  to.setMonth(to.getMonth() + 2);
  return { from: ddmmyyyy(from), to: ddmmyyyy(to) };
};

/** The identity questions only: the media work needs an approved application, nothing more. */
const FORM = [
  {
    key: 'section_1',
    librarySectionKey: null,
    title: { bn: 'পরিচয়', en: 'Identity' },
    visibility: 'volunteer',
    condition: null,
    fields: [
      question('q_id', 'short_text', {
        standardColumn: 'nid_or_birth_reg',
        label: { bn: 'পরিচয় নম্বর', en: 'Identity number' },
      }),
      question('q_name', 'short_text', {
        standardColumn: 'name',
        label: { bn: 'উপকারভোগীর নাম', en: 'Name' },
      }),
      question('q_father', 'short_text', {
        standardColumn: 'father_or_husband_name',
        label: { bn: 'পিতা বা স্বামীর নাম', en: 'Father or husband' },
      }),
      question('q_mobile', 'phone', {
        standardColumn: 'mobile',
        label: { bn: 'উপকারভোগীর মোবাইল', en: 'Mobile' },
      }),
      question('q_gender', 'single_select', {
        standardColumn: 'gender_code',
        label: { bn: 'লিঙ্গ', en: 'Gender' },
        options: [
          choice('male', { bn: 'পুরুষ', en: 'Male' }),
          choice('female', { bn: 'নারী', en: 'Female' }),
        ],
      }),
      question('q_address', 'bd_address', {
        standardColumn: 'division_id,district_id,upazila_id,union_id',
        label: { bn: 'ঠিকানা', en: 'Address' },
      }),
      question('q_village', 'short_text', {
        standardColumn: 'village',
        label: { bn: 'গ্রাম', en: 'Village' },
      }),
    ],
  },
];

/**
 * An active ERR project of this run with volunteer 15 assigned and consenting, and one of their
 * applications approved by the Dhaka RPM; answers the application's id and its person.
 */
async function approvedApplication(browser: Browser, request: Parameters<typeof apiAs>[0]) {
  const projectId = await onDesk(browser, async (desk) => {
    await signIn(desk, PM);
    await desk.goto('/admin/projects');
    return activeProject(desk, `মিডিয়া ${code()}`, ERR, PM, FORM, {
      window: windowAroundToday(),
      fundSource: 'সাধারণ দান',
    });
  });
  const head = await apiAs(request, HEAD);
  const volunteer = await volunteerId(head, VOLUNTEER);
  const assigned = await head.post(`/projects/${projectId}/volunteers`, {
    volunteers: [{ volunteerId: volunteer }],
  });
  expect(assigned.status(), await assigned.text()).toBe(201);
  await consent(request, VOLUNTEER, projectId);
  const places = await savar(head);
  const me = await apiAs(request, VOLUNTEER);
  const form = await me.get(`/projects/${projectId}/application-form`);
  const { data: version } = (await form.json()) as { data: { id: string } };
  const name = `মিডিয়া উপকারভোগী ${digits(4)}`;
  const made = await me.post(`/projects/${projectId}/applications`, {
    clientUuid: crypto.randomUUID(),
    projectId,
    formVersionId: version.id,
    answers: [
      { fieldKey: 'q_id', value: { t: 'short_text', v: `3${digits(9)}` } },
      { fieldKey: 'q_name', value: { t: 'short_text', v: name } },
      { fieldKey: 'q_father', value: { t: 'short_text', v: 'নমুনা পিতা' } },
      { fieldKey: 'q_mobile', value: { t: 'phone', v: `018${digits(8)}` } },
      { fieldKey: 'q_gender', value: { t: 'single_select', v: 'female' } },
      {
        fieldKey: 'q_address',
        value: {
          t: 'bd_address',
          division_id: places.division,
          district_id: places.district,
          upazila_id: places.upazila,
          union_id: places.union,
        },
      },
      { fieldKey: 'q_village', value: { t: 'short_text', v: 'পূর্বপাড়া' } },
    ],
  });
  expect(made.status(), await made.text()).toBe(201);
  const id = ((await made.json()) as { data: { id: string } }).data.id;
  await act(me, id, 'submit');
  const rpm = await apiAs(request, RPM);
  await act(rpm, id, 'review');
  await act(rpm, id, 'send_for_approval');
  await act(rpm, id, 'approve');
  const record = await head.get(`/applications/${id}`);
  const { data } = (await record.json()) as { data: { appNo: string; beneficiaryId: string } };
  return { id, appNo: data.appNo, beneficiaryId: data.beneficiaryId, name };
}

/** A desktop page of a person of the journey, each step failing on its own rather than at the end. */
const atDesk = <T>(browser: Browser, work: (desk: Page) => Promise<T>) =>
  onDesk(browser, async (desk) => {
    desk.context().setDefaultTimeout(30_000);
    return work(desk);
  });

const noSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const noViolations = async (page: Page, where: string) =>
  expect((await scan(page)).violations, where).toEqual([]);

/** Moves the work to a stage from its page, as whoever is signed in there. */
async function moveTo(page: Page, stage: string) {
  await choose(page, 'নতুন ধাপ', stage);
  await page.getByRole('button', { name: 'ধাপ বদলান' }).click();
  await expect(page.getByText(`ধাপ: ${stage}`).first()).toBeVisible();
}

test.describe('the Media Team', () => {
  test('a referral runs from the application to a published work on the person’s profile', async ({
    browser,
    page,
    request,
  }, info) => {
    test.skip(isPhone(info), 'the journey opens its own phone and desktop pages');
    test.setTimeout(300_000);
    const application = await approvedApplication(browser, request);

    // the RPM sends the approved application from its office page
    await signIn(page, RPM);
    await page.goto(`/admin/applications/${application.id}`);
    await page.getByRole('button', { name: 'মিডিয়া টিমে পাঠান' }).click();
    const dialog = page.getByRole('dialog', { name: 'মিডিয়া টিমে পাঠান' });
    // the native radio sits under its drawn dot; the label takes the click
    await dialog.getByText('উচ্চ', { exact: true }).click();
    await dialog.getByRole('textbox', { name: /^নোট/ }).fill('ঘুরে দাঁড়ানোর গল্প');
    await dialog.getByRole('textbox', { name: /^গল্প \(ঐচ্ছিক\)/ }).fill('একাই সংসার চালান');
    await dialog.getByRole('button', { name: 'পাঠান' }).click();
    await expect(page.getByText('মিডিয়া টিমে পাঠানো হলো')).toBeVisible();
    await expect(page.getByText('মিডিয়া: সিদ্ধান্তের অপেক্ষায়')).toBeVisible();
    const head = await apiAs(request, HEAD);
    const record = await head.get(`/applications/${application.id}`);
    const referralId = ((await record.json()) as { data: { media: { referralId: string } } }).data
      .media.referralId;

    // the Department Head decides on a phone at 360 px
    const phone: BrowserContext = await browser.newContext({
      ...devices['Pixel 7'],
      viewport: { width: 360, height: 780 },
    });
    // a step that cannot happen fails here, not at the end of the whole journey
    phone.setDefaultTimeout(30_000);
    try {
      const director = await phone.newPage();
      await signIn(director, HEAD);
      await director.goto('/media');
      await expect(director.getByRole('heading', { level: 1, name: 'মিডিয়ার কাজ' })).toBeVisible();
      await expect(director.getByRole('link', { name: /নতুন মিডিয়া রেফারেল/ })).toBeVisible();
      expect(await noSideways(director)).toBe(true);
      await noViolations(director, 'the home');
      await director.goto(`/media/referrals/${referralId}`);
      await director.getByRole('button', { name: 'গ্রহণ করুন' }).click();
      await director
        .getByRole('alertdialog', { name: 'গ্রহণ করুন' })
        .getByRole('button', { name: 'গ্রহণ করুন' })
        .click();
      await expect(director.getByText('রেফারেল গ্রহণ করা হলো; কাজ শুরু হলো')).toBeVisible();
      await director.getByRole('button', { name: 'সদস্য যোগ করুন' }).click();
      const team = director.getByRole('dialog', { name: 'দল' });
      await choose(director, 'মিডিয়া টিমের সদস্য খুঁজুন', MEMBER_NAME);
      await team.getByText('ক্যামেরা', { exact: true }).click();
      await team.getByText('ভিডিও সম্পাদনা', { exact: true }).click();
      await expect(team.getByRole('checkbox', { name: 'ভিডিও সম্পাদনা' })).toBeChecked();
      await team.getByRole('button', { name: 'সংরক্ষণ' }).click();
      await expect(
        director.getByText('দল সংরক্ষিত হলো; নতুন সদস্যরা নোটিফিকেশন পাবেন'),
      ).toBeVisible();
      expect(await noSideways(director)).toBe(true);
      await noViolations(director, 'the work page');
    } finally {
      await phone.close();
    }

    // the member moves the stages on a desktop
    await atDesk(browser, async (desk) => {
      await signIn(desk, MEMBER);
      await desk.goto(`/media/referrals/${referralId}`);
      for (const stage of ['শুটিং সম্পন্ন', 'সম্পাদনা', 'প্রকাশের জন্য প্রস্তুত'])
        await moveTo(desk, stage);
      // the member gives no final review and changes no team
      await expect(desk.getByRole('button', { name: 'চূড়ান্ত পর্যালোচনা অনুমোদন' })).toHaveCount(
        0,
      );
      await expect(desk.getByRole('button', { name: 'দল বদলান' })).toHaveCount(0);
    });

    // the final review, then a YouTube post makes the work published
    await atDesk(browser, async (desk) => {
      await signIn(desk, HEAD);
      await desk.goto(`/media/referrals/${referralId}`);
      await desk.getByRole('button', { name: 'চূড়ান্ত পর্যালোচনা অনুমোদন' }).click();
      await expect(desk.getByText(/^অনুমোদন: /)).toBeVisible();
      await desk.getByRole('button', { name: 'প্রকাশ যোগ করুন' }).click();
      const post = desk.getByRole('dialog', { name: 'প্রকাশ যোগ করুন' });
      await choose(desk, 'প্ল্যাটফর্ম', 'As-Sunnah Foundation YouTube');
      await choose(desk, 'অবস্থা', 'প্রকাশিত');
      await post.getByRole('textbox', { name: /^লিংক/ }).fill('https://youtu.be/dQw4w9WgXcQ');
      await post.getByRole('button', { name: 'সংরক্ষণ' }).click();
      await expect(desk.getByText('ধাপ: প্রকাশিত').first()).toBeVisible();

      // the person's profile and the member's portfolio show the published work
      await desk.goto(`/admin/beneficiaries/${application.beneficiaryId}`);
      const media = desk.getByRole('region', { name: 'মিডিয়া' });
      await expect(media.getByText(application.appNo).first()).toBeVisible();
      await expect(
        media.getByRole('link', { name: 'As-Sunnah Foundation YouTube-এ দেখুন' }),
      ).toBeVisible();
      const users = await head.get(`/users?q=${encodeURIComponent(MEMBER)}`);
      const [member] = ((await users.json()) as { data: { id: string }[] }).data;
      await desk.goto(`/media/members/${member!.id}`);
      await expect(desk.getByRole('heading', { level: 1, name: MEMBER_NAME })).toBeVisible();
      await expect(desk.getByText(application.appNo).first()).toBeVisible();
      await noViolations(desk, 'the member page');
    });
  });

  test('a volunteer and the Finance Team are refused the media pages', async ({
    browser,
  }, info) => {
    test.skip(isPhone(info), 'the refusal is the same on every screen');
    for (const loginId of [VOLUNTEER, FINANCE])
      await atDesk(browser, async (desk) => {
        await signIn(desk, loginId);
        await desk.goto('/media');
        await expect(desk.getByText(DENIED)).toBeVisible();
        await desk.goto(`/media/referrals/${crypto.randomUUID()}`);
        await expect(desk.getByText(DENIED)).toBeVisible();
      });
  });
});
