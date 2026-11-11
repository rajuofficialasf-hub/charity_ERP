import { describe, expect, it } from 'vitest';
import { encodeLocalKey, newLocalKey, openLocalKey, sealLocalKey } from './local-key.js';

const SECRET = 's'.repeat(40);
const OTHER = 'o'.repeat(40);
const SESSION = '019a2c3e-7b1d-7c2a-9b1e-2d3f4a5b6c7d';
const ANOTHER = '019a2c3e-7b1d-7c2a-9b1e-2d3f4a5b6c7e';

describe('the device key of a session', () => {
  it('is 32 random bytes, told to the phone as base64url', () => {
    const key = newLocalKey();
    expect(key).toHaveLength(32);
    expect(encodeLocalKey(key)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newLocalKey().equals(key)).toBe(false);
  });

  it('opens again only with the same secret, for the same session', () => {
    const key = newLocalKey();
    const sealed = sealLocalKey(key, SESSION, SECRET);
    expect(Buffer.from(sealed).equals(key)).toBe(false);
    expect(openLocalKey(sealed, SESSION, [SECRET])!.equals(key)).toBe(true);
    expect(openLocalKey(sealed, ANOTHER, [SECRET])).toBeNull();
    expect(openLocalKey(sealed, SESSION, [OTHER])).toBeNull();
  });

  it('opens with the previous secret while a rotation is under way', () => {
    const key = newLocalKey();
    const sealed = sealLocalKey(key, SESSION, OTHER);
    expect(openLocalKey(sealed, SESSION, [SECRET, OTHER])!.equals(key)).toBe(true);
  });

  it('seals the same key differently each time', () => {
    const key = newLocalKey();
    expect(
      Buffer.from(sealLocalKey(key, SESSION, SECRET)).equals(
        Buffer.from(sealLocalKey(key, SESSION, SECRET)),
      ),
    ).toBe(false);
  });
});
