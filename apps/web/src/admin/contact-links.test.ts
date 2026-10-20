import { describe, expect, it } from 'vitest';
import { mailLink, telLink } from './contact-links';

describe('the contact links of a profile', () => {
  it('dials only the digits and a leading plus of a number written with spaces or dashes', () => {
    expect(telLink('+880 1711-000201')).toBe('tel:+8801711000201');
    expect(telLink('01711000201;ext=9')).toBe('tel:017110002019');
  });

  it('encodes the address, so it adds no recipient, header or text of its own', () => {
    const link = mailLink('a@b.org?cc=x@evil.org&body=hi');
    expect(link).toBe('mailto:a%40b.org%3Fcc%3Dx%40evil.org%26body%3Dhi');
    expect(new URL(link).search).toBe('');
  });
});
