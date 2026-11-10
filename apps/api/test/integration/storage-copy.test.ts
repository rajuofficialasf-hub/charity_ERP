import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { text } from 'node:stream/consumers';
import { uuidv7 } from '@css/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from 'vitest';
import { AuditWriter } from '../../src/audit/audit-writer';
import { PrismaService } from '../../src/core/prisma.service';
import { copyFiles } from '../../src/storage/copy';
import { createNasDriver } from '../../src/storage/drivers/nas';
import type { StorageDriver } from '../../src/storage';
import { testEnv } from '../support/env';
import { cloneTemplate, dropDatabase } from './support/db';

// The copy of stored files from one driver to another before the app switches to the NAS: two
// folder drivers stand in for MinIO and the NAS, so the copy goes through the driver interface only.
let drop: () => Promise<void>;
let prisma: PrismaService;
let source: StorageDriver;
let target: StorageDriver;
const audit = new AuditWriter();

const folder = () => createNasDriver(mkdtempSync(join(tmpdir(), 'css-copy-')));
const bytes = (s: string) => Readable.from([Buffer.from(s)]);

async function storedFile(
  key: string,
  content: string,
  thumbnails = false,
  driver: 'nas' | 's3' = 's3',
): Promise<string> {
  const id = uuidv7();
  await source.put('photos', key, bytes(content), { contentType: 'image/jpeg' });
  if (thumbnails) {
    await source.put('photos', `${key}.s.jpg`, bytes('small'), { contentType: 'image/jpeg' });
    await source.put('photos', `${key}.m.jpg`, bytes('medium'), { contentType: 'image/jpeg' });
  }
  await prisma.$executeRaw`
    INSERT INTO files (id, bucket, object_key, kind, mime, size_bytes, sha256, source, storage_driver,
                       thumbnail_small_key, thumbnail_medium_key)
    VALUES (${id}::uuid, 'photos', ${key}, 'profile_photo', 'image/jpeg', ${content.length},
            ${id.replace(/-/g, '').padEnd(64, '0')}, 'gallery', ${driver},
            ${thumbnails ? `${key}.s.jpg` : null}, ${thumbnails ? `${key}.m.jpg` : null})`;
  return id;
}

const driverOf = async (id: string) =>
  (
    await prisma.$queryRaw<
      { d: string }[]
    >`SELECT storage_driver AS d FROM files WHERE id = ${id}::uuid`
  )[0]!.d;

const copy = (options: { dryRun?: boolean } = {}) =>
  copyFiles({ prisma, audit, from: source, fromName: 's3', to: target, toName: 'nas', ...options });

beforeAll(async () => {
  const clone = await cloneTemplate(inject('templateDb'));
  await clone.client.end();
  drop = () => dropDatabase(clone.name);
  prisma = new PrismaService(testEnv({ DATABASE_URL: clone.url }));
});

afterAll(async () => {
  await prisma.$disconnect();
  await drop();
});

beforeEach(async () => {
  source = folder();
  target = folder();
  await prisma.$executeRaw`DELETE FROM files`;
});

describe('copying stored files to another driver', () => {
  it('copies each object with its thumbnails, moves the row and keeps the source', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes', true);
    const report = await copy();
    expect(report).toMatchObject({ copied: 1, missing: [], failed: [] });
    expect(await driverOf(id)).toBe('nas');
    expect(await text(await target.get('photos', 'p/1.jpg'))).toBe('photo bytes');
    expect(await text(await target.get('photos', 'p/1.jpg.s.jpg'))).toBe('small');
    expect(await text(await target.get('photos', 'p/1.jpg.m.jpg'))).toBe('medium');
    expect(await target.stat('photos', 'p/1.jpg')).toMatchObject({ contentType: 'image/jpeg' });
    expect(await source.stat('photos', 'p/1.jpg')).not.toBeNull();
  });

  it('copies nothing on a second run', async () => {
    await storedFile('p/1.jpg', 'photo bytes');
    await copy();
    expect(await copy()).toMatchObject({ copied: 0, missing: [], failed: [] });
  });

  it('leaves files already on the target driver alone', async () => {
    const id = await storedFile('p/2.jpg', 'photo bytes', false, 'nas');
    expect(await copy()).toMatchObject({ copied: 0 });
    expect(await target.stat('photos', 'p/2.jpg')).toBeNull();
    expect(await driverOf(id)).toBe('nas');
  });

  it('counts the rows and copies nothing in a dry run', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes');
    expect(await copy({ dryRun: true })).toMatchObject({ copied: 0, pending: 1 });
    expect(await target.stat('photos', 'p/1.jpg')).toBeNull();
    expect(await driverOf(id)).toBe('s3');
  });

  it('reports a row whose object is missing and leaves it on the source driver', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes');
    await source.remove('photos', 'p/1.jpg');
    expect(await copy()).toMatchObject({ copied: 0, missing: [id] });
    expect(await driverOf(id)).toBe('s3');
  });

  it('leaves the row on the source when the copy does not arrive whole', async () => {
    const id = await storedFile('p/1.jpg', 'photo bytes');
    const short: StorageDriver = {
      ...target,
      // a target that loses the end of what it is given
      put: async (bucket, key, body, meta) => {
        const all = await text(body);
        await target.put(bucket, key, bytes(all.slice(0, 3)), meta);
      },
    };
    const report = await copyFiles({
      prisma,
      audit,
      from: source,
      fromName: 's3',
      to: short,
      toName: 'nas',
    });
    expect(report).toMatchObject({ copied: 0, failed: [id] });
    expect(await driverOf(id)).toBe('s3');
  });

  it('refuses a file row that does not name its driver', async () => {
    await expect(
      prisma.$executeRaw`
        INSERT INTO files (id, bucket, object_key, kind, mime, size_bytes, sha256, source)
        VALUES (${uuidv7()}::uuid, 'photos', 'p/x.jpg', 'profile_photo', 'image/jpeg', 1,
                ${'b'.repeat(64)}, 'gallery')`,
    ).rejects.toThrow(/storage_driver/);
  });

  it('refuses a copy onto the same driver', async () => {
    await expect(
      copyFiles({ prisma, audit, from: source, fromName: 's3', to: source, toName: 's3' }),
    ).rejects.toThrow(/different drivers/);
  });

  it('writes one audit entry per batch with the counts', async () => {
    await storedFile('p/1.jpg', 'one');
    await storedFile('p/2.jpg', 'two');
    // the audit log is append-only, so only the entries this run adds are counted
    const entries = () =>
      prisma.$queryRaw<{ new: unknown }[]>`
        SELECT new FROM audit_log WHERE action = 'storage.copied' ORDER BY id`;
    const before = (await entries()).length;
    await copy();
    const after = await entries();
    expect(after).toHaveLength(before + 1);
    expect(after[after.length - 1]!.new).toMatchObject({ from: 's3', to: 'nas', copied: 2 });
  });
});
