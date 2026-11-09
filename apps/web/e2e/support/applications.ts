import { type APIRequestContext, type Browser, devices, expect, type Page } from '@playwright/test';
import { apiAs } from './admin';

// Shared steps of the specs that bring applications through the API (application-rules.spec.ts,
// media.spec.ts) against the demo seed (docs/testing/DEMO_ACCOUNTS.md).
type Api = Awaited<ReturnType<typeof apiAs>>;

/** A desktop page of its own for an official, closed whatever happens on it. */
export async function onDesk<T>(browser: Browser, work: (desk: Page) => Promise<T>): Promise<T> {
  const context = await browser.newContext({ ...devices['Desktop Chrome'] });
  try {
    return await work(await context.newPage());
  } finally {
    await context.close();
  }
}

/** The Savar union of Dhaka with its places above, as the address answer names them. */
export async function savar(api: Api) {
  const child = async (parentId: string | null, name: string) => {
    const res = await api.get(`/locations${parentId ? `?parentId=${parentId}` : ''}`);
    expect(res.ok()).toBe(true);
    const rows = ((await res.json()) as { data: { id: string; name: { bn: string } }[] }).data;
    const found = rows.find((r) => r.name.bn === name);
    expect(found, name).toBeDefined();
    return found!.id;
  };
  const division = await child(null, 'ঢাকা');
  const district = await child(division, 'ঢাকা');
  const upazila = await child(district, 'সাভার');
  const union = await child(upazila, 'সাভার');
  return { division, district, upazila, union };
}

/** The volunteer's id, by the mobile they sign in with. */
export async function volunteerId(head: Api, mobile: string) {
  const res = await head.get(`/volunteers?q=${mobile}`);
  expect(res.ok()).toBe(true);
  const [found] = ((await res.json()) as { data: { id: string }[] }).data;
  expect(found, mobile).toBeDefined();
  return found!.id;
}

/** The volunteer accepts the project's rules through the API, as the consent screen would. */
export async function consent(request: APIRequestContext, mobile: string, projectId: string) {
  const me = await apiAs(request, mobile);
  const detail = await me.get(`/me/projects/${projectId}`);
  expect(detail.ok()).toBe(true);
  const { data } = (await detail.json()) as {
    data: { rules: { version: number; parts: { part: string }[] } };
  };
  const res = await me.post(`/me/projects/${projectId}/consent`, {
    rulesVersion: data.rules.version,
    decision: 'accepted',
    parts: data.rules.parts.map((p) => p.part),
  });
  expect(res.ok(), 'the consent').toBe(true);
}

/** Moves an application with the version it has now. */
export async function act(
  api: Api,
  id: string,
  action: string,
  body: Record<string, unknown> = {},
) {
  const read = await api.get(`/applications/${id}`);
  const res = await api.post(`/applications/${id}/actions/${action}`, body, {
    'If-Match': read.headers()['etag'] ?? '',
  });
  expect(res.ok(), `${action}: ${await res.text()}`).toBe(true);
}
