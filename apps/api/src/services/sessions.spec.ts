import { describe, expect, it } from 'vitest';
import { ipHintOf } from './sessions.js';

describe("a device's network", () => {
  it('drops the last part of an IPv4 address and all but three groups of an IPv6 one', () => {
    expect(ipHintOf('203.0.113.45')).toBe('203.0.113.x');
    expect(ipHintOf('::ffff:198.51.100.7')).toBe('198.51.100.x');
    expect(ipHintOf('203.0.113.45/32')).toBe('203.0.113.x');
    expect(ipHintOf('2001:db8:85a3:0:0:8a2e:370:7334')).toBe('2001:db8:85a3:…');
    expect(ipHintOf('2001:db8::1')).toBe('2001:db8:0:…');
  });

  it('says nothing without an address or for one it cannot read', () => {
    expect(ipHintOf(null)).toBeNull();
    expect(ipHintOf('')).toBeNull();
    expect(ipHintOf('not an address')).toBeNull();
  });
});
