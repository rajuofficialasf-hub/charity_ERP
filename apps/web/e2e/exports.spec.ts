import { readFile } from 'node:fs/promises';
import { type Download, expect, type Locator, type Page, test } from '@playwright/test';
import { apiAs, isPhone, signIn } from './support/admin';
import { onDesk, savar } from './support/applications';
import { activeProject, code, IDENTITY_SECTION, question, UCD } from './support/projects';

// The export service end to end (docs/plans/2026-11-01-1011-feat-export-service-plan.md, the
// journeys): the Dhaka RPM exports the beneficiary list as Excel and a project's application list
// as CSV with a whole section of the form's questions, finds both in "My exports", and prints a
// beneficiary's profile as a PDF; the Project Executive and the Media Team are offered only the
// columns their view holds; a volunteer has no export and the API refuses one. The jobs run in the
// E2E export worker.
const RPM = 'rpm.dhaka@example.org';
const PM = 'pm.ucd@example.org';
const VOLUNTEER = '01700000106';
const MEDIA = 'media@example.org';
const EXECUTIVE = 'executive@example.org';
const READY = 'ডাউনলোড করুন';

/** A form of this run: the identity questions and a "family and income" part of two questions. */
const FAMILY = {
  key: 'family_income',
  librarySectionKey: null,
  title: { bn: 'পরিবার ও আয়', en: 'Family and income' },
  visibility: 'volunteer',
  condition: null,
  fields: [
    question('q_members', 'number', {
      label: { bn: 'পরিবারের সদস্য', en: 'Family members' },
      required: false,
    }),
    question('q_income', 'number', {
      label: { bn: 'মাসিক আয়', en: 'Monthly income' },
      required: false,
    }),
  ],
};

/** Starts the export of the open dialog and saves its file once the job is done. */
async function exported(page: Page, dialog: Locator): Promise<Download> {
  await dialog.getByRole('button', { name: 'এক্সপোর্ট শুরু করুন' }).click();
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await page.getByRole('button', { name: READY }).click({ timeout: 90_000 });
  return download;
}

/** The text of a saved download. */
async function textOf(download: Download): Promise<string> {
  return readFile((await download.path())!, 'utf8');
}

test.describe('the export service', () => {
  test('exports the lists as Excel and CSV, finds them in My exports, and fits a 360 px phone', async ({
    page,
    browser,
  }, info) => {
    test.setTimeout(300_000);
    // a project of this run with the family part in its form; its RPM is the Dhaka RPM
    const projectId = await onDesk(browser, async (desk) => {
      await signIn(desk, PM);
      await desk.goto('/admin/projects');
      return activeProject(desk, `এক্সপোর্ট ${code()}`, UCD, PM, [IDENTITY_SECTION, FAMILY]);
    });
    if (isPhone(info)) await page.setViewportSize({ width: 360, height: 780 });
    await signIn(page, RPM);

    // the beneficiary list as Excel, with the on-screen columns ticked and one more added
    await page.goto('/admin/beneficiaries');
    await page.getByRole('button', { name: 'এক্সপোর্ট', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'এক্সপোর্ট: উপকারভোগীর তালিকা' });
    await expect(dialog.getByRole('checkbox', { name: 'নাম', exact: true })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'BEN নম্বর' })).toBeChecked();
    const mobile = dialog.getByRole('checkbox', { name: 'মোবাইল' });
    await expect(mobile).not.toBeChecked();
    // a person presses the words: the native box is visually hidden behind the drawn one
    await dialog.getByText('মোবাইল', { exact: true }).click();
    await expect(mobile).toBeChecked();
    await dialog.getByText('Excel', { exact: true }).click();
    // the dialog fits the phone: nothing scrolls sideways
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
      ),
    ).toBe(true);
    const workbook = await exported(page, dialog);
    expect(workbook.suggestedFilename()).toMatch(/^beneficiaries-\d{4}-\d{2}-\d{2}\.xlsx$/);
    // the footer's close, not the header's
    await page.getByRole('button', { name: 'বন্ধ করুন' }).last().click();

    // the application list as CSV, with the whole family part of the form
    await page.goto(`/admin/projects/${projectId}/applications`);
    await page.getByRole('button', { name: 'এক্সপোর্ট', exact: true }).click();
    const listDialog = page.getByRole('dialog', { name: 'এক্সপোর্ট: আবেদনের তালিকা' });
    await listDialog.getByText('CSV', { exact: true }).click();
    await expect(listDialog.getByRole('radio', { name: 'CSV' })).toBeChecked();
    await listDialog.getByText('পুরো অংশ বাছুন: পরিবার ও আয়', { exact: true }).click();
    await expect(
      listDialog.getByRole('checkbox', { name: 'পুরো অংশ বাছুন: পরিবার ও আয়' }),
    ).toBeChecked();
    const csv = await exported(page, listDialog);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
    const text = await textOf(csv);
    // the byte-order mark keeps Bengali intact in Excel, and the questions are columns
    expect(text.charCodeAt(0)).toBe(0xfeff);
    const header = text.slice(1).split('\r\n')[0]!;
    expect(header).toContain('আবেদন নম্বর');
    expect(header).toContain('পরিবারের সদস্য');
    expect(header).toContain('মাসিক আয়');
    // the footer's close, not the header's
    await page.getByRole('button', { name: 'বন্ধ করুন' }).last().click();

    // both wait in My exports, ready
    await page.goto('/account/exports');
    const rows = page.getByRole('listitem');
    await expect(rows.filter({ hasText: 'উপকারভোগীর তালিকা' }).first()).toContainText('তৈরি');
    await expect(rows.filter({ hasText: 'আবেদনের তালিকা' }).first()).toContainText('তৈরি');
  });

  test('prints a beneficiary’s profile as a PDF', async ({ page, request }) => {
    test.setTimeout(180_000);
    // a person of the RPM's own region, which the journey report reaches
    const rpm = await apiAs(request, RPM);
    const { division } = await savar(rpm);
    const list = await rpm.get(`/beneficiaries?divisionId=${division}&limit=1`);
    expect(list.ok()).toBe(true);
    const [person] = ((await list.json()) as { data: { id: string }[] }).data;
    expect(person).toBeDefined();
    await signIn(page, RPM);
    await page.goto(`/admin/beneficiaries/${person!.id}`);
    await page.getByRole('button', { name: 'PDF নামান' }).click();
    const download = page.waitForEvent('download', { timeout: 90_000 });
    await page.getByRole('button', { name: READY }).click({ timeout: 90_000 });
    const pdf = await download;
    expect(pdf.suggestedFilename()).toMatch(/^beneficiary_profile-.*\.pdf$/);
    const bytes = await readFile((await pdf.path())!);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  test('offers each role only the columns it may export', async ({ page, request }) => {
    const columnsOf = async (who: string) => {
      const api = await apiAs(request, who);
      const res = await api.get('/exports/columns?list=beneficiaries');
      expect(res.ok(), await res.text()).toBe(true);
      return ((await res.json()) as { data: { columns: { id: string }[] } }).data.columns.map(
        (c) => c.id,
      );
    };
    const rpm = await columnsOf(RPM);
    expect(rpm).toEqual(expect.arrayContaining(['name', 'nid', 'mobile']));
    const executive = await columnsOf(EXECUTIVE);
    expect(executive).toContain('name');
    expect(executive).not.toContain('nid');
    // the Media Team: the name and the area of its limited view, no contact and no identity
    const media = await columnsOf(MEDIA);
    expect(media).toContain('name');
    expect(media).not.toContain('nid');
    expect(media).not.toContain('mobile');
    const refused = await (
      await apiAs(request, MEDIA)
    ).post('/exports', {
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name', 'mobile'],
      filters: {},
    });
    expect(refused.status(), await refused.text()).toBe(403);
    await signIn(page, MEDIA);
    await page.goto('/admin/beneficiaries');
    await expect(page.getByRole('button', { name: 'এক্সপোর্ট', exact: true })).toBeVisible();
  });

  test('offers a volunteer no export, and the API refuses one', async ({ page, request }) => {
    const volunteer = await apiAs(request, VOLUNTEER);
    const refused = await volunteer.post('/exports', {
      kind: 'beneficiaries',
      format: 'csv',
      columns: ['name'],
      filters: {},
    });
    expect(refused.status()).toBe(403);
    await signIn(page, VOLUNTEER);
    await page.goto('/admin/beneficiaries');
    await expect(page.getByText('এই পাতায় আপনার প্রবেশাধিকার নেই।')).toBeVisible();
    await expect(page.getByRole('button', { name: 'এক্সপোর্ট', exact: true })).toHaveCount(0);
  });
});
