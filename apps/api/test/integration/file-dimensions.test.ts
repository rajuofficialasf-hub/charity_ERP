import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FileDimensionsJob } from '../../src/jobs/file-dimensions.js';
import type { StorageDriver } from '../../src/storage/index.js';
import { picture } from '../support/photos.js';
import { account, type AuthHarness, authHarness } from './support/auth-app.js';

// The sizes of the photos stored before the size was kept: read once from the stored file, turned
// upright, written only while still empty.
let h: AuthHarness;
let uploader: string;
const quiet = { info: () => undefined, warn: () => undefined };

beforeAll(async () => {
  h = await authHarness();
  uploader = (await account(h.db)).id;
});
afterAll(async () => h.close());

/** A stored file and its row without a size; `content` false stores the row alone. */
async function stored(
  bytes: Buffer,
  over: { kind?: string; mime?: string; scan?: string; size?: number; content?: boolean } = {},
): Promise<string> {
  const id = randomUUID();
  const key = `older/${id}`;
  if (over.content !== false)
    await h.container.storage.put('photos', key, Readable.from([bytes]), {
      contentType: over.mime ?? 'image/jpeg',
      size: bytes.length,
    });
  await h.db.query(
    `INSERT INTO files (id, bucket, storage_driver, object_key, kind, mime, size_bytes, sha256, uploaded_by, source, virus_scan)
     VALUES ($1, 'photos', $2, $3, $4, $5, $6, $7, $8, 'camera', $9)`,
    [
      id,
      h.container.storage.name,
      key,
      over.kind ?? 'form_photo',
      over.mime ?? 'image/jpeg',
      over.size ?? bytes.length,
      createHash('sha256').update(bytes).digest('hex'),
      uploader,
      over.scan ?? 'clean',
    ],
  );
  return id;
}

const sizeOf = async (id: string) =>
  (await h.db.query('SELECT width, height FROM files WHERE id = $1', [id])).rows[0] as {
    width: number | null;
    height: number | null;
  };

/** A JPEG stored sideways: the camera says to turn it a quarter. */
const sideways = async () =>
  sharp(await picture({ width: 320 }))
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();

describe('the sizes of older photos', () => {
  it('fills an upright and a sideways photo, and a second run writes nothing', async () => {
    const upright = await stored(await picture({ width: 640 }));
    const turned = await stored(await sideways());
    const first = await h.container.fileDimensions.run();
    expect(first.filled).toBeGreaterThanOrEqual(2);
    expect(await sizeOf(upright)).toEqual({ width: 640, height: 480 });
    // measured as it is shown: turned upright
    expect(await sizeOf(turned)).toEqual({ width: 240, height: 320 });
    const second = await h.container.fileDimensions.run();
    expect(second.filled).toBe(0);
  });

  it('keeps a damaged file without a size and goes on with the next', async () => {
    const damaged = await stored(Buffer.from('not a photo at all'));
    const fine = await stored(await picture({ width: 400 }));
    const missing = await stored(await picture({ width: 200 }), { content: false });
    const result = await h.container.fileDimensions.run();
    expect(result.failed).toBeGreaterThanOrEqual(2);
    expect(await sizeOf(damaged)).toEqual({ width: null, height: null });
    expect(await sizeOf(missing)).toEqual({ width: null, height: null });
    expect(await sizeOf(fine)).toEqual({ width: 400, height: 300 });
  });

  it('skips a photo larger than its kind allows without reading it', async () => {
    const big = await stored(await picture({ width: 100 }), { size: 6 * 1024 * 1024 });
    const reads: string[] = [];
    const watched: StorageDriver = {
      ...h.container.storage,
      name: h.container.storage.name,
      get: (bucket, key) => {
        reads.push(key);
        return h.container.storage.get(bucket, key);
      },
    };
    const job = new FileDimensionsJob(h.container.prisma, () => watched, quiet);
    const result = await job.run();
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(reads).not.toContain(`older/${big}`);
    expect(await sizeOf(big)).toEqual({ width: null, height: null });
  });

  it('leaves out what is no photo, and a photo the processing has not finished', async () => {
    const pdf = await stored(Buffer.from('%PDF-1.4'), { kind: 'voucher', mime: 'application/pdf' });
    const waiting = await stored(await picture({ width: 300 }), { scan: 'pending' });
    const refused = await stored(await picture({ width: 300 }), { scan: 'failed' });
    await h.container.fileDimensions.run();
    for (const id of [pdf, waiting, refused])
      expect(await sizeOf(id)).toEqual({ width: null, height: null });
  });

  it('tells the worker whether any processed photo still has no size', async () => {
    const job = new FileDimensionsJob(h.container.prisma, () => h.container.storage, quiet);
    // the damaged and the oversized photos above still have none
    expect(await job.hasWaiting()).toBe(true);
    await h.db.query(`UPDATE files SET width = 1, height = 1 WHERE width IS NULL`);
    expect(await job.hasWaiting()).toBe(false);
  });
});
