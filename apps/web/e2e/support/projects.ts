import { expect, type Locator, type Page, request as apiRequest } from '@playwright/test';
import { apiAs } from './admin';

// Shared steps of the project specs (projects.spec.ts, assignment.spec.ts) against the demo seed
// (docs/testing/DEMO_ACCOUNTS.md).
export const UCD = 'আন্ডারপ্রিভিলেজড কমিউনিটি ডেভেলপমেন্ট প্রোগ্রাম (UCD)';
export const ERR = 'ইমার্জেন্সি রেসপন্স অ্যান্ড রিহ্যাবিলিটেশন প্রোগ্রাম (ERR)';

/** A project code of its own for this run: E and three random capital letters. */
export const code = () =>
  `E${Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('')}`;

export const section = (page: Page, name: string): Locator => page.getByRole('region', { name });
/** The state badge beside the project's name. */
export const state = (page: Page, badge: string): Locator =>
  page.locator('.admin-title-row').getByText(badge, { exact: true });
export const next = (page: Page) => page.getByRole('button', { name: 'পরের ধাপ' });

/** Picks an option of a Select inside a part of the page. */
export async function chooseIn(page: Page, scope: Locator, label: string, option: string) {
  // the name is the value, then the label, then "(আবশ্যক)" for a required field
  await scope.getByRole('button', { name: new RegExp(`\\s${label}( \\(আবশ্যক\\))?$`) }).click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

/** The first step of the wizard: Next creates the draft and opens the components step. */
export async function newDraft(page: Page, projectCode: string, name: string, program = UCD) {
  await page.getByRole('button', { name: 'নতুন প্রকল্প' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'নতুন প্রকল্প' })).toBeVisible();
  const basics = section(page, 'মৌলিক তথ্য');
  await basics.getByRole('textbox', { name: /প্রকল্প কোড/ }).fill(projectCode);
  await basics.getByRole('textbox', { name: /বাংলায় নাম/ }).fill(name);
  await basics.getByRole('textbox', { name: /ইংরেজিতে নাম/ }).fill(`${name} EN`);
  await basics.getByRole('textbox', { name: /বছর/ }).fill('2026');
  await chooseIn(page, basics, 'প্রোগ্রাম', program);
  await chooseIn(page, basics, 'ওয়ার্কফ্লো', 'বিতরণ');
  await next(page).click();
  await expect(page.getByRole('heading', { level: 1, name: `সেটআপ: ${name}` })).toBeVisible();
  await expect(page).toHaveURL(/step=components/);
  await expect(state(page, 'খসড়া')).toBeVisible();
}

/** The three rules texts a project without dawah needs, in both languages. */
export async function writeRules(page: Page) {
  const rules = section(page, 'নিয়মাবলি');
  for (const part of [
    'স্বেচ্ছাসেবকের দায়িত্ব',
    'বাস্তবায়ন প্রক্রিয়া',
    'অনিয়মের ক্ষেত্রে ব্যবস্থা',
  ]) {
    await rules
      .getByRole('textbox', { name: new RegExp(`^${part} \\(বাংলা\\)`) })
      .fill(`${part}: পরীক্ষা`);
    await rules
      .getByRole('textbox', { name: new RegExp(`^${part} \\(ইংরেজি\\)`) })
      .fill(`${part}: test`);
  }
}

/** Types a date into the segments of a date field (dd-mm-yyyy). */
export async function typeDate(page: Page, scope: Locator, label: string, ddmmyyyy: string) {
  await scope.getByRole('group', { name: label }).getByRole('spinbutton').first().click();
  await page.keyboard.type(ddmmyyyy);
}

/** The Monitoring Team's demo account, who builds the ready forms. */
const MONITORING = 'monitoring@example.org';

/** A question of a form built through the API; `extra` overrides the label, the options or the column. */
export const question = (fieldKey: string, type: string, extra: Record<string, unknown> = {}) => ({
  fieldKey,
  libraryFieldKey: null,
  type,
  label: { bn: 'প্রশ্ন', en: 'Question' },
  required: true,
  standardColumn: null,
  settings: {},
  options: [],
  ...extra,
});
/** An option of a choice question, labelled by its code unless given. */
export const choice = (
  code: string,
  label: { bn: string; en: string } = { bn: code, en: code },
) => ({
  code,
  label,
  dependsOnOptionCode: null,
  allowsOtherText: false,
});
/** One section with the seven identity questions, each marked by its column. */
export const IDENTITY_SECTION = {
  key: 'section_1',
  librarySectionKey: null,
  title: { bn: 'পরিচয়', en: 'Identity' },
  visibility: 'volunteer',
  condition: null,
  fields: [
    question('q_id', 'short_text', { standardColumn: 'nid_or_birth_reg' }),
    question('q_name', 'short_text', { standardColumn: 'name' }),
    question('q_father', 'short_text', { standardColumn: 'father_or_husband_name' }),
    question('q_mobile', 'phone', { standardColumn: 'mobile' }),
    question('q_gender', 'single_select', {
      standardColumn: 'gender_code',
      options: [choice('male'), choice('female')],
    }),
    question('q_address', 'bd_address', {
      standardColumn: 'division_id,district_id,upazila_id,union_id',
    }),
    question('q_village', 'short_text', { standardColumn: 'village' }),
  ],
};

/**
 * The application form of a project, published: a ready form built and published by the
 * Monitoring Team through the API, then placed on the project by `loginId`, the person signed in
 * on the page; activation needs it. Journeys that are not about forms use this; the form
 * builder's own journey builds and publishes its form on the screen.
 */
export async function placeReadyForm(
  page: Page,
  loginId: string,
  projectId: string,
  sections: unknown[] = [IDENTITY_SECTION],
) {
  const context = await apiRequest.newContext({ baseURL: new URL(page.url()).origin });
  try {
    const builder = await apiAs(context, MONITORING);
    const made = await builder.post('/ready-forms', {
      key: `e2e_${code().toLowerCase()}`,
      title: { bn: 'আবেদন', en: 'Application' },
      kind: 'beneficiary_application',
      source: { kind: 'blank' },
    });
    expect(made.ok(), await made.text()).toBe(true);
    const ready = ((await made.json()) as { data: { id: string; draftVersionId: string } }).data;
    const etag = async () =>
      (await builder.get(`/form-versions/${ready.draftVersionId}`)).headers()['etag'] ?? '';
    const saved = await builder.patch(
      `/form-versions/${ready.draftVersionId}`,
      { sections },
      { 'If-Match': await etag() },
    );
    expect(saved.ok(), await saved.text()).toBe(true);
    const published = await builder.post(
      `/form-versions/${ready.draftVersionId}/publish`,
      undefined,
      {
        'If-Match': await etag(),
      },
    );
    expect(published.ok(), await published.text()).toBe(true);
    const placer = await apiAs(context, loginId);
    const placed = await placer.post(`/projects/${projectId}/forms/place`, {
      readyFormId: ready.id,
      key: 'default',
    });
    expect(placed.ok(), await placed.text()).toBe(true);
  } finally {
    await context.dispose();
  }
}

/** The project id in the address of a project page. */
export function projectIdOf(page: Page): string {
  const id = /projects\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  expect(id).toBeTruthy();
  return id!;
}

/**
 * A project made active through the wizard from the project list: a group photo, a budget of
 * 100 × 1000 from zakat, a window, a limit of 50, the Dhaka division with its RPM, the rules and
 * the application form published through the API by `loginId`, the person signed in.
 * Returns the project's id.
 */
export async function activeProject(
  page: Page,
  name: string,
  program: string,
  loginId: string,
  sections?: unknown[],
  setup?: SetupOptions,
): Promise<string> {
  await newDraft(page, code(), name, program);
  await placeReadyForm(page, loginId, projectIdOf(page), sections);
  return finishSetup(page, setup);
}

/** What the rest of the wizard may vary: the application window (ddmmyyyy) and the fund source. */
export interface SetupOptions {
  /** November and December 2026 unless given. */
  window?: { from: string; to: string };
  /** Zakat unless given; a zakat project needs the zakat decision of T2.6 before an approval. */
  fundSource?: string;
}

/**
 * The rest of the wizard from its components step, then the activation: a group photo, a budget
 * of 100 × 1000 from one fund source, the window, a limit of 50, the Dhaka division with its RPM
 * and the rules. The project needs its published form already. Returns the project's id.
 */
export async function finishSetup(page: Page, setup: SetupOptions = {}): Promise<string> {
  const window = setup.window ?? { from: '01112026', to: '31122026' };
  await page.getByRole('button', { name: 'বিতরণ ও ছবি-এর সেটিংস' }).click();
  const drawer = page.getByRole('dialog');
  await drawer.getByText('শুধু দলের ছবি', { exact: true }).click();
  await drawer.getByRole('button', { name: 'সংরক্ষণ' }).click();
  await expect(drawer).toHaveCount(0);
  await next(page).click();
  const budget = section(page, 'বাজেট ও তহবিলের উৎস');
  await budget.getByRole('textbox', { name: /প্রতিজনের খরচ/ }).fill('1000');
  await budget.getByRole('textbox', { name: /লক্ষ্য/ }).fill('100');
  await budget.getByRole('button', { name: 'তহবিলের উৎস যোগ করুন' }).click();
  await chooseIn(page, budget, 'তহবিলের উৎস', setup.fundSource ?? 'যাকাত');
  await budget.getByRole('textbox', { name: /পরিমাণ/ }).fill('100000');
  await next(page).click();
  const dates = section(page, 'আবেদনের সময়সীমা ও সীমা');
  await typeDate(page, dates, 'আবেদন শুরু', window.from);
  await typeDate(page, dates, 'আবেদনের শেষ তারিখ', window.to);
  await dates.getByRole('textbox', { name: /আবেদন সীমা/ }).fill('50');
  await next(page).click();
  const areas = section(page, 'এলাকা ও আরপিএম');
  await chooseIn(page, areas, 'বিভাগ', 'ঢাকা');
  const rpm = areas.getByRole('combobox', { name: /আরপিএম/ });
  await rpm.fill('আরপিএম ঢাকা');
  await expect(page.getByRole('option', { name: /^আরপিএম ঢাকা/ }).first()).toBeVisible();
  // chosen with the keyboard: a list that redraws while it loads never stops a key press
  await rpm.press('ArrowDown');
  await rpm.press('Enter');
  await expect(rpm).toHaveValue(/আরপিএম ঢাকা/);
  await next(page).click();
  await expect(section(page, 'স্টাফের অ্যাক্সেস')).toBeVisible();
  await page
    .getByRole('list', { name: 'সেটআপের ধাপ' })
    .getByRole('button', { name: /^নিয়মাবলি/ })
    .click();
  await writeRules(page);
  await next(page).click();
  await expect(page.getByText('সক্রিয় করার জন্য দরকারি সব আছে।')).toBeVisible();
  await page.getByRole('button', { name: 'সক্রিয় করুন', exact: true }).click();
  await expect(page.getByText('প্রকল্প সক্রিয় হয়েছে।')).toBeVisible();
  const id = /\/admin\/projects\/([0-9a-f-]{36})/.exec(page.url())?.[1];
  if (!id) throw new Error(`no project id in ${page.url()}`);
  return id;
}
