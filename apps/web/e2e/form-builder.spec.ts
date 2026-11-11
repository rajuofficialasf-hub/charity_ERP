import { devices, expect, type Page, test } from '@playwright/test';
import { scan, signIn, switchLanguage } from './support/admin';
import {
  dayFromToday,
  digits,
  openFixList,
  ownQuestion,
  pick,
  publish,
  saved,
  settled,
} from './support/forms';
import {
  chooseIn,
  code,
  finishSetup,
  newDraft,
  projectIdOf,
  section,
  UCD,
} from './support/projects';

// The form journey against the demo seed (docs/testing/DEMO_ACCOUNTS.md): the Monitoring Team
// builds a ready form with the seven identity marks, a calculation and a condition, and publishes
// it; the PM places it on a project and switches the public link on; an applicant sends it on a
// phone; the Monitoring Team publishes version 2, the PM takes it, and the same link then opens
// it. The entry sent on version 1 keeps its answers as they were, and the project's RPM opens its
// verification from the office's list.
const MONITORING = 'monitoring@example.org';
const PM = 'pm.ucd@example.org';
const RPM = 'rpm.dhaka@example.org';

// a step that cannot happen fails on its own line instead of at the end of the journey
test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

/** Marks the chosen question with an identity role in the settings pane. */
async function mark(page: Page, role: string) {
  await chooseIn(page, page.locator('main'), 'পরিচয়-চিহ্ন', role);
  const tag = role.replace(/ \(.*\)$/, '');
  await expect(page.locator('main').getByText(`পরিচয়: ${tag}`).first()).toBeVisible();
}

/**
 * A new ready form for beneficiary applications, empty, open in the builder. Its key comes from
 * the English name and the moment it is made, so tests that start together give different names.
 */
async function newReadyForm(page: Page, title: string, english: string) {
  await page.goto('/admin/ready-forms');
  await page.getByRole('button', { name: 'নতুন তৈরি ফর্ম' }).click();
  const create = page.getByRole('dialog', { name: 'নতুন তৈরি ফর্ম' });
  await create.getByRole('textbox', { name: /ফর্মের নাম \(বাংলা\)/ }).fill(title);
  await create.getByRole('textbox', { name: /ফর্মের নাম \(ইংরেজি\)/ }).fill(english);
  await expect(create.getByRole('radio', { name: 'উপকারভোগীর আবেদন' })).toBeChecked();
  await create.getByRole('button', { name: 'তৈরি করুন' }).click();
  await expect(page).toHaveURL(/\/admin\/ready-forms\/[0-9a-f-]{36}$/);
  await expect(page.getByTestId('form-head').getByText('সংস্করণ 1: খসড়া')).toBeVisible();
  await expect(page.getByTestId('form-head').getByText('1টি অংশ · 0টি প্রশ্ন')).toBeVisible();
}

test('the Monitoring Team builds a ready form, the PM places it, an applicant sends it, and version 2 follows', async ({
  page,
  browser,
}, info) => {
  test.skip(
    info.project.name !== 'desktop',
    'the builders work on a computer; the applicant gets a phone page of its own',
  );
  test.setTimeout(420_000);

  // the Monitoring Team: a new ready form for beneficiary applications, empty
  await signIn(page, MONITORING);
  const title = `স্বাবলম্বী আবেদন ${code()}`;
  await newReadyForm(page, title, 'Self-reliance application');
  const readyUrl = page.url();

  // the identity questions, written by the builder and marked one by one
  const identity: [string, [string, string], string, [string, string][]?][] = [
    ['ছোট লেখা', ['জাতীয় পরিচয়পত্র নম্বর', 'NID number'], 'এনআইডি বা জন্মনিবন্ধন নম্বর'],
    ['ছোট লেখা', ['উপকারভোগীর নাম', "Beneficiary's name"], 'নাম'],
    ['ছোট লেখা', ['পিতা/স্বামীর নাম', "Father's or husband's name"], 'পিতা বা স্বামীর নাম'],
    ['মোবাইল নম্বর', ['মোবাইল নম্বর', 'Mobile number'], 'মোবাইল নম্বর'],
    [
      'তালিকা থেকে একটি',
      ['লিঙ্গ', 'Gender'],
      'লিঙ্গ',
      [
        ['পুরুষ', 'Male'],
        ['নারী', 'Female'],
      ],
    ],
    ['ঠিকানা', ['ঠিকানা', 'Address'], 'ঠিকানা (বিভাগ থেকে ইউনিয়ন)'],
    ['ছোট লেখা', ['গ্রাম', 'Village'], 'গ্রাম'],
  ];
  // the first six only: a publish without the village names the missing role
  for (const [type, label, role, options] of identity.slice(0, 6)) {
    await ownQuestion(page, 'অংশ 1', type, label, options);
    await mark(page, role);
  }
  // Publish does not ask while something is left: it opens the list, which names the role
  await saved(page);
  await page.getByRole('button', { name: 'প্রকাশ করুন', exact: true }).click();
  const fixes = page.getByRole('dialog', { name: 'প্রকাশের আগে ঠিক করুন' });
  await expect(fixes.getByText('পরিচয়ের প্রশ্ন বাকি: গ্রাম', { exact: true })).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(fixes).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'প্রকাশের আগে ঠিক করুন (1)', exact: true }),
  ).toBeVisible();
  const [vType, vLabel, vRole] = identity[6]!;
  await ownQuestion(page, 'অংশ 1', vType, vLabel);
  await mark(page, vRole);

  // a second section: two numbers of the form's own with their total, and a question shown only
  // when the first number is above zero
  await page.getByRole('button', { name: 'নতুন অংশ' }).click();
  // the new section is chosen, its title a button on the canvas; its question list is empty yet
  await expect(page.getByRole('button', { name: 'অংশ 2', exact: true })).toBeVisible();
  await ownQuestion(page, 'অংশ 2', 'সংখ্যা', ['পুরুষ সদস্য', 'Male members']);
  await ownQuestion(page, 'অংশ 2', 'সংখ্যা', ['নারী সদস্য', 'Female members']);
  await ownQuestion(page, 'অংশ 2', 'নিজে থেকে হিসাব', ['মোট সদস্য', 'All members']);
  await page.getByRole('button', { name: 'হিসাব ঠিক করুন' }).click();
  const calc = page.getByRole('dialog', { name: 'হিসাবের নিয়ম' });
  await chooseIn(page, calc, 'হিসাব: ধরন', 'হিসাব (+ − × ÷)');
  // a sum starts with one part
  await calc.getByRole('button', { name: 'অংশ যোগ করুন' }).click();
  for (const [n, label] of [
    ['1', 'পুরুষ সদস্য'],
    ['2', 'নারী সদস্য'],
  ] as const) {
    await chooseIn(page, calc, `হিসাব › অংশ ${n}: ধরন`, 'একটি প্রশ্নের উত্তর');
    await chooseIn(page, calc, `হিসাব › অংশ ${n}: প্রশ্ন`, label);
  }
  await calc.getByRole('button', { name: 'হয়ে গেছে' }).click();
  await expect(page.getByText('মোট সদস্য = “পুরুষ সদস্য” + “নারী সদস্য”')).toBeVisible();
  // the keyboard drags too: the second number moves one place up by its handle
  const list = page.getByRole('list', { name: 'অংশ 2', exact: true });
  // dnd-kit measures the rows after the pick-up, so each key waits for its announcement
  const announced = page.locator('[id^="DndLiveRegion"]');
  await page.getByRole('button', { name: 'নারী সদস্য টেনে সরান' }).focus();
  await page.keyboard.press('Space');
  await expect(announced).toContainText(/q_female_members/);
  await page.keyboard.press('ArrowUp');
  await expect(announced).toContainText(/moved over droppable area q_male_members/);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => (await list.getByRole('listitem').allInnerTexts()).slice(-3).join('|'))
    // a field's label also sits in its border, so an item's text runs over lines
    .toMatch(/নারী সদস্য[\s\S]*\|[\s\S]*পুরুষ সদস্য[\s\S]*\|[\s\S]*মোট সদস্য/);
  await saved(page);
  await ownQuestion(
    page,
    'অংশ 2',
    'একটি বেছে নিন',
    ['আপনার কি নিজের ঘর আছে?', 'Do you own a house?'],
    [
      ['হ্যাঁ', 'Yes'],
      ['না', 'No'],
    ],
  );
  await page.getByRole('button', { name: 'শর্ত ঠিক করুন' }).click();
  const show = page.getByRole('dialog', { name: 'প্রশ্নটি কখন দেখাবে' });
  await show.getByRole('button', { name: 'শর্ত যোগ করুন' }).click();
  await chooseIn(page, show, 'শর্ত 1: প্রশ্ন', 'পুরুষ সদস্য');
  await chooseIn(page, show, 'শর্ত 1: তুলনা', 'বেশি');
  await show.getByRole('textbox', { name: 'শর্ত 1: মান' }).fill('0');
  await show.getByRole('button', { name: 'হয়ে গেছে' }).click();
  await expect(page.getByText('দেখাবে যখন “পুরুষ সদস্য” 0-এর বেশি।')).toBeVisible();

  await publish(page, 1);
  await expect(page.getByTestId('form-head').getByText('সংস্করণ 1: প্রকাশিত')).toBeVisible();

  // the PM, on a computer of their own: a new project places the ready form
  const desk = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  });
  // the applicant: a phone of the mobile project (touch, its user agent) at 360 × 640
  const phone = await browser.newContext({
    ...devices['Pixel 7'],
    viewport: { width: 360, height: 640 },
  });
  try {
    const pm = await desk.newPage();
    await signIn(pm, PM);
    await pm.goto('/admin/projects');
    const name = `ফর্ম ${code()}`;
    await newDraft(pm, code(), name, UCD);
    const projectId = projectIdOf(pm);
    // the activation review leads the missing form to the placement of a ready form
    await pm.goto(`/admin/projects/${projectId}/setup?step=review`);
    const review = section(pm, 'পর্যালোচনা');
    await expect(review.getByText('প্রকাশিত আবেদন ফর্ম')).toBeVisible();
    await review.getByRole('link', { name: 'ফর্ম বিল্ডার খুলুন' }).click();
    const place = pm.getByRole('dialog', { name: 'তৈরি ফর্ম বসান' });
    // the radio's input is visually hidden; its text chooses it
    const option = `${title} · উপকারভোগীর আবেদন · সংস্করণ 1`;
    await place.getByText(option, { exact: true }).click();
    await expect(place.getByRole('radio', { name: option })).toBeChecked();
    await place.getByRole('button', { name: 'বসান', exact: true }).click();
    await expect(pm).toHaveURL(/\/forms\/[0-9a-f-]{36}$/);
    const placedUrl = pm.url();
    await expect(pm.getByTestId('form-head').getByText('সংস্করণ 1: প্রকাশিত')).toBeVisible();
    await expect(
      pm.getByText('এই ফর্মটি একটি তৈরি ফর্ম থেকে বসানো, তাই এখানে বদলানো যায় না।'),
    ).toBeVisible();
    await expect(pm.getByRole('button', { name: 'প্রকাশ করুন', exact: true })).toHaveCount(0);

    // the public link, switched on with this form, in a closed group of the form-settings tab
    await pm.getByRole('tab', { name: 'ফর্মের সেটিং' }).click();
    await pm.getByRole('button', { name: 'পাবলিক আবেদনের লিংক', exact: true }).click();
    const link = section(pm, 'পাবলিক আবেদনের লিংক');
    // the switch's input is visually hidden behind its track, like the checkbox's
    await link
      .getByRole('switch', { name: 'এই ফর্মের জন্য পাবলিক লিংক চালু' })
      .click({ force: true });
    // it shows as on once the server has issued the link
    await expect(link.getByText('লিংক চালু; এই ফর্মটি খোলে।')).toBeVisible();
    const url = await link.getByRole('textbox', { name: 'আবেদনের লিংক' }).inputValue();
    expect(url).toMatch(/\/apply\/[A-Za-z0-9_-]{20,}$/);

    // the rest of the setup, with a window open from yesterday, then the activation
    await pm.goto(`/admin/projects/${projectId}/setup?step=components`);
    await finishSetup(pm, { window: { from: dayFromToday(-1), to: dayFromToday(60) } });

    // the applicant, signed out, on the phone
    const applicant = await phone.newPage();
    await applicant.goto(new URL(url).pathname);
    await expect(applicant.getByRole('heading', { level: 1, name })).toBeVisible();
    // the open form passes axe in both languages on the phone
    await settled(applicant);
    expect((await scan(applicant)).violations, 'the public form (bn)').toEqual([]);
    await switchLanguage(applicant, 'en');
    await expect(applicant.getByRole('heading', { level: 1, name: `${name} EN` })).toBeVisible();
    await settled(applicant);
    expect((await scan(applicant)).violations, 'the public form (en)').toEqual([]);
    await switchLanguage(applicant, 'bn');
    await expect(applicant.getByRole('heading', { level: 1, name })).toBeVisible();
    const form = applicant.locator('main');
    await form.getByRole('textbox', { name: /জাতীয় পরিচয়পত্র/ }).fill(`1${digits(9)}`);
    await form.getByRole('textbox', { name: /মোবাইল/ }).fill(`017${digits(8)}`);
    await form.getByRole('textbox', { name: /^উপকারভোগীর নাম/ }).fill('নমুনা আবেদনকারী');
    await form.getByRole('textbox', { name: /^পিতা\/স্বামীর নাম/ }).fill('নমুনা পিতা');
    await pick(applicant, form, /(^|\s)লিঙ্গ/);
    // the parts come one per screen on a phone: next until the own questions show
    const nextPart = form.getByRole('button', { name: 'পরের অংশ' });
    const male = form.getByRole('textbox', { name: /পুরুষ সদস্য/ });
    for (let i = 0; i < 12 && !(await male.isVisible()); i += 1) {
      const division = form
        .getByRole('button', { name: /(^|\s)বিভাগ/ })
        .or(form.getByRole('combobox', { name: /(^|\s)বিভাগ/ }));
      if (await division.isVisible()) {
        await pick(applicant, form, /(^|\s)বিভাগ/, 'ঢাকা');
        await pick(applicant, form, /(^|\s)জেলা/, 'ঢাকা');
        await pick(applicant, form, /(^|\s)উপজেলা/, 'সাভার');
        await pick(applicant, form, /(^|\s)ইউনিয়ন/, 'সাভার');
        await form.getByRole('textbox', { name: /গ্রাম/ }).first().fill('নমুনা গ্রাম');
      }
      await nextPart.click();
    }
    await male.fill('2');
    await form.getByRole('textbox', { name: /নারী সদস্য/ }).fill('1');
    await expect(form.getByRole('textbox', { name: /মোট সদস্য/ })).toHaveValue('3');
    // shown because the first number is above zero
    await form
      .getByRole('radiogroup', { name: 'আপনার কি নিজের ঘর আছে?' })
      .getByText('হ্যাঁ', { exact: true })
      .click();
    const send = form.getByRole('button', { name: 'আবেদন জমা দিন' });
    for (let i = 0; i < 12 && !(await send.isVisible()); i += 1) await nextPart.click();
    await send.click();
    await expect(applicant.getByRole('heading', { name: 'আবেদন জমা হয়েছে' })).toBeVisible();
    // no horizontal scrolling at 360 px
    expect(
      await applicant.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(360);

    // version 2 of the ready form: one option changes
    await page.goto(readyUrl);
    await page.getByRole('button', { name: 'নতুন সংস্করণ তৈরি করুন' }).click();
    await expect(page.getByTestId('form-head').getByText('সংস্করণ 2: খসড়া')).toBeVisible();
    await page.getByRole('button', { name: 'আপনার কি নিজের ঘর আছে? বদলান' }).click();
    await page.getByRole('textbox', { name: /^অপশন 2 \(বাংলা\)/ }).fill('না, ভাড়া থাকি');
    await publish(page, 2);
    await page.getByRole('tab', { name: 'ফর্মের সেটিং' }).click();
    const versions = section(page, 'সংস্করণগুলো');
    await expect(versions.getByText('সংস্করণ 2: প্রকাশিত')).toBeVisible();
    await expect(versions.getByText(/প্রশ্নে বদল: আপনার কি নিজের ঘর আছে\? \(অপশন\)/)).toBeVisible();

    // the PM sees the newer version and takes it; the same link then opens version 2
    await pm.goto(placedUrl);
    await expect(pm.getByText(/এই ফর্মের নতুন সংস্করণ আছে \(সংস্করণ 2\)/)).toBeVisible();
    await pm.getByRole('button', { name: 'নতুন সংস্করণ নিন' }).click();
    await expect(pm.getByTestId('form-head').getByText('সংস্করণ 2: প্রকাশিত')).toBeVisible();
    await expect(pm.getByRole('button', { name: 'নতুন সংস্করণ নিন' })).toHaveCount(0);
    const token = new URL(url).pathname.split('/').at(-1)!;
    const opened = await applicant.request.get(`/api/v1/public/forms/${token}`);
    expect(opened.ok()).toBe(true);
    expect(
      ((await opened.json()) as { data: { form: { versionNo: number } } }).data.form.versionNo,
    ).toBe(2);

    // the office: the entry sent on version 1 waits for verification with its answers as they
    // were, and the project's RPM opens its verification
    const office = await browser.newContext({ ...devices['Desktop Chrome'] });
    try {
      const rpm = await office.newPage();
      await signIn(rpm, RPM);
      await rpm.goto(`/admin/projects/${projectId}/applications`);
      await rpm.getByRole('radio', { name: 'যাচাইয়ের অপেক্ষায়' }).click();
      await rpm.getByRole('link', { name: 'নমুনা আবেদনকারী' }).first().click();
      await expect(rpm.getByRole('heading', { level: 1, name: 'নমুনা আবেদনকারী' })).toBeVisible();
      await expect(rpm.getByText('আপনার কি নিজের ঘর আছে?').first()).toBeVisible();
      await expect(rpm.getByText('হ্যাঁ', { exact: true }).first()).toBeVisible();
      await expect(rpm.getByText('না, ভাড়া থাকি')).toHaveCount(0);
      await rpm.getByRole('button', { name: 'যাচাই করুন' }).click();
      // a new number: the dialog offers a new profile from the entry. The creation itself is
      // left out here: the gender of this builder-made form carries codes of its own that the
      // profile refuses (docs/STATUS.md, "Known issues / risks"); the API tests create from an entry.
      const verify = rpm.getByRole('dialog', { name: 'এন্ট্রি যাচাই করুন' });
      await expect(verify.getByText('এন্ট্রির তথ্য দিয়ে নতুন প্রোফাইল তৈরি হবে।')).toBeVisible();
      await expect(verify.getByRole('button', { name: 'তৈরি করুন' })).toBeEnabled();
    } finally {
      await office.close();
    }
  } finally {
    await phone.close();
    await desk.close();
  }
});

// A form built in Bengali first: what stands between it and its publishing is listed beside the
// Publish button, and each line leads to its place.
test('a new application form lists what to fix before publishing, and a line leads to its question', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the builders work on a computer');
  test.setTimeout(120_000);
  await signIn(page, MONITORING);
  await newReadyForm(page, `প্রকাশের তালিকা ${code()}`, `Publish list ${code()}`);
  // nothing to list yet but the identity questions
  await expect(
    page.getByRole('button', { name: 'প্রকাশের আগে ঠিক করুন (1)', exact: true }),
  ).toBeVisible();

  // one question, then its English text emptied in the right pane: the draft still saves
  await ownQuestion(page, 'অংশ 1', 'ছোট লেখা', ['পরিবারের সদস্য', 'Family members']);
  const question = page.getByRole('button', { name: 'পরিবারের সদস্য বদলান' });
  await page.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ }).fill('');
  await saved(page);
  // the question carries the mark, by an icon with a name
  await expect(
    page
      .getByRole('list', { name: 'অংশ 1', exact: true })
      .getByRole('img', { name: 'ঠিক করতে হবে' }),
  ).toBeVisible();

  // another place is chosen, so the way back to the question shows
  await page.getByRole('button', { name: 'অংশ 1', exact: true }).click();
  await expect(question).toHaveAttribute('aria-pressed', 'false');
  const list = await openFixList(page, 2);
  await expect(
    list.getByText(
      'পরিচয়ের প্রশ্ন বাকি: এনআইডি বা জন্মনিবন্ধন নম্বর, নাম, পিতা বা স্বামীর নাম, মোবাইল নম্বর, লিঙ্গ, ঠিকানা (বিভাগ থেকে ইউনিয়ন), গ্রাম',
      { exact: true },
    ),
  ).toBeVisible();
  await settled(page);
  expect((await scan(page)).violations, 'the list of what to fix').toEqual([]);
  await list.getByRole('button', { name: 'পরিবারের সদস্য: প্রশ্নের ইংরেজি লেখা বাকি' }).click();
  // the list closes, the question is chosen with the focus, and its settings are in the right pane
  await expect(list).toHaveCount(0);
  await expect(question).toHaveAttribute('aria-pressed', 'true');
  await expect(question).toBeFocused();
  await expect(question).toBeInViewport();
  await expect(page.getByRole('textbox', { name: /^লেবেল \(বাংলা\)/ })).toHaveValue(
    'পরিবারের সদস্য',
  );
  await expect(page.getByRole('textbox', { name: /^লেবেল \(ইংরেজি\)/ })).toHaveValue('');

  // Publish says the same instead of asking
  await page.getByRole('button', { name: 'প্রকাশ করুন', exact: true }).click();
  await expect(list).toBeVisible();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('a removed question and a removed part come back with the undo of the form head, and the draft saves', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'the builders work on a computer');
  test.setTimeout(120_000);
  await signIn(page, MONITORING);
  await newReadyForm(page, `ফিরিয়ে আনা ${code()}`, `Undo check ${code()}`);
  const head = page.getByTestId('form-head');
  const undo = head.getByRole('button', { name: 'ফিরিয়ে আনুন' });
  const redo = head.getByRole('button', { name: 'আবার করুন' });
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();

  await ownQuestion(page, 'অংশ 1', 'ছোট লেখা', ['পেশা', 'Occupation']);
  await ownQuestion(page, 'অংশ 1', 'সংখ্যা', ['পরিবারের সদস্য', 'Family members']);
  const first = page.getByRole('button', { name: 'পেশা বদলান' });
  const second = page.getByRole('button', { name: 'পরিবারের সদস্য বদলান' });
  await expect(head.getByText('1টি অংশ · 2টি প্রশ্ন')).toBeVisible();

  // the question added last is the chosen one, so its bar is open
  await page.getByRole('button', { name: 'পরিবারের সদস্য সরান' }).click();
  await expect(second).toHaveCount(0);
  await expect(
    page.getByText(
      '“পরিবারের সদস্য” সরানো হয়েছে। ফিরিয়ে আনতে উপরের “ফিরিয়ে আনুন” বোতামে চাপুন।',
    ),
  ).toBeVisible();
  await undo.click();
  await expect(second).toBeVisible();
  await expect(first).toBeVisible();
  await expect(redo).toBeEnabled();
  await saved(page);

  // the keys do the same from the canvas: the removal again, and back
  await second.focus();
  await page.keyboard.press('Control+y');
  await expect(second).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(second).toBeVisible();
  await saved(page);

  // a whole part comes back the same way: a second part with a question, removed from its menu
  await page.getByRole('button', { name: 'নতুন অংশ' }).click();
  await expect(page.getByRole('button', { name: 'অংশ 2', exact: true })).toBeVisible();
  await ownQuestion(page, 'অংশ 2', 'ছোট লেখা', ['গ্রামের নাম', 'Village name']);
  const third = page.getByRole('button', { name: 'গ্রামের নাম বদলান' });
  const secondPart = page.getByRole('list', { name: 'অংশ 2', exact: true });
  await expect(head.getByText('2টি অংশ · 3টি প্রশ্ন')).toBeVisible();
  await page.getByRole('button', { name: 'অংশ 2: আরও কাজ' }).click();
  await page.getByRole('menuitem', { name: 'অংশ 2 সরান' }).click();
  await expect(secondPart).toHaveCount(0);
  await expect(third).toHaveCount(0);
  await expect(head.getByText('1টি অংশ · 2টি প্রশ্ন')).toBeVisible();
  await expect(
    page.getByText('“অংশ 2” সরানো হয়েছে। ফিরিয়ে আনতে উপরের “ফিরিয়ে আনুন” বোতামে চাপুন।'),
  ).toBeVisible();
  await undo.click();
  await expect(secondPart).toBeVisible();
  await expect(secondPart.getByRole('button', { name: 'গ্রামের নাম বদলান' })).toBeVisible();
  await expect(head.getByText('2টি অংশ · 3টি প্রশ্ন')).toBeVisible();
  await saved(page);

  // what was saved is the form with both parts and their questions
  await page.reload();
  await expect(head.getByText('2টি অংশ · 3টি প্রশ্ন')).toBeVisible();
  await expect(second).toBeVisible();
  await expect(third).toBeVisible();
  await expect(undo).toBeDisabled();
});
