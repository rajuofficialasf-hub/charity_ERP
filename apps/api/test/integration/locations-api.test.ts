import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authHarness, type AuthHarness } from './support/auth-app.js';
import * as f from './support/fixtures.js';

// The public locations list for the registration form. One listening server with keep-alive fetch:
// hundreds of supertest connections are unstable on Windows (see authorization-matrix.test.ts).
let h: AuthHarness;
let server: Server;
let base: string;
let tree: Awaited<ReturnType<typeof f.locationTree>>;

beforeAll(async () => {
  h = await authHarness({ realRateLimits: true });
  tree = await f.locationTree(h.db);
  server = createServer(h.app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no address');
  base = `http://127.0.0.1:${address.port}/api/v1`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await h.close();
});

const list = async (parentId?: string) => {
  const res = await fetch(`${base}/locations${parentId ? `?parentId=${parentId}` : ''}`);
  return { status: res.status, body: (await res.json()) as { data: Record<string, unknown>[] } };
};

describe('GET /locations without a login', () => {
  it('lists active divisions with bilingual names when parentId is omitted', async () => {
    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.data).toContainEqual({
      id: tree.division,
      parentId: null,
      level: 'division',
      code: expect.any(String),
      name: { bn: 'বিভাগ', en: 'Division' },
      postCode: null,
      active: true,
    });
    expect(body.data.every((l) => l.level === 'division')).toBe(true);
  });

  it('walks the cascade division → district → upazila → union', async () => {
    expect((await list(tree.division)).body.data.map((l) => l.id)).toEqual([tree.district]);
    expect((await list(tree.district)).body.data.map((l) => l.id)).toEqual([tree.upazila]);
    expect((await list(tree.upazila)).body.data.map((l) => l.id)).toEqual([tree.union]);
    expect((await list(tree.union)).body.data).toEqual([]);
  });

  it('gives an empty list for an unknown parent and 422 for a malformed one', async () => {
    expect(await list(randomUUID())).toMatchObject({ status: 200, body: { data: [] } });
    expect((await fetch(`${base}/locations?parentId=dhaka`)).status).toBe(422);
  });

  it('gives the whole master in one answer with an ETag, and 304 for the same version', async () => {
    const first = await fetch(`${base}/locations/all`);
    expect(first.status).toBe(200);
    const etag = first.headers.get('etag');
    expect(etag).toMatch(/^"\d+\.[0-9a-z]+"$/);
    const body = (await first.json()) as { data: { id: string; level: string; active: boolean }[] };
    const ids = body.data.map((l) => l.id);
    for (const id of [tree.division, tree.district, tree.upazila, tree.union])
      expect(ids).toContain(id);
    expect(body.data.every((l) => l.active)).toBe(true);
    // top level first, so a phone can build the tree in one pass
    const levels = body.data.map((l) => l.level);
    expect(levels.indexOf('district')).toBeGreaterThan(levels.lastIndexOf('division'));
    expect(levels.indexOf('union')).toBeGreaterThan(levels.lastIndexOf('upazila'));
    const same = await fetch(`${base}/locations/all`, { headers: { 'If-None-Match': etag! } });
    expect(same.status).toBe(304);
    await f.locationTree(h.db);
    const changed = await fetch(`${base}/locations/all`, { headers: { 'If-None-Match': etag! } });
    expect(changed.status).toBe(200);
    const grown = changed.headers.get('etag');
    expect(grown).not.toBe(etag);
    // a rename moves the version too, as the loader bumps the row's version
    await h.db.query(
      `UPDATE locations SET name_en = 'Renamed', version = version + 1 WHERE id = $1`,
      [tree.union],
    );
    const renamed = await fetch(`${base}/locations/all`, { headers: { 'If-None-Match': grown! } });
    expect(renamed.status).toBe(200);
    expect(renamed.headers.get('etag')).not.toBe(grown);
  });

  it('leaves inactive locations out', async () => {
    await h.db.query('UPDATE locations SET active = false WHERE id = $1', [tree.union]);
    expect((await list(tree.upazila)).body.data).toEqual([]);
  });

  it('answers 429 after 300 calls per hour from one address', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 302; i += 1) statuses.push((await fetch(`${base}/locations`)).status);
    // earlier tests of this file may have used part of the window: at most 300 succeed in all
    expect(statuses.filter((s) => s === 200).length).toBeLessThanOrEqual(300);
    expect(statuses.at(-1)).toBe(429);
    const res = await fetch(`${base}/locations`);
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBeTruthy();
  });
});
