import { expect, type Locator, type Page } from '@playwright/test';

/** Below the asf theme's `md` breakpoint a select is a sheet from the bottom. */
const isPhoneWidth = (page: Page) => (page.viewportSize()?.width ?? 1280) < 900;

/**
 * Opens a select and picks an option, the named one or the first. On a phone the select is a sheet
 * from the bottom, and the next level of an address opens by itself once the one above it is picked
 *, so a list already open is used as it is. While a sheet is open the rest of the page is
 * hidden from the accessibility tree, so the pick is followed by the list's own id: it is done when
 * that list has gone, whichever list opens after it.
 */
export async function pickFrom(page: Page, trigger: Locator, option?: string): Promise<void> {
  const open = page.getByRole('listbox');
  const opened =
    isPhoneWidth(page) &&
    (await expect(open)
      .toHaveCount(1, { timeout: 1_000 })
      .then(
        () => true,
        () => false,
      ));
  if (!opened) await trigger.click();
  // the newest list: a closing sheet is hidden from the accessibility tree behind the new one
  const list = open.last();
  await expect(list).toBeVisible();
  const listId = await list.getAttribute('id');
  await (
    option
      ? list.getByRole('option', { name: option, exact: true })
      : list.getByRole('option').first()
  ).click();
  if (listId) await expect(page.locator(`[id="${listId}"]`)).toHaveCount(0);
  else await expect(open).toHaveCount(0);
}

/**
 * A short choice of the form renderer on a phone is a row of buttons: a radio group named
 * by the question's label. Answers whether the question is drawn that way.
 */
export async function pickChoiceButton(page: Page, label: string, option: string) {
  const group = page.getByRole('radiogroup', { name: new RegExp(`^${label}`) });
  if (!(await group.count())) return false;
  const button = group.getByRole('radio', { name: option, exact: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-checked', 'true');
  return true;
}
