import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../i18n/api-error';
import { FilesystemStorage } from './filesystem-storage';
import { urlTtl } from './storage';

const SECRET = 'storage-test-secret-0123456789abcdef';

describe('FilesystemStorage (ADR-005, test adapter)', () => {
  it('stores, reads and describes objects', async () => {
    const storage = new FilesystemStorage(mkdtempSync(join(tmpdir(), 'css-fs-')), SECRET);
    await storage.put('photos', 'projects/p1/a1/photo.jpg', Buffer.from('jpeg bytes'), {
      contentType: 'image/jpeg',
    });
    expect(await storage.stat('photos', 'projects/p1/a1/photo.jpg')).toEqual({
      size: 10,
      contentType: 'image/jpeg',
    });
    expect(await text(await storage.get('photos', 'projects/p1/a1/photo.jpg'))).toBe('jpeg bytes');
    expect(await storage.stat('photos', 'projects/p1/a1/missing.jpg')).toBeNull();
    expect(await storage.ping()).toBe(true);
  });

  it('signs URLs that verify until they expire and refuses tampering', async () => {
    let now = Date.UTC(2026, 9, 11, 6);
    const storage = new FilesystemStorage(
      mkdtempSync(join(tmpdir(), 'css-fs-')),
      SECRET,
      () => now,
    );
    const { url, expiresAt } = await storage.presignGet('vouchers', 'v/1.pdf', 60);
    expect(expiresAt.getTime()).toBe(now + 60_000);
    expect(storage.verify(url)).toBe(true);
    expect(storage.verify(url.replace('v/1.pdf', 'v/2.pdf'))).toBe(false);
    expect(storage.verify(url.replace('method=GET', 'method=PUT'))).toBe(false);
    now += 61_000;
    expect(storage.verify(url)).toBe(false);
  });

  it('refuses keys that escape the bucket and lifetimes above 15 minutes (NFR-28)', async () => {
    const storage = new FilesystemStorage(mkdtempSync(join(tmpdir(), 'css-fs-')), SECRET);
    await expect(
      storage.put('photos', '../etc/passwd', Buffer.from('x'), { contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(storage.presignGet('photos', 'a//b')).rejects.toBeInstanceOf(ApiError);
    expect(() => urlTtl(901)).toThrow(/NFR-28/);
    expect(urlTtl()).toBe(900);
  });
});
