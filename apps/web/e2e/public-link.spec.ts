import { expect, test } from '@playwright/test';
import { signIn } from './support/admin';
import { dayFromToday } from './support/forms';
import {
  code,
  finishSetup,
  newDraft,
  placeReadyForm,
  projectIdOf,
  section,
  UCD,
} from './support/projects';

// The project's public link moved from one form to another (docs/architecture/
// FILES_AND_DOCUMENTS.md, "Public photos", and docs/api/API_STANDARDS.md, the error-code
// catalogue): the PM switches it on for the first form, then on the second form's builder is
// asked first, the dialog naming the first form; once confirmed, the old link stops and the new
// one opens. Against the demo seed (docs/testing/DEMO_ACCOUNTS.md).
const PM = 'pm.ucd@example.org';

test.use({ actionTimeout: 20_000, navigationTimeout: 30_000 });

test('the public link moves to another form only after the PM confirms it', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'one PM, one project');
  test.setTimeout(180_000);
  await signIn(page, PM);
  await page.goto('/admin/projects');
  const name = `লিংক ${code()}`;
  await newDraft(page, code(), name, UCD, PM);
  const projectId = projectIdOf(page);
  const first = await placeReadyForm(page, PM, projectId);
  await finishSetup(page, { window: { from: dayFromToday(-1), to: dayFromToday(60) } });
  const second = await placeReadyForm(page, PM, projectId, undefined, 'second');

  /** The link's group of a form's builder, opened. */
  const linkOf = async (formId: string) => {
    await page.goto(`/admin/projects/${projectId}/forms/${formId}`);
    await page.getByRole('tab', { name: 'ফর্মের সেটিং' }).click();
    await page.getByRole('button', { name: 'পাবলিক আবেদনের লিংক', exact: true }).click();
    return section(page, 'পাবলিক আবেদনের লিংক');
  };
  const switchOf = async (link: ReturnType<typeof section>) => {
    const toggle = link.getByRole('switch', { name: 'এই ফর্মের জন্য পাবলিক লিংক চালু' });
    // the switch waits for the project's links to load; its input is hidden behind its track
    await expect(toggle).toBeEnabled({ timeout: 15_000 });
    await toggle.click({ force: true });
  };
  const live = (link: ReturnType<typeof section>) =>
    expect(link.getByText('লিংক চালু; এই ফর্মটি খোলে।')).toBeVisible({ timeout: 15_000 });

  let link = await linkOf(first);
  await switchOf(link);
  await live(link);
  const oldUrl = await link.getByRole('textbox', { name: 'আবেদনের লিংক' }).inputValue();

  link = await linkOf(second);
  await expect(link.getByText('লিংক চালু, তবে অন্য একটি ফর্ম খোলে।')).toBeVisible();
  await switchOf(link);
  const dialog = page.getByRole('alertdialog', { name: 'লিংক বদলাবেন?' });
  await expect(dialog).toContainText('"আবেদন"');
  await dialog.getByRole('button', { name: 'হ্যাঁ, লিংক বদলান' }).click();
  await live(link);
  const newUrl = await link.getByRole('textbox', { name: 'আবেদনের লিংক' }).inputValue();
  expect(newUrl).not.toBe(oldUrl);

  await page.goto(new URL(oldUrl).pathname);
  await expect(
    page.getByRole('heading', { level: 1, name: 'এই লিংকে এখন আবেদন নেওয়া হচ্ছে না' }),
  ).toBeVisible();
  await page.goto(new URL(newUrl).pathname);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
});
