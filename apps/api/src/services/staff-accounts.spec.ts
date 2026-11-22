import { describe, expect, it } from 'vitest';
import { invitationLink } from './staff-accounts.js';

// The set-password link's address, shared by the admin's screen and the seed of the department's
// own officials: the token rides in the fragment, which the browser never sends to a server.
describe('invitationLink', () => {
  it('puts the token after the invite page, with or without a trailing slash on the origin', () => {
    expect(invitationLink('http://127.0.0.1:3000', 'abc')).toBe('http://127.0.0.1:3000/invite#abc');
    expect(invitationLink('https://erp.example.org/', 'abc')).toBe(
      'https://erp.example.org/invite#abc',
    );
  });
});
