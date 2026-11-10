import { describe, it } from 'vitest';
import { meSchema, publicSettingsSchema, tokenPairSchema } from '../../src/api/schemas';
import { expectContract } from './support/expect';
import { call, contractBase, signIn } from './support/session';

// Signing in, refreshing, signing out and the public settings, as the app's client reads them.
describe.skipIf(!contractBase())('the session', () => {
  it('reads the public settings before anyone signs in', async () => {
    expectContract(await call(null, 'GET', '/public/settings'), 200, publicSettingsSchema);
  });

  it('signs in, refreshes and signs out as the app does', async () => {
    const caller = await signIn('CSS-001');
    tokenPairSchema.parse(caller.pair);
    meSchema.parse(caller.me);
    const csrf = caller.cookies.find((c) => c.startsWith('css_csrf='))?.split('=')[1] ?? '';
    const refreshed = expectContract(
      await call(caller, 'POST', '/auth/refresh', undefined, { 'X-CSRF-Token': csrf }),
      200,
      tokenPairSchema,
    );
    caller.token = refreshed.accessToken;
    const out = await call(caller, 'POST', '/auth/logout', {});
    if (out.status !== 204) throw new Error(`logout answered ${out.status}`);
  });
});
