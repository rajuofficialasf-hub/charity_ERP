// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  fromBase64Url,
  importDataKey,
  importDeviceKey,
  newDeviceBoundKey,
  newKeyBytes,
  open,
  openJson,
  seal,
  sealJson,
  unwrapKey,
  wrapKey,
} from './crypto';

const DEVICE_KEY = 'k'.repeat(43);

describe('the store cryptography', () => {
  it('seals and opens a value, with a fresh IV every time', async () => {
    const key = await importDataKey(newKeyBytes());
    const first = await sealJson(key, { nid: '1234567890', name: 'নমুনা' });
    const second = await sealJson(key, { nid: '1234567890', name: 'নমুনা' });
    expect(first.iv).not.toEqual(second.iv);
    expect(new TextDecoder().decode(first.data)).not.toContain('1234567890');
    expect(await openJson(key, first)).toEqual({ nid: '1234567890', name: 'নমুনা' });
  });

  it('refuses a wrong key and a changed byte', async () => {
    const key = await importDataKey(newKeyBytes());
    const other = await importDataKey(newKeyBytes());
    const sealed = await seal(key, new TextEncoder().encode('secret'));
    await expect(open(other, sealed)).rejects.toThrow();
    const tampered = new Uint8Array(sealed.data.slice(0));
    tampered[0] = tampered[0]! ^ 1;
    await expect(open(key, { iv: sealed.iv, data: tampered.buffer })).rejects.toThrow();
  });

  it('never lets the working data key out', async () => {
    const key = await importDataKey(newKeyBytes());
    expect(key.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey('raw', key)).rejects.toThrow();
    expect((await newDeviceBoundKey()).extractable).toBe(false);
  });

  it('wraps the data key under the device key and under the device-bound key', async () => {
    const raw = newKeyBytes();
    const server = await importDeviceKey(DEVICE_KEY);
    const bound = await newDeviceBoundKey();
    const byServer = await wrapKey(server, raw);
    const byDevice = await wrapKey(bound, raw);
    expect(await unwrapKey(server, byServer)).toEqual(raw);
    expect(await unwrapKey(bound, byDevice)).toEqual(raw);
    await expect(unwrapKey(bound, byServer)).rejects.toThrow();
    await expect(unwrapKey(await importDeviceKey('j'.repeat(43)), byServer)).rejects.toThrow();
  });

  it('reads a base64url key of 32 bytes', () => {
    expect(fromBase64Url(DEVICE_KEY)).toHaveLength(32);
    expect(fromBase64Url('AQID')).toEqual(new Uint8Array([1, 2, 3]));
  });
});
