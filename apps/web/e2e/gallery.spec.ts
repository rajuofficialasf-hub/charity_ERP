import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Locator } from '@playwright/test';

// Dev-only component gallery (T1.4). The E2E build includes it (CSS_DEV_GALLERY=1); a normal
// production build does not. Every component is checked at 360x640 (mobile project) and
// 1280x800 (desktop project), in both languages.
const SECTIONS = [
  'type',
  'button',
  'badge',
  'card',
  'field',
  'select',
  'choice',
  'file',
  'form',
  'nav',
  'row',
  'table',
  'overlay',
  'alert',
  'tabs',
  'breadcrumb',
  'states',
  'offline',
  'bulk',
  'timeline',
  'progress',
  'misc',
];

/** The text a date field shows, without spaces and invisible marks. */
const shownDate = async (field: Locator) =>
  ((await field.textContent()) ?? '').replace(/[\s\u200b\u2066-\u2069]/g, '');

test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize(
    info.project.name === 'mobile' ? { width: 360, height: 640 } : { width: 1280, height: 800 },
  );
});

for (const lang of ['bn', 'en'] as const) {
  test.describe(`gallery (${lang})`, () => {
    test('renders every component without horizontal scroll or accessibility violations', async ({
      page,
      baseURL,
    }, info) => {
      await page.context().addCookies([{ name: 'css_locale', value: lang, url: baseURL! }]);
      await page.goto('/dev/components');
      await page.locator('[data-hydrated]').waitFor();
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      for (const id of SECTIONS) await expect(page.locator(`section#${id}`)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      const results = await new AxeBuilder({ page }).analyze();
      expect(
        results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(', ')}`),
      ).toEqual([]);

      await page.screenshot({
        path: info.outputPath(`gallery-${info.project.name}-${lang}.png`),
        fullPage: true,
      });
    });
  });
}

test.describe('gallery keyboard flows', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    await page.context().addCookies([{ name: 'css_locale', value: 'en', url: baseURL! }]);
    await page.goto('/dev/components');
    await page.locator('[data-hydrated]').waitFor();
  });

  test('modal traps focus, closes on Escape and returns focus', async ({ page }) => {
    const trigger = page.getByRole('button', { name: 'Unlock field (modal)' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Unlock the mobile number' });
    await expect(dialog).toBeVisible();
    for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    const axe = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(axe.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('confirm dialog needs a reason before the danger action', async ({ page }) => {
    await page.getByRole('button', { name: 'Reject application (confirmation)' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
    const confirm = dialog.getByRole('button', { name: 'Reject application' });
    await expect(confirm).toBeDisabled();
    await dialog.getByRole('textbox', { name: /Reason/ }).fill('Income above the limit');
    await confirm.click();
    await expect(page.getByTestId('confirm-result')).toContainText('Income above the limit');
  });

  test('tabs move with the arrow keys', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'arrow keys are a desktop keyboard flow');
    const list = page.getByRole('tablist', { name: 'Application details' });
    await list.getByRole('tab', { name: 'Answers' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(list.getByRole('tab', { name: /History/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('End');
    await expect(list.getByRole('tab', { name: 'Changes' })).toBeFocused();
  });

  test('combobox filters and selects with the keyboard', async ({ page }) => {
    const input = page.getByRole('combobox', { name: 'Upazila (combobox)' });
    await input.click();
    await input.pressSequentially('nil');
    await expect(page.getByRole('option', { name: 'Nilphamari' })).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('Nilphamari');
  });

  test('date picker opens the calendar and keeps dd-mm-yyyy with English digits', async ({
    page,
  }, info) => {
    const field = page.locator('#select .ui-date-group');
    await expect.poll(() => shownDate(field)).toBe('01-12-2026');
    await field.getByRole('button', { name: /Open calendar/ }).click();
    const grid = page.getByRole('grid', { name: /December 2026/ });
    await expect(grid).toBeVisible();
    if (info.project.name === 'mobile') {
      // on a phone the calendar is a bottom sheet
      const sheet = page.getByRole('dialog', { name: 'Distribution date' });
      await expect
        .poll(async () => {
          const box = await sheet.boundingBox();
          return box && Math.round(box.y + box.height);
        })
        .toBe(640);
    }
    await grid.getByRole('gridcell', { name: '15' }).click();
    await expect(grid).toBeHidden();
    await expect.poll(() => shownDate(field)).toBe('15-12-2026');
  });

  test('table sorts by a header and selects rows', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'the table becomes cards on phones');
    const table = page.getByRole('grid', { name: 'Applications' });
    await table.getByRole('columnheader', { name: /Name/ }).click();
    await expect(table.getByRole('columnheader', { name: /Name/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    // The native input is visually hidden; people press its label.
    await table
      .getByRole('checkbox', { name: /Select Ayesha Begum/ })
      .locator('xpath=ancestor::label')
      .click();
    await expect(page.getByTestId('table-state')).toContainText('Selected: 1');
  });

  test('phone cards select rows and open the filter sheet', async ({ page }, info) => {
    test.skip(info.project.name !== 'mobile', 'cards are the phone layout');
    const cards = page.getByRole('list', { name: 'Applications' });
    await cards
      .getByRole('checkbox', { name: /Select Karim Mia/ })
      .locator('xpath=ancestor::label')
      .click();
    await expect(page.getByTestId('table-state')).toContainText('Selected: 1');
    await page.getByRole('button', { name: 'Filters (1 active)' }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
  });
});

test('the language switch turns the gallery to English and back, and the choice persists (I18N 2)', async ({
  page,
}) => {
  await page.goto('/dev/components');
  await page.locator('[data-hydrated]').waitFor();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('কম্পোনেন্ট গ্যালারি');
  await page.getByRole('radio', { name: 'English' }).locator('xpath=ancestor::label').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Component gallery');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Component gallery');
  await page.getByRole('radio', { name: 'বাংলা' }).locator('xpath=ancestor::label').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'bn');
});

test('serves the self-hosted fonts with their licence texts (D-065)', async ({ request }) => {
  for (const file of [
    'UbuntuSans-derivative-CSSERP.woff2',
    'Bornomala-Regular.woff2',
    'Bornomala-Bold.woff2',
    'UbuntuSans-UFL-1.0-LICENCE.txt',
    'Bornomala-OFL-1.0-LICENSE.txt',
  ]) {
    const res = await request.get(`/fonts/${file}`);
    expect(res.ok(), file).toBe(true);
  }
});
