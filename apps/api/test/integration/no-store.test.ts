import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accessWorld } from './support/access-fixtures';
import { type Account, account, type AuthHarness, authHarness, login } from './support/auth-app';
import * as f from './support/fixtures';

// No browser or proxy keeps a signed-in answer (plan
// docs/plans/2026-10-14-1400-feat-volunteer-form-refine-plan.md, U5; R7).
let h: AuthHarness;
let world: Awaited<ReturnType<typeof accessWorld>>;
const accounts = new Map<string, Account>();
const api = () => request(h.server());

beforeAll(async () => {
  h = await authHarness();
  const make = (kind: 'staff' | 'volunteer') => async (role: string) => {
    const a = await account(h.db, { kind, role });
    accounts.set(a.id, a);
    return a.id;
  };
  world = await accessWorld(h.db, { staff: make('staff'), volunteerUser: make('volunteer') });
});
afterAll(async () => h.close());

describe('Cache-Control on the answers', () => {
  it('is no-store on the own profile, the own requests and the approver lists and details', async () => {
    const own = await account(h.db, { kind: 'volunteer', role: 'volunteer_general' });
    await f.volunteer(h.db, world.dhaka, own.id, { approved_at: new Date() });
    const mine = await login(h, own);
    // a registration waiting in the Dhaka area, for the approver's detail
    const waiting = await account(h.db, {
      kind: 'volunteer',
      role: 'volunteer_general',
      state: 'pending',
    });
    await f.volunteer(h.db, world.dhaka, waiting.id);
    const rpm = await login(h, accounts.get(world.users.rpmDhaka)!);
    const urls: [string, string][] = [
      [mine.accessToken, '/api/v1/volunteers/me'],
      [mine.accessToken, '/api/v1/me/change-requests'],
      [rpm.accessToken, '/api/v1/registrations'],
      [rpm.accessToken, `/api/v1/registrations/${waiting.id}`],
      [rpm.accessToken, '/api/v1/edit-requests'],
    ];
    for (const [token, url] of urls) {
      const res = await api().get(url).set('Authorization', `Bearer ${token}`);
      expect(res.status, url).toBe(200);
      expect(res.headers['cache-control'], url).toBe('no-store');
    }
  });

  it('is not set on a public answer such as the locations list', async () => {
    const res = await api().get('/api/v1/locations');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).not.toBe('no-store');
  });
});
