/* eslint-disable security/detect-non-literal-fs-filename -- paths are the configured root plus keys checked by assertKey; test adapter only */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { buffer } from 'node:stream/consumers';
import {
  assertKey,
  type Bucket,
  type ObjectInfo,
  type SignedUrl,
  type StorageAdapter,
  urlTtl,
} from './storage';

/**
 * Filesystem storage for automated tests (ADR-005): objects are files under a root folder; signed
 * URLs are local paths with an expiry and an HMAC, checked by `verify()`. Never used in production
 * (the configuration refuses it).
 */
export class FilesystemStorage implements StorageAdapter {
  constructor(
    private readonly root: string,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  private path(bucket: Bucket, key: string): string {
    assertKey(key);
    return join(this.root, bucket, ...key.split('/'));
  }

  async put(
    bucket: Bucket,
    key: string,
    body: Buffer | Readable,
    options: { contentType: string },
  ): Promise<void> {
    const file = this.path(bucket, key);
    await mkdir(dirname(file), { recursive: true });
    const bytes = Buffer.isBuffer(body) ? body : await buffer(body);
    await writeFile(file, bytes);
    await writeFile(`${file}.meta.json`, JSON.stringify({ contentType: options.contentType }));
  }

  async get(bucket: Bucket, key: string): Promise<Readable> {
    return createReadStream(this.path(bucket, key));
  }

  async stat(bucket: Bucket, key: string): Promise<ObjectInfo | null> {
    const file = this.path(bucket, key);
    try {
      const info = await stat(file);
      const meta = JSON.parse(await readFile(`${file}.meta.json`, 'utf8')) as {
        contentType?: string;
      };
      return { size: info.size, contentType: meta.contentType };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null;
      throw error;
    }
  }

  private sign(method: string, bucket: Bucket, key: string, ttlSeconds?: number): SignedUrl {
    assertKey(key);
    const expires = Math.floor(this.now() / 1000) + urlTtl(ttlSeconds);
    const mac = createHmac('sha256', this.secret)
      .update(`${method}\n${bucket}/${key}\n${expires}`)
      .digest('hex');
    return {
      url: `/__storage/${bucket}/${key}?method=${method}&expires=${expires}&signature=${mac}`,
      expiresAt: new Date(expires * 1000),
    };
  }

  async presignGet(bucket: Bucket, key: string, ttlSeconds?: number): Promise<SignedUrl> {
    return this.sign('GET', bucket, key, ttlSeconds);
  }

  async presignPut(bucket: Bucket, key: string, ttlSeconds?: number): Promise<SignedUrl> {
    return this.sign('PUT', bucket, key, ttlSeconds);
  }

  /** True when a URL from presignGet/presignPut is authentic and not expired. */
  verify(url: string): boolean {
    const parsed = new URL(url, 'http://local');
    const match = /^\/__storage\/([a-z]+)\/(.+)$/.exec(parsed.pathname);
    const method = parsed.searchParams.get('method');
    const expires = Number(parsed.searchParams.get('expires'));
    const signature = parsed.searchParams.get('signature') ?? '';
    if (!match || !method || !Number.isFinite(expires)) return false;
    if (expires < Math.floor(this.now() / 1000)) return false;
    const expected = createHmac('sha256', this.secret)
      .update(`${method}\n${match[1]}/${match[2]}\n${expires}`)
      .digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  async ping(): Promise<boolean> {
    try {
      await mkdir(this.root, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }
}
