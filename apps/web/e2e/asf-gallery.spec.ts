import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The asf pieces built for the app (docs/architecture/ADR/ADR-016-asf-ui-system.md, "Decision"), in
// their dev-only gallery: every piece in both languages and both modes, at 360 px on the mobile
// project and 1280 px on the desktop project, with no sideways scroll and no axe violation, the
// colour contrast included, the dialog and the drawer open as well. The desktop's light Bengali run
// leaves a picture of each piece in its output folder; the pictures in docs/ui/asf-pieces/ are
// copied from there by hand when a piece changes.
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
  'cards',
  'additions',
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
      for (const id of PIECES) await expect(page.getByTestId(`piece-${id}`)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      // the page draws once before the stored mode applies, and the buttons ease their colours
      // into it: axe measures colours, so the eased changes must have ended (the spinner and the
      // loading shapes never end)
      await page.evaluate(() =>
        Promise.all(
          document
            .getAnimations()
            .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
            .map((animation) => animation.finished),
        ),
      );

      // the widest piece wider than the screen, named, when anything scrolls sideways
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-testid^="piece-"] *')]
          .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 3)
          .map(
            (element) =>
              `${element.closest('[data-testid^="piece-"]')?.getAttribute('data-testid')}: ${element.outerHTML.slice(0, 100)}`,
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

      // the dialog and the drawer open, each checked on its own
      const overlays = page.getByTestId('piece-overlays').getByRole('button');
      for (const index of [0, 2]) {
        await overlays.nth(index).click();
        const panel = page.getByRole('dialog');
        await expect(panel).toBeVisible();
        // axe measures colours: the panel's own slide and fade must have ended (the spinner and
        // the loading shapes elsewhere never end)
        await panel.evaluate((element) =>
          Promise.all(
            element
              .getAnimations({ subtree: true })
              .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
              .map((animation) => animation.finished),
          ),
        );
        const open = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
        expect(
          open.violations.flatMap((v) =>
            v.nodes.map((n) => `${v.id}: ${n.html.slice(0, 120)} | ${n.failureSummary ?? ''}`),
          ),
        ).toEqual([]);
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
      }

      if (info.project.name === 'desktop' && lang === 'bn' && mode === 'light') {
        // the pointer away from the pieces, so no flip card is caught turning in its picture
        await page.mouse.move(0, 0);
        for (const id of PIECES)
          await page
            .getByTestId(`piece-${id}`)
            .screenshot({ path: info.outputPath(`asf-${id}.png`) });
      }
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

test('turns the flip card by the pointer on a computer and by its buttons on a phone', async ({
  page,
  baseURL,
}, info) => {
  test.skip(info.project.name === 'iphone', 'the phone is checked on the mobile project');
  await page.context().addCookies([{ name: 'css_locale', value: 'bn', url: baseURL! }]);
  await page.goto('/dev/asf');
  const cards = page.getByTestId('piece-cards');
  await expect(cards).toBeVisible();
  const card = cards.getByRole('article', { name: 'স্বাবলম্বী প্রকল্প' });
  const back = card.getByRole('link', { name: 'সব প্রকল্প দেখুন' });
  await card.scrollIntoViewIfNeeded();
  await expect(back).toBeHidden();
  if (info.project.name === 'desktop') {
    // a computer: resting the pointer turns it, leaving turns it back
    await card.hover();
    await expect(card).toHaveAttribute('data-turned', 'true');
    await expect(back).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(card).toHaveAttribute('data-turned', 'false');
    await expect(back).toBeHidden();
  } else {
    // a phone at 360 px: the buttons turn it, and nothing runs past the screen's edge
    await card.getByRole('button', { name: 'স্বাবলম্বী প্রকল্প: বিস্তারিত দেখুন' }).click();
    await expect(card).toHaveAttribute('data-turned', 'true');
    await expect(back).toBeVisible();
    await card.getByRole('button', { name: 'সামনের দিকে ফিরুন' }).click();
    await expect(card).toHaveAttribute('data-turned', 'false');
    await expect(back).toBeHidden();
    const box = await card.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(360);
  }
});
