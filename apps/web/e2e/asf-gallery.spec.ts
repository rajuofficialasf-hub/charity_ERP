import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The asf pieces built for the app (docs/architecture/ADR/ADR-016-asf-ui-system.md), in their
// dev-only gallery: every piece in both languages and both modes, at 360 px on the mobile project
// and 1280 px on the desktop project, with no sideways scroll and no axe violation, the colour
// contrast included. The desktop's light Bengali run keeps each piece's picture for the kit.
const PIECES = [
  'buttons',
  'states',
  'fields',
  'choices',
  'table',
  'progress',
  'people',
  'overlays',
  'lists',
];

test.beforeEach(async ({ page }, info) => {
  await page.setViewportSize(
    info.project.name === 'mobile' ? { width: 360, height: 640 } : { width: 1280, height: 800 },
  );
});

for (const lang of ['bn', 'en'] as const) {
  for (const mode of ['light', 'dark'] as const) {
    test(`shows every asf piece in ${lang}, ${mode}, readable and within the screen`, async ({
      page,
      baseURL,
    }, info) => {
      test.skip(
        info.project.name === 'iphone',
        'the phone layout is checked on the mobile project',
      );
      await page.context().addCookies([{ name: 'css_locale', value: lang, url: baseURL! }]);
      await page.addInitScript((chosen) => window.localStorage.setItem('asf-mode', chosen), mode);
      await page.goto('/dev/asf');
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('html')).toHaveAttribute('data-color-scheme', mode);
      for (const id of PIECES) await expect(page.locator(`[data-piece="${id}"]`)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      // the widest piece wider than the screen, named, when anything scrolls sideways
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-piece] *')]
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 3)
          .map(
            (element) =>
              `${element.closest('[data-piece]')?.getAttribute('data-piece')}: ${element.outerHTML.slice(0, 100)}`,
          ),
      );
      expect(wide).toEqual([]);

      const results = await new AxeBuilder({ page }).analyze();
      // each failing element with its markup and axe's reason, so the failure says what to fix
      expect(
        results.violations.flatMap((v) =>
          v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)} | ${n.failureSummary ?? ''}`),
        ),
      ).toEqual([]);

      if (info.project.name === 'desktop' && lang === 'bn' && mode === 'light')
        for (const id of PIECES)
          await page
            .locator(`[data-piece="${id}"]`)
            .screenshot({ path: info.outputPath(`asf-${id}.png`) });
    });
  }
}

test('opens the confirm dialog and asks for the reason before it confirms', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one project is enough for the overlay flow');
  await page.context().addCookies([{ name: 'css_locale', value: 'en', url: baseURL! }]);
  await page.goto('/dev/asf');
  await page.getByRole('button', { name: 'Reject application (confirmation)' }).click();
  const dialog = page.getByRole('alertdialog', {
    name: 'Reject the application of Rahima Khatun?',
  });
  await expect(dialog.getByRole('button', { name: 'Reject application' })).toBeDisabled();
  await dialog.getByRole('textbox', { name: 'Reason' }).fill('Income above the limit');
  await expect(dialog.getByRole('button', { name: 'Reject application' })).toBeEnabled();
  const results = await new AxeBuilder({ page }).include('[role="alertdialog"]').analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
