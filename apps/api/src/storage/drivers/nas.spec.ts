import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../i18n/api-error';
import { NotFoundError } from '../types';
import { createNasDriver } from './nas';

const tempRoot = () => mkdtempSync(join(tmpdir(), 'css-nas-'));
const fresh = () => createNasDriver(tempRoot());
const body = (s: string) => Readable.from([Buffer.from(s)]);

/** A link to a folder; a junction on Windows, which needs no extra rights there. */
function linkFolder(target: string, link: string): void {
  symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

describe('NAS storage driver', () => {
  it('stores a stream, reads it back, describes and removes it', async () => {
    const storage = fresh();
    expect(storage.name).toBe('nas');
    await storage.put('photos', 'projects/p1/a1/photo.jpg', body('jpeg bytes'), {
      contentType: 'image/jpeg',
    });
    expect(await storage.stat('photos', 'projects/p1/a1/photo.jpg')).toEqual({
      size: 10,
      contentType: 'image/jpeg',
    });
    expect(await text(await storage.get('photos', 'projects/p1/a1/photo.jpg'))).toBe('jpeg bytes');
    expect(await storage.stat('photos', 'projects/p1/a1/missing.jpg')).toBeNull();
    await storage.remove('photos', 'projects/p1/a1/photo.jpg');
    expect(await storage.stat('photos', 'projects/p1/a1/photo.jpg')).toBeNull();
    await expect(storage.remove('photos', 'projects/p1/a1/photo.jpg')).resolves.toBeUndefined();
  });

  it('throws NotFoundError for a missing key', async () => {
    await expect(fresh().get('vouchers', 'v/1.pdf')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('leaves no partial object when the upload stream fails', async () => {
    const storage = fresh();
    const failing = new Readable({
      read() {
        this.push(Buffer.from('partial'));
        this.destroy(new Error('connection lost'));
      },
    });
    await expect(
      storage.put('photos', 'p/1.jpg', failing, { contentType: 'image/jpeg' }),
    ).rejects.toThrow('connection lost');
    expect(await storage.stat('photos', 'p/1.jpg')).toBeNull();
    await expect(storage.get('photos', 'p/1.jpg')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('keeps two writes of one key apart, so a retried upload part never cuts the first short', async () => {
    const storage = fresh();
    const slow = new Readable({ read() {} });
    const first = storage.put('uploads', 's/1', slow, { contentType: 'application/octet-stream' });
    slow.push(Buffer.from('aaaa'));
    await new Promise((r) => setTimeout(r, 20));
    await storage.put('uploads', 's/1', body('bbbbbbbb'), {
      contentType: 'application/octet-stream',
    });
    slow.push(Buffer.from('aaaa'));
    slow.push(null);
    await first;
    const stored = await text(await storage.get('uploads', 's/1'));
    expect(['aaaaaaaa', 'bbbbbbbb']).toContain(stored);
  });

  it('describes an object whose content type file is missing instead of calling it gone', async () => {
    const root = tempRoot();
    const storage = createNasDriver(root);
    await storage.put('photos', 'a.jpg', body('jpeg'), { contentType: 'image/jpeg' });
    rmSync(join(root, 'photos', 'a.jpg.meta.json'));
    expect(await storage.stat('photos', 'a.jpg')).toEqual({ size: 4, contentType: undefined });
  });

  it('refuses keys that escape the bucket or collide with its own files', async () => {
    const storage = fresh();
    await expect(
      storage.put('photos', 'x.meta.json', body('x'), { contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(
      storage.put('photos', '../etc/passwd', body('x'), { contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(storage.get('photos', 'a//b')).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses a bucket name that would lead out of the root', async () => {
    const storage = fresh();
    await expect(
      storage.put('../../outside' as never, 'k.txt', body('x'), { contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('refuses every operation through a folder that links out of the root', async () => {
    const root = tempRoot();
    const outside = tempRoot();
    writeFileSync(join(outside, 'secret.txt'), 'outside');
    mkdirSync(join(root, 'photos'));
    linkFolder(outside, join(root, 'photos', 'p'));
    const storage = createNasDriver(root);

    await expect(
      storage.put('photos', 'p/new.txt', body('x'), { contentType: 'text/plain' }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(existsSync(join(outside, 'new.txt'))).toBe(false);
    await expect(storage.get('photos', 'p/secret.txt')).rejects.toBeInstanceOf(ApiError);
    await expect(storage.stat('photos', 'p/secret.txt')).rejects.toBeInstanceOf(ApiError);
    await expect(storage.remove('photos', 'p/secret.txt')).rejects.toBeInstanceOf(ApiError);
    expect(existsSync(join(outside, 'secret.txt'))).toBe(true);
  });

  it('refuses to read or remove an object that is itself a link', async (ctx) => {
    const root = tempRoot();
    const outside = tempRoot();
    writeFileSync(join(outside, 'secret.txt'), 'outside');
    mkdirSync(join(root, 'photos'));
    try {
      symlinkSync(join(outside, 'secret.txt'), join(root, 'photos', 'link.txt'), 'file');
    } catch {
      // a file link needs extra rights on Windows; the folder case above runs everywhere
      ctx.skip();
    }
    const storage = createNasDriver(root);
    await expect(storage.get('photos', 'link.txt')).rejects.toBeInstanceOf(ApiError);
    await expect(storage.remove('photos', 'link.txt')).rejects.toBeInstanceOf(ApiError);
    expect(existsSync(join(outside, 'secret.txt'))).toBe(true);
  });

  it('answers the readiness ping on a readable and writable root only', async () => {
    expect(await fresh().ping()).toBe(true);
    expect(await createNasDriver(join(tempRoot(), 'missing')).ping()).toBe(false);
  });

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'fails the ping on a root it may not write',
    async () => {
      const root = tempRoot();
      chmodSync(root, 0o500);
      try {
        expect(await createNasDriver(root).ping()).toBe(false);
      } finally {
        chmodSync(root, 0o700);
      }
    },
  );
});
