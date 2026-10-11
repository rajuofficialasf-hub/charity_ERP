import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../i18n/api-error';
import { NotFoundError } from '../types';
import { createFilesystemDriver } from './filesystem';

const fresh = () => createFilesystemDriver(mkdtempSync(join(tmpdir(), 'css-fs-')));

describe('filesystem storage driver (ADR-005, tests only)', () => {
  it('stores a stream, reads it back, describes and removes it', async () => {
    const storage = fresh();
    await storage.put(
      'photos',
      'projects/p1/a1/photo.jpg',
      Readable.from([Buffer.from('jpeg bytes')]),
      {
        contentType: 'image/jpeg',
      },
    );
    expect(await storage.stat('photos', 'projects/p1/a1/photo.jpg')).toEqual({
      size: 10,
      contentType: 'image/jpeg',
    });
    expect(await text(await storage.get('photos', 'projects/p1/a1/photo.jpg'))).toBe('jpeg bytes');
    expect(await storage.stat('photos', 'projects/p1/a1/missing.jpg')).toBeNull();
    await storage.remove('photos', 'projects/p1/a1/photo.jpg');
    expect(await storage.stat('photos', 'projects/p1/a1/photo.jpg')).toBeNull();
    await expect(storage.remove('photos', 'projects/p1/a1/photo.jpg')).resolves.toBeUndefined();
    expect(await storage.ping()).toBe(true);
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

  it('refuses keys that escape the bucket or collide with its own files (NE-SEC-07)', async () => {
    await expect(
      fresh().put('photos', 'x.meta.json', Readable.from([Buffer.from('x')]), {
        contentType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    const storage = fresh();
    await expect(
      storage.put('photos', '../etc/passwd', Readable.from([Buffer.from('x')]), {
        contentType: 'text/plain',
      }),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(storage.get('photos', 'a//b')).rejects.toBeInstanceOf(ApiError);
  });
});
